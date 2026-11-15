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
    ("muito insatisfeito", "insatisfeito", "neutro", "satisfeito", "muito satisfeito"),
    (
        "muito insatisfeito",
        "insatisfeito",
        "nem satisfeito nem insatisfeito",
        "satisfeito",
        "muito satisfeito",
    ),
    ("nunca", "raramente", "as vezes", "frequentemente", "sempre"),
    ("nunca", "quase nunca", "as vezes", "quase sempre", "sempre"),
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
DATE_COLUMN_PATTERN = re.compile(r"timestamp|carimbo|\bdata\b|\bdate\b", flags=re.IGNORECASE)
_INTERVAL_NUMBER = r"[+-]?(?:\d+(?:\.\d*)?|\.\d+)"
_TEXT_INTERVAL_PATTERN = re.compile(
    rf"\s*(?:(?:entre|de)\s+)?({_INTERVAL_NUMBER})\s*(?:até|a|[-–—])\s*"
    rf"({_INTERVAL_NUMBER})(?:\s+[a-zA-ZÀ-ÿ%].*)?\s*",
    flags=re.IGNORECASE,
)
_BRACKET_INTERVAL_PATTERN = re.compile(
    rf"\s*[\[(]\s*({_INTERVAL_NUMBER})\s*;\s*({_INTERVAL_NUMBER})\s*[\]\[)]\s*"
)


def _normalize(value: object) -> str:
    text = unicodedata.normalize("NFKD", str(value).strip().lower())
    without_accents = "".join(character for character in text if not unicodedata.combining(character))
    return " ".join(without_accents.split())


def _category_labels(series: pd.Series) -> list[str]:
    """Return distinct, displayable category labels in their first-seen order."""
    labels: list[str] = []
    seen: set[str] = set()
    for value in series.dropna():
        label = str(value).strip()
        if label and label not in seen:
            seen.add(label)
            labels.append(label)
    return labels


def _recognized_ordinal_order(labels: list[str]) -> list[str] | None:
    """Match a known scale while retaining every distinct observed spelling."""
    normalized_labels: dict[str, list[str]] = {}
    for label in labels:
        normalized_labels.setdefault(_normalize(label), []).append(label)

    normalized_categories = set(normalized_labels)
    if not normalized_categories:
        return None

    for sequence in ORDINAL_SEQUENCES:
        normalized_sequence = [_normalize(value) for value in sequence]
        if normalized_categories.issubset(set(normalized_sequence)):
            return [
                label
                for normalized_value in normalized_sequence
                for label in normalized_labels.get(normalized_value, [])
            ]
    return None


def resolve_ordinal_order(
    series: pd.Series,
    requested_order: object = None,
) -> tuple[list[str], str]:
    """Resolve a complete ordinal order and identify where it came from.

    With no custom request, known labels use their recognized semantic scale;
    otherwise labels stay in first-appearance order for the UI to review. A
    partial custom order is completed with unmentioned labels in that same
    first-appearance order.
    """
    labels = _category_labels(series)

    if requested_order is None:
        requested: list[str] = []
    elif isinstance(requested_order, list) and not requested_order:
        requested = []
    elif not isinstance(requested_order, list) or any(
        not isinstance(value, str) for value in requested_order
    ):
        raise ValueError("A ordem ordinal deve ser uma lista de rótulos de texto.")
    else:
        requested = [value.strip() for value in requested_order]
        if any(not value for value in requested):
            raise ValueError("A ordem ordinal não pode conter rótulos vazios.")
        if len(requested) != len(set(requested)):
            raise ValueError("A ordem ordinal não pode repetir categorias.")

    if requested:
        known_labels = set(labels)
        unknown_labels = [value for value in requested if value not in known_labels]
        if unknown_labels:
            raise ValueError(
                "A ordem ordinal contém categorias que não existem nos dados: "
                + ", ".join(unknown_labels)
                + "."
            )
        requested_set = set(requested)
        return requested + [value for value in labels if value not in requested_set], "custom"

    recognized = _recognized_ordinal_order(labels)
    if recognized is not None:
        return recognized, "recognized"
    return labels, "appearance"


def is_ignored_column(name: object) -> bool:
    """Ignore date metadata and clearly personal columns in the variable picker."""
    normalized = _normalize(name)
    if DATE_COLUMN_PATTERN.search(normalized):
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

    reported_interval = parse_numeric_interval(text)
    if reported_interval is not None:
        return (reported_interval[0] + reported_interval[1]) / 2

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


def parse_numeric_interval(value: object) -> tuple[float, float] | None:
    """Parse a reported numeric range without collapsing it to its midpoint."""
    if pd.isna(value) or isinstance(value, (int, float, np.integer, np.floating)):
        return None

    text = str(value).strip().replace("−", "-").replace(",", ".")
    if not text:
        return None

    match = _BRACKET_INTERVAL_PATTERN.fullmatch(text)
    if match is None:
        match = _TEXT_INTERVAL_PATTERN.fullmatch(text)
    if match is None:
        return None

    try:
        lower, upper = (float(match.group(index)) for index in (1, 2))
    except ValueError:
        return None
    if not math.isfinite(lower) or not math.isfinite(upper) or lower >= upper:
        return None
    return lower, upper


def reported_interval_classes(series: pd.Series) -> list[dict] | None:
    """Collect and validate a column whose nonblank responses are numeric ranges.

    Equivalent limits are combined, labels retain their first-seen spelling, and
    the returned classes are sorted by their numeric limits. A positive overlap
    makes the source ambiguous and returns ``None``; touching ranges and gaps are
    both allowed.
    """
    clean = series.dropna()
    clean = clean[clean.astype(str).str.strip() != ""]
    if clean.empty:
        return None

    by_limits: dict[tuple[float, float], dict] = {}
    for source_value in clean:
        limits = parse_numeric_interval(source_value)
        if limits is None:
            return None
        label = str(source_value).strip()
        item = by_limits.get(limits)
        if item is None:
            item = {
                "value": label,
                "source_labels": [label],
                "lower": limits[0],
                "upper": limits[1],
                "midpoint": (limits[0] + limits[1]) / 2,
                "frequency": 0,
            }
            by_limits[limits] = item
        elif label not in item["source_labels"]:
            item["source_labels"].append(label)
        item["frequency"] += 1

    classes = sorted(by_limits.values(), key=lambda item: (item["lower"], item["upper"]))
    for previous, current in zip(classes, classes[1:]):
        if current["lower"] < previous["upper"]:
            return None
    return classes


def has_reported_intervals(series: pd.Series) -> bool:
    """Whether all observed, nonblank values form an ordered set of ranges."""
    return reported_interval_classes(series) is not None


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
    order = _recognized_ordinal_order(values)
    if order is not None and len({_normalize(value) for value in values}) > 1:
        return "qualitative_ordinal", order

    return "qualitative_nominal", None


def allowed_variable_types(series: pd.Series) -> list[str]:
    """Return classifications from the same numeric/text rule used by inference."""
    inferred_type, _ = infer_variable_type(series)
    if inferred_type.startswith("quantitative_"):
        return ["quantitative_discrete", "quantitative_continuous"]
    return ["qualitative_nominal", "qualitative_ordinal"]


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
                "allowed_types": allowed_variable_types(series),
                "type_label": TYPE_LABELS[inferred_type],
                "inferred_order": inferred_order,
                "has_reported_intervals": has_reported_intervals(series),
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
