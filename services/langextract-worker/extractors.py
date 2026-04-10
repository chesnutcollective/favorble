"""Extraction type configurations for the LangExtract worker.

Each configuration defines:
  - ``prompt_description``: natural-language instructions handed to the LLM.
  - ``examples``: a list of ``langextract.data.ExampleData`` few-shot examples.
  - ``mock_response``: a deterministic payload returned when running without
    a real API key (``GEMINI_API_KEY == "pending-gemini-setup"``).

The shapes are tuned for Favorble's SSA / legal workflows:
  - medical_record       Extract providers, dates, diagnoses, treatments, meds.
  - status_report        Pull claim status, hearing date / office, ALJ, docs.
  - decision_letter      Favorable / unfavorable decision, date, reasoning.
  - efolder_classification  Classify an ERE / e-folder document into a type.
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
Extract the SSA disability decision details from the letter text.

Entity classes:
  - decision_type       Must be "favorable", "partially favorable", "unfavorable",
                        or "dismissal". Use the attribute ``raw`` to hold the
                        exact source phrase.
  - decision_date       The date the decision was issued.
  - onset_date          The established onset date, if stated.
  - alj                 Deciding Administrative Law Judge.
  - reasoning           Key finding or rationale sentences from the decision.
  - appeal_deadline     Date by which an appeal must be filed, if mentioned.

Return the exact source text for each extraction.
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
                "been disabled since January 3, 2023. This decision is issued "
                "on April 2, 2025. You have 60 days to file an appeal."
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
                ),
                lx_data.Extraction(
                    extraction_class="appeal_deadline",
                    extraction_text="60 days",
                    attributes={"kind": "relative"},
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
