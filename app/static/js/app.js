"use strict";

const state = {
    datasetId: null,
    fileName: null,
    sheets: [],
    columns: [],
    analysis: null,
};

const elements = {};
const variableLabels = {
    qualitative_nominal: "Qualitativa nominal",
    qualitative_ordinal: "Qualitativa ordinal",
    quantitative_discrete: "Quantitativa discreta",
    quantitative_continuous: "Quantitativa contínua",
};

document.addEventListener("DOMContentLoaded", () => {
    [
        "alert", "fileInput", "dropZone", "fileInfo", "fileName", "fileMeta", "removeFile",
        "analysisForm", "sheetSelect", "columnSelect", "typeSelect", "inferenceHint",
        "ordinalField", "ordinalOrder", "secondaryField", "secondaryColumn", "groupField", "groupColumn", "groupFields",
        "groupedToggle", "binsField", "binsInput", "emptyState", "datasetArea", "rowCount",
        "columnCount", "previewTable", "results", "resultTitle", "resultSubtitle", "statsCards",
        "groupedNotice", "tableMode", "frequencyTable", "tableLimitNote", "analysisForm",
        "exportButton", "loading", "scatterCard", "boxCard", "ogiveCard", "lineDescription",
        "groupMeanCard", "groupBoxCard",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    bindEvents();
});

function bindEvents() {
    elements.fileInput.addEventListener("change", (event) => uploadFile(event.target.files[0]));
    ["dragenter", "dragover"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.add("dragging");
        });
    });
    ["dragleave", "drop"].forEach((eventName) => {
        elements.dropZone.addEventListener(eventName, (event) => {
            event.preventDefault();
            elements.dropZone.classList.remove("dragging");
        });
    });
    elements.dropZone.addEventListener("drop", (event) => uploadFile(event.dataTransfer.files[0]));
    elements.removeFile.addEventListener("click", removeDataset);
    elements.sheetSelect.addEventListener("change", () => loadSheet(elements.sheetSelect.value));
    elements.columnSelect.addEventListener("change", syncColumnConfiguration);
    elements.typeSelect.addEventListener("change", syncTypeControls);
    elements.groupedToggle.addEventListener("change", syncGroupedControls);
    elements.analysisForm.addEventListener("submit", runAnalysis);
    elements.exportButton.addEventListener("click", exportFrequencyTable);
    window.addEventListener("resize", debounce(resizeCharts, 180));
}

async function uploadFile(file) {
    if (!file) return;
    if (!/\.(xls|xlsx|xlsm|csv)$/i.test(file.name)) {
        showAlert("Formato inválido. Selecione um arquivo .xls, .xlsx, .xlsm ou .csv.");
        return;
    }

    const body = new FormData();
    body.append("file", file);
    setLoading(true);
    clearAlert();
    try {
        const response = await fetch("/api/datasets", { method: "POST", body });
        const data = await parseResponse(response);
        state.datasetId = data.dataset_id;
        state.fileName = data.file_name;
        state.sheets = data.sheets;
        elements.fileName.textContent = data.file_name;
        elements.fileMeta.textContent = `${formatBytes(file.size)} · ${data.sheets.length} aba(s)`;
        elements.dropZone.hidden = true;
        elements.fileInfo.hidden = false;
        elements.analysisForm.hidden = false;
        elements.emptyState.hidden = true;
        elements.datasetArea.hidden = false;
        populateSheetSelect(data.sheets, data.sheet);
        applyDatasetMetadata(data);
        showAlert("Planilha importada com sucesso.", "success");
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(false);
        elements.fileInput.value = "";
    }
}

async function loadSheet(sheet) {
    if (!state.datasetId) return;
    setLoading(true);
    clearAlert();
    try {
        const response = await fetch(`/api/datasets/${state.datasetId}?sheet=${encodeURIComponent(sheet)}`);
        const data = await parseResponse(response);
        applyDatasetMetadata(data);
        elements.results.hidden = true;
        state.analysis = null;
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(false);
    }
}

function applyDatasetMetadata(data) {
    state.columns = data.columns;
    elements.rowCount.textContent = formatInteger(data.row_count);
    elements.columnCount.textContent = formatInteger(data.column_count);
    populateColumnSelects();
    renderPreview(data.preview, data.columns.map((column) => column.name));
    syncColumnConfiguration();
}

function populateSheetSelect(sheets, selected) {
    clearElement(elements.sheetSelect);
    sheets.forEach((sheet) => addOption(elements.sheetSelect, sheet, sheet, sheet === selected));
}

function populateColumnSelects() {
    clearElement(elements.columnSelect);
    clearElement(elements.secondaryColumn);
    clearElement(elements.groupColumn);
    addOption(elements.secondaryColumn, "", "Usar índice das linhas", true);
    addOption(elements.groupColumn, "", "Sem agrupamento", true);
    state.columns.forEach((column, index) => {
        addOption(elements.columnSelect, column.name, column.name, index === 0);
        if (column.inferred_type.startsWith("quantitative_")) {
            addOption(elements.secondaryColumn, column.name, column.name, false);
        } else {
            addOption(elements.groupColumn, column.name, column.name, false);
        }
    });
}

function syncColumnConfiguration() {
    const column = state.columns.find((item) => item.name === elements.columnSelect.value);
    if (!column) return;
    elements.typeSelect.value = column.inferred_type;
    elements.inferenceHint.textContent = `Sugestão automática: ${column.type_label}. ${formatInteger(column.unique_count)} valor(es) distinto(s).`;
    elements.ordinalOrder.value = (column.inferred_order || []).join(", ");
    [...elements.secondaryColumn.options].forEach((option) => {
        option.disabled = option.value === column.name;
    });
    [...elements.groupColumn.options].forEach((option) => {
        option.disabled = option.value === column.name;
    });
    if (elements.secondaryColumn.value === column.name) elements.secondaryColumn.value = "";
    if (elements.groupColumn.value === column.name) elements.groupColumn.value = "";
    syncTypeControls();
}

function syncTypeControls() {
    const type = elements.typeSelect.value;
    const quantitative = type.startsWith("quantitative_");
    elements.ordinalField.hidden = type !== "qualitative_ordinal";
    elements.secondaryField.hidden = !quantitative;
    elements.groupField.hidden = !quantitative || elements.groupColumn.options.length <= 1;
    elements.groupFields.hidden = !quantitative;
    if (!quantitative) elements.groupedToggle.checked = false;
    syncGroupedControls();
}

function syncGroupedControls() {
    elements.binsField.hidden = !elements.groupedToggle.checked;
}

async function runAnalysis(event) {
    event.preventDefault();
    if (!state.datasetId) return;

    const ordinalOrder = elements.ordinalOrder.value
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const payload = {
        dataset_id: state.datasetId,
        sheet: elements.sheetSelect.value,
        column: elements.columnSelect.value,
        variable_type: elements.typeSelect.value,
        grouped: elements.groupedToggle.checked,
        bins: elements.binsInput.value || null,
        ordinal_order: ordinalOrder.length ? ordinalOrder : null,
        secondary_column: elements.secondaryColumn.value || null,
        group_column: elements.groupColumn.value || null,
    };

    setLoading(true);
    clearAlert();
    try {
        const response = await fetch("/api/analysis", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        state.analysis = await parseResponse(response);
        renderAnalysis(state.analysis);
        elements.results.hidden = false;
        elements.results.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showAlert(error.message);
    } finally {
        setLoading(false);
    }
}

function renderAnalysis(analysis) {
    elements.resultTitle.textContent = analysis.column;
    const group = analysis.charts.group_comparison?.column;
    elements.resultSubtitle.textContent = `${analysis.type_label} · ${formatInteger(analysis.valid_count)} valores válidos · ${formatInteger(analysis.missing_count)} ausentes${group ? ` · agrupado por ${group}` : ""}`;
    elements.tableMode.textContent = analysis.grouped ? `${analysis.bins} intervalos de classe` : "Dados sem intervalo";
    renderStatistics(analysis);
    renderFrequencyTable(analysis.frequency_table, analysis.grouped);
    renderCharts(analysis);
}

function renderStatistics(analysis) {
    clearElement(elements.statsCards);
    elements.groupedNotice.hidden = true;

    if (analysis.statistics) {
        const stats = analysis.statistics;
        const mode = stats.mode_note || (stats.mode.length ? stats.mode.map(formatNumber).join("; ") : "—");
        [
            ["Média", stats.mean, true],
            ["Mediana", stats.median, false],
            ["Moda", mode, false, true],
            ["1º quartil (Q1)", stats.q1],
            ["2º quartil (Q2)", stats.q2],
            ["3º quartil (Q3)", stats.q3],
            ["Desvio-padrão", stats.standard_deviation],
            ["Amplitude", stats.range],
        ].forEach(([label, value, accent, formatted]) => {
            appendStatCard(label, formatted ? value : formatNumber(value), accent);
        });

        if (analysis.grouped_statistics) {
            elements.groupedNotice.hidden = false;
            elements.groupedNotice.textContent = `Medidas agrupadas aproximadas — média: ${formatNumber(analysis.grouped_statistics.mean)}, mediana: ${formatNumber(analysis.grouped_statistics.median)}, moda: ${formatNumber(analysis.grouped_statistics.mode)}, Q1: ${formatNumber(analysis.grouped_statistics.q1)} e Q3: ${formatNumber(analysis.grouped_statistics.q3)}. ${analysis.grouped_statistics.note}`;
        }
    } else {
        const rows = analysis.frequency_table;
        const top = rows.reduce((best, row) => row.frequency > best.frequency ? row : best, rows[0]);
        appendStatCard("Total válido", formatInteger(analysis.valid_count), true);
        appendStatCard("Categorias", formatInteger(rows.length));
        appendStatCard("Moda", top.value);
        appendStatCard("Frequência modal", formatInteger(top.frequency));
    }
}

function appendStatCard(label, value, accent = false) {
    const card = document.createElement("article");
    card.className = `stat-card${accent ? " accent" : ""}`;
    const caption = document.createElement("span");
    caption.textContent = label;
    const number = document.createElement("strong");
    number.textContent = value ?? "—";
    number.title = String(value ?? "—");
    card.append(caption, number);
    elements.statsCards.appendChild(card);
}

function renderPreview(records, columns) {
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    columns.forEach((column) => {
        const th = document.createElement("th");
        th.textContent = column;
        head.appendChild(th);
    });
    const body = table.createTBody();
    records.forEach((record) => {
        const row = body.insertRow();
        columns.forEach((column) => {
            const cell = row.insertCell();
            const value = record[column];
            cell.textContent = value === null || value === undefined ? "ausente" : String(value);
            if (value === null || value === undefined) cell.className = "null-value";
        });
    });
    clearElement(elements.previewTable);
    elements.previewTable.appendChild(table);
}

function renderFrequencyTable(rows, grouped) {
    const columns = grouped
        ? [["Classe", "value"], ["Limite inferior", "lower"], ["Limite superior", "upper"], ["Ponto médio", "midpoint"], ["fi", "frequency"], ["fr", "relative_frequency"], ["%", "percentage"], ["Fi", "cumulative_frequency"], ["% acum.", "cumulative_percentage"]]
        : [["Valor / categoria", "value"], ["fi", "frequency"], ["fr", "relative_frequency"], ["%", "percentage"], ["Fi", "cumulative_frequency"], ["% acum.", "cumulative_percentage"]];
    const visibleRows = rows.slice(0, 500);
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    columns.forEach(([label]) => {
        const th = document.createElement("th");
        th.textContent = label;
        head.appendChild(th);
    });
    const body = table.createTBody();
    visibleRows.forEach((record) => {
        const row = body.insertRow();
        columns.forEach(([, key]) => {
            const cell = row.insertCell();
            const value = record[key];
            if (value === null || value === undefined) {
                cell.textContent = "—";
            } else if (["relative_frequency"].includes(key)) {
                cell.textContent = Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
            } else if (["percentage", "cumulative_percentage"].includes(key)) {
                cell.textContent = `${formatNumber(value)}%`;
            } else if (["lower", "upper", "midpoint"].includes(key)) {
                cell.textContent = formatNumber(value);
            } else {
                cell.textContent = String(value);
            }
        });
    });
    clearElement(elements.frequencyTable);
    elements.frequencyTable.appendChild(table);
    elements.tableLimitNote.hidden = rows.length <= visibleRows.length;
    elements.tableLimitNote.textContent = `Exibindo 500 de ${formatInteger(rows.length)} linhas. O arquivo CSV exportado contém a tabela completa.`;
}

function renderCharts(analysis) {
    if (typeof Plotly === "undefined") {
        showAlert("A biblioteca de gráficos não foi carregada. Verifique a conexão com a internet.");
        return;
    }
    const charts = analysis.charts;
    const colors = ["#FF6A00", "#1E5AA8", "#111827", "#FFC299", "#9DBBE8", "#8A3A00", "#0B2A52", "#9CA3AF", "#5C6F8F"];
    const baseLayout = {
        margin: { l: 48, r: 18, t: 25, b: 68 },
        paper_bgcolor: "transparent",
        plot_bgcolor: "transparent",
        font: { family: "Inter, sans-serif", size: 10, color: "#53605b" },
        xaxis: { gridcolor: "#ecebe5", automargin: true, tickangle: -25 },
        yaxis: { gridcolor: "#ecebe5", zerolinecolor: "#d8d8d1", automargin: true },
        hoverlabel: { bgcolor: "#18201e", font: { color: "white" } },
        showlegend: false,
    };
    const config = {
        responsive: true,
        displaylogo: false,
        locale: "pt-BR",
        modeBarButtonsToRemove: ["lasso2d", "select2d"],
        toImageButtonOptions: { format: "png", filename: `statlab-${slugify(analysis.column)}`, scale: 2 },
    };

    Plotly.react("barChart", [{ type: "bar", x: charts.frequency_labels, y: charts.frequencies, marker: { color: "#FF6A00", cornerradius: 4 }, hovertemplate: "%{x}<br>Frequência: %{y}<extra></extra>" }], { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: "Frequência" } }, config);
    Plotly.react("pieChart", [{ type: "pie", labels: charts.frequency_labels, values: charts.frequencies, hole: .43, marker: { colors }, textinfo: "percent", hovertemplate: "%{label}<br>%{value} (%{percent})<extra></extra>" }], { ...baseLayout, margin: { l: 20, r: 20, t: 25, b: 35 }, showlegend: true, legend: { orientation: "h", y: -.13, font: { size: 9 } } }, config);

    const quantitative = analysis.variable_type.startsWith("quantitative_");
    const hasDateTrend = charts.date_x?.length > 0;
    const lineX = hasDateTrend ? charts.date_x : quantitative ? charts.series_x : charts.frequency_labels;
    const lineY = hasDateTrend ? charts.date_y : quantitative ? charts.series_y : charts.frequencies;
    elements.lineDescription.textContent = hasDateTrend
        ? `Respostas por dia · ${charts.date_column}`
        : quantitative ? "Sequência das observações" : "Frequência por categoria";
    Plotly.react("lineChart", [{ type: "scatter", mode: "lines+markers", x: lineX, y: lineY, line: { color: "#FF6A00", width: 2 }, marker: { size: 5, color: "#1E5AA8", line: { color: "#fffefa", width: 1 } }, hovertemplate: "%{x}<br>%{y}<extra></extra>" }], baseLayout, config);

    elements.scatterCard.hidden = !quantitative;
    elements.boxCard.hidden = !quantitative;
    if (quantitative) {
        Plotly.react("scatterChart", [{ type: "scatter", mode: "markers", x: charts.series_x, y: charts.series_y, marker: { color: "#1E5AA8", size: 7, opacity: .7, line: { color: "white", width: 1 } }, hovertemplate: `${charts.scatter_x_label}: %{x}<br>${charts.scatter_y_label}: %{y}<extra></extra>` }], { ...baseLayout, xaxis: { ...baseLayout.xaxis, title: charts.scatter_x_label }, yaxis: { ...baseLayout.yaxis, title: charts.scatter_y_label } }, config);
        Plotly.react("boxChart", [{ type: "box", y: charts.box_values, name: analysis.column, boxpoints: "outliers", jitter: .25, marker: { color: "#1E5AA8" }, line: { color: "#FF6A00" }, fillcolor: "rgba(255,106,0,.25)", hovertemplate: "%{y}<extra></extra>" }], { ...baseLayout, xaxis: { ...baseLayout.xaxis, tickangle: 0 }, yaxis: { ...baseLayout.yaxis, title: analysis.column } }, config);
    }

    const hasOgive = charts.cumulative_x.length > 0;
    elements.ogiveCard.hidden = !hasOgive;
    if (hasOgive) {
        Plotly.react("ogiveChart", [{ type: "scatter", mode: "lines+markers", x: charts.cumulative_x, y: charts.cumulative_y, fill: "tozeroy", fillcolor: "rgba(30,90,168,.14)", line: { color: "#1E5AA8", width: 3 }, marker: { size: 6, color: "#FF6A00" }, hovertemplate: "%{x}<br>Acumulada: %{y}<extra></extra>" }], { ...baseLayout, yaxis: { ...baseLayout.yaxis, title: "Frequência acumulada" } }, config);
    }

    renderGroupCharts(charts, config, baseLayout);
}

function renderGroupCharts(charts, config, baseLayout) {
    const heatmap = charts.group_heatmap;
    const comparison = charts.group_comparison;
    const hasHeatmap = Boolean(heatmap?.values?.length && heatmap.metric_labels?.length);
    const groups = comparison?.groups || [];
    elements.groupMeanCard.hidden = !hasHeatmap;
    elements.groupBoxCard.hidden = groups.length === 0;

    if (hasHeatmap) {
        const columns = heatmap.metric_labels.map((_, index) => heatmap.values.map((row) => row[index]).filter((value) => value !== null && value !== undefined));
        const bounds = columns.map((values) => [Math.min(...values), Math.max(...values)]);
        const z = heatmap.values.map((row) => row.map((value, index) => {
            if (value === null || value === undefined) return null;
            const [minimum, maximum] = bounds[index];
            return maximum === minimum ? 0.5 : (value - minimum) / (maximum - minimum);
        }));
        const text = heatmap.values.map((row) => row.map((value) => value === null || value === undefined ? "—" : formatNumber(value)));
        Plotly.react("groupMeanChart", [{
            type: "heatmap",
            x: heatmap.metric_labels,
            y: heatmap.group_labels,
            z,
            customdata: heatmap.values,
            text,
            texttemplate: "%{text}",
            colorscale: [[0, "#fff7f0"], [1, "#FF6A00"]],
            zmin: 0,
            zmax: 1,
            hovertemplate: "%{y}<br>%{x}<br>Média: %{customdata}<extra></extra>",
            colorbar: { title: "Escala por variável", tickvals: [0, 1], ticktext: ["menor", "maior"] },
        }], { ...baseLayout, margin: { l: 115, r: 28, t: 18, b: 95 }, xaxis: { ...baseLayout.xaxis, tickangle: -35 }, yaxis: { ...baseLayout.yaxis, title: heatmap.group_column } }, config);
    }

    if (groups.length) {
        const x = [];
        const y = [];
        groups.forEach((group) => group.values.forEach((value) => { x.push(group.label); y.push(value); }));
        Plotly.react("groupBoxChart", [{
            type: "box",
            x,
            y,
            boxpoints: "outliers",
            boxmean: true,
            marker: { color: "#1E5AA8", size: 4 },
            line: { color: "#FF6A00" },
            fillcolor: "rgba(255,106,0,.2)",
            hovertemplate: "%{x}<br>Valor: %{y}<extra></extra>",
        }], { ...baseLayout, xaxis: { ...baseLayout.xaxis, title: comparison.column, tickangle: -25 }, yaxis: { ...baseLayout.yaxis, title: "Valores" } }, config);
    }
}

function exportFrequencyTable() {
    if (!state.analysis) return;
    const analysis = state.analysis;
    const escapeCsv = (value) => {
        let text = String(value ?? "");
        if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
        return `"${text.replaceAll('"', '""')}"`;
    };
    const csvRow = (values) => values.map(escapeCsv).join(";");
    const rows = [
        ["Resumo da análise"],
        ["Variável", analysis.column],
        ["Classificação", analysis.type_label],
        ["Linhas válidas", analysis.valid_count],
        ["Valores ausentes", analysis.missing_count],
    ];
    if (analysis.statistics) {
        rows.push(["", ""], ["Medidas estatísticas"], ["Medida", "Valor"]);
        const stats = analysis.statistics;
        [
            ["Média", stats.mean], ["Mediana", stats.median],
            ["Moda", stats.mode_note || (stats.mode || []).join(", ")],
            ["Q1", stats.q1], ["Q2", stats.q2], ["Q3", stats.q3],
            ["Mínimo", stats.minimum], ["Máximo", stats.maximum],
            ["Amplitude", stats.range], ["Variância", stats.variance],
            ["Desvio-padrão", stats.standard_deviation],
            ["Coeficiente de variação (%)", stats.coefficient_of_variation],
        ].forEach((row) => rows.push(row));
        if (analysis.grouped_statistics) {
            rows.push(["", ""], ["Medidas aproximadas por intervalos"], ["Medida", "Valor"]);
            ["mean", "median", "mode", "q1", "q2", "q3"].forEach((key) => rows.push([key, analysis.grouped_statistics[key]]));
        }
    }

    const frequencyKeys = analysis.grouped
        ? ["value", "lower", "upper", "midpoint", "frequency", "relative_frequency", "percentage", "cumulative_frequency", "cumulative_percentage"]
        : ["value", "frequency", "relative_frequency", "percentage", "cumulative_frequency", "cumulative_percentage"];
    const labels = {
        value: "valor_classe", lower: "limite_inferior", upper: "limite_superior", midpoint: "ponto_medio",
        frequency: "frequencia_absoluta", relative_frequency: "frequencia_relativa", percentage: "percentual",
        cumulative_frequency: "frequencia_acumulada", cumulative_percentage: "percentual_acumulado",
    };
    rows.push(["", ""], ["Tabela de frequências"], frequencyKeys.map((key) => labels[key]));
    analysis.frequency_table.forEach((row) => rows.push(frequencyKeys.map((key) => row[key])));

    const comparison = analysis.charts.group_comparison;
    if (comparison?.groups?.length) {
        rows.push(["", ""], [`Comparação por ${comparison.column}`], ["Categoria", "Quantidade", "Média"]);
        comparison.groups.forEach((group) => rows.push([group.label, group.count, group.mean]));
    }
    const heatmap = analysis.charts.group_heatmap;
    if (heatmap?.values?.length) {
        rows.push(["", ""], [`Médias por grupo: ${heatmap.group_column}`], ["Categoria", ...heatmap.metric_labels]);
        heatmap.group_labels.forEach((label, index) => rows.push([label, ...heatmap.values[index]]));
    }

    const csv = rows.map(csvRow).join("\r\n");
    const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `relatorio-statlab-${slugify(analysis.column)}.csv`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}

async function removeDataset() {
    if (state.datasetId) {
        try { await fetch(`/api/datasets/${state.datasetId}`, { method: "DELETE" }); } catch (_) { /* local cleanup still proceeds */ }
    }
    state.datasetId = null;
    state.fileName = null;
    state.columns = [];
    state.analysis = null;
    elements.dropZone.hidden = false;
    elements.fileInfo.hidden = true;
    elements.analysisForm.hidden = true;
    elements.emptyState.hidden = false;
    elements.datasetArea.hidden = true;
    elements.results.hidden = true;
    clearAlert();
}

async function parseResponse(response) {
    let data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
}

function showAlert(message, type = "error") {
    elements.alert.textContent = message;
    elements.alert.className = `alert${type === "success" ? " success" : ""}`;
    elements.alert.hidden = false;
}

function clearAlert() { elements.alert.hidden = true; }
function setLoading(active) { elements.loading.hidden = !active; }
function clearElement(element) { while (element.firstChild) element.removeChild(element.firstChild); }

function addOption(select, value, label, selected) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
}

function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 4 });
}

function formatInteger(value) { return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); }

function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[index]}`;
}

function slugify(text) {
    return String(text).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "dados";
}

function resizeCharts() {
    document.querySelectorAll(".chart").forEach((chart) => {
        if (chart.data && typeof Plotly !== "undefined") Plotly.Plots.resize(chart);
    });
}

function debounce(callback, wait) {
    let timeout;
    return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => callback(...args), wait); };
}

