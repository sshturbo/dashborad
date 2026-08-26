"""Gera uma planilha fictícia contendo os quatro tipos de variáveis."""

from pathlib import Path

import numpy as np
import pandas as pd


ROOT_DIR = Path(__file__).resolve().parent.parent
OUTPUT_PATH = ROOT_DIR / "data" / "exemplo_pesquisa.xlsx"


def build_dataset(rows: int = 120) -> pd.DataFrame:
    rng = np.random.default_rng(42)
    courses = np.array(["Administração", "Computação", "Engenharia", "Pedagogia"])
    shifts = np.array(["Manhã", "Tarde", "Noite"])
    satisfaction = np.array(["Péssimo", "Ruim", "Regular", "Bom", "Ótimo"])

    frame = pd.DataFrame(
        {
            "ID do estudante": np.arange(1001, 1001 + rows),
            "Curso": rng.choice(courses, rows, p=[0.22, 0.31, 0.27, 0.20]),
            "Turno": rng.choice(shifts, rows, p=[0.28, 0.18, 0.54]),
            "Satisfação": rng.choice(satisfaction, rows, p=[0.05, 0.10, 0.25, 0.38, 0.22]),
            "Número de livros": rng.poisson(3.4, rows),
            "Faltas no semestre": rng.poisson(4.8, rows),
            "Altura (cm)": np.round(rng.normal(169, 9, rows), 1),
            "Horas de estudo/semana": np.round(np.clip(rng.normal(9.5, 4, rows), 0.5, 26), 1),
            "Nota final": np.round(np.clip(rng.normal(7.1, 1.4, rows), 0, 10), 1),
        }
    )

    # Ausências intencionais permitem demonstrar o tratamento de células vazias.
    for index in rng.choice(frame.index, 6, replace=False):
        frame.loc[index, "Horas de estudo/semana"] = np.nan
    for index in rng.choice(frame.index, 4, replace=False):
        frame.loc[index, "Satisfação"] = None
    return frame


def main() -> None:
    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    data = build_dataset()
    dictionary = pd.DataFrame(
        [
            ["ID do estudante", "Qualitativa nominal", "Identificador; não calcular média"],
            ["Curso", "Qualitativa nominal", "Curso do participante"],
            ["Turno", "Qualitativa nominal", "Período principal de aulas"],
            ["Satisfação", "Qualitativa ordinal", "Péssimo < Ruim < Regular < Bom < Ótimo"],
            ["Número de livros", "Quantitativa discreta", "Contagem no semestre"],
            ["Faltas no semestre", "Quantitativa discreta", "Contagem"],
            ["Altura (cm)", "Quantitativa contínua", "Medição em centímetros"],
            ["Horas de estudo/semana", "Quantitativa contínua", "Medição semanal"],
            ["Nota final", "Quantitativa contínua", "Escala de 0 a 10"],
        ],
        columns=["Variável", "Classificação correta", "Observação"],
    )
    with pd.ExcelWriter(OUTPUT_PATH, engine="openpyxl") as writer:
        data.to_excel(writer, sheet_name="Pesquisa", index=False)
        dictionary.to_excel(writer, sheet_name="Dicionário", index=False)
    print(f"Planilha criada em: {OUTPUT_PATH}")


if __name__ == "__main__":
    main()

