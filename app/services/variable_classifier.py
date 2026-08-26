from __future__ import annotations

import math
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


def _normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    return "".join(character for character in text if not unicodedata.combining(character))


def infer_variable_type(series: pd.Series) -> tuple[str, list[str] | None]:
    """Infer a statistical variable type and, when safe, its ordinal order."""
    clean = series.dropna()
    if clean.empty:
        return "qualitative_nominal", None

    if pd.api.types.is_bool_dtype(clean):
        return "qualitative_nominal", None

    if pd.api.types.is_numeric_dtype(clean):
        numeric = pd.to_numeric(clean, errors="coerce").dropna()
        integer_like = np.isclose(numeric % 1, 0).all()
        return (
            "quantitative_discrete" if integer_like else "quantitative_continuous",
            None,
        )

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
        series = frame[name]
        inferred_type, inferred_order = infer_variable_type(series)
        examples = [_json_scalar(value) for value in series.dropna().unique()[:4]]
        descriptions.append(
            {
                "name": str(name),
                "inferred_type": inferred_type,
                "type_label": TYPE_LABELS[inferred_type],
                "inferred_order": inferred_order,
                "missing_count": int(series.isna().sum()),
                "unique_count": int(series.nunique(dropna=True)),
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

