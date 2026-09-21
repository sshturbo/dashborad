from __future__ import annotations

import math
import re
import unicodedata

import numpy as np
import pandas as pd


VARIABLE_TYPES = {
    "qualitative_nominal",
    "qualitative_ordinal",
    "quantitative_discrete",
    "quantitative_continuous",
}

TYPE_LABELS = {
    "qualitative_nominal": "Qualitativa nominal",
    "qualitative_ordinal": "Qualitativa ordinal",
    "quantitative_discrete": "Quantitativa discreta",
    "quantitative_continuous": "Quantitativa contínua",
}

ORDINAL_SEQUENCES = (
    ("muito baixo", "baixo", "medio", "alto", "muito alto"),
    ("pessimo", "ruim", "regular", "bom", "otimo"),
    ("discordo totalmente", "discordo", "neutro", "concordo", "concordo totalmente"),
    ("fundamental", "medio", "superior", "pos-graduacao"),
    ("pequeno", "medio", "grande"),
)

PERSONAL_DATA_TERMS = (
    "email",
    "e-mail",
    "endereço de e-mail",
    "endereco de e-mail",
    "nome:",
    "nome completo",
    "nome do colaborador",
    "nome do funcionário",
    "nome do funcionario",
)


def _normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    return "".join(character for character in text if not unicodedata.combining(character))


def is_ignored_column(name: object) -> bool:
    """Apply the Google Forms rules: ignore Timestamp and clearly personal fields."""
    normalized = _normalize(name)
    if normalized == "timestamp":
        return True
    return any(_normalize(term) in normalized for term in PERSONAL_DATA_TERMS)


def extract_number(value: object) -> float | None:
    """Extract a numeric value using the rules from the original desktop analyzer."""
    if pd.isna(value):
        return None
    if isinstance(value, (int, float, np.integer, np.floating)) and not isinstance(value, (bool, np.bool_)):
        number = float(value)
        return number if math.isfinite(number) else None

    text = str(value).strip()
    if not text:
        return None
    text = text.replace(",", ".")

    if re.fullmatch(r"[+-]?\d+(?:\.\d+)?", text):
        try:
            return float(text)
        except ValueError:
            return None

    interval = re.search(
        r"([+-]?\d+(?:\.\d+)?)\s*(?:a|até|-)\s*([+-]?\d+(?:\.\d+)?)",
        text,
        re.IGNORECASE,
    )
    if interval:
        try:
            return (float(interval.group(1)) + float(interval.group(2))) / 2
        except ValueError:
            return None

    numbers = re.findall(r"[+-]?\d+(?:\.\d+)?", text)
    if len(numbers) == 1:
        try:
            return float(numbers[0])
        except ValueError:
            return None
    return None


def infer_variable_type(series: pd.Series) -> tuple[str, list[str] | None]:
    """Infer type; a column is numeric when at least 80% of filled values are parseable."""
    clean = series.dropna()
    clean = clean[clean.astype(str).str.strip() != ""]
    if clean.empty:
        return "qualitative_nominal", None

    if pd.api.types.is_bool_dtype(clean):
        return "qualitative_nominal", None

    extracted = [extract_number(value) for value in clean]
    numeric_values = [value for value in extracted if value is not None]
    numeric_ratio = len(numeric_values) / len(clean)

    if numeric_ratio >= 0.80:
        integer_like = all(math.isclose(value, round(value), abs_tol=1e-9) for value in numeric_values)
        return ("quantitative_discrete" if integer_like else "quantitative_continuous", None)

    values = list(dict.fromkeys(str(value).strip() for value in clean.unique()))
    normalized = {_normalize(value): value for value in values}

    for sequence in ORDINAL_SEQUENCES:
        if set(normalized).issubset(set(sequence)) and len(normalized) > 1:
            order = [normalized[item] for item in sequence if item in normalized]
            return "qualitative_ordinal", order

    return "qualitative_nominal", None


def describe_columns(frame: pd.DataFrame) -> list[dict]:
    descriptions: list[dict] = []
    for name in frame.columns:
        if is_ignored_column(name):
            continue
        series = frame[name]
        clean = series.dropna()
        clean = clean[clean.astype(str).str.strip() != ""]
        if clean.empty:
            continue

        inferred_type, inferred_order = infer_variable_type(series)
        examples = [_json_scalar(value) for value in clean.unique()[:4]]
        descriptions.append(
            {
                "name": str(name),
                "inferred_type": inferred_type,
                "type_label": TYPE_LABELS[inferred_type],
                "inferred_order": inferred_order,
                "missing_count": int(len(series) - len(clean)),
                "unique_count": int(clean.nunique(dropna=True)),
                "examples": examples,
            }
        )
    return descriptions


def _json_scalar(value: object):
    if isinstance(value, (pd.Timestamp, pd.Timedelta)):
        return str(value)
    if isinstance(value, np.generic):
        value = value.item()
    if isinstance(value, float) and (math.isnan(value) or math.isinf(value)):
        return None
    return value
