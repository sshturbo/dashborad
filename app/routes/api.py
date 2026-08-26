from __future__ import annotations

from pathlib import Path

from flask import Blueprint, current_app, jsonify, request
from werkzeug.exceptions import RequestEntityTooLarge

from app.services.file_service import (
    DatasetNotFoundError,
    SpreadsheetError,
    dataset_summary,
    find_dataset,
    inspect_workbook,
    load_sheet,
    save_spreadsheet,
)
from app.services.statistics import analyze_column


api_bp = Blueprint("api", __name__)


@api_bp.get("/health")
def health():
    return jsonify({"status": "ok"})


@api_bp.post("/datasets")
def upload_dataset():
    uploaded_file = request.files.get("file")
    if uploaded_file is None:
        return _error("Envie a planilha no campo 'file'.", 400)

    path: Path | None = None
    try:
        dataset_id, path, original_name = save_spreadsheet(
            uploaded_file,
            Path(current_app.config["UPLOAD_FOLDER"]),
            current_app.config["ALLOWED_EXTENSIONS"],
        )
        sheets = inspect_workbook(path)
        frame, selected_sheet = load_sheet(path, sheets[0], current_app.config["MAX_DATASET_ROWS"])
        return jsonify(
            {
                "dataset_id": dataset_id,
                "file_name": original_name,
                "sheets": sheets,
                **dataset_summary(frame, selected_sheet),
            }
        ), 201
    except (SpreadsheetError, ValueError) as exc:
        if path and path.exists():
            path.unlink()
        return _error(str(exc), 400)


@api_bp.get("/datasets/<dataset_id>")
def get_dataset(dataset_id: str):
    try:
        path = find_dataset(dataset_id, Path(current_app.config["UPLOAD_FOLDER"]))
        sheets = inspect_workbook(path)
        frame, selected_sheet = load_sheet(
            path,
            request.args.get("sheet"),
            current_app.config["MAX_DATASET_ROWS"],
        )
        return jsonify({"dataset_id": dataset_id, "sheets": sheets, **dataset_summary(frame, selected_sheet)})
    except DatasetNotFoundError as exc:
        return _error(str(exc), 404)
    except (SpreadsheetError, ValueError) as exc:
        return _error(str(exc), 400)


@api_bp.delete("/datasets/<dataset_id>")
def delete_dataset(dataset_id: str):
    try:
        path = find_dataset(dataset_id, Path(current_app.config["UPLOAD_FOLDER"]))
        path.unlink()
        return "", 204
    except DatasetNotFoundError as exc:
        return _error(str(exc), 404)


@api_bp.post("/analysis")
def analyze_dataset():
    payload = request.get_json(silent=True) or {}
    required = [field for field in ("dataset_id", "column", "variable_type") if not payload.get(field)]
    if required:
        return _error(f"Campos obrigatórios ausentes: {', '.join(required)}.", 400)

    try:
        path = find_dataset(payload["dataset_id"], Path(current_app.config["UPLOAD_FOLDER"]))
        frame, selected_sheet = load_sheet(
            path,
            payload.get("sheet"),
            current_app.config["MAX_DATASET_ROWS"],
        )
        bins = payload.get("bins")
        result = analyze_column(
            frame=frame,
            column=payload["column"],
            variable_type=payload["variable_type"],
            grouped=bool(payload.get("grouped", False)),
            bins=int(bins) if bins not in (None, "") else None,
            ordinal_order=payload.get("ordinal_order"),
            secondary_column=payload.get("secondary_column"),
        )
        return jsonify({"sheet": selected_sheet, **result})
    except DatasetNotFoundError as exc:
        return _error(str(exc), 404)
    except (SpreadsheetError, ValueError, TypeError) as exc:
        return _error(str(exc), 400)


@api_bp.app_errorhandler(RequestEntityTooLarge)
def file_too_large(_error_details):
    max_mb = current_app.config["MAX_CONTENT_LENGTH"] // (1024 * 1024)
    return _error(f"O arquivo excede o limite de {max_mb} MB.", 413)


def _error(message: str, status: int):
    return jsonify({"error": message}), status

