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


def csv_file() -> BytesIO:
    return BytesIO(
        "Departamento;Nota;Data\n"
        "Comercial;4,5;15/10/2026\n"
        "Financeiro;3,5;15/10/2026\n"
        "Comercial;5;16/10/2026\n".encode("utf-8-sig")
    )


def reported_intervals_workbook() -> BytesIO:
    stream = BytesIO()
    values = (
        ["Entre 1 a 15 minutos"] * 29
        + ["Entre 16 a 30 minutos"] * 20
        + ["Entre 45 a 60 minutos"]
    )
    with pd.ExcelWriter(stream, engine="openpyxl") as writer:
        pd.DataFrame({"Tempo TI": values}).to_excel(writer, sheet_name="Dados", index=False)
    stream.seek(0)
    return stream


def open_intervals_workbook() -> BytesIO:
    stream = BytesIO()
    frame = pd.DataFrame(
        {
            "Tempo": [
                "Entre 5 a 6 horas", "+8 horas", "Entre 7 a 8 horas",
                "Entre 5 a 6 horas", "+8 horas", None, "",
            ],
            "Nota": [1, 2, 3, 4, 5, 6, 7],
            "Departamento": ["A", "B", "A", "B", "A", "B", "A"],
            "Faixa fechada": ["Entre 1 a 3 horas", "Entre 5 a 7 horas"] * 3 + ["Entre 1 a 3 horas"],
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
    columns = {column["name"]: column for column in metadata["columns"]}
    assert columns["Categoria"]["allowed_types"] == ["qualitative_nominal", "qualitative_ordinal"]
    assert columns["Quantidade"]["allowed_types"] == ["quantitative_discrete", "quantitative_continuous"]

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


def test_reported_interval_detection_and_grouping_metadata_are_exposed_by_api(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (reported_intervals_workbook(), "tempos.xlsx")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    column = next(item for item in metadata["columns"] if item["name"] == "Tempo TI")
    assert column["has_reported_intervals"] is True

    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": metadata["dataset_id"],
            "sheet": metadata["sheet"],
            "column": "Tempo TI",
            "variable_type": "quantitative_continuous",
            "allow_type_override": True,
            "grouped": True,
            "bins": 3,
        },
    )
    assert response.status_code == 200
    result = response.get_json()
    assert result["grouping"]["source"] == "reported_intervals"
    assert result["grouping"]["method"] == "original"
    assert result["grouping"]["class_count"] == 3
    assert result["grouping"]["note"]
    assert result["grouped_statistics"]["mean"] == pytest.approx(14.89)
    assert [row["frequency"] for row in result["frequency_table"]] == [29, 20, 1]


@pytest.mark.parametrize("grouped", [False, True])
def test_api_preserves_reported_open_hour_classes_and_exposes_only_grouped_estimates(client, grouped):
    upload = client.post(
        "/api/datasets",
        data={"file": (open_intervals_workbook(), "horas.xlsx")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    column = next(item for item in metadata["columns"] if item["name"] == "Tempo")
    assert column["inferred_type"] == "qualitative_ordinal"
    assert column["has_reported_intervals"] is True
    assert column["has_open_intervals"] is True

    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": metadata["dataset_id"],
            "sheet": metadata["sheet"],
            "column": "Tempo",
            "variable_type": "quantitative_continuous",
            "allow_type_override": True,
            "grouped": grouped,
        },
    )
    assert response.status_code == 200
    result = response.get_json()
    assert result["valid_count"] == 5
    assert result["missing_count"] == 2
    assert result["statistics"] is None
    assert result["grouped"] is True
    assert result["grouping"]["source"] == "reported_intervals"
    assert result["grouping"]["method"] == "original"
    assert [(row["value"], row["frequency"]) for row in result["frequency_table"]] == [
        ("Entre 5 a 6 horas", 2), ("Entre 7 a 8 horas", 1), ("+8 horas", 2)
    ]
    assert result["frequency_table"][-1]["upper"] is None
    assert result["frequency_table"][-1]["midpoint"] is None
    assert result["frequency_table"][-1]["cumulative_frequency"] == 5
    assert result["grouped_statistics"]["mean"] is None
    assert result["grouped_statistics"]["q1"] == pytest.approx(5.625)
    assert result["grouped_statistics"]["median"] == pytest.approx(7.5)
    assert result["grouped_statistics"]["q3"] is None
    for key in ("series_x", "series_y", "box_values", "cumulative_x", "cumulative_y"):
        assert result["charts"][key] == []


def test_api_treats_closed_ranges_with_integer_midpoints_as_continuous_grouped_data(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (open_intervals_workbook(), "horas.xlsx")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    column = next(item for item in metadata["columns"] if item["name"] == "Faixa fechada")
    assert column["inferred_type"] == "qualitative_ordinal"
    assert column["has_reported_intervals"] is True
    assert column["has_open_intervals"] is False

    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": metadata["dataset_id"],
            "column": "Faixa fechada",
            "variable_type": "quantitative_continuous",
            "allow_type_override": True,
            "grouped": False,
        },
    )
    assert response.status_code == 200
    result = response.get_json()
    assert result["statistics"] is None
    assert result["grouped_statistics"]["mean"] == pytest.approx(26 / 7)
    for key in ("series_x", "series_y", "box_values"):
        assert result["charts"][key] == []


@pytest.mark.parametrize(
    ("comparison", "expected_message"),
    [
        ({"column": "Tempo", "secondary_column": "Nota"}, "valores individuais"),
        ({"column": "Nota", "secondary_column": "Tempo"}, "valores individuais"),
        ({"column": "Tempo", "group_column": "Departamento"}, "valores individuais"),
    ],
)
def test_analysis_api_rejects_comparisons_that_require_individual_values_from_ranges(client, comparison, expected_message):
    upload = client.post(
        "/api/datasets",
        data={"file": (open_intervals_workbook(), "horas.xlsx")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201

    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": upload.get_json()["dataset_id"],
            "variable_type": "quantitative_continuous",
            "allow_type_override": True,
            **comparison,
        },
    )

    assert response.status_code == 400
    assert expected_message in response.get_json()["error"]


def test_analysis_api_rejects_classification_from_the_wrong_family(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (excel_file(), "pesquisa.xlsx")},
        content_type="multipart/form-data",
    )
    dataset_id = upload.get_json()["dataset_id"]
    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": dataset_id,
            "sheet": "Dados",
            "column": "Categoria",
            "variable_type": "quantitative_discrete",
        },
    )
    assert response.status_code == 400
    assert "classificada como qualitativa" in response.get_json()["error"]


def test_api_can_use_range_categories_to_group_individual_numeric_values(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (open_intervals_workbook(), "horas.xlsx")},
        content_type="multipart/form-data",
    )
    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": upload.get_json()["dataset_id"],
            "column": "Nota",
            "variable_type": "quantitative_discrete",
            "group_column": "Tempo",
        },
    )
    assert response.status_code == 200
    groups = response.get_json()["charts"]["group_comparison"]["groups"]
    assert "Entre 5 a 6 horas" in {group["label"] for group in groups}


def test_survey_rating_and_speed_range_columns_follow_the_observed_response_format(client):
    rating_question = "8. Como você avalia a qualidade do suporte prestado pelo setor de TI?"
    speed_question = "29. Qual é aproximadamente a velocidade da internet disponível no seu computador, em Mbps?"
    stream = BytesIO()
    frame = pd.DataFrame({
        rating_question: [4, 5, 5, 4],
        speed_question: ["Entre 121 a 180 mpbs", "Entre 61 a 120 mpbs"] * 2,
    })
    frame.to_excel(stream, index=False)
    stream.seek(0)
    upload = client.post(
        "/api/datasets", data={"file": (stream, "pesquisa.xlsx")}, content_type="multipart/form-data"
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    columns = {column["name"]: column for column in metadata["columns"]}
    assert columns[rating_question]["inferred_type"] == "quantitative_discrete"
    assert columns[speed_question]["inferred_type"] == "qualitative_ordinal"

    for question in (rating_question, speed_question):
        response = client.post("/api/analysis", json={
            "dataset_id": metadata["dataset_id"],
            "column": question,
            "variable_type": columns[question]["inferred_type"],
        })
        assert response.status_code == 200
        result = response.get_json()
        assert result["valid_count"] == 4
        assert sum(row["frequency"] for row in result["frequency_table"]) == 4
        if question == rating_question:
            assert result["statistics"]["mean"] == 4.5
            assert [row["value"] for row in result["frequency_table"]] == ["4", "5"]
        else:
            assert result["statistics"] is None
            assert result["grouped_statistics"] is None
            assert [row["value"] for row in result["frequency_table"]] == [
                "Entre 61 a 120 mpbs", "Entre 121 a 180 mpbs"
            ]


def test_ordinal_analysis_api_returns_default_category_order(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (excel_file(), "pesquisa.xlsx")},
        content_type="multipart/form-data",
    )
    dataset_id = upload.get_json()["dataset_id"]

    response = client.post(
        "/api/analysis",
        json={
            "dataset_id": dataset_id,
            "sheet": "Dados",
            "column": "Categoria",
            "variable_type": "qualitative_ordinal",
        },
    )

    assert response.status_code == 200
    result = response.get_json()
    assert result["ordinal_order"] == ["A", "B", "C"]
    assert result["ordinal_order_source"] == "appearance"
    assert [row["value"] for row in result["frequency_table"]] == ["A", "B", "C"]


def test_rejects_wrong_file_extension(client):
    response = client.post(
        "/api/datasets",
        data={"file": (BytesIO(b"not excel"), "dados.txt")},
        content_type="multipart/form-data",
    )
    assert response.status_code == 400
    assert "Formato" in response.get_json()["error"]


def test_upload_csv_and_analyze_grouped_comparison(client):
    upload = client.post(
        "/api/datasets",
        data={"file": (csv_file(), "pesquisa.csv")},
        content_type="multipart/form-data",
    )
    assert upload.status_code == 201
    metadata = upload.get_json()
    assert metadata["sheet"] == "Dados"
    assert metadata["row_count"] == 3

    analysis = client.post(
        "/api/analysis",
        json={
            "dataset_id": metadata["dataset_id"],
            "sheet": "Dados",
            "column": "Nota",
            "variable_type": "quantitative_continuous",
            "group_column": "Departamento",
        },
    )
    assert analysis.status_code == 200
    result = analysis.get_json()
    assert result["statistics"]["mean"] == pytest.approx(4.3333333333)
    comparison = result["charts"]["group_comparison"]
    assert [(group["label"], group["count"], group["mean"]) for group in comparison["groups"]] == [
        ("Comercial", 2, 4.75),
        ("Financeiro", 1, 3.5),
    ]
    assert result["charts"]["date_column"] == "Data"
    assert result["charts"]["date_y"] == [2, 1]

