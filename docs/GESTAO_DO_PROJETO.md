# Gestão do projeto para seis integrantes

O objetivo desta divisão é dar responsabilidade clara a cada pessoa sem criar seis partes isoladas. Toda entrega deve ser revisada por pelo menos outro integrante.

## Papéis sugeridos

| Integrante | Responsabilidade principal | Entregas |
|---|---|---|
| 1 — Coordenação e produto | Escopo, cronograma e integração | Quadro de tarefas, critérios de aceite, revisão final e organização da apresentação |
| 2 — Dados e importação | Entrada e validação de planilhas | Leitura `.xls/.xlsx`, seleção de abas, valores ausentes, planilha de demonstração |
| 3 — Estatística | Regras matemáticas | Frequências, classes, média, mediana, moda, quartis, dispersão e conferência manual |
| 4 — Backend | API e organização Python | Rotas Flask, tratamento de erros, configuração e testes de integração |
| 5 — Frontend | Experiência e acessibilidade | HTML, estado da tela, formulários, tabelas, exportação e responsividade |
| 6 — Visualização e qualidade | Gráficos, testes e documentação | Plotly, consistência visual, testes, revisão do relatório e roteiro da demonstração |

Os números são apenas posições. O grupo deve registrar os nomes reais na tabela abaixo:

| Papel | Nome | Contato | Substituto para revisão |
|---|---|---|---|
| Coordenação |  |  |  |
| Dados |  |  |  |
| Estatística |  |  |  |
| Backend |  |  |  |
| Frontend |  |  |  |
| Visualização/QA |  |  |  |

## Cronograma sugerido de quatro semanas

### Semana 1 — definição e dados

- Confirmar requisitos com o professor.
- Escolher ou criar o conjunto de dados.
- Definir dicionário das variáveis e classificar cada uma.
- Executar o projeto localmente nos computadores do grupo.
- Criar exemplos de resultado esperado calculados à mão ou em planilha.

### Semana 2 — núcleo funcional

- Validar importação `.xls` e `.xlsx`.
- Conferir frequências sem intervalos.
- Conferir criação de classes e regra de Sturges.
- Testar média, mediana, moda e quartis com casos pequenos conhecidos.

### Semana 3 — dashboard e integração

- Integrar formulários, API, tabela e cartões.
- Revisar os seis tipos de gráfico.
- Testar variáveis nominais, ordinais, discretas e contínuas.
- Ajustar comportamento em celular e mensagens de erro.

### Semana 4 — qualidade e apresentação

- Executar todos os testes automatizados.
- Fazer uma revisão estatística independente.
- Ensaiar a apresentação com tempo marcado.
- Preparar cópia local da planilha e capturas de tela como contingência.
- Congelar mudanças importantes 24 horas antes da apresentação.

## Fluxo de Git

1. Cada tarefa começa em uma branch curta, por exemplo `feat/grafico-ogiva` ou `test/calculo-quartis`.
2. Commits devem descrever a mudança: `feat: adiciona seleção da aba`.
3. Antes de unir, outro integrante confere o código e testa a funcionalidade.
4. A branch principal deve permanecer executável.
5. Nunca enviar `.env`, ambiente virtual ou planilhas com dados pessoais.

Tipos úteis de commit: `feat`, `fix`, `docs`, `test`, `refactor`, `style` e `chore`.

## Definição de pronto

Uma tarefa só está pronta quando:

- atende ao requisito descrito;
- trata entrada vazia ou inválida;
- foi testada com ao menos um caso normal e um caso extremo;
- não quebra os testes existentes;
- possui texto ou comentário quando a decisão não é óbvia;
- foi revisada por outra pessoa;
- está demonstrável na interface.

## Matriz mínima de testes manuais

| Cenário | Resultado esperado |
|---|---|
| Arquivo com extensão diferente | Mensagem de formato inválido |
| Arquivo `.xls` e arquivo `.xlsx` | Ambos são importados |
| Planilha com várias abas | A troca de aba atualiza colunas e prévia |
| Coluna nominal | Sem média, quartis ou acumulada |
| Coluna ordinal | Respeita a ordem digitada |
| Discreta sem classes | Uma linha por valor distinto |
| Contínua com classes automáticas | Quantidade calculada por Sturges |
| Contínua com classes manuais | Respeita valor entre 2 e 30 |
| Células vazias | Exibe a contagem e ignora nos cálculos |
| Coluna constante | Uma classe e dispersão igual a zero |
| Segunda variável numérica | Gráfico de pontos usa as duas colunas |
| Exportação | CSV contém todas as frequências |

## Riscos e respostas

| Risco | Prevenção |
|---|---|
| Classificação automática incorreta | Exigir conferência humana e documentar o dicionário de dados |
| Fórmula estatística divergente da aula | Comparar com o material do professor e registrar o método adotado |
| Planilha grande travar o navegador | Limitar pontos visuais e manter cálculos no backend |
| CDN indisponível na apresentação | Levar capturas de tela ou baixar Plotly localmente antes do dia |
| Conflitos no código | Branches pequenas, revisão e integração frequente |
| Dados pessoais no repositório | Usar dados fictícios ou anonimizados |

