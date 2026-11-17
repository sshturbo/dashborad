import json

import pandas as pd
import pytest

from app.services.variable_classifier import allowed_variable_types, describe_columns, infer_variable_type


def test_infers_nominal_text():
    kind, order = infer_variable_type(pd.Series(["Azul", "Verde", "Azul"]))
    assert kind == "qualitative_nominal"
    assert order is None


def test_infers_known_ordinal_sequence_and_order():
    kind, order = infer_variable_type(pd.Series(["Alto", "Baixo", "Médio", "Alto"]))
    assert kind == "qualitative_ordinal"
    assert order == ["Baixo", "Médio", "Alto"]


def test_inferred_ordinal_order_preserves_distinct_case_and_accent_variants():
    kind, order = infer_variable_type(pd.Series(["Médio", "medio", "ALTO", "Baixo"]))
    assert kind == "qualitative_ordinal"
    assert order == ["Baixo", "Médio", "medio", "ALTO"]


def test_infers_common_portuguese_satisfaction_and_frequency_scales():
    satisfaction = pd.Series(["Satisfeito", "Muito satisfeito", "Insatisfeito", "Neutro"])
    frequency = pd.Series(["Sempre", "Às vezes", "Nunca", "Raramente"])

    assert infer_variable_type(satisfaction) == (
        "qualitative_ordinal",
        ["Insatisfeito", "Neutro", "Satisfeito", "Muito satisfeito"],
    )
    assert infer_variable_type(frequency) == (
        "qualitative_ordinal",
        ["Nunca", "Raramente", "Às vezes", "Sempre"],
    )


def test_infers_discrete_integer_and_continuous_decimal():
    assert infer_variable_type(pd.Series([1, 2, 3]))[0] == "quantitative_discrete"
    assert infer_variable_type(pd.Series([1.2, 2.5, 3.1]))[0] == "quantitative_continuous"



def test_numeric_rule_accepts_at_least_eighty_percent_parseable_values():
    kind, _ = infer_variable_type(pd.Series(["1", "2 anos", "3", "4", "texto"]))
    assert kind == "quantitative_discrete"


def test_numeric_rule_rejects_less_than_eighty_percent_parseable_values():
    kind, _ = infer_variable_type(pd.Series(["1", "2", "3", "texto", "outro"]))
    assert kind == "qualitative_nominal"


def test_extracts_decimal_comma_interval_and_number_in_text():
    from app.services.variable_classifier import extract_number

    assert extract_number("1,5") == 1.5
    assert extract_number("10 a 20") == 15.0
    assert extract_number("8 anos") == 8.0


def test_detects_reported_numeric_intervals_and_combines_equivalent_bounds():
    from app.services.variable_classifier import has_reported_intervals, reported_interval_classes

    series = pd.Series([
        "Entre 16 a 30 minutos",
        "1,0 a 15,0 min",
        "Entre 1 a 15 minutos",
        "Entre 45 a 60 minutos",
    ])

    assert has_reported_intervals(series)
    classes = reported_interval_classes(series)
    assert [(row["lower"], row["upper"], row["frequency"]) for row in classes] == [
        (1.0, 15.0, 2),
        (16.0, 30.0, 1),
        (45.0, 60.0, 1),
    ]
    assert classes[0]["source_labels"] == ["1,0 a 15,0 min", "Entre 1 a 15 minutos"]


def test_reported_intervals_allow_gaps_but_reject_overlaps_and_mixed_values():
    from app.services.variable_classifier import has_reported_intervals, parse_numeric_interval

    assert parse_numeric_interval("−2,5 a −1,25") == (-2.5, -1.25)
    assert parse_numeric_interval("[1; 15[") == (1.0, 15.0)
    assert has_reported_intervals(pd.Series(["1 a 15", "16 a 30", "45 a 60"]))
    assert not has_reported_intervals(pd.Series(["1 a 20", "15 a 30"]))
    assert not has_reported_intervals(pd.Series(["1 a 15", 23]))


def test_column_descriptions_flag_valid_reported_intervals():
    from app.services.variable_classifier import describe_columns

    descriptions = describe_columns(pd.DataFrame({"Tempo": ["1 a 15", "16 a 30", "45 a 60"]}))
    assert descriptions[0]["has_reported_intervals"] is True
    assert descriptions[0]["has_open_intervals"] is False


@pytest.mark.parametrize(
    "label",
    [
        "+8 horas",
        "+ 8 horas",
        "8+ horas",
        "8+",
        ">8",
        ">=8 horas",
        "≥ 8 horas",
        "Mais de 8 horas",
        "Acima de 8 horas",
        "A partir de 8 horas",
        "8 ou mais",
        "8 horas ou mais",
    ],
)
def test_open_lower_ranges_keep_the_unknown_upper_limit(label):
    from app.services.variable_classifier import extract_number, parse_numeric_interval

    assert parse_numeric_interval(label) == (8.0, None)
    assert extract_number(label) is None


@pytest.mark.parametrize(
    "label",
    [
        "<8",
        "<= 8 horas",
        "≤8 horas",
        "Menos de 8 horas",
        "Abaixo de 8 horas",
        "Até 8 horas",
        "ate 8 horas",
        "8 ou menos",
        "8 horas ou menos",
    ],
)
def test_open_upper_ranges_keep_the_unknown_lower_limit(label):
    from app.services.variable_classifier import extract_number, parse_numeric_interval

    assert parse_numeric_interval(label) == (None, 8.0)
    assert extract_number(label) is None


def test_open_range_bounds_support_decimal_comma_and_negative_values():
    from app.services.variable_classifier import parse_numeric_interval

    assert parse_numeric_interval("+8,5 horas") == (8.5, None)
    assert parse_numeric_interval("menos de −2,5 graus") == (None, -2.5)


def test_plain_signed_numbers_remain_individual_numeric_values():
    from app.services.variable_classifier import extract_number, parse_numeric_interval

    for label, expected in [("+8", 8.0), ("-8", -8.0), ("+8,5", 8.5)]:
        assert parse_numeric_interval(label) is None
        assert extract_number(label) == expected
    assert infer_variable_type(pd.Series(["+8", "+9"]))[0] == "quantitative_discrete"


def test_hour_survey_ranges_preserve_labels_order_and_open_class():
    from app.services.variable_classifier import reported_interval_classes

    series = pd.Series(["Entre 5 a 6 horas", "+8 horas", "Entre 7 a 8 horas", "+8 horas"])
    classes = reported_interval_classes(series)

    assert infer_variable_type(series) == ("quantitative_continuous", None)
    assert [row["value"] for row in classes] == [
        "Entre 5 a 6 horas", "Entre 7 a 8 horas", "+8 horas"
    ]
    assert [(row["lower"], row["upper"], row["midpoint"], row["frequency"]) for row in classes] == [
        (5.0, 6.0, 5.5, 1),
        (7.0, 8.0, 7.5, 1),
        (8.0, None, None, 2),
    ]
    assert sum(row["frequency"] for row in classes) == len(series)
    # Open limits must serialize as null, never as nonstandard JSON Infinity.
    assert json.loads(json.dumps(classes, allow_nan=False))[-1]["upper"] is None
    description = describe_columns(pd.DataFrame({"Horas": series}))[0]
    assert description["has_reported_intervals"] is True
    assert description["has_open_intervals"] is True
    assert description["inferred_type"] == "quantitative_continuous"


def test_all_open_classes_combine_equivalent_labels_and_ignore_blank_responses():
    from app.services.variable_classifier import reported_interval_classes

    series = pd.Series([">8 horas", None, "  ", "Até 5 horas", "+8 horas", float("nan")])
    classes = reported_interval_classes(series)

    assert [(row["lower"], row["upper"], row["midpoint"], row["frequency"]) for row in classes] == [
        (None, 5.0, None, 1),
        (8.0, None, None, 2),
    ]
    assert classes[-1]["source_labels"] == [">8 horas", "+8 horas"]
    description = describe_columns(pd.DataFrame({"Horas": series}))[0]
    assert description["inferred_type"] == "quantitative_continuous"
    assert description["missing_count"] == 3


def test_empty_responses_do_not_create_an_open_class():
    from app.services.variable_classifier import reported_interval_classes

    series = pd.Series([None, float("nan"), "", "  "])
    assert reported_interval_classes(series) is None
    assert infer_variable_type(series) == ("qualitative_nominal", None)
    assert describe_columns(pd.DataFrame({"Horas": series})) == []


def test_closed_ranges_are_continuous_even_with_integer_midpoints():
    from app.services.variable_classifier import extract_number

    series = pd.Series(["1 a 3 horas", "4 a 6 horas"])
    assert [extract_number(value) for value in series] == [2.0, 5.0]
    assert infer_variable_type(series) == ("quantitative_continuous", None)


@pytest.mark.parametrize(
    "values",
    [
        ["5 a 9 horas", "+8 horas"],
        ["Até 6 horas", "5 a 8 horas"],
        ["Acima de 5 horas", "+8 horas"],
        ["Até 5 horas", "Até 8 horas"],
        ["Até 8 horas", "+5 horas"],
        ["Até 5 horas", 8],
        ["5 a 6 horas", "+8"],
        ["5 a 6 horas", "sem resposta"],
    ],
)
def test_open_classes_reject_positive_overlap_and_mixed_individual_values(values):
    from app.services.variable_classifier import reported_interval_classes

    assert reported_interval_classes(pd.Series(values)) is None


def test_ignored_google_forms_columns():
    from app.services.variable_classifier import is_ignored_column

    assert is_ignored_column("Timestamp")
    assert is_ignored_column("Data da resposta")
    assert is_ignored_column("Date")
    assert is_ignored_column("Endereço de e-mail")
    assert is_ignored_column("Nome completo")
    assert not is_ignored_column("Qual é o nome da sua cidade?")


def test_allowed_classifications_follow_inferred_text_or_numeric_family():
    assert allowed_variable_types(pd.Series(["Azul", "Verde"])) == [
        "qualitative_nominal", "qualitative_ordinal"
    ]
    assert allowed_variable_types(pd.Series(["1", "2", "3"])) == [
        "quantitative_discrete", "quantitative_continuous"
    ]
    assert allowed_variable_types(pd.Series(["4,5", "5,0"])) == [
        "quantitative_discrete", "quantitative_continuous"
    ]


def test_column_descriptions_include_allowed_classifications():
    descriptions = describe_columns(pd.DataFrame({"Resposta": ["Sim", "Não"], "Nota": [4, 5]}))
    by_name = {item["name"]: item for item in descriptions}
    assert by_name["Resposta"]["allowed_types"] == ["qualitative_nominal", "qualitative_ordinal"]
    assert by_name["Nota"]["allowed_types"] == ["quantitative_discrete", "quantitative_continuous"]
