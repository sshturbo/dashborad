# Fundamentação estatística

Este documento registra os conceitos utilizados pelo StatLab e serve como base teórica para o relatório da disciplina.

## 1. Tipos de variável

### Qualitativa nominal

Representa categorias sem relação natural de ordem. Exemplos: curso, cidade, estado civil e turno. Para esse tipo são adequados tabela de frequências, moda, gráfico de barras e gráfico de pizza. Frequência acumulada, média e mediana não possuem interpretação estatística válida.

### Qualitativa ordinal

Representa categorias com uma ordem definida, mas sem distância numérica mensurável entre elas. Exemplos: baixo/médio/alto e ruim/regular/bom/ótimo. Além de frequências, moda, barras e pizza, pode-se construir frequência acumulada e uma linha de frequências, desde que a ordem seja informada corretamente.

### Quantitativa discreta

Resulta normalmente de contagem e assume valores isolados, em geral inteiros. Exemplos: número de filhos, faltas ou livros lidos. Aceita medidas numéricas, boxplot, pontos, linhas e distribuição de frequências com ou sem classes.

### Quantitativa contínua

Resulta normalmente de medição e pode assumir qualquer valor dentro de um intervalo. Exemplos: altura, massa, tempo e renda. Intervalos de classe são especialmente úteis quando há muitos valores diferentes.

> Atenção: o formato da célula não determina sozinho o tipo estatístico. Um código numérico de matrícula continua sendo uma variável qualitativa nominal. Por isso o sistema permite revisar a sugestão automática.

## 2. Tabela de frequência

Para cada valor ou classe, o sistema calcula:

- **Frequência absoluta (`fi`)**: número de ocorrências.
- **Frequência relativa (`fr`)**: `fi / n`.
- **Percentual**: `fr × 100`.
- **Frequência acumulada (`Fi`)**: soma das frequências até a linha atual.
- **Percentual acumulado**: `Fi / n × 100`.

A acumulação somente é mostrada quando existe ordem: variáveis ordinais, quantitativas ou intervalos. Em uma variável nominal, somar “curso A” até “curso C” não tem significado intrínseco.

## 3. Dados sem intervalo de classe

Cada valor diferente ocupa uma linha da tabela. As medidas são calculadas diretamente com as observações originais.

### Média aritmética

```text
x̄ = Σxi / n
```

### Mediana

Valor central depois da ordenação. Com quantidade par de observações, é a média dos dois valores centrais.

### Moda

Valor ou valores com maior frequência. Uma distribuição pode ser unimodal, multimodal ou não apresentar uma moda destacada.

### Quartis

- `Q1` (25%): um quarto das observações está abaixo ou igual a ele.
- `Q2` (50%): corresponde à mediana.
- `Q3` (75%): três quartos das observações estão abaixo ou igual a ele.

O sistema usa a interpolação linear padrão do Pandas para os quartis dos dados brutos.

### Dispersão

```text
amplitude = máximo - mínimo
variância amostral = Σ(xi - x̄)² / (n - 1)
desvio-padrão amostral = √variância
coeficiente de variação = (desvio-padrão / média) × 100
```

## 4. Dados com intervalo de classe

O StatLab usa classes contíguas e de mesma amplitude geradas pelo NumPy. Se o usuário não indicar a quantidade, aplica-se a regra de Sturges:

```text
k = teto(1 + 3,322 × log10(n))
```

O número é limitado a no máximo 30 classes e não supera a quantidade de valores distintos. O ponto médio de uma classe é:

```text
xi = (limite inferior + limite superior) / 2
```

### Medidas agrupadas aproximadas

Média:

```text
x̄g = Σ(xi × fi) / n
```

Quantil interpolado, incluindo mediana e quartis:

```text
Qp = L + [(p × n - Fant) / fclasse] × h
```

em que `L` é o limite inferior da classe do quantil, `Fant` é a frequência acumulada anterior, `fclasse` é a frequência da classe e `h` é a amplitude.

Moda de Czuber:

```text
Mo = L + [d1 / (d1 + d2)] × h
d1 = fmodal - fanterior
d2 = fmodal - fposterior
```

Como as posições dentro de cada classe são desconhecidas, essas medidas são aproximações. O dashboard mostra as estatísticas exatas dos dados originais nos cartões e as estimativas agrupadas em um aviso separado.

## 5. Escolha do gráfico

| Gráfico | Uso principal | Variáveis adequadas |
|---|---|---|
| Barras | Comparar frequências | Todas |
| Pizza | Mostrar composição percentual | Qualitativas ou poucas classes |
| Linhas | Mostrar sequência ou perfil ordenado | Quantitativas e qualitativas ordinais |
| Pontos | Observar dispersão ou relação entre duas colunas | Quantitativas |
| Ogiva | Mostrar frequência acumulada | Quantitativas ou ordinais |
| Boxplot | Resumir quartis, dispersão e possíveis valores atípicos | Quantitativas |

No gráfico de pontos, uma segunda variável quantitativa pode ser selecionada. Sem ela, o eixo horizontal representa a posição de cada observação na planilha.

## 6. Tratamento dos dados

- Células vazias não participam dos cálculos e são contabilizadas separadamente.
- Ao escolher uma classificação quantitativa, células vazias, valores infinitos e textos que não podem ser convertidos em número são contabilizados como ausentes/excluídos da análise numérica.
- Nos gráficos de linhas, pontos e boxplot, a resposta é limitada às primeiras 5.000 observações para manter a interface responsiva. Tabelas e medidas usam o conjunto completo aceito pelo servidor.
- Em intervalos, a última classe inclui o limite superior máximo; as anteriores são fechadas à esquerda e abertas à direita.
