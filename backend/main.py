"""
main.py
-------
FastAPI service exposing PII anonymisation via Format-Preserving Encryption (FPE).

Endpoints
  POST /api/encrypt        – encrypt a single PII record
  POST /api/decrypt        – decrypt a single PII record (FPE fields only)
  POST /api/batch/encrypt  – encrypt a list of records
  POST /api/batch/decrypt  – decrypt a list of records
  GET  /api/health         – liveness probe

Run locally:
  uvicorn main:app --reload --port 8000

Environment variables:
  FPE_SECRET_KEY   – hex string used as the FPE / HMAC key
                     (defaults to the built-in demo key; change in production)
"""

import os
from typing import Optional, List

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, field_validator

from backend.crypto import (
    encrypt_sg_id,
    decrypt_sg_id,
    encrypt_passport,
    decrypt_passport,
    encrypt_dob_preserve_year,
    hash_name,
    DEFAULT_KEY,
)

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------

app = FastAPI(
    title="PII Anonymisation API",
    description=(
        "Format-Preserving Encryption (FPE) and hashing utilities for PII data. "
        "Supports Singapore NRIC/FIN, passport numbers, dates of birth, and names."
    ),
    version="1.0.0",
    contact={"name": "Privacy Engineering Team"},
    license_info={"name": "MIT"},
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # tighten to your frontend origin in production
    allow_methods=["*"],
    allow_headers=["*"],
)

# Derive the key from env; fall back to built-in demo key
_RAW_KEY = os.getenv("FPE_SECRET_KEY", DEFAULT_KEY)
FPE_KEY  = _RAW_KEY.encode()


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class PIIRecord(BaseModel):
    """A single PII record.  All fields are optional."""
    nric:      Optional[str] = None
    passport:  Optional[str] = None
    dob:       Optional[str] = None
    name:      Optional[str] = None

    @field_validator("nric", "passport", "dob", "name", mode="before")
    @classmethod
    def strip_whitespace(cls, v):
        return v.strip() if isinstance(v, str) else v


class PIIResult(BaseModel):
    """Anonymised or recovered PII record, plus per-field metadata."""
    nric:           Optional[str] = None
    passport:       Optional[str] = None
    dob:            Optional[str] = None
    name:           Optional[str] = None
    name_reversible: bool = False
    dob_reversible:  bool = False


class BatchRequest(BaseModel):
    records: List[PIIRecord]

    @field_validator("records")
    @classmethod
    def limit_batch_size(cls, v):
        if len(v) > 1000:
            raise ValueError("Batch size cannot exceed 1 000 records.")
        return v


class BatchResult(BaseModel):
    results: List[PIIResult]
    total:   int


class HealthResponse(BaseModel):
    status: str
    version: str


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _encrypt_record(record: PIIRecord) -> PIIResult:
    try:
        return PIIResult(
            nric      = encrypt_sg_id(record.nric, FPE_KEY),
            passport  = encrypt_passport(record.passport, FPE_KEY),
            dob       = encrypt_dob_preserve_year(record.dob, FPE_KEY),
            name      = hash_name(record.name),
            name_reversible = False,
            dob_reversible  = False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


def _decrypt_record(record: PIIRecord) -> PIIResult:
    try:
        return PIIResult(
            nric     = decrypt_sg_id(record.nric, FPE_KEY),
            passport = decrypt_passport(record.passport, FPE_KEY),
            # DOB and name cannot be reversed
            dob      = record.dob,
            name     = record.name,
            name_reversible = False,
            dob_reversible  = False,
        )
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc


# ---------------------------------------------------------------------------
# Routes
# ---------------------------------------------------------------------------

@app.get("/api/health", response_model=HealthResponse, tags=["Meta"])
def health():
    """Liveness probe."""
    return HealthResponse(status="ok", version=app.version)


@app.post("/api/encrypt", response_model=PIIResult, tags=["Single record"])
def encrypt_record(record: PIIRecord):
    """
    Encrypt / anonymise a single PII record.

    - **nric** / **passport**: FPE — format preserved, reversible.
    - **dob**: HMAC masking — year preserved, month/day pseudorandomised (not reversible).
    - **name**: SHA-256 hash — one-way.
    """
    return _encrypt_record(record)


@app.post("/api/decrypt", response_model=PIIResult, tags=["Single record"])
def decrypt_record(record: PIIRecord):
    """
    Decrypt a previously encrypted PII record.

    Only **nric** and **passport** can be reversed (FPE).
    **dob** and **name** are returned unchanged (one-way transforms).
    """
    return _decrypt_record(record)


@app.post("/api/batch/encrypt", response_model=BatchResult, tags=["Batch"])
def batch_encrypt(body: BatchRequest):
    """Encrypt up to 1 000 PII records in one call."""
    results = [_encrypt_record(r) for r in body.records]
    return BatchResult(results=results, total=len(results))


@app.post("/api/batch/decrypt", response_model=BatchResult, tags=["Batch"])
def batch_decrypt(body: BatchRequest):
    """Decrypt up to 1 000 PII records in one call."""
    results = [_decrypt_record(r) for r in body.records]
    return BatchResult(results=results, total=len(results))
