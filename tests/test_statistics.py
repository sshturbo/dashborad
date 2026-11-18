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
    assert result["ordinal_order"] == ["Baixo", "Médio", "Alto"]
    assert result["ordinal_order_source"] == "custom"


def test_ordinal_defaults_to_recognized_semantic_order():
    frame = pd.DataFrame({"Nível": ["Alto", "Muito baixo", "Médio", "Baixo", "Alto"]})

    result = analyze_column(frame, "Nível", "qualitative_ordinal")

    assert result["ordinal_order"] == ["Muito baixo", "Baixo", "Médio", "Alto"]
    assert result["ordinal_order_source"] == "recognized"
    assert [row["value"] for row in result["frequency_table"]] == result["ordinal_order"]
    assert [row["cumulative_frequency"] for row in result["frequency_table"]] == [1, 2, 3, 5]


def test_unknown_ordinal_categories_default_to_first_appearance_for_review():
    frame = pd.DataFrame({"Preferência": ["Centro", "Sul", "Norte", "Sul"]})

    result = analyze_column(frame, "Preferência", "qualitative_ordinal")

    assert result["ordinal_order"] == ["Centro", "Sul", "Norte"]
    assert result["ordinal_order_source"] == "appearance"
    assert [row["value"] for row in result["frequency_table"]] == ["Centro", "Sul", "Norte"]
    assert [row["cumulative_frequency"] for row in result["frequency_table"]] == [1, 3, 4]


def test_partial_custom_ordinal_order_appends_unmentioned_categories_by_appearance():
    frame = pd.DataFrame({"Nível": ["Alto", "Baixo", "Médio", "Alto"]})

    result = analyze_column(
        frame,
        "Nível",
        "qualitative_ordinal",
        ordinal_order=["Médio", "Alto"],
    )

    assert result["ordinal_order"] == ["Médio", "Alto", "Baixo"]
    assert result["ordinal_order_source"] == "custom"
    assert [row["value"] for row in result["frequency_table"]] == ["Médio", "Alto", "Baixo"]


@pytest.mark.parametrize(
    "invalid_order",
    [
        "Baixo, Alto",
        ["Baixo", "Baixo"],
        ["Baixo", "Ausente"],
        [""],
        [1],
        [None],
    ],
)
def test_rejects_invalid_custom_ordinal_orders(invalid_order):
    frame = pd.DataFrame({"Nível": ["Baixo", "Alto"]})

    with pytest.raises(ValueError, match="ordem ordinal"):
        analyze_column(frame, "Nível", "qualitative_ordinal", ordinal_order=invalid_order)


def test_custom_ordinal_labels_can_contain_commas():
    frame = pd.DataFrame({"Nível": ["Nível baixo, inicial", "Alto", "Médio"]})

    result = analyze_column(
        frame,
        "Nível",
        "qualitative_ordinal",
        ordinal_order=["Alto"],
    )

    assert result["ordinal_order"] == ["Alto", "Nível baixo, inicial", "Médio"]
    assert [row["value"] for row in result["frequency_table"]] == result["ordinal_order"]


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


def test_grouped_reported_intervals_preserve_source_ranges_and_estimate_measures():
    values = (
        ["Entre 1 a 15 minutos"] * 29
        + ["Entre 16 a 30 minutos"] * 20
        + ["Entre 45 a 60 minutos"]
    )
    result = analyze_column(
        pd.DataFrame({"Tempo TI": values}),
        "Tempo TI",
        "quantitative_continuous",
        grouped=True,
        bins=3,
        allow_type_override=True,
    )

    rows = result["frequency_table"]
    assert result["grouping"]["source"] == "reported_intervals"
    assert result["grouping"]["method"] == "original"
    assert result["grouping"]["class_count"] == 3
    assert [(row["value"], row["lower"], row["upper"], row["midpoint"], row["frequency"], row["cumulative_frequency"]) for row in rows] == [
        ("Entre 1 a 15 minutos", 1.0, 15.0, 8.0, 29, 29),
        ("Entre 16 a 30 minutos", 16.0, 30.0, 23.0, 20, 49),
        ("Entre 45 a 60 minutos", 45.0, 60.0, 52.5, 1, 50),
    ]
    assert rows[0]["percentage"] == pytest.approx(58.0)
    assert result["grouped_statistics"]["mean"] == pytest.approx(14.89)
    assert result["grouped_statistics"]["q1"] == pytest.approx(1 + (12.5 / 29) * 14)
    assert result["grouped_statistics"]["median"] == pytest.approx(1 + (25 / 29) * 14)
    assert result["grouped_statistics"]["q3"] == pytest.approx(16 + (8.5 / 20) * 14)
    assert result["grouped_statistics"]["mode"] is None
    assert result["grouped_statistics"]["modal_classes"] == ["Entre 1 a 15 minutos"]
    assert result["grouped_statistics"]["mode_note"] == "Classe modal: Entre 1 a 15 minutos"
    assert result["charts"]["cumulative_x"] == [1.0, 15.0, 16.0, 30.0, 45.0, 60.0]
    assert result["charts"]["cumulative_y"] == [0, 29, 29, 49, 49, 50]


@pytest.mark.parametrize(
    "values",
    [
        ["1 a 20", "15 a 30", "40 a 50"],
        ["1 a 15", "16 a 30", "45"],
    ],
)
def test_overlapping_or_mixed_ranges_remain_categories_without_fabricated_midpoints(values):
    frame = pd.DataFrame({"Resposta": values})
    result = analyze_column(frame, "Resposta", "qualitative_nominal")
    assert result["valid_count"] == len(values)
    assert result["statistics"] is None
    assert result["grouped"] is False
    with pytest.raises(ValueError, match="qualitativa"):
        analyze_column(frame, "Resposta", "quantitative_continuous", grouped=True, allow_type_override=True)


def test_grouped_reported_interval_variants_are_counted_together():
    values = ["Entre 1 a 15 minutos", "1,0 a 15,0 min", "16 a 30"]
    result = analyze_column(
        pd.DataFrame({"Tempo": values}),
        "Tempo",
        "quantitative_continuous",
        grouped=True,
        allow_type_override=True,
    )

    assert result["grouping"]["source"] == "reported_intervals"
    assert [row["frequency"] for row in result["frequency_table"]] == [2, 1]
    assert result["frequency_table"][0]["source_labels"] == [
        "Entre 1 a 15 minutos", "1,0 a 15,0 min"
    ]


@pytest.mark.parametrize("grouped", [False, True])
def test_reported_open_intervals_preserve_counts_without_individual_observations(grouped):
    values = [
        "Entre 5 a 6 horas", "+8 horas", "Entre 7 a 8 horas",
        "Entre 5 a 6 horas", "+8 horas", None, "",
    ]

    result = analyze_column(
        pd.DataFrame({"Tempo": values}),
        "Tempo",
        "quantitative_continuous",
        grouped=grouped,
        bins=2,
        allow_type_override=True,
    )

    rows = result["frequency_table"]
    assert result["total_rows"] == 7
    assert result["valid_count"] == 5
    assert result["missing_count"] == 2
    assert result["grouped"] is True
    assert result["statistics"] is None
    assert result["grouping"]["source"] == "reported_intervals"
    assert result["grouping"]["method"] == "original"
    assert result["grouping"]["class_count"] == 3
    assert [(row["value"], row["frequency"], row["cumulative_frequency"]) for row in rows] == [
        ("Entre 5 a 6 horas", 2, 2),
        ("Entre 7 a 8 horas", 1, 3),
        ("+8 horas", 2, 5),
    ]
    assert rows[-1]["lower"] == 8
    assert rows[-1]["upper"] is None
    assert rows[-1]["midpoint"] is None
    assert sum(row["percentage"] for row in rows) == pytest.approx(100)
    assert result["grouped_statistics"]["mean"] is None
    assert result["grouped_statistics"]["q1"] == pytest.approx(5.625)
    assert result["grouped_statistics"]["median"] == pytest.approx(7.5)
    assert result["grouped_statistics"]["q2"] == pytest.approx(7.5)
    assert result["grouped_statistics"]["q3"] is None
    assert result["grouped_statistics"]["mode"] is None
    assert result["grouped_statistics"]["modal_classes"] == ["Entre 5 a 6 horas", "+8 horas"]
    assert result["charts"]["frequencies"] == [2, 1, 2]
    for key in ("series_x", "series_y", "box_values", "cumulative_x", "cumulative_y"):
        assert result["charts"][key] == []


@pytest.mark.parametrize(
    ("counts", "q1", "median", "q3"),
    [
        ([1, 1, 6], 8.0, None, None),
        ([6, 1, 1], 5 + 2 / 6, 5 + 4 / 6, 6.0),
    ],
)
def test_open_interval_only_suppresses_quantiles_inside_the_open_class(counts, q1, median, q3):
    labels = ["Entre 5 a 6 horas", "Entre 7 a 8 horas", "+8 horas"]
    values = [label for label, count in zip(labels, counts) for _ in range(count)]

    result = analyze_column(
        pd.DataFrame({"Tempo": values}), "Tempo", "quantitative_continuous", allow_type_override=True
    )

    estimates = result["grouped_statistics"]
    assert estimates["mean"] is None
    for key, expected in (("q1", q1), ("median", median), ("q2", median), ("q3", q3)):
        if expected is None:
            assert estimates[key] is None
        else:
            assert estimates[key] == pytest.approx(expected)


@pytest.mark.parametrize("grouped", [False, True])
def test_closed_reported_intervals_also_do_not_create_individual_values(grouped):
    frame = pd.DataFrame({"Tempo": ["Entre 1 a 3 horas", "Entre 5 a 7 horas", "Entre 1 a 3 horas"]})

    result = analyze_column(frame, "Tempo", "quantitative_continuous", grouped=grouped, allow_type_override=True)

    assert result["grouped"] is True
    assert result["statistics"] is None
    assert result["valid_count"] == 3
    assert result["grouping"]["source"] == "reported_intervals"
    assert [row["frequency"] for row in result["frequency_table"]] == [2, 1]
    assert result["grouped_statistics"]["mean"] == pytest.approx(10 / 3)
    assert result["charts"]["cumulative_x"] == [1.0, 3.0, 5.0, 7.0]
    assert result["charts"]["cumulative_y"] == [0, 2, 2, 3]
    for key in ("series_x", "series_y", "box_values"):
        assert result["charts"][key] == []


def test_plus_prefixed_numbers_remain_exact_individual_observations():
    result = analyze_column(
        pd.DataFrame({"Nota": ["+8", "+8", "+10"]}),
        "Nota",
        "quantitative_discrete",
    )

    assert result["grouped"] is False
    assert result["valid_count"] == 3
    assert result["statistics"]["mean"] == pytest.approx(26 / 3)
    assert result["charts"]["series_y"] == [8.0, 8.0, 10.0]


def test_grouped_constant_and_modal_ties_are_reported_without_losing_values():
    constant = analyze_column(
        pd.DataFrame({"Nota": [7, 7, 7]}),
        "Nota",
        "quantitative_discrete",
        grouped=True,
        bins=4,
    )
    assert constant["grouped_statistics"]["mean"] == 7
    assert constant["grouped_statistics"]["median"] == 7
    assert constant["grouped_statistics"]["mode"] == 7

    tied = analyze_column(
        pd.DataFrame({"Nota": [1, 1, 9, 9]}),
        "Nota",
        "quantitative_discrete",
        grouped=True,
        bins=2,
    )
    assert tied["grouped_statistics"]["mode"] is None
    assert tied["grouped_statistics"]["modal_classes"] == ["[1; 5[", "[5; 9]"]
    assert tied["grouped_statistics"]["mode_note"] == "Classes modais: [1; 5[; [5; 9]"


def test_constant_series_has_a_mode():
    result = quantitative_statistics(pd.Series([7, 7, 7]))
    assert result["mode"] == [7.0]
    assert result["mode_note"] is None


def test_rejects_grouping_for_qualitative_variable():
    frame = pd.DataFrame({"Cor": ["Azul", "Verde"]})
    with pytest.raises(ValueError, match="aplicáveis apenas"):
        analyze_column(frame, "Cor", "qualitative_nominal", grouped=True)


def test_classification_can_change_within_its_numeric_or_text_family():
    text = pd.DataFrame({"Cor": ["Azul", "Verde", "Azul"]})
    numeric = pd.DataFrame({"Nota": [1, 2, 3]})
    assert analyze_column(text, "Cor", "qualitative_ordinal")["variable_type"] == "qualitative_ordinal"
    assert analyze_column(numeric, "Nota", "quantitative_continuous")["variable_type"] == "quantitative_continuous"


@pytest.mark.parametrize(
    ("frame", "column", "classification", "expected_family"),
    [
        (pd.DataFrame({"Cor": ["Azul", "Verde"]}), "Cor", "quantitative_discrete", "qualitativa"),
        (pd.DataFrame({"Nota": [4, 5]}), "Nota", "qualitative_nominal", "quantitativa"),
    ],
)
def test_rejects_classification_from_the_wrong_data_family(frame, column, classification, expected_family):
    with pytest.raises(ValueError, match=expected_family):
        analyze_column(frame, column, classification)


def test_ordinal_range_analysis_preserves_labels_and_counts_without_numeric_statistics():
    values = ["Entre 121 a 180 mpbs", "Entre 61 a 120 mpbs", "Entre 121 a 180 mpbs", None, ""]
    result = analyze_column(pd.DataFrame({"Velocidade": values}), "Velocidade", "qualitative_ordinal")
    assert result["statistics"] is None
    assert result["grouped_statistics"] is None
    assert result["grouped"] is False
    assert result["valid_count"] == 3
    assert result["missing_count"] == 2
    assert result["ordinal_order_source"] == "recognized"
    assert [(row["value"], row["frequency"]) for row in result["frequency_table"]] == [
        ("Entre 61 a 120 mpbs", 1), ("Entre 121 a 180 mpbs", 2)
    ]
    assert result["charts"]["series_y"] == []


def test_range_estimates_require_explicit_numeric_override():
    frame = pd.DataFrame({"Velocidade": ["Entre 61 a 120 mpbs", "Entre 121 a 180 mpbs"]})
    with pytest.raises(ValueError, match="qualitativa"):
        analyze_column(frame, "Velocidade", "quantitative_continuous")
    result = analyze_column(frame, "Velocidade", "quantitative_continuous", allow_type_override=True)
    assert result["grouping"]["source"] == "reported_intervals"
    assert result["statistics"] is None
    assert result["grouped_statistics"]["mean"] == 120.5
