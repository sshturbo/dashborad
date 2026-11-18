# StatLab — Dashboard Estatístico

Aplicação web acadêmica para importar planilhas Excel, identificar tipos de variáveis e produzir análise estatística descritiva com tabelas e gráficos interativos.

O projeto usa **Python/Flask e Pandas** no backend e **HTML, CSS, JavaScript e Apache ECharts** no frontend. A separação em camadas permite que seis integrantes trabalhem em paralelo sem concentrar toda a lógica em um único arquivo.

## Funcionalidades

- Importação de arquivos `.xls`, `.xlsx`, `.xlsm` e `.csv`, com seleção da aba nas planilhas Excel.
- Quantidade de linhas e colunas, valores distintos e ausentes.
- Inferência inicial e correção manual dos tipos:
  - qualitativa nominal;
  - qualitativa ordinal, com ordem configurável;
  - quantitativa discreta;
  - quantitativa contínua.
- Tabela agrupada de frequências e tabela geral com todos os dados originais da planilha.
- Dados quantitativos sem intervalo ou agrupados em intervalos de classe.
- Número automático de classes pela regra de Sturges ou quantidade definida pelo usuário.
- Média, mediana, moda, quartis, mínimo, máximo, amplitude, variância, desvio-padrão e coeficiente de variação.
- Estimativas de média, mediana, moda e quartis para dados agrupados.
- Gráficos de barras, colunas, rosca, pizza, linhas, pontos, ogiva, mapa de calor e boxplot por grupo, além das tabelas agrupada e geral.
- Reconhecimento de datas para mostrar a quantidade de respostas por dia.
- Exportação em CSV e PNG pelo botão **Baixar** de cada visualização.
- Importação inicial dedicada à planilha, com abertura automática do dashboard e configuração das variáveis acima dos gráficos.
- Layout responsivo para computador, tablet e celular.

## Execução rápida

Pré-requisito: Python 3.11 ou mais recente.

No Windows, abra o PowerShell na pasta do projeto e execute:

```powershell
py -3 -m venv --clear .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
python run.py
```

O argumento `--clear` evita misturar arquivos binários de pacotes quando a pasta `.venv` já foi criada com outra versão do Python.

No macOS ou Linux, use:

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python run.py
```

Acesse `http://127.0.0.1:5000`. O Apache ECharts é servido pelo próprio projeto, sem depender de uma CDN no navegador. O processamento da planilha permanece no servidor Python.

### Acesso pelo celular na rede local

Para abrir a aplicação em outro aparelho, execute:

```bash
python -m flask --app run run --host=0.0.0.0 --no-debugger --no-reload
```

Conecte o celular e o computador à mesma rede Wi-Fi e abra `http://IP-DO-COMPUTADOR:5000` no celular. No Windows, consulte o endereço IPv4 do adaptador de rede com `ipconfig` e, se solicitado, permita o acesso do Python pelo firewall na rede privada. `127.0.0.1` e `localhost` no celular apontam para o próprio celular, não para o computador.

Na tela de importação, toque na área de seleção e escolha um arquivo Excel ou CSV baixado no aparelho. Documentos do Google Planilhas devem ser exportados para um desses formatos antes do envio.

Se a página abrir, mas o envio falhar por conexão, abra `http://IP-DO-COMPUTADOR:5000/api/health`. A resposta esperada é `{"status":"ok"}`. Sem essa resposta, verifique se o servidor Python continua em execução, o endereço, a rede Wi-Fi e a permissão do firewall. Deixe o servidor aberto enquanto usa o dashboard; abrir apenas o HTML ou uma hospedagem de arquivos estáticos não executa a API.

O navegador verifica o limite de tamanho antes do envio e o servidor mantém sua própria validação. No servidor de desenvolvimento do Flask, um envio acima do limite pode causar uma conexão interrompida em vez de uma resposta HTTP 413; veja a [documentação de uploads do Flask](https://flask.palletsprojects.com/en/stable/patterns/fileuploads/).

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
│   │   └── js/app.js           # Estado da interface e gráficos ECharts
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

1. O navegador envia a planilha ou o CSV para `POST /api/datasets`.
2. O servidor valida a extensão, gera um identificador aleatório e lê a primeira aba (ou o conteúdo do CSV).
3. O serviço de classificação inspeciona cada coluna e sugere um tipo de variável.
4. O usuário confirma ou corrige o tipo e escolhe se quer intervalos de classe.
5. `POST /api/analysis` calcula as medidas e devolve JSON.
6. O JavaScript monta a tabela, os gráficos e as comparações por grupo com Apache ECharts.

## API

| Método | Rota | Finalidade |
|---|---|---|
| `GET` | `/api/health` | Verificar se o serviço está ativo |
| `POST` | `/api/datasets` | Importar uma planilha no campo multipart `file` |
| `GET` | `/api/datasets/<id>?sheet=Aba` | Ler metadados de uma aba |
| `GET` | `/api/datasets/<id>/rows?sheet=Aba&offset=0&limit=100` | Ler uma página dos dados originais |
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
  "secondary_column": "Horas de estudo",
  "group_column": "Departamento"
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

