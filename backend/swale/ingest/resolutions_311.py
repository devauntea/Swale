"""DEP 311 resolution text -> verification status, by deterministic phrase rules.

The phrases come from DEP's templated resolutions on Brooklyn complaints since 2024
(docs/data-sources.md). Matching ignores case and whitespace, and never guesses:
no match gives UNKNOWN, and matches that disagree give UNKNOWN.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Any

from swale.core.trust import KnowledgeType, Verification, verification_knowledge_type

BASIS = "dep_311_resolution"
V = Verification


@dataclass(frozen=True)
class Rule:
    id: str
    status: Verification
    phrase: str  # lower-case, single-spaced


@dataclass(frozen=True)
class VerificationResult:
    status: Verification
    knowledge_type: KnowledgeType
    basis: str | None
    rule: str | None
    text: str | None
    at: datetime | None

    def as_doc(self) -> dict[str, Any]:
        return {
            "status": self.status.value,
            "knowledge_type": self.knowledge_type.value,
            "basis": self.basis,
            "rule": self.rule,
            "text": self.text,
            "at": self.at,
        }


DEP_RULES: tuple[Rule, ...] = (
    Rule("dep-res-obstruction-v1", V.AGENCY_FOUND_OBSTRUCTION, "found that debris was obstructing the catch basin"),
    Rule("dep-res-surcharge-grease-v1", V.AGENCY_FOUND_OBSTRUCTION, "surcharge conditions have been confirmed and attributed to grease"),
    Rule("dep-res-surcharge-defect-v1", V.AGENCY_FOUND_DEFECT, "surcharge conditions have been confirmed and is attributed to a defective sewer"),
    Rule("dep-res-surcharge-rain-v1", V.CAPACITY_SURCHARGE, "surcharge conditions have been confirmed due to rain intensity or volume"),
    Rule("dep-res-overtaxed-rain-v1", V.CAPACITY_SURCHARGE, "was overtaxed due to heavy rain"),
    Rule("dep-res-repair-work-v1", V.AGENCY_FOUND_DEFECT, "has performed repair work"),
    Rule("dep-res-repaired-v1", V.AGENCY_FOUND_DEFECT, "inspected your complaint and repaired the problem"),
    Rule("dep-res-defect-found-v1", V.AGENCY_FOUND_DEFECT, "a defect was found"),
    Rule("dep-res-cleaned-v1", V.AGENCY_CLEANED, "cleaned the catch basin or inlet"),
    Rule("dep-res-functioning-v1", V.AGENCY_FUNCTIONING, "the catch basin is now functioning properly"),
    Rule("dep-res-not-found-v1", V.AGENCY_NOT_FOUND, "could not find the problem you reported"),
    Rule("dep-res-no-city-backup-v1", V.AGENCY_NOT_FOUND, "found there was no sewer back up in the city system"),
    Rule("dep-res-private-plumbing-v1", V.AGENCY_NOT_FOUND, "there was no indication of a city sewer issue"),
    Rule("dep-res-duplicate-v1", V.DUPLICATE, "previously reported by another customer"),
    Rule("dep-res-referred-dot-v1", V.REFERRED, "referred it to the department of transportation"),
    Rule("dep-res-referred-other-v1", V.REFERRED, "referred it to another agency or utility"),
    Rule("dep-res-jurisdiction-v1", V.REFERRED, "it is outside its jurisdiction"),
    Rule("dep-res-pending-v1", V.PENDING, "further investigation is required"),
    Rule("dep-res-phone-v1", V.NO_INSPECTION, "resolved this complaint by speaking to the complainant on the phone"),
)


def _normalize(text: str) -> str:
    return " ".join(text.lower().split())


def classify(agency: str | None, text: str | None, at: datetime | None) -> VerificationResult:
    """Classify one complaint's resolution. ``at`` is the resolution time in UTC."""
    if agency != "DEP":
        return VerificationResult(V.UNVERIFIED, KnowledgeType.REPORTED, None, None, text, at)
    if not text or not text.strip():
        return VerificationResult(V.NONE, KnowledgeType.REPORTED, BASIS, None, None, at)
    normalized = _normalize(text)
    matches = [rule for rule in DEP_RULES if rule.phrase in normalized]
    if not matches or len({m.status for m in matches}) > 1:
        return VerificationResult(V.UNKNOWN, KnowledgeType.REPORTED, BASIS, None, text, at)
    rule = matches[0]
    return VerificationResult(rule.status, verification_knowledge_type(rule.status), BASIS, rule.id, text, at)
