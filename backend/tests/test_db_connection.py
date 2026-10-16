import pytest

from swale.db.connection import QueryFailed, connect, run, run_one


def test_run_returns_one_result_per_statement():
    with connect("mem://") as db:
        assert run(db, "RETURN 1; RETURN 2;") == [1, 2]


def test_run_raises_when_a_later_statement_fails():
    # surrealdb 2.0.0's own query() silently drops this error; run() must not.
    with connect("mem://") as db:
        with pytest.raises(QueryFailed) as err:
            run(db, "RETURN 1; THROW 'boom';")
    assert err.value.index == 1
    assert "boom" in err.value.message


def test_run_raises_on_parse_error():
    with connect("mem://") as db:
        with pytest.raises(QueryFailed) as err:
            run(db, "SELEC nonsense;")
    assert err.value.index == -1


def test_run_one_returns_records_with_record_ids():
    with connect("mem://") as db:
        rows = run_one(db, "CREATE thing:a SET n = 1;")
    assert str(rows[0]["id"]) == "thing:a"
    assert rows[0]["n"] == 1


def test_run_one_rejects_multiple_statements():
    with connect("mem://") as db:
        with pytest.raises(ValueError):
            run_one(db, "RETURN 1; RETURN 2;")


def test_surrealkv_creates_parent_dirs_and_persists(tmp_path):
    url = f"surrealkv://{tmp_path / 'nested' / 'swale.kv'}"
    with connect(url) as db:
        run(db, "CREATE thing:a SET n = 1;")
    with connect(url) as db:
        assert run_one(db, "SELECT VALUE n FROM thing:a;") == [1]
