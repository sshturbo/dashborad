# StatLab — Dashboard Estatístico

Aplicação web acadêmica para importar planilhas Excel, identificar tipos de variáveis e produzir análise estatística descritiva com tabelas e gráficos interativos.

O projeto usa **Python/Flask e Pandas** no backend e **HTML, CSS, JavaScript e Plotly.js** no frontend. A separação em camadas permite que seis integrantes trabalhem em paralelo sem concentrar toda a lógica em um único arquivo.

## Funcionalidades

- Importação de arquivos `.xls` e `.xlsx`, com seleção da aba da planilha.
- Prévia dos dados, quantidade de linhas, colunas, valores distintos e ausentes.
- Inferência inicial e correção manual dos tipos:
  - qualitativa nominal;
  - qualitativa ordinal, com ordem configurável;
  - quantitativa discreta;
  - quantitativa contínua.
- Tabela de frequências absoluta (`fi`), relativa (`fr`), percentual e acumulada.
- Dados quantitativos sem intervalo ou agrupados em intervalos de classe.
- Número automático de classes pela regra de Sturges ou quantidade definida pelo usuário.
- Média, mediana, moda, quartis, mínimo, máximo, amplitude, variância, desvio-padrão e coeficiente de variação.
- Estimativas de média, mediana, moda e quartis para dados agrupados.
- Gráficos de barras, pizza, linhas, pontos, ogiva e boxplot.
- Exportação da tabela de frequência em CSV.
- Layout responsivo para computador, tablet e celular.

## Execução rápida

Pré-requisito: Python 3.11 ou mais recente.

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python run.py
```

Acesse `http://127.0.0.1:5000`. Os gráficos usam Plotly.js por CDN, portanto o navegador precisa de internet para carregar essa biblioteca. O processamento da planilha permanece local.

Para gerar uma planilha de demonstração:

```bash
python scripts/generate_sample.py
```

O arquivo será criado em `data/exemplo_pesquisa.xlsx` e conterá variáveis de todas as classificações usadas no trabalho.

## Estrutura do projeto

```text
dashborad/
├── app/
│   ├── routes/                 # Página principal e endpoints JSON
│   ├── services/               # Importação, classificação e estatística
│   ├── static/
│   │   ├── css/style.css       # Identidade visual e responsividade
│   │   └── js/app.js           # Estado da interface e Plotly
│   ├── templates/index.html    # Dashboard
│   ├── __init__.py             # Application factory
│   └── config.py               # Limites e variáveis de ambiente
├── data/                       # Planilhas locais de demonstração
├── docs/
│   ├── ESTATISTICA.md          # Fundamentos, fórmulas e critérios
│   ├── GESTAO_DO_PROJETO.md    # Divisão para seis integrantes
│   └── ROTEIRO_APRESENTACAO.md # Sugestão de apresentação em sala
├── instance/uploads/           # Arquivos temporários, ignorados pelo Git
├── scripts/generate_sample.py  # Gerador de dados reprodutível
├── tests/                      # Testes unitários e de integração
├── .env.example
├── requirements.txt
└── run.py
```

## Fluxo de funcionamento

1. O navegador envia a planilha para `POST /api/datasets`.
2. O servidor valida a extensão, gera um identificador aleatório e lê a primeira aba.
3. O serviço de classificação inspeciona cada coluna e sugere um tipo de variável.
4. O usuário confirma ou corrige o tipo e escolhe se quer intervalos de classe.
5. `POST /api/analysis` calcula as medidas e devolve JSON.
6. O JavaScript monta a tabela e os seis gráficos com Plotly.js.

## API

| Método | Rota | Finalidade |
|---|---|---|
| `GET` | `/api/health` | Verificar se o serviço está ativo |
| `POST` | `/api/datasets` | Importar uma planilha no campo multipart `file` |
| `GET` | `/api/datasets/<id>?sheet=Aba` | Ler metadados e prévia de uma aba |
| `DELETE` | `/api/datasets/<id>` | Excluir o arquivo temporário |
| `POST` | `/api/analysis` | Executar a análise estatística |

Exemplo do corpo de uma análise:

```json
{
  "dataset_id": "identificador-retornado-no-upload",
  "sheet": "Pesquisa",
  "column": "Renda mensal",
  "variable_type": "quantitative_continuous",
  "grouped": true,
  "bins": 7,
  "ordinal_order": null,
  "secondary_column": "Horas de estudo"
}
```

## Testes

Com o ambiente virtual ativo:

```bash
pytest
```

Os testes cobrem classificação de variáveis, medidas descritivas, frequência com e sem classes, upload e análise pela API.

## Decisões e limitações

- A inferência é uma **sugestão**. Números usados apenas como códigos, por exemplo `1 = manhã` e `2 = noite`, devem ser corrigidos para qualitativa nominal.
- O servidor aceita até 16 MB e 100.000 linhas por padrão. Os limites podem ser alterados no `.env`.
- Planilhas protegidas por senha não são lidas.
- A primeira linha da aba deve conter os nomes das colunas.
- Medidas de dados agrupados são aproximações; a interface mantém também as medidas exatas dos dados originais para comparação.
- Os arquivos enviados são temporários e não entram no Git. Para uma implantação pública, deve-se programar limpeza periódica e autenticação.

## Documentação complementar

- [Fundamentação estatística](docs/ESTATISTICA.md)
- [Organização da equipe](docs/GESTAO_DO_PROJETO.md)
- [Roteiro de apresentação](docs/ROTEIRO_APRESENTACAO.md)

