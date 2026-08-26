from __future__ import annotations

import math
from typing import Iterable

import numpy as np
import pandas as pd

from app.services.variable_classifier import TYPE_LABELS, VARIABLE_TYPES


def analyze_column(
    frame: pd.DataFrame,
    column: str,
    variable_type: str,
    grouped: bool = False,
    bins: int | None = None,
    ordinal_order: list[str] | None = None,
    secondary_column: str | None = None,
) -> dict:
    if column not in frame.columns:
        raise ValueError("A coluna selecionada não existe.")
    if variable_type not in VARIABLE_TYPES:
        raise ValueError("O tipo de variável informado é inválido.")

    is_quantitative = variable_type.startswith("quantitative_")
    series = frame[column]
    clean = _numeric_series(series, column) if is_quantitative else _categorical_series(series)
    if clean.empty:
        raise ValueError("A coluna selecionada não possui valores válidos para análise.")

    if grouped and not is_quantitative:
        raise ValueError("Intervalos de classe são aplicáveis apenas a variáveis quantitativas.")

    excluded_count = int(len(series) - len(clean))
    analysis = {
        "column": column,
        "variable_type": variable_type,
        "type_label": TYPE_LABELS[variable_type],
        "grouped": grouped,
        "total_rows": int(len(series)),
        "valid_count": int(len(clean)),
        "missing_count": excluded_count,
        "statistics": quantitative_statistics(clean) if is_quantitative else None,
    }

    if grouped:
        frequency, actual_bins = grouped_frequency(clean, bins)
        analysis["frequency_table"] = frequency
        analysis["bins"] = actual_bins
        analysis["grouped_statistics"] = grouped_statistics(frequency, len(clean))
    else:
        ordered = variable_type != "qualitative_nominal"
        analysis["frequency_table"] = ungrouped_frequency(
            clean,
            ordered=ordered,
            ordinal_order=ordinal_order if variable_type == "qualitative_ordinal" else None,
        )
        analysis["bins"] = None
        analysis["grouped_statistics"] = None

    analysis["charts"] = chart_payload(
        frame=frame,
        column=column,
        clean=clean,
        is_quantitative=is_quantitative,
        grouped=grouped,
        frequency=analysis["frequency_table"],
        secondary_column=secondary_column,
    )
    return analysis


def quantitative_statistics(series: pd.Series) -> dict:
    values = series.astype(float)
    modes = values.mode().tolist()
    is_amodal = len(values.unique()) > 1 and len(modes) == len(values.unique())
    quartiles = values.quantile([0.25, 0.5, 0.75])
    mean = float(values.mean())
    standard_deviation = float(values.std(ddof=1)) if len(values) > 1 else 0.0
    return {
        "mean": _finite(mean),
        "median": _finite(float(values.median())),
        "mode": [] if is_amodal else [_finite(float(value)) for value in modes[:10]],
        "mode_note": "Amodal" if is_amodal else None,
        "q1": _finite(float(quartiles.loc[0.25])),
        "q2": _finite(float(quartiles.loc[0.5])),
        "q3": _finite(float(quartiles.loc[0.75])),
        "minimum": _finite(float(values.min())),
        "maximum": _finite(float(values.max())),
        "range": _finite(float(values.max() - values.min())),
        "variance": _finite(float(values.var(ddof=1))) if len(values) > 1 else 0.0,
        "standard_deviation": _finite(standard_deviation),
        "coefficient_of_variation": _finite(standard_deviation / mean * 100) if mean else None,
    }


def ungrouped_frequency(
    series: pd.Series,
    ordered: bool,
    ordinal_order: list[str] | None = None,
) -> list[dict]:
    values = series
    counts = values.value_counts(dropna=False, sort=False)

    if ordinal_order:
        order_map = {str(value): index for index, value in enumerate(ordinal_order)}
        counts = counts.sort_index(key=lambda idx: idx.map(lambda value: order_map.get(str(value), len(order_map))))
    elif ordered:
        try:
            counts = counts.sort_index()
        except TypeError:
            counts.index = counts.index.map(str)
            counts = counts.sort_index()
    else:
        counts = counts.sort_values(ascending=False, kind="stable")

    total = int(counts.sum())
    cumulative = 0
    rows: list[dict] = []
    for value, count in counts.items():
        count_int = int(count)
        cumulative += count_int
        rows.append(
            {
                "value": _label(value),
                "frequency": count_int,
                "relative_frequency": count_int / total,
                "percentage": count_int / total * 100,
                "cumulative_frequency": cumulative if ordered else None,
                "cumulative_percentage": cumulative / total * 100 if ordered else None,
            }
        )
    return rows


def grouped_frequency(series: pd.Series, bins: int | None = None) -> tuple[list[dict], int]:
    values = series.astype(float)
    distinct = int(values.nunique())
    if distinct == 1:
        value = float(values.iloc[0])
        return ([{
            "value": f"[{_format_number(value)}; {_format_number(value)}]",
            "lower": value,
            "upper": value,
            "midpoint": value,
            "frequency": int(len(values)),
            "relative_frequency": 1.0,
            "percentage": 100.0,
            "cumulative_frequency": int(len(values)),
            "cumulative_percentage": 100.0,
        }], 1)

    requested_bins = bins if bins is not None else sturges_bins(len(values))
    requested_bins = max(2, min(int(requested_bins), 30, distinct))
    counts, edges = np.histogram(values.to_numpy(), bins=requested_bins)
    total = len(values)
    cumulative = 0
    rows: list[dict] = []

    for index, count in enumerate(counts):
        lower = float(edges[index])
        upper = float(edges[index + 1])
        midpoint = (lower + upper) / 2
        cumulative += int(count)
        closing = "]" if index == len(counts) - 1 else "["
        rows.append(
            {
                "value": f"[{_format_number(lower)}; {_format_number(upper)}{closing}",
                "lower": lower,
                "upper": upper,
                "midpoint": midpoint,
                "frequency": int(count),
                "relative_frequency": int(count) / total,
                "percentage": int(count) / total * 100,
                "cumulative_frequency": cumulative,
                "cumulative_percentage": cumulative / total * 100,
            }
        )
    return rows, len(counts)


def grouped_statistics(rows: list[dict], total: int) -> dict:
    """Approximate mean, median, mode and quartiles from class intervals."""
    if not rows or total == 0:
        return {}

    mean = sum(row["midpoint"] * row["frequency"] for row in rows) / total
    frequencies = [row["frequency"] for row in rows]
    modal_index = int(np.argmax(frequencies))
    modal = rows[modal_index]
    previous_f = frequencies[modal_index - 1] if modal_index > 0 else 0
    next_f = frequencies[modal_index + 1] if modal_index < len(rows) - 1 else 0
    d1 = modal["frequency"] - previous_f
    d2 = modal["frequency"] - next_f
    width = modal["upper"] - modal["lower"]
    mode = modal["lower"] + (d1 / (d1 + d2) * width if d1 + d2 else width / 2)

    return {
        "mean": _finite(mean),
        "median": _finite(_grouped_quantile(rows, total, 0.5)),
        "mode": _finite(mode),
        "q1": _finite(_grouped_quantile(rows, total, 0.25)),
        "q2": _finite(_grouped_quantile(rows, total, 0.5)),
        "q3": _finite(_grouped_quantile(rows, total, 0.75)),
        "note": "Valores aproximados, calculados pelos pontos médios e pela interpolação das classes.",
    }


def chart_payload(
    frame: pd.DataFrame,
    column: str,
    clean: pd.Series,
    is_quantitative: bool,
    grouped: bool,
    frequency: list[dict],
    secondary_column: str | None,
) -> dict:
    max_points = 5000
    payload = {
        "frequency_labels": [row["value"] for row in frequency],
        "frequencies": [row["frequency"] for row in frequency],
        "percentages": [row["percentage"] for row in frequency],
        "cumulative_x": [],
        "cumulative_y": [],
        "series_x": [],
        "series_y": [],
        "box_values": [],
        "scatter_x_label": "Índice",
        "scatter_y_label": column,
    }

    if grouped:
        payload["cumulative_x"] = [frequency[0]["lower"]] + [row["upper"] for row in frequency]
        payload["cumulative_y"] = [0] + [row["cumulative_frequency"] for row in frequency]
    elif any(row["cumulative_frequency"] is not None for row in frequency):
        payload["cumulative_x"] = [row["value"] for row in frequency]
        payload["cumulative_y"] = [row["cumulative_frequency"] for row in frequency]

    if is_quantitative:
        values = clean.astype(float).iloc[:max_points]
        payload["series_x"] = list(range(1, len(values) + 1))
        payload["series_y"] = [_finite(float(value)) for value in values]
        payload["box_values"] = payload["series_y"]

        if secondary_column and secondary_column in frame.columns and secondary_column != column:
            pair = frame[[column, secondary_column]].apply(pd.to_numeric, errors="coerce").dropna().iloc[:max_points]
            if not pair.empty:
                payload["series_x"] = [_finite(float(value)) for value in pair[column]]
                payload["series_y"] = [_finite(float(value)) for value in pair[secondary_column]]
                payload["scatter_x_label"] = column
                payload["scatter_y_label"] = secondary_column

    return payload


def sturges_bins(sample_size: int) -> int:
    return max(1, math.ceil(1 + 3.322 * math.log10(max(sample_size, 1))))


def _grouped_quantile(rows: list[dict], total: int, quantile: float) -> float:
    target = total * quantile
    previous_cumulative = 0
    for row in rows:
        if row["cumulative_frequency"] >= target:
            width = row["upper"] - row["lower"]
            frequency = row["frequency"]
            if frequency == 0:
                return row["midpoint"]
            return row["lower"] + ((target - previous_cumulative) / frequency) * width
        previous_cumulative = row["cumulative_frequency"]
    return rows[-1]["upper"]


def _numeric_series(series: pd.Series, column: str) -> pd.Series:
    numeric = pd.to_numeric(series, errors="coerce").replace([np.inf, -np.inf], np.nan).dropna()
    if numeric.empty:
        raise ValueError(f'A coluna "{column}" não contém valores numéricos válidos.')
    return numeric


def _categorical_series(series: pd.Series) -> pd.Series:
    return series.dropna().map(lambda value: str(value).strip() or "(vazio)")


def _finite(value: float | None):
    if value is None or not math.isfinite(value):
        return None
    return float(value)


def _label(value: object) -> str:
    if isinstance(value, (float, np.floating)):
        return _format_number(float(value))
    return str(value)


def _format_number(value: float) -> str:
    return f"{value:.6g}"
