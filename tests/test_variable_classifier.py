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

