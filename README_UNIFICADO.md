# Dashboard unificado — Fábrica de Luz / StatLab

## Como executar no Windows

1. Instale Python 3.10 ou superior.
2. Extraia esta pasta.
3. Abra o Prompt de Comando/PowerShell dentro da pasta do projeto.
4. Crie um ambiente virtual (opcional, recomendado):

   ```powershell
   py -m venv .venv
   .venv\Scripts\activate
   ```

5. Instale as dependências:

   ```powershell
   pip install -r requirements.txt
   ```

6. Inicie o sistema:

   ```powershell
   python run.py
   ```

7. Abra no navegador o endereço mostrado no terminal, normalmente http://127.0.0.1:5000.

## O que foi combinado

- Interface visual do projeto Fábrica de Luz (dashboard, gráficos, upload e downloads).
- Aplicação Flask/Python do projeto StatLab, com serviços estatísticos, classificação de variáveis e API de planilhas.
- A interface principal lê a planilha enviada no próprio navegador; a API Python também permanece disponível em `/api/health`, `/api/datasets` e `/api/analysis`.
- A planilha deve ter cabeçalhos na primeira linha. São aceitos os formatos indicados na interface.

## Observações

A interface principal mantém o processamento local no navegador do primeiro projeto. Para fazer com que o dashboard use exclusivamente os cálculos do backend Python, seria necessário adaptar o JavaScript para enviar os arquivos à API Flask; a API e os serviços estatísticos já estão no projeto.