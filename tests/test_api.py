from io import BytesIO

import pandas as pd
import pytest

from app import create_app


@pytest.fixture()
def client(tmp_path):
    application = create_app(
        {
            "TESTING": True,
            "UPLOAD_FOLDER": tmp_path / "uploads",
            "MAX_DATASET_ROWS": 1000,
        }
    )
    return application.test_client()


def excel_file() -> BytesIO:
    stream = BytesIO()
    frame = pd.DataFrame(
        {
            "Categoria": ["A", "B", "A", "C"],
            "Quantidade": [1, 2, 2, 5],
            "Medida": [1.5, 2.0, 3.5, 4.0],
        }
    )
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        frame.to_excel(writer, sheet_name="Dados", index=False)
    stream.seek(0)
    return stream


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.get_json() == {"status": "ok"}


def test_upload_and_analyze_workbook(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (excel_file(), "pesquisa.xlsx")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    assert metadata["row_count"] == 4
    assert metadata["sheet"] == "Dados"

    analysis = client.post(
        "/api/analysis",
        json={
            "dataset_id": metadata["dataset_id"],
            "sheet": "Dados",
            "column": "Quantidade",
            "variable_type": "quantitative_discrete",
            "grouped": False,
        },
    )
    assert analysis.status_code == 200
    result = analysis.get_json()
    assert result["statistics"]["mean"] == 2.5
    assert result["statistics"]["median"] == 2.0


def test_rejects_wrong_file_extension(client):
    response = client.post(
        "/api/datasets",
        data={"file": (BytesIO(b"not excel"), "dados.csv")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "Formato" in response.get_json()["error"]

