import pandas as pd

from app.services.variable_classifier import infer_variable_type


def test_infers_nominal_text():
    kind, order = infer_variable_type(pd.Series(["Azul", "Verde", "Azul"]))
    assert kind == "qualitative_nominal"
    assert order is None


def test_infers_known_ordinal_sequence_and_order():
    kind, order = infer_variable_type(pd.Series(["Alto", "Baixo", "Médio", "Alto"]))
    assert kind == "qualitative_ordinal"
    assert order == ["Baixo", "Médio", "Alto"]


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


def test_ignored_google_forms_columns():
    from app.services.variable_classifier import is_ignored_column

    assert is_ignored_column("Timestamp")
    assert is_ignored_column("Endereço de e-mail")
    assert is_ignored_column("Nome completo")
    assert not is_ignored_column("Qual é o nome da sua cidade?")
