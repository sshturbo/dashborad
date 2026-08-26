from __future__ import annotations

import re
from pathlib import Path
from uuid import uuid4

import numpy as np
import pandas as pd
from werkzeug.datastructures import FileStorage
from werkzeug.utils import secure_filename

from app.services.variable_classifier import describe_columns


DATASET_ID_PATTERN = re.compile(r"^[0-9a-f]{32}$")


class SpreadsheetError(ValueError):
    """Raised when a spreadsheet cannot be safely imported."""


class DatasetNotFoundError(FileNotFoundError):
    """Raised when an uploaded dataset id no longer exists."""


def save_spreadsheet(
    uploaded_file: FileStorage,
    upload_folder: Path,
    allowed_extensions: set[str],
) -> tuple[str, Path, str]:
    original_name = secure_filename(uploaded_file.filename or "")
    if not original_name or "." not in original_name:
        raise SpreadsheetError("Selecione um arquivo .xls ou .xlsx válido.")

    extension = original_name.rsplit(".", 1)[1].lower()
    if extension not in allowed_extensions:
        raise SpreadsheetError("Formato não aceito. Use uma planilha .xls ou .xlsx.")

    dataset_id = uuid4().hex
    destination = upload_folder / f"{dataset_id}.{extension}"
    uploaded_file.save(destination)
    return dataset_id, destination, original_name


def find_dataset(dataset_id: str, upload_folder: Path) -> Path:
    if not DATASET_ID_PATTERN.fullmatch(dataset_id):
        raise DatasetNotFoundError("Conjunto de dados não encontrado.")

    matches = list(upload_folder.glob(f"{dataset_id}.*"))
    if len(matches) != 1 or matches[0].suffix.lower() not in {".xls", ".xlsx"}:
        raise DatasetNotFoundError("Conjunto de dados não encontrado ou expirado.")
    return matches[0]


def inspect_workbook(path: Path) -> list[str]:
    try:
        with pd.ExcelFile(path) as workbook:
            return list(workbook.sheet_names)
    except Exception as exc:
        raise SpreadsheetError(
            "Não foi possível abrir a planilha. Verifique se o arquivo não está corrompido ou protegido por senha."
        ) from exc


def load_sheet(path: Path, sheet_name: str | None, max_rows: int) -> tuple[pd.DataFrame, str]:
    sheets = inspect_workbook(path)
    if not sheets:
        raise SpreadsheetError("A planilha não possui abas legíveis.")

    selected_sheet = sheet_name or sheets[0]
    if selected_sheet not in sheets:
        raise SpreadsheetError("A aba selecionada não existe na planilha.")

    try:
        frame = pd.read_excel(path, sheet_name=selected_sheet, nrows=max_rows + 1)
    except Exception as exc:
        raise SpreadsheetError("Não foi possível ler os dados da aba selecionada.") from exc

    if frame.empty and len(frame.columns) == 0:
        raise SpreadsheetError("A aba selecionada está vazia.")
    if len(frame) > max_rows:
        raise SpreadsheetError(
            f"A aba ultrapassa o limite de {max_rows:,} linhas configurado para o projeto."
        )

    frame = frame.copy()
    frame.columns = _unique_column_names(frame.columns)
    return frame, selected_sheet


def dataset_summary(frame: pd.DataFrame, sheet_name: str, preview_rows: int = 8) -> dict:
    preview = frame.head(preview_rows).replace({np.nan: None})
    records = [
        {str(key): _serialize_cell(value) for key, value in row.items()}
        for row in preview.to_dict(orient="records")
    ]
    return {
        "sheet": sheet_name,
        "row_count": int(len(frame)),
        "column_count": int(len(frame.columns)),
        "columns": describe_columns(frame),
        "preview": records,
    }


def _unique_column_names(columns) -> list[str]:
    names: list[str] = []
    used: dict[str, int] = {}
    for index, raw_name in enumerate(columns, start=1):
        base = str(raw_name).strip()
        if not base or base.lower().startswith("unnamed:"):
            base = f"Coluna {index}"
        count = used.get(base, 0)
        used[base] = count + 1
        names.append(base if count == 0 else f"{base} ({count + 1})")
    return names


def _serialize_cell(value: object):
    if value is None or (not isinstance(value, (list, dict)) and pd.isna(value)):
        return None
    if isinstance(value, (pd.Timestamp, pd.Timedelta)):
        return str(value)
    if isinstance(value, np.generic):
        return value.item()
    return value

