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
_INTERVAL_UNIT = r"(?:\s*[a-zA-ZÀ-ÿ%][a-zA-ZÀ-ÿ%./²³\s]*)?"
_OPEN_LOWER_PATTERNS = (
    rf"(?:>=|≥|>)\s*({_INTERVAL_NUMBER}){_INTERVAL_UNIT}",
    rf"(?:mais de|acima de|a partir de)\s+({_INTERVAL_NUMBER}){_INTERVAL_UNIT}",
    rf"({_INTERVAL_NUMBER})\s*\+{_INTERVAL_UNIT}",
    rf"({_INTERVAL_NUMBER}){_INTERVAL_UNIT}\s+ou mais",
    # A leading plus is a range marker only with a unit: plain '+8' is +8.
    rf"\+\s*(\d+(?:\.\d*)?|\.\d+)\s*[a-zA-ZÀ-ÿ%][a-zA-ZÀ-ÿ%./²³\s]*",
)
_OPEN_UPPER_PATTERNS = (
    rf"(?:<=|≤|<)\s*({_INTERVAL_NUMBER}){_INTERVAL_UNIT}",
    rf"(?:menos de|abaixo de|at[eé])\s+({_INTERVAL_NUMBER}){_INTERVAL_UNIT}",
    rf"({_INTERVAL_NUMBER}){_INTERVAL_UNIT}\s+ou menos",
)
_OPEN_INTERVAL_PATTERNS = tuple(
    (re.compile(pattern, flags=re.IGNORECASE), lower_bounded)
    for patterns, lower_bounded in (
        (_OPEN_LOWER_PATTERNS, True),
        (_OPEN_UPPER_PATTERNS, False),
    )
    for pattern in patterns
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
    """Extract a value or a closed range's midpoint, never an open range's bound."""
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
        lower, upper = reported_interval
        return (lower + upper) / 2 if lower is not None and upper is not None else None

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


def parse_numeric_interval(value: object) -> tuple[float | None, float | None] | None:
    """Parse closed or one-sided reported ranges without inventing their limits.

    A missing bound is ``None`` rather than infinity so the result is JSON safe.
    ``+8 horas`` denotes a lower-bounded class, while the plain signed number
    ``+8`` remains an individual value and is not an interval.
    """
    if pd.isna(value) or isinstance(value, (int, float, np.integer, np.floating)):
        return None

    text = str(value).strip().replace("−", "-").replace(",", ".")
    if not text:
        return None

    match = _BRACKET_INTERVAL_PATTERN.fullmatch(text)
    if match is None:
        match = _TEXT_INTERVAL_PATTERN.fullmatch(text)
    if match is None:
        for pattern, lower_bounded in _OPEN_INTERVAL_PATTERNS:
            open_match = pattern.fullmatch(text)
            if open_match is None:
                continue
            bound = float(open_match.group(1))
            if math.isfinite(bound):
                return (bound, None) if lower_bounded else (None, bound)
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
    both allowed. Open classes retain ``None`` for their unknown limit and
    midpoint; infinity is used only internally to sort and detect overlap.
    """
    clean = series.dropna()
    clean = clean[clean.astype(str).str.strip() != ""]
    if clean.empty:
        return None

    by_limits: dict[tuple[float | None, float | None], dict] = {}
    for source_value in clean:
        limits = parse_numeric_interval(source_value)
        if limits is None:
            return None
        label = str(source_value).strip()
        item = by_limits.get(limits)
        if item is None:
            lower, upper = limits
            item = {
                "value": label,
                "source_labels": [label],
                "lower": lower,
                "upper": upper,
                "midpoint": (lower + upper) / 2 if lower is not None and upper is not None else None,
                "frequency": 0,
            }
            by_limits[limits] = item
        elif label not in item["source_labels"]:
            item["source_labels"].append(label)
        item["frequency"] += 1

    classes = sorted(
        by_limits.values(),
        key=lambda item: (
            item["lower"] if item["lower"] is not None else -math.inf,
            item["upper"] if item["upper"] is not None else math.inf,
        ),
    )
    for previous, current in zip(classes, classes[1:]):
        current_lower = current["lower"] if current["lower"] is not None else -math.inf
        previous_upper = previous["upper"] if previous["upper"] is not None else math.inf
        if current_lower < previous_upper:
            return None
    return classes


def has_reported_intervals(series: pd.Series) -> bool:
    """Whether all observed, nonblank values form an ordered set of ranges."""
    return reported_interval_classes(series) is not None


def infer_variable_type(series: pd.Series) -> tuple[str, list[str] | None]:
    """Recognize reported ranges, then apply the 80% individual numeric rule."""
    clean = series.dropna()
    clean = clean[clean.astype(str).str.strip() != ""]
    if clean.empty:
        return "qualitative_nominal", None

    if pd.api.types.is_bool_dtype(clean):
        return "qualitative_nominal", None

    if has_reported_intervals(clean):
        return "quantitative_continuous", None

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
        interval_classes = reported_interval_classes(series)
        examples = [_json_scalar(value) for value in clean.unique()[:4]]
        descriptions.append(
            {
                "name": str(name),
                "inferred_type": inferred_type,
                "allowed_types": allowed_variable_types(series),
                "type_label": TYPE_LABELS[inferred_type],
                "inferred_order": inferred_order,
                "has_reported_intervals": interval_classes is not None,
                "has_open_intervals": any(
                    item["lower"] is None or item["upper"] is None
                    for item in interval_classes or []
                ),
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
