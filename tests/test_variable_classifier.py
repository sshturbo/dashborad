import pandas as pd

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
