"""Extraction type configurations for the LangExtract worker.

Each configuration defines:
  - ``prompt_description``: natural-language instructions handed to the LLM.
  - ``examples``: a list of ``langextract.data.ExampleData`` few-shot examples.
  - ``mock_response``: a deterministic payload returned when running without
    a real API key (``GEMINI_API_KEY == "pending-gemini-setup"``).

The shapes are tuned for Favorble's SSA / legal workflows:
  - medical_record       Extract providers, dates, diagnoses, treatments, meds.
  - status_report        Pull claim status, hearing date / office, ALJ, docs.
  - decision_letter      Favorable / unfavorable decision, date, reasoning,
                         RFC findings, severe impairments, listing match, PRW.
  - efolder_classification  Classify an ERE / e-folder document into a type.
  - phi_sheet_draft      Draft a Pre-Hearing Intelligence sheet from sources.
  - appeal_brief         Extract Appeals Council / Federal Court brief fields.
"""

from __future__ import annotations

from typing import Any, Dict, List

try:
    import langextract as lx
    from langextract import data as lx_data
    _LX_AVAILABLE = True
except Exception:  # pragma: no cover - langextract optional at import time
    lx = None  # type: ignore[assignment]
    lx_data = None  # type: ignore[assignment]
    _LX_AVAILABLE = False


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

MEDICAL_RECORD_PROMPT = """\
Extract clinical facts from the medical record text in the order they appear.

For every extraction, return the exact source span from the document (do not
paraphrase). Use these entity classes:

  - provider     A clinician, practice, or facility name.
  - encounter_date  An appointment, admission, or service date.
  - diagnosis    A diagnosed condition (include ICD-10 when present).
  - treatment    A procedure, therapy, or clinical intervention.
  - medication   A prescribed drug (include dose + frequency when present).

Attach structured attributes where helpful (specialty, icd10, dose, route,
status). Do not invent information that is not in the text.
"""

STATUS_REPORT_PROMPT = """\
Extract the current posture of an SSA disability claim from a status report.

Entity classes:
  - claim_status        Overall case status (e.g. "Hearing Scheduled").
  - hearing_date        Scheduled hearing date and time if present.
  - hearing_office      SSA hearing office / ODAR / OHO location.
  - alj                 Administrative Law Judge name.
  - document_on_file    Each document listed as filed in the e-folder.
  - representative      Claimant representative / attorney of record.

Return exact source spans. Attach attributes like document_type, exhibit_id,
received_date when those details are in the text.
"""

DECISION_LETTER_PROMPT = """\
Extract the SSA disability decision details from the letter text. You are
reading an ALJ Notice of Decision. Return exact source spans only (never
paraphrase) and attach structured attributes where indicated.

Entity classes:
  - decision_type         One of "favorable", "partially_favorable",
                          "unfavorable", "dismissal", or "remand". Store the
                          normalized token in the ``value`` attribute and the
                          literal source phrase in the ``raw`` attribute.
  - decision_date         The date the decision was issued.
  - onset_date            The established onset date, if stated.
  - alj                   Deciding Administrative Law Judge.
  - reasoning             A concise summary sentence of the ALJ's stated
                          reasoning. Prefer the sentence that most directly
                          explains WHY the claim was granted or denied. Store
                          the full paragraph (if any) in the ``full_text``
                          attribute.
  - rfc_findings          Residual Functional Capacity paragraph(s) — the
                          sentence(s) describing the claimant's RFC. Use the
                          ``exertional_level`` attribute to capture "sedentary",
                          "light", "medium", "heavy", or "very heavy" when the
                          ALJ states one.
  - severe_impairment     One extraction per severe medically determinable
                          impairment named at Step 2. Use the ``step`` = "2"
                          attribute.
  - listing_match         Whether the claimant met or equaled a Listing at
                          Step 3. Use the ``met`` attribute ("true" / "false")
                          and the ``listing`` attribute to hold the listing
                          number (e.g. "1.15") if stated.
  - past_relevant_work    Step 4 analysis of past relevant work. Use the
                          ``can_perform_prw`` attribute ("true" / "false") when
                          the ALJ makes an explicit finding.
  - appeal_deadline       Date / period by which an appeal must be filed, if
                          mentioned.

Rules:
  - Always return exact source text for each extraction.
  - If a field is not present in the document, omit it rather than inventing.
  - Multiple severe_impairment extractions are expected — one per impairment.
"""

EFOLDER_CLASSIFICATION_PROMPT = """\
Classify the document into exactly one Favorble e-folder document type.

Allowed values for the ``document_type`` extraction (use the attribute
``category`` to hold the value):

  medical_record, status_report, decision_letter, hearing_notice,
  representative_appointment, medical_source_statement, consultative_exam,
  work_history_report, function_report, disability_report, appeals_council,
  correspondence, other

Return one extraction with class ``document_type``. Include a ``confidence``
attribute in [0, 1] and a short ``reason`` attribute citing specific language
from the document.
"""


PHI_SHEET_DRAFT_PROMPT = """\
Extract structured facts to populate a Pre-Hearing Intelligence (PHI) sheet
draft for an SSA disability claim. The source text is an assembled packet of
medical records, work history, and claimant statements. Your job is to
identify the strongest sentences from the record that ground each PHI field.

Always return the exact source span for each extraction. The downstream
editor will refine the draft; your job is to provide richly grounded raw
material — NOT polished prose.

Entity classes:
  - claimant_summary        One or two sentences from the record giving
                            background (age, prior work, onset, core problem).
                            Include ``age``, ``gender``, ``onset`` attributes
                            when the text states them.
  - alleged_impairment      One extraction per impairment the claimant alleges.
                            Use the ``severity`` attribute ("alleged",
                            "documented", "severe") based on how the record
                            characterizes it.
  - key_medical_evidence    The strongest evidentiary sentences — imaging
                            findings, objective test results, specialist
                            opinions, hospitalizations. One extraction per
                            piece of evidence. Attach ``source`` (provider or
                            exhibit id) and ``weight`` ("strong", "moderate",
                            "supporting") attributes.
  - work_history_summary    Sentence(s) describing relevant past work. Attach
                            ``years`` and ``exertional_level`` attributes when
                            stated.
  - vocational_factor       One extraction per vocational factor the record
                            mentions. Use the ``factor`` attribute to hold
                            one of: "age", "education", "language", "skills".
  - hearing_strategy_note   Internal-analysis sentences suggesting an approach
                            (e.g. "strong grid rule argument at 50",
                            "listing 12.04 equivalency available").
  - question_for_alj        Any question or topic the representative should
                            raise at the hearing.
  - witness_recommended     Any treating source or lay witness the record
                            suggests calling.

Only return extractions when the source text actually supports them. Do not
fabricate strategy notes or witness recommendations if the record is silent.
"""


APPEAL_BRIEF_PROMPT = """\
Extract the skeleton of an Appeals Council or Federal Court appeal brief
from the source text. The input may be a prior ALJ decision, a draft brief,
or a hearing transcript. Return exact source spans only.

Entity classes:
  - case_caption            The case caption (claimant name, SSA claim
                            number, docket / case number). Attach ``claimant``,
                            ``ssn_last4``, and ``docket`` attributes if
                            present in the text.
  - alj_decision_date       The date of the ALJ decision being appealed.
  - issue_on_appeal         One extraction per issue being raised on appeal
                            (e.g. "whether the ALJ properly evaluated the
                            treating source opinion"). Attach an ``index``
                            attribute ("1", "2", …) in order.
  - error_alleged           One extraction per specific legal error alleged
                            (e.g. "failure to apply the treating physician
                            rule", "improper step 5 analysis"). Attach a
                            ``category`` attribute such as "legal_standard",
                            "credibility", "rfc", "step_5", "listings",
                            "new_evidence".
  - relief_requested        The relief requested from the reviewing body
                            (e.g. "remand for further proceedings", "reversal
                            and award of benefits").

Do not invent legal theories the source text does not support.
"""


# ---------------------------------------------------------------------------
# Few-shot examples (used when langextract is installed)
# ---------------------------------------------------------------------------

def _medical_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "Patient seen by Dr. Amelia Chen at Brookside Spine Clinic on "
                "03/14/2025 for chronic low back pain. Assessment: lumbar "
                "radiculopathy (M54.16). Plan: continue gabapentin 300 mg TID, "
                "add physical therapy 2x/week."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="provider",
                    extraction_text="Dr. Amelia Chen",
                    attributes={"specialty": "spine", "facility": "Brookside Spine Clinic"},
                ),
                lx_data.Extraction(
                    extraction_class="encounter_date",
                    extraction_text="03/14/2025",
                    attributes={"kind": "office_visit"},
                ),
                lx_data.Extraction(
                    extraction_class="diagnosis",
                    extraction_text="lumbar radiculopathy (M54.16)",
                    attributes={"icd10": "M54.16"},
                ),
                lx_data.Extraction(
                    extraction_class="medication",
                    extraction_text="gabapentin 300 mg TID",
                    attributes={"dose": "300 mg", "frequency": "TID", "status": "continued"},
                ),
                lx_data.Extraction(
                    extraction_class="treatment",
                    extraction_text="physical therapy 2x/week",
                    attributes={"frequency": "2x/week", "status": "new"},
                ),
            ],
        )
    ]


def _status_report_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "Claim Status: Hearing Scheduled. Hearing set for 05/21/2025 "
                "at 9:30 AM before ALJ Robert Hwang at the Falls Church OHO. "
                "Exhibits on file: 1F Medical Records (Brookside), 2F Function "
                "Report. Representative: Jane Doe, Esq."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="claim_status",
                    extraction_text="Hearing Scheduled",
                ),
                lx_data.Extraction(
                    extraction_class="hearing_date",
                    extraction_text="05/21/2025 at 9:30 AM",
                ),
                lx_data.Extraction(
                    extraction_class="alj",
                    extraction_text="Robert Hwang",
                ),
                lx_data.Extraction(
                    extraction_class="hearing_office",
                    extraction_text="Falls Church OHO",
                ),
                lx_data.Extraction(
                    extraction_class="document_on_file",
                    extraction_text="1F Medical Records (Brookside)",
                    attributes={"exhibit_id": "1F", "document_type": "medical_record"},
                ),
                lx_data.Extraction(
                    extraction_class="document_on_file",
                    extraction_text="2F Function Report",
                    attributes={"exhibit_id": "2F", "document_type": "function_report"},
                ),
                lx_data.Extraction(
                    extraction_class="representative",
                    extraction_text="Jane Doe, Esq.",
                ),
            ],
        )
    ]


def _decision_letter_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "Notice of Decision — Fully Favorable. After careful review of "
                "the entire record, ALJ Maria Alvarez finds the claimant has "
                "been disabled since January 3, 2023. At Step 2 the claimant "
                "has the following severe impairments: degenerative disc "
                "disease of the lumbar spine, major depressive disorder, and "
                "fibromyalgia. At Step 3 the claimant's impairments do not "
                "meet or medically equal the severity of a listed impairment. "
                "After careful consideration of the entire record, the "
                "undersigned finds that the claimant has the residual "
                "functional capacity to perform sedentary work as defined in "
                "20 CFR 404.1567(a) except she can occasionally climb ramps "
                "and stairs and must avoid concentrated exposure to hazards. "
                "At Step 4, the claimant is unable to perform any past "
                "relevant work as a warehouse picker. This decision is "
                "issued on April 2, 2025. You have 60 days to file an appeal."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="decision_type",
                    extraction_text="Fully Favorable",
                    attributes={"raw": "Fully Favorable", "value": "favorable"},
                ),
                lx_data.Extraction(
                    extraction_class="alj",
                    extraction_text="Maria Alvarez",
                ),
                lx_data.Extraction(
                    extraction_class="onset_date",
                    extraction_text="January 3, 2023",
                ),
                lx_data.Extraction(
                    extraction_class="decision_date",
                    extraction_text="April 2, 2025",
                ),
                lx_data.Extraction(
                    extraction_class="reasoning",
                    extraction_text=(
                        "After careful review of the entire record, ALJ Maria "
                        "Alvarez finds the claimant has been disabled since "
                        "January 3, 2023."
                    ),
                    attributes={"kind": "summary"},
                ),
                lx_data.Extraction(
                    extraction_class="rfc_findings",
                    extraction_text=(
                        "the claimant has the residual functional capacity to "
                        "perform sedentary work as defined in 20 CFR "
                        "404.1567(a) except she can occasionally climb ramps "
                        "and stairs and must avoid concentrated exposure to "
                        "hazards"
                    ),
                    attributes={"exertional_level": "sedentary"},
                ),
                lx_data.Extraction(
                    extraction_class="severe_impairment",
                    extraction_text="degenerative disc disease of the lumbar spine",
                    attributes={"step": "2"},
                ),
                lx_data.Extraction(
                    extraction_class="severe_impairment",
                    extraction_text="major depressive disorder",
                    attributes={"step": "2"},
                ),
                lx_data.Extraction(
                    extraction_class="severe_impairment",
                    extraction_text="fibromyalgia",
                    attributes={"step": "2"},
                ),
                lx_data.Extraction(
                    extraction_class="listing_match",
                    extraction_text=(
                        "the claimant's impairments do not meet or medically "
                        "equal the severity of a listed impairment"
                    ),
                    attributes={"met": "false"},
                ),
                lx_data.Extraction(
                    extraction_class="past_relevant_work",
                    extraction_text=(
                        "the claimant is unable to perform any past relevant "
                        "work as a warehouse picker"
                    ),
                    attributes={
                        "can_perform_prw": "false",
                        "prw_title": "warehouse picker",
                    },
                ),
                lx_data.Extraction(
                    extraction_class="appeal_deadline",
                    extraction_text="60 days",
                    attributes={"kind": "relative"},
                ),
            ],
        )
    ]


def _phi_sheet_draft_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "Claimant is a 52-year-old former warehouse worker with a "
                "high school education who alleges disability due to chronic "
                "low back pain, radiculopathy, and depression beginning "
                "March 2023. MRI of the lumbar spine dated 06/12/2024 shows "
                "L4-L5 disc herniation with nerve root impingement. Dr. Chen "
                "at Brookside Spine notes the claimant cannot sit or stand "
                "more than 15 minutes at a time. PHQ-9 score of 18 "
                "(moderately severe) recorded 08/01/2024. Claimant's past "
                "relevant work as warehouse picker was performed at the "
                "heavy exertional level for 14 years. At age 52 with a "
                "limited education, a grid rule argument under 201.14 may "
                "apply if RFC is limited to sedentary. Treating physician "
                "Dr. Chen should be called to testify about sitting and "
                "standing limitations. The ALJ should be asked how the "
                "claimant can sustain competitive work with breaks every "
                "15 minutes."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="claimant_summary",
                    extraction_text=(
                        "Claimant is a 52-year-old former warehouse worker "
                        "with a high school education who alleges disability "
                        "due to chronic low back pain, radiculopathy, and "
                        "depression beginning March 2023."
                    ),
                    attributes={
                        "age": "52",
                        "onset": "March 2023",
                        "education": "high school",
                    },
                ),
                lx_data.Extraction(
                    extraction_class="alleged_impairment",
                    extraction_text="chronic low back pain",
                    attributes={"severity": "documented"},
                ),
                lx_data.Extraction(
                    extraction_class="alleged_impairment",
                    extraction_text="radiculopathy",
                    attributes={"severity": "documented"},
                ),
                lx_data.Extraction(
                    extraction_class="alleged_impairment",
                    extraction_text="depression",
                    attributes={"severity": "documented"},
                ),
                lx_data.Extraction(
                    extraction_class="key_medical_evidence",
                    extraction_text=(
                        "MRI of the lumbar spine dated 06/12/2024 shows L4-L5 "
                        "disc herniation with nerve root impingement"
                    ),
                    attributes={"source": "imaging", "weight": "strong"},
                ),
                lx_data.Extraction(
                    extraction_class="key_medical_evidence",
                    extraction_text=(
                        "Dr. Chen at Brookside Spine notes the claimant "
                        "cannot sit or stand more than 15 minutes at a time"
                    ),
                    attributes={
                        "source": "Dr. Chen, Brookside Spine",
                        "weight": "strong",
                    },
                ),
                lx_data.Extraction(
                    extraction_class="key_medical_evidence",
                    extraction_text=(
                        "PHQ-9 score of 18 (moderately severe) recorded "
                        "08/01/2024"
                    ),
                    attributes={"source": "objective_test", "weight": "moderate"},
                ),
                lx_data.Extraction(
                    extraction_class="work_history_summary",
                    extraction_text=(
                        "past relevant work as warehouse picker was performed "
                        "at the heavy exertional level for 14 years"
                    ),
                    attributes={"years": "14", "exertional_level": "heavy"},
                ),
                lx_data.Extraction(
                    extraction_class="vocational_factor",
                    extraction_text="age 52",
                    attributes={"factor": "age"},
                ),
                lx_data.Extraction(
                    extraction_class="vocational_factor",
                    extraction_text="limited education",
                    attributes={"factor": "education"},
                ),
                lx_data.Extraction(
                    extraction_class="hearing_strategy_note",
                    extraction_text=(
                        "a grid rule argument under 201.14 may apply if RFC "
                        "is limited to sedentary"
                    ),
                ),
                lx_data.Extraction(
                    extraction_class="witness_recommended",
                    extraction_text="Dr. Chen",
                ),
                lx_data.Extraction(
                    extraction_class="question_for_alj",
                    extraction_text=(
                        "how the claimant can sustain competitive work with "
                        "breaks every 15 minutes"
                    ),
                ),
            ],
        )
    ]


def _appeal_brief_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "BEFORE THE APPEALS COUNCIL, SOCIAL SECURITY ADMINISTRATION. "
                "In re: Jane Roe, Claimant. Claim No. XXX-XX-1234. Docket: "
                "AC-2025-00841. Appeal from the decision of ALJ Robert Hwang "
                "dated March 15, 2025. The claimant appeals on the following "
                "issues: (1) whether the ALJ properly evaluated the treating "
                "source opinion of Dr. Amelia Chen under 20 CFR 404.1520c; "
                "(2) whether the ALJ's Step 5 analysis is supported by "
                "substantial evidence. The ALJ erred by failing to articulate "
                "supportability and consistency factors for the treating "
                "source opinion. The ALJ further erred by relying on VE "
                "testimony that conflicted with the DOT without resolving "
                "the conflict. The claimant respectfully requests that this "
                "matter be remanded for further proceedings."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="case_caption",
                    extraction_text=(
                        "In re: Jane Roe, Claimant. Claim No. XXX-XX-1234. "
                        "Docket: AC-2025-00841."
                    ),
                    attributes={
                        "claimant": "Jane Roe",
                        "ssn_last4": "1234",
                        "docket": "AC-2025-00841",
                    },
                ),
                lx_data.Extraction(
                    extraction_class="alj_decision_date",
                    extraction_text="March 15, 2025",
                ),
                lx_data.Extraction(
                    extraction_class="issue_on_appeal",
                    extraction_text=(
                        "whether the ALJ properly evaluated the treating "
                        "source opinion of Dr. Amelia Chen under 20 CFR "
                        "404.1520c"
                    ),
                    attributes={"index": "1"},
                ),
                lx_data.Extraction(
                    extraction_class="issue_on_appeal",
                    extraction_text=(
                        "whether the ALJ's Step 5 analysis is supported by "
                        "substantial evidence"
                    ),
                    attributes={"index": "2"},
                ),
                lx_data.Extraction(
                    extraction_class="error_alleged",
                    extraction_text=(
                        "failing to articulate supportability and consistency "
                        "factors for the treating source opinion"
                    ),
                    attributes={"category": "legal_standard"},
                ),
                lx_data.Extraction(
                    extraction_class="error_alleged",
                    extraction_text=(
                        "relying on VE testimony that conflicted with the "
                        "DOT without resolving the conflict"
                    ),
                    attributes={"category": "step_5"},
                ),
                lx_data.Extraction(
                    extraction_class="relief_requested",
                    extraction_text=(
                        "this matter be remanded for further proceedings"
                    ),
                    attributes={"kind": "remand"},
                ),
            ],
        )
    ]


def _efolder_examples() -> List[Any]:
    if not _LX_AVAILABLE:
        return []
    return [
        lx_data.ExampleData(
            text=(
                "SOCIAL SECURITY ADMINISTRATION — NOTICE OF HEARING. You are "
                "scheduled to appear at a hearing before an Administrative "
                "Law Judge on May 21, 2025."
            ),
            extractions=[
                lx_data.Extraction(
                    extraction_class="document_type",
                    extraction_text="NOTICE OF HEARING",
                    attributes={
                        "category": "hearing_notice",
                        "confidence": 0.98,
                        "reason": "Header reads 'NOTICE OF HEARING' and body schedules an ALJ hearing.",
                    },
                )
            ],
        )
    ]


# ---------------------------------------------------------------------------
# Mock payloads (used when GEMINI_API_KEY == 'pending-gemini-setup')
# ---------------------------------------------------------------------------

def _mock_extraction(extraction_class: str, text: str, **attrs: Any) -> Dict[str, Any]:
    return {
        "extraction_class": extraction_class,
        "extraction_text": text,
        "char_interval": {"start_pos": 0, "end_pos": len(text)},
        "attributes": attrs or {},
        "alignment_status": "mocked",
    }


MOCK_RESPONSES: Dict[str, Dict[str, Any]] = {
    "medical_record": {
        "extractions": [
            _mock_extraction("provider", "Dr. Amelia Chen", specialty="spine"),
            _mock_extraction("encounter_date", "03/14/2025", kind="office_visit"),
            _mock_extraction("diagnosis", "lumbar radiculopathy (M54.16)", icd10="M54.16"),
            _mock_extraction("medication", "gabapentin 300 mg TID", dose="300 mg", frequency="TID"),
            _mock_extraction("treatment", "physical therapy 2x/week", frequency="2x/week"),
        ]
    },
    "status_report": {
        "extractions": [
            _mock_extraction("claim_status", "Hearing Scheduled"),
            _mock_extraction("hearing_date", "05/21/2025 at 9:30 AM"),
            _mock_extraction("hearing_office", "Falls Church OHO"),
            _mock_extraction("alj", "Robert Hwang"),
            _mock_extraction(
                "document_on_file",
                "1F Medical Records",
                exhibit_id="1F",
                document_type="medical_record",
            ),
        ]
    },
    "decision_letter": {
        "extractions": [
            _mock_extraction(
                "decision_type",
                "Fully Favorable",
                raw="Fully Favorable",
                value="favorable",
            ),
            _mock_extraction("decision_date", "April 2, 2025"),
            _mock_extraction("onset_date", "January 3, 2023"),
            _mock_extraction("alj", "Maria Alvarez"),
            _mock_extraction(
                "reasoning",
                "After careful review of the entire record, the claimant has been disabled since January 3, 2023.",
                kind="summary",
            ),
            _mock_extraction(
                "rfc_findings",
                "the claimant has the residual functional capacity to perform sedentary work",
                exertional_level="sedentary",
            ),
            _mock_extraction(
                "severe_impairment",
                "degenerative disc disease of the lumbar spine",
                step="2",
            ),
            _mock_extraction(
                "severe_impairment",
                "major depressive disorder",
                step="2",
            ),
            _mock_extraction(
                "severe_impairment",
                "fibromyalgia",
                step="2",
            ),
            _mock_extraction(
                "listing_match",
                "the claimant's impairments do not meet or medically equal the severity of a listed impairment",
                met="false",
            ),
            _mock_extraction(
                "past_relevant_work",
                "the claimant is unable to perform any past relevant work as a warehouse picker",
                can_perform_prw="false",
                prw_title="warehouse picker",
            ),
            _mock_extraction(
                "appeal_deadline",
                "60 days",
                kind="relative",
            ),
        ]
    },
    "phi_sheet_draft": {
        "extractions": [
            _mock_extraction(
                "claimant_summary",
                "Claimant is a 52-year-old former warehouse worker with a high school education",
                age="52",
                education="high school",
            ),
            _mock_extraction(
                "alleged_impairment",
                "chronic low back pain",
                severity="documented",
            ),
            _mock_extraction(
                "alleged_impairment",
                "radiculopathy",
                severity="documented",
            ),
            _mock_extraction(
                "alleged_impairment",
                "depression",
                severity="documented",
            ),
            _mock_extraction(
                "key_medical_evidence",
                "MRI of the lumbar spine dated 06/12/2024 shows L4-L5 disc herniation",
                source="imaging",
                weight="strong",
            ),
            _mock_extraction(
                "key_medical_evidence",
                "PHQ-9 score of 18 (moderately severe)",
                source="objective_test",
                weight="moderate",
            ),
            _mock_extraction(
                "work_history_summary",
                "past relevant work as warehouse picker was performed at the heavy exertional level for 14 years",
                years="14",
                exertional_level="heavy",
            ),
            _mock_extraction(
                "vocational_factor",
                "age 52",
                factor="age",
            ),
            _mock_extraction(
                "vocational_factor",
                "limited education",
                factor="education",
            ),
            _mock_extraction(
                "hearing_strategy_note",
                "a grid rule argument under 201.14 may apply if RFC is limited to sedentary",
            ),
            _mock_extraction(
                "witness_recommended",
                "Dr. Chen",
            ),
            _mock_extraction(
                "question_for_alj",
                "how the claimant can sustain competitive work with breaks every 15 minutes",
            ),
        ]
    },
    "appeal_brief": {
        "extractions": [
            _mock_extraction(
                "case_caption",
                "In re: Jane Roe, Claimant. Claim No. XXX-XX-1234.",
                claimant="Jane Roe",
                ssn_last4="1234",
                docket="AC-2025-00841",
            ),
            _mock_extraction(
                "alj_decision_date",
                "March 15, 2025",
            ),
            _mock_extraction(
                "issue_on_appeal",
                "whether the ALJ properly evaluated the treating source opinion",
                index="1",
            ),
            _mock_extraction(
                "issue_on_appeal",
                "whether the ALJ's Step 5 analysis is supported by substantial evidence",
                index="2",
            ),
            _mock_extraction(
                "error_alleged",
                "failing to articulate supportability and consistency factors for the treating source opinion",
                category="legal_standard",
            ),
            _mock_extraction(
                "error_alleged",
                "relying on VE testimony that conflicted with the DOT without resolving the conflict",
                category="step_5",
            ),
            _mock_extraction(
                "relief_requested",
                "this matter be remanded for further proceedings",
                kind="remand",
            ),
        ]
    },
    "efolder_classification": {
        "extractions": [
            _mock_extraction(
                "document_type",
                "NOTICE OF HEARING",
                category="hearing_notice",
                confidence=0.97,
                reason="Mocked classifier response.",
            )
        ]
    },
}


# ---------------------------------------------------------------------------
# Registry
# ---------------------------------------------------------------------------

EXTRACTION_TYPES: Dict[str, Dict[str, Any]] = {
    "medical_record": {
        "prompt_description": MEDICAL_RECORD_PROMPT,
        "examples_fn": _medical_examples,
        "mock_key": "medical_record",
    },
    "status_report": {
        "prompt_description": STATUS_REPORT_PROMPT,
        "examples_fn": _status_report_examples,
        "mock_key": "status_report",
    },
    "decision_letter": {
        "prompt_description": DECISION_LETTER_PROMPT,
        "examples_fn": _decision_letter_examples,
        "mock_key": "decision_letter",
    },
    "efolder_classification": {
        "prompt_description": EFOLDER_CLASSIFICATION_PROMPT,
        "examples_fn": _efolder_examples,
        "mock_key": "efolder_classification",
    },
    "phi_sheet_draft": {
        "prompt_description": PHI_SHEET_DRAFT_PROMPT,
        "examples_fn": _phi_sheet_draft_examples,
        "mock_key": "phi_sheet_draft",
    },
    "appeal_brief": {
        "prompt_description": APPEAL_BRIEF_PROMPT,
        "examples_fn": _appeal_brief_examples,
        "mock_key": "appeal_brief",
    },
}


def list_extraction_types() -> List[str]:
    return sorted(EXTRACTION_TYPES.keys())


def get_extraction_config(extraction_type: str) -> Dict[str, Any]:
    if extraction_type not in EXTRACTION_TYPES:
        raise KeyError(
            f"Unknown extraction_type '{extraction_type}'. "
            f"Valid: {', '.join(list_extraction_types())}"
        )
    return EXTRACTION_TYPES[extraction_type]


def get_mock_response(extraction_type: str, document_text: str) -> Dict[str, Any]:
    """Return a deterministic mock payload for the given extraction type.

    The char intervals are clamped to the document length so downstream code
    that expects valid spans does not blow up on short inputs.
    """
    config = get_extraction_config(extraction_type)
    payload = MOCK_RESPONSES[config["mock_key"]]
    doc_len = len(document_text)
    extractions: List[Dict[str, Any]] = []
    cursor = 0
    for raw in payload["extractions"]:
        text = raw["extraction_text"]
        # Try to locate the mocked text in the real document; fall back to a
        # rolling cursor window so the spans stay inside [0, len(document)].
        found = document_text.find(text, cursor) if doc_len else -1
        if found >= 0:
            start, end = found, found + len(text)
            cursor = end
        else:
            start = min(cursor, max(doc_len - 1, 0))
            end = min(start + len(text), doc_len)
        extractions.append(
            {
                **raw,
                "char_interval": {"start_pos": start, "end_pos": end},
            }
        )
    return {"extractions": extractions}
