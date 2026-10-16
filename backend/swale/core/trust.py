"""Swale's trust vocabulary: what kind of knowledge a record is, and how an incident was verified."""

from enum import StrEnum


class KnowledgeType(StrEnum):
    OBSERVED = "observed"  # sensor reading, authoritative inventory, agency field finding
    REPORTED = "reported"  # unverified public report, e.g. a 311 complaint
    PREDICTED = "predicted"  # model output: Swale simulation, DEP flood map, NWS forecast
    INFERRED = "inferred"  # derived by Swale's own rules


class Verification(StrEnum):
    AGENCY_FOUND_OBSTRUCTION = "agency_found_obstruction"
    AGENCY_FOUND_DEFECT = "agency_found_defect"
    AGENCY_CLEANED = "agency_cleaned"
    AGENCY_NOT_FOUND = "agency_not_found"
    AGENCY_FUNCTIONING = "agency_functioning"
    CAPACITY_SURCHARGE = "capacity_surcharge"
    DUPLICATE = "duplicate"
    REFERRED = "referred"
    PENDING = "pending"
    NO_INSPECTION = "no_inspection"
    NONE = "none"
    UNKNOWN = "unknown"
    UNVERIFIED = "unverified"


#: What an agency found in the field. Only a DEP resolution rule may set these.
AGENCY_FINDINGS = frozenset(
    {
        Verification.AGENCY_FOUND_OBSTRUCTION,
        Verification.AGENCY_FOUND_DEFECT,
        Verification.AGENCY_CLEANED,
        Verification.AGENCY_NOT_FOUND,
        Verification.AGENCY_FUNCTIONING,
        Verification.CAPACITY_SURCHARGE,
    }
)


def verification_knowledge_type(status: Verification) -> KnowledgeType:
    """Agency field findings are observations; any other outcome leaves the complaint a report."""
    return KnowledgeType.OBSERVED if status in AGENCY_FINDINGS else KnowledgeType.REPORTED
