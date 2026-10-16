from datetime import datetime, timezone

import pytest

from swale.core.trust import AGENCY_FINDINGS, KnowledgeType, Verification
from swale.ingest.resolutions_311 import BASIS, DEP_RULES, classify
from swale.ingest.taxonomy_311 import CATEGORY_LABELS, categorize, soql_filter

AT = datetime(2026, 7, 23, 16, 45, tzinfo=timezone.utc)

# Real descriptor pairs from Brooklyn 311 data (2024 onward), both DEP taxonomies.
@pytest.mark.parametrize(
    ("complaint_type", "descriptor", "category"),
    [
        ("Sewer", "Catch Basin Clogged/Flooding (Use Comments) (SC)", "catch_basin_clogged"),
        ("Sewer Maintenance", "Catch Basin Clogged", "catch_basin_clogged"),
        ("Sewer", "Street Flooding (SJ)", "street_flooding"),
        ("Sewer Maintenance", "Flooding on Street", "street_flooding"),
        ("Sewer", "Highway Flooding (SH)", "highway_flooding"),
        ("Sewer Maintenance", "Flooding on Highway", "highway_flooding"),
        ("Sewer", "Sewer Backup (Use Comments) (SA)", "sewer_backup"),
        ("Sewer Maintenance", "Backup", "sewer_backup"),
        ("Sewer", "Manhole Overflow (Use Comments) (SA1)", "manhole_overflow"),
        ("Sewer", "Catch Basin Sunken/Damaged/Raised (SC1)", "catch_basin_damaged"),
        ("Sewer Maintenance", "Catch Basin Sunken", "catch_basin_damaged"),
        ("Sewer", "Catch Basin Grating Missing (SA4)", "catch_basin_damaged"),
        ("Sewer Maintenance", "Catch Basin Grate Missing", "catch_basin_damaged"),
        ("Sewer", "Catch Basin Search (SC2)", "catch_basin_other"),
        ("Sewer", "Culvert Blocked/Needs Cleaning (SE)", "culvert_blocked"),
        ("Industrial Waste", "Concrete In Catch Basin (IEA)", "basin_contamination"),
        ("Street Condition", "Pothole", "pothole"),
        ("Street Condition", "Cave-in", "cave_in"),
        ("Sewer", "Sewer Odor (SA2)", "other"),
        (None, None, "other"),
    ],
)
def test_categorize(complaint_type, descriptor, category):
    assert categorize(complaint_type, descriptor) == category
    assert category in CATEGORY_LABELS


def test_soql_filter_loads_dep_sewer_types_in_full_and_only_relevant_others():
    assert soql_filter() == (
        "(complaint_type in('Sewer','Sewer Maintenance')"
        " OR (complaint_type = 'Industrial Waste' AND descriptor in("
        "'Concrete In Catch Basin (IEA)','Wastewater Into Catch Basin (IEB)','Grease In Sewer/Catch Basin (IDG)'))"
        " OR (complaint_type = 'Street Condition' AND descriptor in('Pothole','Cave-in')))"
    )


# Full, unedited DEP resolution texts from Brooklyn 311 data (2024 onward).
REAL_TEXTS = [
    ("The Department of Environmental Protection has investigated this complaint and found that debris was obstructing the catch basin.", "agency_found_obstruction", "dep-res-obstruction-v1"),
    ("The Department of Environmental Protection has investigated this complaint. Surcharge conditions have been confirmed and attributed to grease. Work was performed to relieve the blockage.", "agency_found_obstruction", "dep-res-surcharge-grease-v1"),
    ("The Department of Environmental Protection has investigated this complaint. Surcharge conditions have been confirmed and is attributed to a defective sewer.", "agency_found_defect", "dep-res-surcharge-defect-v1"),
    ("The Department of Environmental Protection has investigated this complaint. Surcharge conditions have been confirmed due to rain intensity or volume.", "capacity_surcharge", "dep-res-surcharge-rain-v1"),
    ("The Department of Environmental Protection inspected your complaint and cleaned the catch basin or inlet. If the condition returns, please call 311 (or 212-639-9675 if calling from a non-New York City area code) to submit a new complaint.", "agency_cleaned", "dep-res-cleaned-v1"),
    ("The Department of Environmental Protection inspected your complaint and determined that the catch basin is now functioning properly.  If the condition returns, please call 311 (or 212-639-9675 if calling from a non-New York City area code) to submit a new complaint.", "agency_functioning", "dep-res-functioning-v1"),
    ("The Department of Environment Protection inspected your complaint but could not find the problem you reported. If the condition persists, please call 311 (or 212-639-9675 if calling from a non-New York City area code) with more detailed information to submit a new complaint.", "agency_not_found", "dep-res-not-found-v1"),
    ("The Department of Environmental Protection investigated this complaint and found there was no sewer back up in the city system at the time of the inspection.", "agency_not_found", "dep-res-no-city-backup-v1"),
    ("The Department of Environmental Protection has investigated this complaint. Upon investigation, there was no indication of a city sewer issue and there is a suspected sewer backup due to an internal plumbing issue.", "agency_not_found", "dep-res-private-plumbing-v1"),
    ("The Department of Environmental Protection has determined that this issue was previously reported by another customer The original complaint is being addressed. If the condition persists, please call 311 (or 212-639-9675 if calling from a non-New York City area code) to submit a new complaint.", "duplicate", "dep-res-duplicate-v1"),
    ("The Department of Environmental Protection has determined that this issue was previously reported by another customer The original complaint is being addressed. If the condition persists, please call 311 (or 212-639-9675 if calling from a non-New York City area code) with more detailed information to submit a new complaint.", "duplicate", "dep-res-duplicate-v1"),
    ("The Department of Environmental Protection inspected your complaint and referred it to the Department of Transportation for further action. If the problem persists, please call 311 (or 212-639-9675 if calling from a non-New York City area code) to submit a new complaint.", "referred", "dep-res-referred-dot-v1"),
    ("The Department of Environmental Protection investigated this complaint and referred it to another agency or utility for further action.", "referred", "dep-res-referred-other-v1"),
    ("The Department of Environmental Protection inspected the condition and determined that it is outside its jurisdiction.", "referred", "dep-res-jurisdiction-v1"),
    ("The Department of Environmental Protection has inspected your complaint and determined that further investigation is required. More information will be available once the condition is resolved. Please visit nyc.gov/311 or call 311 at a later time to check the status of your complaint.", "pending", "dep-res-pending-v1"),
    ("The Department of Environmental Protection resolved this complaint by speaking to the complainant on the phone.", "no_inspection", "dep-res-phone-v1"),
]


@pytest.mark.parametrize(("text", "status", "rule"), REAL_TEXTS)
def test_every_real_dep_template_is_classified(text, status, rule):
    result = classify("DEP", text, AT)
    assert (result.status.value, result.rule) == (status, rule)
    assert result.basis == BASIS
    assert result.text == text
    assert result.at == AT
    expected_kt = KnowledgeType.OBSERVED if result.status in AGENCY_FINDINGS else KnowledgeType.REPORTED
    assert result.knowledge_type is expected_kt


def test_non_dep_complaints_are_unverified_but_keep_their_text():
    result = classify("DOT", "The Department of Transportation inspected the condition.", AT)
    assert result.status is Verification.UNVERIFIED
    assert (result.basis, result.rule) == (None, None)
    assert result.text == "The Department of Transportation inspected the condition."


@pytest.mark.parametrize("text", [None, "", "   "])
def test_missing_resolution_text_is_none(text):
    result = classify("DEP", text, None)
    assert result.status is Verification.NONE
    assert result.knowledge_type is KnowledgeType.REPORTED


def test_unmatched_text_is_unknown_and_preserved():
    text = "The Department of Environmental Protection reviewed this complaint."
    result = classify("DEP", text, AT)
    assert result.status is Verification.UNKNOWN
    assert result.rule is None
    assert result.text == text


def test_conflicting_phrases_are_unknown_not_guessed():
    text = "Found that debris was obstructing the catch basin but could not find the problem you reported."
    assert classify("DEP", text, AT).status is Verification.UNKNOWN


def test_matching_ignores_case_and_whitespace():
    text = "FOUND THAT DEBRIS   WAS\nobstructing the catch basin."
    assert classify("DEP", text, AT).status is Verification.AGENCY_FOUND_OBSTRUCTION


def test_rules_are_unique_and_normalized():
    assert len({r.id for r in DEP_RULES}) == len(DEP_RULES)
    for rule in DEP_RULES:
        assert rule.phrase == " ".join(rule.phrase.lower().split())


def test_as_doc_shape():
    doc = classify("DEP", REAL_TEXTS[0][0], AT).as_doc()
    assert doc == {
        "status": "agency_found_obstruction",
        "knowledge_type": "observed",
        "basis": "dep_311_resolution",
        "rule": "dep-res-obstruction-v1",
        "text": REAL_TEXTS[0][0],
        "at": AT,
    }
