"""
crypto.py
---------
Format-Preserving Encryption (FPE) and hashing utilities for PII anonymisation.

Supported PII types:
  - Singapore NRIC / FIN  (FPE, reversible)
  - Passport numbers      (FPE, reversible)
  - Date of birth         (HMAC-based month/day masking, year preserved, reversible-free)
  - Full names            (SHA-256 hash with salt, one-way)

All FPE operations use the FF1 algorithm via pyffx and are keyed with a
caller-supplied secret.  Hashing uses HMAC-SHA256 for DOB masking and
plain SHA-256 (salted) for names.
"""

import hashlib
import hmac
import re
import datetime
from typing import Optional, Tuple

import pyffx

# ---------------------------------------------------------------------------
# Default key – REPLACE in production with a secret loaded from env / vault
# ---------------------------------------------------------------------------
DEFAULT_KEY = "3a8b5f92f3b1c57b9f8d4c36a57d6c0e"


# ---------------------------------------------------------------------------
# Date of Birth
# ---------------------------------------------------------------------------

def encrypt_dob_preserve_year(
    dob: Optional[str],
    key: bytes = DEFAULT_KEY.encode(),
) -> Optional[str]:
    """
    Mask the month and day of a date of birth while preserving the year.

    The transformation is deterministic (same input + key → same output) and
    based on HMAC-SHA256, so it cannot be reversed without the key.

    Supported input formats:
        "YYYY-MM-DD"               e.g. 1978-08-30
        "YYYYMMDD"                 e.g. 19780830
        "DD-MMM-YYYY HH:MM:SS.f"   e.g. 30-AUG-1978 00:00:00.000

    Returns "YYYY-MM-DD" with year intact, or None if input is None.
    Falls back to "1900-01-01" on unrecognised formats.
    """
    if dob is None:
        return None

    formats = [
        "%Y-%m-%d",
        "%Y%m%d",
        "%d-%b-%Y %H:%M:%S.%f",
    ]

    parsed = None
    for fmt in formats:
        try:
            parsed = datetime.datetime.strptime(dob.strip(), fmt).date()
            break
        except ValueError:
            continue

    if parsed is None:
        return "1900-01-01"

    digest = hmac.new(key, dob.encode(), hashlib.sha256).digest()
    month = (digest[0] % 12) + 1
    day   = (digest[1] % 28) + 1

    return datetime.date(parsed.year, month, day).isoformat()


# ---------------------------------------------------------------------------
# Passport numbers
# ---------------------------------------------------------------------------

def _detect_passport_structure(passport: str) -> Tuple[str, str, str, str]:
    """
    Split a passport number into (prefix, core, suffix, alphabet).

    prefix / suffix – leading / trailing alpha characters (not encrypted)
    core            – the segment that will be FPE-encrypted
    alphabet        – character set of core ("0-9" or "A-Z0-9")
    """
    cleaned = passport.strip().upper()

    # Numeric core  e.g. A1234567Z
    m = re.fullmatch(r"([A-Z]*)(\d+)([A-Z]*)", cleaned)
    if m:
        prefix, core, suffix = m.groups()
        return prefix, core, suffix, "0123456789"

    # Alphanumeric core  e.g. AB1234567, 12AB12345
    m = re.fullmatch(r"([A-Z]*)([A-Z0-9]+)([A-Z]*)", cleaned)
    if m:
        prefix, core, suffix = m.groups()
        return prefix, core, suffix, "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789"

    raise ValueError(f"Unsupported passport format: {passport!r}")


def encrypt_passport(
    passport: Optional[str],
    key: bytes = DEFAULT_KEY.encode(),
) -> Optional[str]:
    """Format-preserving encryption of a passport number."""
    if not passport:
        return None
    try:
        prefix, core, suffix, alphabet = _detect_passport_structure(passport)
        cipher = pyffx.String(key, alphabet=alphabet, length=len(core))
        return f"{prefix}{cipher.encrypt(core)}{suffix}"
    except Exception as exc:
        raise ValueError(f"Passport encryption failed: {exc}") from exc


def decrypt_passport(
    encrypted: Optional[str],
    key: bytes = DEFAULT_KEY.encode(),
) -> Optional[str]:
    """Reverse of encrypt_passport."""
    if not encrypted:
        return None
    try:
        prefix, core, suffix, alphabet = _detect_passport_structure(encrypted)
        cipher = pyffx.String(key, alphabet=alphabet, length=len(core))
        return f"{prefix}{cipher.decrypt(core)}{suffix}"
    except Exception as exc:
        raise ValueError(f"Passport decryption failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Singapore NRIC / FIN
# ---------------------------------------------------------------------------

def _sg_checksum(prefix: str, digits: str) -> str:
    """Compute the MOD-11 checksum letter for a Singapore NRIC/FIN."""
    weights = [2, 7, 6, 5, 4, 3, 2]
    total = sum(int(d) * w for d, w in zip(digits, weights))

    if prefix in {"T", "G"}:
        total += 4

    remainder = total % 11

    maps = {
        "S": list("JZIHGFEDCBA"),
        "T": list("JZIHGFEDCBA"),
        "F": list("XWUTRQPNMLK"),
        "G": list("XWUTRQPNMLK"),
        "M": list(reversed("JZIHGFEDCBA")),
    }
    if prefix not in maps:
        raise ValueError(f"Unsupported NRIC/FIN prefix: {prefix!r}")
    return maps[prefix][remainder]


def encrypt_sg_id(
    id_number: Optional[str],
    key: bytes = DEFAULT_KEY.encode(),
) -> Optional[str]:
    """
    FPE encryption of a Singapore NRIC or FIN.

    Valid format: [STFGM]DDDDDDD[A-Z]
    The 7-digit numeric segment is encrypted; prefix and checksum letter are
    recomputed to keep the result a valid-looking NRIC/FIN.
    """
    if not id_number or not id_number.strip():
        return None

    nid = id_number.strip().upper()

    if re.fullmatch(r"[STFGM]\d{7}[A-Z]", nid):
        prefix  = nid[0]
        digits  = nid[1:8]
        cipher  = pyffx.String(key, alphabet="0123456789", length=7)
        enc     = cipher.encrypt(digits)
        return f"{prefix}{enc}{_sg_checksum(prefix, enc)}"

    # Fallback: treat as passport-style
    return encrypt_passport(nid, key)


def decrypt_sg_id(
    encrypted: Optional[str],
    key: bytes = DEFAULT_KEY.encode(),
) -> Optional[str]:
    """Reverse of encrypt_sg_id."""
    if not encrypted or not encrypted.strip():
        return None

    nid = encrypted.strip().upper()

    if re.fullmatch(r"[STFGM]\d{7}[A-Z]", nid):
        prefix  = nid[0]
        digits  = nid[1:8]
        cipher  = pyffx.String(key, alphabet="0123456789", length=7)
        dec     = cipher.decrypt(digits)
        return f"{prefix}{dec}{_sg_checksum(prefix, dec)}"

    return decrypt_passport(nid, key)


# ---------------------------------------------------------------------------
# Names  (one-way hash)
# ---------------------------------------------------------------------------

def hash_name(
    name: Optional[str],
    salt: str = DEFAULT_KEY,
) -> Optional[str]:
    """
    SHA-256 hash of a normalised, salted name.

    One-way – there is no decrypt function.
    Returns None for None / blank input.
    """
    if not name or not name.strip():
        return None
    salted = (salt + name.strip().lower()).encode("utf-8")
    return hashlib.sha256(salted).hexdigest()
