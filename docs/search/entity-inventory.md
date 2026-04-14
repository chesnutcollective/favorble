# Entity Inventory

The polymorphic `search_documents` table indexes 15 entity types
from across the app. This document is the reference for what each
type contributes to search, which fields are full-text vs.
semantic vs. exact-match, what facets are available, and what
role gates apply.

When you add a new entity type, copy a row from this table and
keep it in sync with the trigger + access filter.

## Entity matrix

| # | Entity | Title field | Subtitle field | Full-text body | Exact-match identifiers | Key facets | PHI gate |
|---|---|---|---|---|---|---|---|
| 1 | **case** | `case_number` (e.g. HS-22215) | primary claimant name | ALJ, hearing office, SSA office, application type | `case_number`, `ssa_claim_number`, `chronicle_claimant_id` | status, stage_id, phi_sheet_status, mr_status, mr_team_color, hearing_date, hearing_office, alj, app_type | attorney, case_manager, intake, medical_records, phi_sheet_writer, reviewer, admin |
| 2 | **contact** | `"Last, First"` | contact_type · email · phone | address, city, state, zip | lowercased email, digit-normalized phone | contact_type, has_email, has_phone, state | attorney, case_manager, intake, admin |
| 3 | **lead** | `"Last, First"` | pipeline_stage · email · phone | notes | lowercased email, digit-normalized phone | status, pipeline_stage, pipeline_group, assigned_to_id, source, converted | attorney, case_manager, intake, admin |
| 4 | **user** | `"First Last"` | role · team · email | — | lowercased email | role, team, is_active | open to all non-guest roles |
| 5 | **document** | `file_name` | category · source | description, tags[] | `source_external_id` (SSA doc ID) | case_id, category, source, is_confidential | attorney, case_manager, intake, medical_records, phi_sheet_writer, reviewer, admin |
| 6 | **document_chunk** (phase 3) | `file_name · p.N` | category · chunk index | chunk_text (~400 tokens) | — | document_id, case_id, page_number, chunk_index, char_start, char_end, category | inherits parent document's gates |
| 7 | **chronology_entry** | summary | date · provider · facility | details, diagnoses[], treatments[], medications[] | ICD-10 codes (from diagnoses) | case_id, entry_type, event_date, is_verified, provider_type | attorney, case_manager, medical_records, phi_sheet_writer, reviewer, admin |
| 8 | **calendar_event** | title | start_at · hearing_office · ALJ | description, location | — | event_type, case_id, start_at, hearing_office, alj | attorney, case_manager, intake, medical_records, phi_sheet_writer, reviewer, admin |
| 9 | **task** | title | priority · due_date | description | — | status, priority, due_date, assigned_to_id, case_id | attorney, case_manager, intake, medical_records, phi_sheet_writer, reviewer, admin |
| 10 | **communication** | subject or first 80 chars of body | type · from · to | body | lowercased from/to email | type, direction, case_id, matched | attorney, case_manager, admin |
| 11 | **chat_message** | first 80 chars | — | content | — | channel_id, author_id | **isolated** — only surfaced with `includeTeamChat: true` |
| 12 | **outbound_mail** | recipient_name | mail_type · tracking | recipient_address, notes | tracking_number | mail_type, case_id, delivered | attorney, case_manager, intake, admin |
| 13 | **invoice** | invoice_number | status · total dollars | notes | invoice_number | status, total_cents, due_date, paid_date, case_id | billing_owner, attorney, admin |
| 14 | **trust_transaction** | description or reference | type · amount · date | description | reference_number | transaction_type, amount_cents, reconciled, client_id, case_id | billing_owner, admin |
| 15 | **admin entities** (`workflow`, `document_template`, `audit_log_entry`) | name / title / action | — | description / metadata | — | various | **admin only** — never shown to non-admin users, including facet counts |

**Total on staging after backfill:** 935 entity rows + 190 chunks = 1,125 indexed search documents.

## Domain-specific query routers (SSD-aware)

The query parser in `lib/search/query-parser.ts` detects these
patterns and routes them as direct-identifier hits before the
generic lexical query runs:

| Pattern | Regex | Route to |
|---|---|---|
| `HS-NNNNN` | `/^HS-\d{4,6}$/i` | Case lookup by `case_number` |
| SSA doc ID | `/^A\d{7}[A-Z]\d{2}[A-Z]\d{5}[A-Z]\d{5}$/` | Document lookup by `source_external_id` |
| 4 bare digits | `/^\d{4}$/` | **SSN last-4** — gated to roles ≥ case_manager |
| `@name` or `@email` | prefix `@` | User / contact lookup |
| `case:`, `doc:`, `client:`, `lead:`, `@`, `#tag`, `stage:4D`, `status:open`, `assigned:me` | scoped prefix grammar | Scope narrowing + facet filter |
| ICD-10 | `/^[A-TV-Z]\d{2}(\.\d+)?$/i` | Chronology lookup by diagnosis code |
| Email | standard email regex | Contact / lead / user / communication lookup |
| `before:2024-01-01`, `after:2023`, `today`, `this week`, `last month` | date language | Hard date filter |

## PHI gate matrix

Every row in `search_documents` has `allowed_roles` (a text array)
and optionally `allowed_user_ids` (a uuid array). A row is visible
to a user iff:

- Their org matches `organization_id`, **AND**
- Any of their effective roles is in `allowed_roles`, **OR**
- Their user id is in `allowed_user_ids`

Effective role inheritance (see `principalFromSession` in
`lib/search/access-filter.ts`):

- `admin` sees everything
- `attorney` inherits `case_manager`, `reviewer`
- `admin` additionally inherits all non-admin roles

### Fields that are intentionally NOT indexed

| Field | Why excluded |
|---|---|
| `cases.ssn_encrypted` | Encrypted at rest, cannot be indexed or searched. Only SSN last-4 is searchable via `cases.metadata` lookup + role gate. |
| `trust_accounts.account_number_encrypted` | Encrypted, unindexable. |
| Full OTP / password / token columns | Never indexed regardless of entity type. |
| `custom_field_values.text_value` when the field definition is marked sensitive | Role check at query time, not currently automatic — **future work**. |

### Fields indexed but role-gated

| Field | Visible to |
|---|---|
| `cases.date_of_birth` | attorney, case_manager, medical_records, admin |
| `contacts.address`, `.city`, `.state`, `.zip` | attorney, case_manager, intake, admin |
| `communications.body` (email + SMS content) | attorney, case_manager, admin |
| `chat_messages.content` | staff only, and only when `includeTeamChat=true` is explicitly passed |
| Trust-related fields | billing_owner, admin |

## Per-type result caps

The RRF merger applies these caps so one entity type can't
dominate the result list. Default values from
`lib/search/types.ts#DEFAULT_TYPE_CAPS`:

```
case: 6          document: 5        invoice: 3
contact: 5       document_chunk: 6  time_entry: 3
lead: 5          chronology: 5      expense: 3
user: 4          calendar: 4        trust_transaction: 3
task: 4          communication: 4   workflow: 3
chat_message: 4  outbound_mail: 3   document_template: 3
```

Override per-request via the `typeCaps` parameter if you need a
different mix for a specific feature (e.g., the documents tab
might want all-documents with zero chronology).

## Row count estimates per firm

| Entity | Small firm (Series-A) | Mid firm (Series-C) | Large firm (Series-E) |
|---|---|---|---|
| case | 500 – 2,000 | 10k – 50k | 200k – 1M |
| contact | 500 – 5,000 | 20k – 100k | 500k – 5M |
| lead | 1k – 10k | 50k – 200k | 500k – 2M |
| document | 5k – 50k | 200k – 2M | 5M – 50M |
| document_chunk | 20k – 200k | 1M – 10M | 25M – 250M |
| chronology_entry | 1k – 20k | 100k – 500k | 2M – 20M |
| calendar_event | 1k – 10k | 20k – 100k | 200k – 2M |
| task | 1k – 20k | 50k – 500k | 1M – 10M |
| communication | 10k – 100k | 500k – 5M | 20M – 200M |
| chat_message | 10k – 100k | 500k – 5M | 20M – 200M |
| invoice | 500 – 5,000 | 20k – 200k | 500k – 5M |
| trust_transaction | 500 – 5,000 | 20k – 200k | 500k – 5M |

These informed the architecture choice: pgvector HNSW handles up to
~10M vectors per index before rebuild times become painful, so
the mid-firm range is the comfortable sweet spot for the current
design. See [roadmap.md § scale pivots](./roadmap.md#scale-pivots)
for the path to Series-E scale.
