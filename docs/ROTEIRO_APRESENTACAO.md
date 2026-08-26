# Roteiro de apresentação

Sugestão para uma apresentação de 12 a 15 minutos, com participação equilibrada dos seis integrantes.

## 1. Problema e objetivo — integrante 1 (2 min)

- Explicar por que transformar uma planilha em informação visual.
- Apresentar o objetivo: uma ferramenta local que reúna classificação, estatística descritiva, tabelas e gráficos.
- Mostrar rapidamente as tecnologias e a arquitetura.

## 2. Conjunto de dados — integrante 2 (2 min)

- Apresentar a origem ou geração dos dados e a unidade observacional.
- Explicar as colunas escolhidas.
- Mostrar um exemplo nominal, ordinal, discreto e contínuo.
- Comentar valores ausentes e cuidados de privacidade.

## 3. Conceitos estatísticos — integrante 3 (3 min)

- Diferenciar dados sem intervalo e com intervalo de classe.
- Explicar `fi`, `fr`, percentual e frequência acumulada.
- Explicar média, mediana, moda e quartis.
- Alertar que medidas agrupadas são aproximações.

## 4. Backend e importação — integrante 4 (2 min)

- Importar a planilha e trocar a aba.
- Explicar validação, leitura pelo Pandas e API Flask.
- Mostrar como erros e células ausentes são tratados.

## 5. Interface — integrante 5 (2 min)

- Escolher uma variável e revisar a classificação sugerida.
- Gerar uma análise sem intervalos.
- Mostrar cartões, tabela e exportação.
- Comentar responsividade e clareza visual.

## 6. Gráficos e conclusão — integrante 6 (3 min)

- Demonstrar barras, pizza, linhas, pontos, ogiva e boxplot.
- Repetir a análise com intervalos e explicar a mudança da tabela e da ogiva.
- Apresentar testes, limitações e possíveis melhorias.

## Demonstração recomendada

1. Gerar `data/exemplo_pesquisa.xlsx` antes da apresentação.
2. Importar a aba `Pesquisa`.
3. Analisar `Curso` como qualitativa nominal e mostrar barras/pizza.
4. Analisar `Satisfação` como qualitativa ordinal e confirmar a ordem.
5. Analisar `Número de livros` como quantitativa discreta sem intervalos.
6. Analisar `Altura (cm)` como quantitativa contínua com intervalos automáticos.
7. Selecionar `Horas de estudo/semana` como segunda variável no gráfico de pontos.
8. Comparar medida exata e medida agrupada.

## Perguntas que o grupo deve saber responder

- Por que um código numérico pode ser qualitativo?
- Quando frequência acumulada não faz sentido?
- Qual foi o critério para o número de classes?
- Por que a média agrupada é aproximada?
- Como o boxplot usa os quartis?
- Como valores ausentes afetam o total analisado?
- Qual a diferença entre discreta e contínua no conjunto usado?
- O que ocorre com um arquivo inválido ou muito grande?

## Plano de contingência

- Manter a planilha de exemplo e o projeto no mesmo computador.
- Testar a instalação e a porta antes da aula.
- Levar capturas dos resultados porque Plotly.js é carregado por internet.
- Ter um integrante responsável por operar o sistema e outro pronto para continuar a explicação durante qualquer espera.

