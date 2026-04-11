"""LangExtract worker service for Favorble.

A small FastAPI app that wraps Google's ``langextract`` library to pull
structured facts out of SSA / legal documents. The service is designed to be
self-contained: feed it text, get back JSON extractions with char-span
pointers into the source document.

Endpoints
---------
GET  /health                       Liveness probe.
POST /extract                      Generic extraction; choose ``extraction_type``.
POST /extract/medical-record       Specialized medical record extraction.
POST /extract/status-report        Specialized SSA status report extraction.
POST /extract/decision-letter      Specialized SSA decision letter extraction
                                    (enhanced: RFC, severe impairments,
                                    listing match, PRW, reasoning).
POST /extract/efolder-classification  Classify an ERE document into a type.
POST /extract/phi-sheet-draft      Draft a Pre-Hearing Intelligence sheet.
POST /extract/appeal-brief         Extract Appeals Council / Federal Court
                                    brief skeleton fields.

Mock mode
---------
If ``GEMINI_API_KEY`` is missing or set to ``"pending-gemini-setup"`` the
service returns deterministic mocked responses instead of calling Gemini.
This lets the service boot and pass health checks before a real key is
provisioned.
"""

from __future__ import annotations

import logging
import os
import time
from dataclasses import asdict, is_dataclass
from typing import Any, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator

from extractors import (
    EXTRACTION_TYPES,
    get_extraction_config,
    get_mock_response,
    list_extraction_types,
)

load_dotenv()

LOG_LEVEL = os.getenv("LOG_LEVEL", "info").upper()
logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s - %(message)s",
)
logger = logging.getLogger("langextract-worker")

DEFAULT_MODEL = os.getenv("LANGEXTRACT_MODEL", "gemini-2.5-flash")
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "pending-gemini-setup")
MOCK_MODE = GEMINI_API_KEY in ("", "pending-gemini-setup", "mock")

# Try to import langextract. If it fails (e.g. during local smoke tests without
# the heavy dependency installed) we fall back to mock mode unconditionally.
try:
    import langextract as lx  # type: ignore
    _LX_IMPORT_OK = True
except Exception as exc:  # pragma: no cover
    logger.warning("langextract import failed, forcing mock mode: %s", exc)
    lx = None  # type: ignore[assignment]
    _LX_IMPORT_OK = False
    MOCK_MODE = True


app = FastAPI(
    title="Favorble LangExtract Worker",
    version="0.1.0",
    description="Structured extraction service for SSA / legal documents.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------


class ExtractRequest(BaseModel):
    document_text: str = Field(..., min_length=1, description="Raw document text.")
    extraction_type: str = Field(
        ...,
        description=(
            "One of: "
            + ", ".join(list_extraction_types())
        ),
    )
    model: Optional[str] = Field(
        default=None,
        description="Override the default Gemini model id.",
    )
    max_workers: int = Field(default=4, ge=1, le=16)
    extraction_passes: int = Field(default=1, ge=1, le=5)


class SpecializedRequest(BaseModel):
    document_text: str = Field(..., min_length=1)
    model: Optional[str] = None
    max_workers: int = Field(default=4, ge=1, le=16)
    extraction_passes: int = Field(default=1, ge=1, le=5)


class CharInterval(BaseModel):
    start_pos: Optional[int] = None
    end_pos: Optional[int] = None


class ExtractionItem(BaseModel):
    extraction_class: str
    extraction_text: str
    char_interval: Optional[CharInterval] = None
    attributes: Optional[Dict[str, Any]] = None
    alignment_status: Optional[str] = None

    @field_validator("attributes", mode="before")
    @classmethod
    def _coerce_attributes(cls, v):
        return v if v is not None else {}


class ExtractResponse(BaseModel):
    extraction_type: str
    model: str
    mock: bool
    elapsed_ms: int
    document_length: int
    extractions: List[ExtractionItem]


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _serialize_extraction(item: Any) -> Dict[str, Any]:
    """Convert a langextract ``Extraction`` dataclass to a JSON-friendly dict."""
    if isinstance(item, dict):
        return item
    if is_dataclass(item):
        raw = asdict(item)
    else:
        # Best-effort attribute scrape.
        raw = {
            "extraction_class": getattr(item, "extraction_class", None),
            "extraction_text": getattr(item, "extraction_text", None),
            "attributes": getattr(item, "attributes", None) or {},
            "char_interval": getattr(item, "char_interval", None),
            "alignment_status": getattr(item, "alignment_status", None),
        }

    ci = raw.get("char_interval")
    if ci is not None and not isinstance(ci, dict):
        raw["char_interval"] = {
            "start_pos": getattr(ci, "start_pos", None),
            "end_pos": getattr(ci, "end_pos", None),
        }
    alignment = raw.get("alignment_status")
    if alignment is not None and not isinstance(alignment, (str, int, float, bool)):
        raw["alignment_status"] = getattr(alignment, "value", str(alignment))
    return raw


def _run_langextract(
    document_text: str,
    extraction_type: str,
    model: str,
    max_workers: int,
    extraction_passes: int,
) -> List[Dict[str, Any]]:
    """Call the real langextract library. Raises on any failure."""
    if not _LX_IMPORT_OK or lx is None:
        raise RuntimeError("langextract is not importable in this environment")

    config = get_extraction_config(extraction_type)
    examples = config["examples_fn"]()
    prompt = config["prompt_description"]

    logger.info(
        "Running langextract model=%s type=%s doc_len=%d passes=%d workers=%d",
        model,
        extraction_type,
        len(document_text),
        extraction_passes,
        max_workers,
    )

    result = lx.extract(
        text_or_documents=document_text,
        prompt_description=prompt,
        examples=examples,
        model_id=model,
        api_key=GEMINI_API_KEY,
        extraction_passes=extraction_passes,
        max_workers=max_workers,
    )

    extractions = getattr(result, "extractions", None) or []
    return [_serialize_extraction(e) for e in extractions]


def _do_extract(
    document_text: str,
    extraction_type: str,
    model: Optional[str],
    max_workers: int,
    extraction_passes: int,
) -> ExtractResponse:
    if extraction_type not in EXTRACTION_TYPES:
        raise HTTPException(
            status_code=400,
            detail={
                "error": "unknown_extraction_type",
                "extraction_type": extraction_type,
                "valid_types": list_extraction_types(),
            },
        )

    model_id = model or DEFAULT_MODEL
    started = time.perf_counter()

    if MOCK_MODE:
        logger.info(
            "Serving MOCK extraction type=%s doc_len=%d (GEMINI_API_KEY not set)",
            extraction_type,
            len(document_text),
        )
        mocked = get_mock_response(extraction_type, document_text)
        extractions = mocked["extractions"]
    else:
        try:
            extractions = _run_langextract(
                document_text=document_text,
                extraction_type=extraction_type,
                model=model_id,
                max_workers=max_workers,
                extraction_passes=extraction_passes,
            )
        except Exception as exc:
            logger.exception("langextract call failed")
            raise HTTPException(
                status_code=502,
                detail={"error": "langextract_failed", "message": str(exc)},
            )

    elapsed_ms = int((time.perf_counter() - started) * 1000)
    return ExtractResponse(
        extraction_type=extraction_type,
        model=model_id,
        mock=MOCK_MODE,
        elapsed_ms=elapsed_ms,
        document_length=len(document_text),
        extractions=[ExtractionItem(**e) for e in extractions],
    )


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------


@app.get("/health")
def health() -> Dict[str, Any]:
    return {
        "status": "ok",
        "service": "langextract-worker",
        "version": app.version,
        "mock_mode": MOCK_MODE,
        "langextract_available": _LX_IMPORT_OK,
        "default_model": DEFAULT_MODEL,
        "extraction_types": list_extraction_types(),
    }


@app.get("/")
def root() -> Dict[str, Any]:
    return {
        "service": "favorble-langextract-worker",
        "endpoints": [
            "/health",
            "/extract",
            "/extract/medical-record",
            "/extract/status-report",
            "/extract/decision-letter",
            "/extract/efolder-classification",
            "/extract/phi-sheet-draft",
            "/extract/appeal-brief",
        ],
    }


@app.post("/extract", response_model=ExtractResponse)
def extract(req: ExtractRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type=req.extraction_type,
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/medical-record", response_model=ExtractResponse)
def extract_medical_record(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="medical_record",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/status-report", response_model=ExtractResponse)
def extract_status_report(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="status_report",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/decision-letter", response_model=ExtractResponse)
def extract_decision_letter(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="decision_letter",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/efolder-classification", response_model=ExtractResponse)
def extract_efolder_classification(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="efolder_classification",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/phi-sheet-draft", response_model=ExtractResponse)
def extract_phi_sheet_draft(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="phi_sheet_draft",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )


@app.post("/extract/appeal-brief", response_model=ExtractResponse)
def extract_appeal_brief(req: SpecializedRequest) -> ExtractResponse:
    return _do_extract(
        document_text=req.document_text,
        extraction_type="appeal_brief",
        model=req.model,
        max_workers=req.max_workers,
        extraction_passes=req.extraction_passes,
    )
