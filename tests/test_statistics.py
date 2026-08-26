import pandas as pd
import pytest

from app.services.statistics import analyze_column, grouped_frequency, quantitative_statistics


def test_quantitative_statistics_for_known_sample():
    result = quantitative_statistics(pd.Series([1, 2, 2, 4, 6]))
    assert result["mean"] == pytest.approx(3.0)
    assert result["median"] == 2.0
    assert result["mode"] == [2.0]
    assert result["q1"] == 2.0
    assert result["q3"] == 4.0
    assert result["range"] == 5.0


def test_nominal_frequency_has_no_cumulative_values():
    frame = pd.DataFrame({"Curso": ["A", "B", "A", None]})
    result = analyze_column(frame, "Curso", "qualitative_nominal")
    assert result["valid_count"] == 3
    assert result["frequency_table"][0]["value"] == "A"
    assert result["frequency_table"][0]["frequency"] == 2
    assert result["frequency_table"][0]["cumulative_frequency"] is None


def test_ordinal_frequency_respects_supplied_order():
    frame = pd.DataFrame({"Nível": ["Alto", "Baixo", "Médio", "Alto"]})
    result = analyze_column(
        frame,
        "Nível",
        "qualitative_ordinal",
        ordinal_order=["Baixo", "Médio", "Alto"],
    )
    assert [row["value"] for row in result["frequency_table"]] == ["Baixo", "Médio", "Alto"]
    assert result["frequency_table"][-1]["cumulative_frequency"] == 4


def test_grouped_frequency_preserves_total_and_last_cumulative():
    rows, bins = grouped_frequency(pd.Series(range(1, 101)), bins=5)
    assert bins == 5
    assert sum(row["frequency"] for row in rows) == 100
    assert rows[-1]["cumulative_frequency"] == 100
    assert rows[-1]["cumulative_percentage"] == 100.0


def test_constant_series_creates_one_class():
    rows, bins = grouped_frequency(pd.Series([7, 7, 7]), bins=5)
    assert bins == 1
    assert rows[0]["midpoint"] == 7
    assert rows[0]["frequency"] == 3


def test_constant_series_has_a_mode():
    result = quantitative_statistics(pd.Series([7, 7, 7]))
    assert result["mode"] == [7.0]
    assert result["mode_note"] is None


def test_rejects_grouping_for_qualitative_variable():
    frame = pd.DataFrame({"Cor": ["Azul", "Verde"]})
    with pytest.raises(ValueError, match="aplicáveis apenas"):
        analyze_column(frame, "Cor", "qualitative_nominal", grouped=True)
