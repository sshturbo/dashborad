"use strict";

const state = {
    datasetId: null,
    fileName: null,
    sheets: [],
    sheet: null,
    columns: [],
    analysis: null,
    groupedAnalysis: null,
    scatterAnalysis: null,
    blockspotAnalysis: null,
    downloads: [],
    activeChart: 0,
    chartAvailability: null,
    responsiveMobile: null,
    activeTab: "up",
    requestId: 0,
    tableRequestId: 0,
    tablePage: 0,
    tablePageSize: 100,
    tableRowCount: 0,
    tableColumns: [],
    tableSheet: null,
    typeOverrides: {},
    orderOverrides: {},
};

const elements = {};
const charts = {};
const chartOptions = {};
const chartItems = [
    ["bar", "Barra", "cbar"], ["column", "Coluna", "ccolumn"], ["pie", "Rosca", "cpie"], ["pizza", "Pizza", "cpizza"],
    ["table", "Tabela agrupada", null], ["rawtable", "Tabela geral", null],
    ["dot", "Ponto", "cdot"], ["line", "Linha", "cline"], ["ogv", "Ogiva", "cogv"], ["blk", "Blockspot", "blkb"],
    ["box", "Caixa", "cbox"], ["su", "Medidas sem classe", null], ["sg", "Medidas com classe", null],
];
const chartPalette = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4", "#f97316", "#14b8a6", "#6366f1"];
const variableTypeLabels = {
    qualitative_nominal: "Qualitativa nominal",
    qualitative_ordinal: "Qualitativa ordinal",
    quantitative_discrete: "Quantitativa discreta",
    quantitative_continuous: "Quantitativa contínua",
};
const responseTypeDescriptions = {
    qualitative_nominal: "resposta qualitativa, com categorias sem ordem",
    qualitative_ordinal: "resposta qualitativa, com categorias ordenáveis",
    quantitative_discrete: "resposta quantitativa discreta, com inteiros ou contagens",
    quantitative_continuous: "resposta quantitativa contínua, com medidas ou valores decimais",
};

document.addEventListener("DOMContentLoaded", initialize);

function initialize() {
    [
        "flt", "gf", "pk", "dash", "up", "emptyDash", "analysisAlert",
        "dashboardLayout", "pageTitle", "pageSubtitle", "contextFile",
        "file", "drop", "ust", "datasetSettings", "fileName", "fileMeta", "sheetSelect", "sheetField", "typeSelect",
        "ordinalField", "ordinalOrder", "secondaryField", "secondaryColumn", "groupField", "groupColumn", "groupedToggle",
        "binsField", "binsInput", "inferenceHint", "rowCount", "columnCount", "tpl", "rst", "loading",
        "blkb", "kun", "kgr", "tgr", "cfreqTableBody", "cfreqTableTotal", "cfreqTablePercent",
        "datasetTable", "tableSummary", "tablePageSize", "tablePrev", "tableNext", "tablePageIndicator",
        "na_dot", "na_line", "na_ogv", "na_blk", "na_box", "na_su", "na_sg",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    bindEvents();
    selectTab("up");
    pickChart(0);
}

function bindEvents() {
    elements.file.addEventListener("change", (event) => uploadFile(event.target.files[0]));
    elements.drop.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            elements.file.click();
        }
    });
    ["dragenter", "dragover"].forEach((name) => elements.drop.addEventListener(name, (event) => {
        event.preventDefault();
        elements.drop.classList.add("ov");
    }));
    ["dragleave", "drop"].forEach((name) => elements.drop.addEventListener(name, (event) => {
        event.preventDefault();
        elements.drop.classList.remove("ov");
    }));
    elements.drop.addEventListener("drop", (event) => uploadFile(event.dataTransfer.files[0]));
    elements.sheetSelect.addEventListener("change", () => loadSheet(elements.sheetSelect.value));
    elements.gf.addEventListener("change", () => {
        syncVariableConfiguration();
        runAnalysis();
    });
    state.responsiveMobile = window.matchMedia("(max-width: 640px)").matches;
    window.addEventListener("resize", () => {
        const mobile = window.matchMedia("(max-width: 640px)").matches;
        if (mobile !== state.responsiveMobile) {
            state.responsiveMobile = mobile;
            if (state.analysis) renderCharts(state.analysis);
        }
        resizeActiveChart();
    });
    elements.typeSelect.addEventListener("change", () => {
        const column = selectedColumn();
        if (column) {
            state.typeOverrides[column.name] = elements.typeSelect.value;
            updateInferenceHint(column, elements.typeSelect.value);
        }
        syncTypeControls();
        runAnalysis();
    });
    elements.ordinalOrder.addEventListener("change", () => {
        const column = selectedColumn();
        if (column) state.orderOverrides[column.name] = parseOrder(elements.ordinalOrder.value);
        runAnalysis();
    });
    elements.secondaryColumn.addEventListener("change", runAnalysis);
    elements.groupColumn.addEventListener("change", runAnalysis);
    elements.groupedToggle.addEventListener("change", () => {
        syncGroupedControls();
        runAnalysis();
    });
    elements.binsInput.addEventListener("change", runAnalysis);
    elements.pk.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-i]");
        if (button) pickChart(Number(button.dataset.i));
    });
    elements.tablePageSize.addEventListener("change", () => {
        state.tablePageSize = Number(elements.tablePageSize.value) || 100;
        state.tablePage = 0;
        loadTablePage(0);
    });
    elements.tablePrev.addEventListener("click", () => loadTablePage(Math.max(0, state.tablePage - 1)));
    elements.tableNext.addEventListener("click", () => loadTablePage(state.tablePage + 1));
    elements.tpl.addEventListener("click", downloadTemplate);
    elements.rst.addEventListener("click", removeDataset);
    elements.dash.addEventListener("click", handleDownloadClick);
}

function selectTab(tab) {
    if (!["dash", "up"].includes(tab)) return;
    if (tab === "up" && state.datasetId) tab = "dash";
    if (tab === "dash" && !state.datasetId) tab = "up";
    state.activeTab = tab;
    ["dash", "up"].forEach((id) => { elements[id].hidden = id !== tab; });
    elements.flt.hidden = !(tab === "dash" && state.columns.length);
    elements.dashboardLayout.hidden = tab !== "dash";
    syncPageContext();
    if (tab === "dash") resizeActiveChart();
}

function syncPageContext() {
    const pages = {
        dash: ["Dashboard", "Explore as respostas e escolha a visualização para sua análise."],
        up: ["Carregar dados", "Importe sua base para começar a análise."],
    };
    const [title, subtitle] = pages[state.activeTab];
    elements.pageTitle.textContent = title;
    elements.pageSubtitle.textContent = subtitle;
    elements.contextFile.textContent = state.fileName || "Nenhum arquivo carregado";
    elements.contextFile.title = state.fileName || "Nenhum arquivo carregado";
    elements.contextFile.classList.toggle("loaded", Boolean(state.fileName));
}

async function uploadFile(file) {
    if (!file) return;
    if (!/\.(xls|xlsx|xlsm|csv)$/i.test(file.name)) {
        setUploadStatus("Formato inválido. Selecione um arquivo .xls, .xlsx, .xlsm ou .csv.", true);
        return;
    }

    const previousDataset = state.datasetId;
    const body = new FormData();
    body.append("file", file);
    setLoading(true);
    setUploadStatus("Enviando e lendo a planilha pela aplicação Python…");
    try {
        const response = await fetch("/api/datasets", { method: "POST", body });
        const data = await parseResponse(response);
        state.datasetId = data.dataset_id;
        state.fileName = file.name;
        state.sheets = data.sheets || [];
        state.sheet = data.sheet;
        state.tablePage = 0;
        state.tableRowCount = 0;
        state.tableColumns = [];
        state.tableSheet = null;
        ++state.tableRequestId;
        if (previousDataset && previousDataset !== state.datasetId) deleteDatasetOnServer(previousDataset);
        elements.fileName.textContent = file.name;
        elements.fileMeta.textContent = `${formatBytes(file.size)} · ${state.sheets.length} aba(s)`;
        elements.datasetSettings.hidden = false;
        elements.emptyDash.hidden = true;
        elements.flt.hidden = state.activeTab !== "dash";
        populateSheetSelect(state.sheets, data.sheet);
        applyDatasetMetadata(data);
        selectTab("dash");
        setUploadStatus(`Arquivo “${file.name}” carregado. ${formatInteger(data.row_count)} respostas · ${formatInteger(data.column_count)} colunas.`, false, true);
        if (state.columns.length) await runAnalysis();
        else setAnalysisError("Nenhuma coluna utilizável foi encontrada nesta planilha.");
    } catch (error) {
        setUploadStatus(error.message, true);
    } finally {
        setLoading(false);
        elements.file.value = "";
    }
}

async function loadSheet(sheet) {
    if (!state.datasetId) return;
    const request = ++state.requestId;
    setLoading(true);
    try {
        const response = await fetch(`/api/datasets/${state.datasetId}?sheet=${encodeURIComponent(sheet)}`);
        const data = await parseResponse(response);
        if (request !== state.requestId) return;
        state.sheet = data.sheet;
        state.typeOverrides = {};
        state.orderOverrides = {};
        applyDatasetMetadata(data);
        elements.emptyDash.hidden = true;
        if (state.activeChart === 5) await loadTablePage(0);
        if (state.columns.length) await runAnalysis();
        else setAnalysisError("Nenhuma coluna utilizável foi encontrada nesta aba.");
    } catch (error) {
        if (request === state.requestId) setAnalysisError(error.message);
    } finally {
        if (request === state.requestId) setLoading(false);
    }
}

function applyDatasetMetadata(data) {
    state.columns = data.columns || [];
    elements.rowCount.textContent = formatInteger(data.row_count || 0);
    elements.columnCount.textContent = formatInteger(data.column_count || 0);
    elements.emptyDash.hidden = Boolean(state.columns.length);
    elements.gf.disabled = !state.columns.length;
    elements.flt.hidden = !(state.activeTab === "dash" && state.columns.length);
    populateVariableSelect();
    syncPageContext();
    if (state.columns.length) syncVariableConfiguration();
}

function populateSheetSelect(sheets, selected) {
    clearElement(elements.sheetSelect);
    (sheets || []).forEach((sheet) => addOption(elements.sheetSelect, sheet, sheet, sheet === selected));
    elements.sheetField.hidden = sheets.length <= 1;
}

function populateVariableSelect() {
    const previous = elements.gf.value;
    clearElement(elements.gf);
    const categorical = state.columns.filter((column) => !column.inferred_type.startsWith("quantitative_"));
    const quantitative = state.columns.filter((column) => column.inferred_type.startsWith("quantitative_"));
    if (categorical.length) appendOptionGroup(elements.gf, "Categorias", categorical);
    if (quantitative.length) appendOptionGroup(elements.gf, "Numéricas (notas e contagens)", quantitative);
    const selected = state.columns.some((column) => column.name === previous)
        ? previous
        : (categorical[0] || quantitative[0])?.name;
    if (selected) elements.gf.value = selected;
}

function appendOptionGroup(select, label, columns) {
    const group = document.createElement("optgroup");
    group.label = label;
    columns.forEach((column) => {
        const option = document.createElement("option");
        option.value = column.name;
        option.textContent = column.name;
        option.title = `${column.type_label} · ${formatInteger(column.unique_count)} valores distintos`;
        group.appendChild(option);
    });
    select.appendChild(group);
}

function syncVariableConfiguration() {
    const column = selectedColumn();
    if (!column) return;
    const type = state.typeOverrides[column.name] || column.inferred_type;
    elements.typeSelect.value = type;
    const order = state.orderOverrides[column.name] || column.inferred_order || [];
    elements.ordinalOrder.value = order.join(", ");
    updateInferenceHint(column, type);
    populateComparisonColumns(column);
    syncTypeControls();
}

function updateInferenceHint(column, appliedType) {
    const suggestedLabel = column.type_label || variableTypeLabels[column.inferred_type] || "Não identificado";
    const appliedLabel = variableTypeLabels[appliedType] || suggestedLabel;
    const responseDescription = responseTypeDescriptions[column.inferred_type] || "resposta ainda não classificada";
    const manualAdjustment = appliedType !== column.inferred_type ? " (ajustada manualmente)" : "";

    elements.inferenceHint.textContent = `Pergunta selecionada: “${column.name}”. Tipo estatístico inferido pelas respostas: ${responseDescription}. Sugestão: ${suggestedLabel}; classificação usada: ${appliedLabel}${manualAdjustment}. A planilha não informa o formato original da pergunta.`;
}

function populateComparisonColumns(column) {
    const numeric = state.columns.filter((item) => item.inferred_type.startsWith("quantitative_"));
    const categorical = state.columns.filter((item) => item.name !== column.name && !item.inferred_type.startsWith("quantitative_"));
    const oldSecondary = elements.secondaryColumn.value;
    const oldGroup = elements.groupColumn.value;

    clearElement(elements.secondaryColumn);
    addOption(elements.secondaryColumn, "", "Variável atual no Y (índice no X)", false);
    numeric.filter((item) => item.name !== column.name).forEach((item) => addOption(elements.secondaryColumn, item.name, item.name, false));
    const defaultSecondary = numeric.find((item) => item.name !== column.name)?.name || "";
    elements.secondaryColumn.value = numeric.some((item) => item.name === oldSecondary && item.name !== column.name) ? oldSecondary : defaultSecondary;

    clearElement(elements.groupColumn);
    addOption(elements.groupColumn, "", "Sem agrupamento", false);
    categorical.forEach((item) => addOption(elements.groupColumn, item.name, item.name, false));
    const defaultGroup = categorical[0]?.name || "";
    elements.groupColumn.value = categorical.some((item) => item.name === oldGroup) ? oldGroup : defaultGroup;
}

function syncTypeControls() {
    const type = elements.typeSelect.value;
    const quantitative = type.startsWith("quantitative_");
    const selectedName = elements.gf.value;
    const categoricalCount = state.columns.filter((column) => column.name !== selectedName && !column.inferred_type.startsWith("quantitative_")).length;
    const activeChart = chartItems[state.activeChart]?.[0];
    elements.ordinalField.hidden = type !== "qualitative_ordinal";
    elements.secondaryField.hidden = activeChart !== "dot" || !quantitative;
    elements.groupField.hidden = !["blk", "box"].includes(activeChart) || !quantitative || categoricalCount === 0;
    elements.groupedToggle.disabled = !quantitative;
    if (!quantitative) elements.groupedToggle.checked = false;
    syncGroupedControls();
}

function syncGroupedControls() {
    elements.binsField.hidden = !(elements.typeSelect.value.startsWith("quantitative_") && elements.groupedToggle.checked);
}

async function runAnalysis() {
    if (!state.datasetId || !elements.gf.value) return;
    const request = ++state.requestId;
    const column = selectedColumn();
    const type = elements.typeSelect.value;
    const quantitative = type.startsWith("quantitative_");
    const groupColumn = quantitative ? (elements.groupColumn.value || null) : null;
    const secondaryColumn = quantitative ? (elements.secondaryColumn.value || null) : null;
    const common = {
        dataset_id: state.datasetId,
        sheet: state.sheet,
        column: column.name,
        variable_type: type,
        ordinal_order: type === "qualitative_ordinal" ? parseOrder(elements.ordinalOrder.value) : null,
        group_column: groupColumn,
    };

    setLoading(true);
    clearAnalysisError();
    try {
        const requests = [requestAnalysis({ ...common, grouped: false, secondary_column: null })];
        requests.push(quantitative
            ? requestAnalysis({ ...common, grouped: true, bins: elements.groupedToggle.checked ? (elements.binsInput.value || null) : null, secondary_column: null })
            : Promise.resolve(null));
        requests.push(quantitative && secondaryColumn
            ? requestAnalysis({ ...common, grouped: false, secondary_column: secondaryColumn, group_column: null })
            : Promise.resolve(null));
        let blockspotRequest = Promise.resolve(null);
        if (!quantitative) {
            const numeric = state.columns.find((item) => item.inferred_type.startsWith("quantitative_"));
            if (!column.inferred_type.startsWith("quantitative_") && numeric && numeric.name !== column.name) {
                blockspotRequest = requestAnalysis({
                    dataset_id: state.datasetId,
                    sheet: state.sheet,
                    column: numeric.name,
                    variable_type: numeric.inferred_type,
                    grouped: false,
                    group_column: column.name,
                    secondary_column: null,
                });
            }
        }
        requests.push(blockspotRequest);
        const [analysis, groupedAnalysis, scatterAnalysis, blockspotAnalysis] = await Promise.all(requests);
        if (request !== state.requestId) return;
        state.analysis = analysis;
        state.groupedAnalysis = groupedAnalysis;
        state.scatterAnalysis = scatterAnalysis;
        state.blockspotAnalysis = blockspotAnalysis;
        renderAnalysis();
    } catch (error) {
        if (request === state.requestId) setAnalysisError(error.message);
    } finally {
        if (request === state.requestId) setLoading(false);
    }
}

async function requestAnalysis(payload) {
    const response = await fetch("/api/analysis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    return parseResponse(response);
}

function renderAnalysis() {
    const analysis = state.analysis;
    if (!analysis) return;
    syncDistributionTitles(analysis);
    renderCharts(analysis);
    const quantitative = analysis.variable_type.startsWith("quantitative_");
    const chartData = analysis.charts;
    const hasDate = chartData.date_x?.length > 0;
    const availability = {
        bar: true,
        column: true,
        pie: true,
        pizza: true,
        table: true,
        rawtable: true,
        dot: quantitative && Boolean(scatterChartPayload(analysis)?.series_x?.length),
        line: hasDate || quantitative,
        ogv: quantitative && Boolean(state.groupedAnalysis?.charts?.cumulative_x?.length),
        blk: Boolean(blockspotData()?.values?.length),
        box: quantitative,
        su: quantitative && Boolean(analysis.statistics),
        sg: quantitative && Boolean(state.groupedAnalysis?.grouped_statistics),
    };
    const messages = {
        dot: "Não há valores numéricos suficientes para montar o gráfico de pontos.",
        line: "Sem coluna de data no arquivo. Escolha uma variável numérica para ver os valores por ordem de resposta.",
        ogv: "A ogiva exige dados numéricos. Escolha uma variável numérica.",
        blk: "O blockspot precisa de uma coluna de categorias e ao menos uma numérica.",
        box: "O boxplot exige dados numéricos. Escolha uma variável numérica.",
        su: "Escolha uma variável numérica para ver estas medidas.",
        sg: "Escolha uma variável numérica para ver as medidas com intervalo de classe.",
    };
    ["dot", "line", "ogv", "blk", "box", "su", "sg"].forEach((key) => setAvailability(key, availability[key], messages[key]));
    state.chartAvailability = availability;
    syncChartList(availability);
    renderDownloads(availability);
    elements.emptyDash.hidden = true;
    pickChart(state.activeChart);
}

function syncChartList(availability) {
    chartItems.forEach(([key], index) => {
        const button = elements.pk.querySelector(`button[data-i="${index}"]`);
        if (button) button.hidden = availability[key] === false;
    });
    const groups = [...elements.pk.querySelectorAll(".visualization-group")];
    groups.forEach((group, index) => {
        const nextGroup = groups[index + 1] || null;
        let sibling = group.nextElementSibling;
        let hasVisibleChart = false;
        while (sibling && sibling !== nextGroup) {
            if (sibling.matches('button[data-i]') && !sibling.hidden) hasVisibleChart = true;
            sibling = sibling.nextElementSibling;
        }
        group.hidden = !hasVisibleChart;
    });
    const activeKey = chartItems[state.activeChart]?.[0];
    if (availability[activeKey] === false) {
        const firstAvailable = chartItems.findIndex(([key]) => availability[key] !== false);
        if (firstAvailable >= 0) state.activeChart = firstAvailable;
    }
}

function usesGroupedDistribution(analysis) {
    return analysis.variable_type === "quantitative_continuous" ||
        (analysis.variable_type === "quantitative_discrete" && elements.groupedToggle.checked);
}

function scatterChartPayload(analysis = state.analysis) {
    if (!analysis) return null;
    return elements.secondaryColumn.value ? state.scatterAnalysis?.charts : analysis.charts;
}

function distributionFrequencyRows(analysis) {
    const groupedRows = state.groupedAnalysis?.frequency_table;
    if (usesGroupedDistribution(analysis) && groupedRows?.length) return groupedRows;
    return analysis.frequency_table || [];
}

function syncDistributionTitles(analysis) {
    const grouped = usesGroupedDistribution(analysis);
    const label = grouped ? "intervalo de classe" : "categoria";
    const titles = {
        cd_bar: `Barras — frequência por ${label}`,
        cd_column: `Coluna — frequência por ${label}`,
        cd_pie: `Rosca — participação por ${label}`,
        cd_pizza: `Pizza — participação por ${label}`,
        cd_table: `Tabela agrupada — frequência por ${label}`,
    };
    Object.entries(titles).forEach(([cardId, title]) => {
        const heading = document.querySelector(`#${cardId} .chart-head h2`);
        if (heading) heading.textContent = title;
    });
    const tableHeading = document.querySelector("#cd_table thead th");
    if (tableHeading) tableHeading.textContent = grouped ? "Intervalo de classe" : "Categoria";
    document.querySelector("#cd_table table")?.setAttribute(
        "aria-label",
        grouped ? "Frequência e participação por intervalo de classe" : "Frequência e participação por categoria",
    );
}


function renderCharts(analysis) {
    const frequency = distributionFrequencyRows(analysis);
    const barRows = frequency.map((row) => [row.value, row.frequency]);
    const barLabels = barRows.map((row) => String(row[0]));
    const barValues = barRows.map((row) => Number(row[1]) || 0);
    const barSeries = "Respostas";
    const distributionLabel = usesGroupedDistribution(analysis) ? "Intervalo de classe" : "Categoria";
    makeChart("cbar", {
        ...baseChartOption([barSeries]),
        tooltip: chartTooltip("axis", "shadow", (params) => {
            const point = firstChartParam(params);
            return chartTooltipLines(point.axisValueLabel || point.name, [formatInteger(point.value)], [point.seriesName || barSeries]);
        }),
        grid: { left: 24, right: 30, top: 38, bottom: 32, containLabel: true },
        xAxis: {
            ...chartValueAxis(),
            name: "Frequência (respostas)",
            nameLocation: "middle",
            nameGap: 32,
            min: 0,
            axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatInteger(value) },
        },
        yAxis: {
            ...chartCategoryAxis(barLabels),
            inverse: true,
            axisLabel: { color: CHART_TEXT, fontSize: 11, width: 180, overflow: "truncate", margin: 12 },
        },
        series: [{
            name: barSeries,
            type: "bar",
            data: barValues,
            barMaxWidth: 32,
            label: { show: true, position: "right", color: CHART_TEXT, fontSize: 11, formatter: (params) => formatInteger(params.value) },
            itemStyle: { color: chartPalette[0], borderRadius: [0, 4, 4, 0] },
            emphasis: { focus: "series", itemStyle: { color: "#2563eb" } },
            labelLayout: { hideOverlap: true },
        }],
        dataZoom: chartDataZoom("cbar", barLabels.length, "y", true, barLabels),
    });

    renderColumnChart(frequency, distributionLabel);
    renderPieChart(frequency, "donut");
    renderPieChart(frequency, "pie");
    renderFrequencyTable(frequency);
    const quantitative = analysis.variable_type.startsWith("quantitative_");
    const scatter = scatterChartPayload(analysis);
    if (quantitative && scatter?.series_x?.length) {
        const compact = window.matchMedia("(max-width: 640px)").matches;
        const points = scatter.series_x.map((x, index) => [Number(x), Number(scatter.series_y[index])]);
        const name = scatter.scatter_y_label + " por " + scatter.scatter_x_label;
        const axisContext = document.getElementById("dotAxisContext");
        if (axisContext) axisContext.textContent = `Eixo X: ${scatter.scatter_x_label}. Eixo Y: ${scatter.scatter_y_label}. Cada ponto representa uma resposta.`;
        makeChart("cdot", {
            ...baseChartOption([compact ? "Relação entre variáveis" : name]),
            tooltip: chartTooltip("item", null, (point) => chartTooltipLines(name, [
                String(scatter.scatter_x_label) + ": " + formatNumber(point.value[0]),
                String(scatter.scatter_y_label) + ": " + formatNumber(point.value[1]),
            ])),
            grid: { left: compact ? 42 : 56, right: 18, top: 42, bottom: compact ? 54 : 54, containLabel: true },
            xAxis: {
                ...chartValueAxis(),
                name: compact ? "Eixo X" : scatter.scatter_x_label,
                nameLocation: "middle",
                nameGap: compact ? 24 : 34,
                axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, formatter: (value) => formatNumber(value) },
            },
            yAxis: {
                ...chartValueAxis(),
                name: compact ? "Eixo Y" : scatter.scatter_y_label,
                nameLocation: "middle",
                nameGap: compact ? 28 : 44,
                axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, formatter: (value) => formatNumber(value) },
            },
            series: [{
                name,
                type: "scatter",
                data: points,
                symbolSize: 9,
                itemStyle: { color: chartPalette[0], opacity: 0.76 },
                emphasis: { focus: "series", itemStyle: { opacity: 1, borderColor: "#ffffff", borderWidth: 2 } },
            }],
            dataZoom: chartDataZoom("cdot", points.length, "x", false, []),
        });
    }

    const dateLabels = analysis.charts.date_x || [];
    const lineLabels = dateLabels.length
        ? dateLabels.map((date) => String(date).slice(8, 10) + "/" + String(date).slice(5, 7) + "/" + String(date).slice(2, 4))
        : analysis.charts.series_x.map(String);
    const lineValues = dateLabels.length ? analysis.charts.date_y : analysis.charts.series_y;
    const lineXTitle = dateLabels.length ? "Data da resposta" : "Ordem da resposta";
    const lineYTitle = dateLabels.length ? "Número de respostas por dia" : analysis.column;
    const lineName = dateLabels.length ? "Respostas por dia" : analysis.column;
    makeChart("cline", {
        ...baseChartOption([lineName]),
        tooltip: chartTooltip("axis", "line", (params) => {
            const point = firstChartParam(params);
            return chartTooltipLines(point.axisValueLabel || point.name, [formatNumber(point.value)], [point.seriesName || lineName]);
        }),
        grid: { left: 52, right: 22, top: 40, bottom: 56, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(lineLabels),
            boundaryGap: false,
            name: lineXTitle,
            nameLocation: "middle",
            nameGap: 38,
            axisLabel: { color: CHART_TEXT, fontSize: 11, rotate: lineLabels.length > 8 ? 25 : 0, hideOverlap: true },
        },
        yAxis: {
            ...chartValueAxis(),
            name: lineYTitle,
            nameLocation: "middle",
            nameGap: 44,
            min: dateLabels.length ? 0 : undefined,
            axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatNumber(value) },
        },
        series: [{
            name: lineName,
            type: "line",
            smooth: true,
            showSymbol: lineLabels.length <= 100,
            symbolSize: 6,
            data: lineValues,
            lineStyle: { color: chartPalette[0], width: 3 },
            itemStyle: { color: chartPalette[0] },
            areaStyle: {
                color: {
                    type: "linear",
                    x: 0, y: 0, x2: 0, y2: 1,
                    colorStops: [
                        { offset: 0, color: "#3b82f655" },
                        { offset: 1, color: "#3b82f505" },
                    ],
                },
            },
        }],
        dataZoom: chartDataZoom("cline", lineLabels.length, "x", false, lineLabels),
    });

    if (state.groupedAnalysis) {
        const groupedCharts = state.groupedAnalysis.charts;
        const ogivePoints = groupedCharts.cumulative_x.map((x, index) => [Number(x), Number(groupedCharts.cumulative_y[index])]);
        const ogiveName = "Frequência acumulada";
        makeChart("cogv", {
            ...baseChartOption([ogiveName]),
            tooltip: chartTooltip("axis", "line", (params) => {
                const point = firstChartParam(params);
                return chartTooltipLines(ogiveName, [
                    "Limite da classe: " + formatNumber(point.value[0]),
                    "Acumulada: " + formatInteger(point.value[1]) + " respostas",
                ]);
            }),
            grid: { left: 60, right: 24, top: 40, bottom: 58, containLabel: true },
            xAxis: {
                ...chartValueAxis(),
                name: "Limite da classe — " + analysis.column,
                nameLocation: "middle",
                nameGap: 38,
                axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatNumber(value) },
            },
            yAxis: {
                ...chartValueAxis(),
                name: "Frequência acumulada (respostas)",
                nameLocation: "middle",
                nameGap: 48,
                min: 0,
                max: analysis.valid_count || undefined,
                axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatInteger(value) },
            },
            series: [{
                name: ogiveName,
                type: "line",
                smooth: false,
                showSymbol: true,
                symbolSize: 7,
                data: ogivePoints,
                lineStyle: { color: chartPalette[4], width: 3 },
                itemStyle: { color: chartPalette[4], borderColor: "#ffffff", borderWidth: 2 },
                areaStyle: { color: "rgba(139,92,246,0.10)" },
            }],
            dataZoom: chartDataZoom("cogv", ogivePoints.length, "x", false, []),
        });
    }

    renderBlockspot(blockspotData());
    if (quantitative) renderBoxplot(analysis);
    renderKpis(elements.kun, analysis.statistics, false);
    if (state.groupedAnalysis) {
        renderKpis(elements.kgr, state.groupedAnalysis.grouped_statistics, true);
        renderGroupedTable(state.groupedAnalysis.frequency_table);
    }
}

function renderColumnChart(rows, distributionLabel) {
    rows = rows || [];
    const labels = rows.map((row) => String(row.value));
    const values = rows.map((row) => Number(row.frequency) || 0);
    const seriesName = "Respostas";
    const dataZoom = chartDataZoom("ccolumn", labels.length, "x", false, labels);
    makeChart("ccolumn", {
        ...baseChartOption([]),
        tooltip: chartTooltip("axis", "shadow", (params) => {
            const point = firstChartParam(params);
            return chartTooltipLines(point.axisValueLabel || point.name, [formatInteger(point.value)], [seriesName]);
        }),
        grid: { left: 64, right: 24, top: 40, bottom: dataZoom ? 86 : 64, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(labels),
            name: distributionLabel,
            nameLocation: "middle",
            nameGap: 42,
            axisLabel: {
                color: CHART_TEXT,
                fontSize: 11,
                interval: 0,
                rotate: labels.length > 6 ? 25 : 0,
                hideOverlap: true,
            },
        },
        yAxis: {
            ...chartValueAxis(),
            name: "Frequência (respostas)",
            nameLocation: "middle",
            nameGap: 48,
            min: 0,
            axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatInteger(value) },
        },
        series: [{
            name: seriesName,
            type: "bar",
            data: values,
            barMaxWidth: 48,
            label: { show: true, position: "top", color: CHART_TEXT, fontSize: 11, formatter: (point) => formatInteger(point.value) },
            itemStyle: { color: chartPalette[0], borderRadius: [5, 5, 0, 0] },
            emphasis: { focus: "series", itemStyle: { color: "#2563eb" } },
            labelLayout: { hideOverlap: true },
        }],
        dataZoom,
    });
}

function renderPieChart(frequencyRows, mode = "donut") {
    const mobile = window.matchMedia("(max-width: 640px)").matches;
    const rows = topFrequencies((frequencyRows || []).map((row) => [row.value, row.frequency]), mobile ? 7 : 12);
    const labels = rows.map((row) => String(row[0]));
    const total = (frequencyRows || []).reduce((sum, row) => sum + (Number(row.frequency) || 0), 0);
    const isDonut = mode === "donut";
    const chartId = isDonut ? "cpie" : "cpizza";
    const formatPieLabel = (point) => `${point.name} ${Number(point.percent || 0).toLocaleString("pt-BR", { maximumFractionDigits: 0 })}%`;
    makeChart(chartId, {
        ...baseChartOption(labels, "bottom", true),
        backgroundColor: PIE_SURFACE,
        tooltip: chartTooltip("item", null, (point) => {
            const percent = Number(point.percent || (total ? Number(point.value) * 100 / total : 0));
            return chartTooltipLines(point.name, [formatInteger(point.value) + " respostas", percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%"]);
        }),
        legend: { show: false },
        graphic: isDonut ? [{
            type: "text",
            left: "center",
            top: "46%",
            silent: true,
            style: {
                text: formatInteger(total),
                textAlign: "center",
                textVerticalAlign: "middle",
                fill: PIE_TEXT,
                fontSize: 22,
                fontWeight: 700,
            },
        }, {
            type: "text",
            left: "center",
            top: "55%",
            silent: true,
            style: { text: "Total", textAlign: "center", textVerticalAlign: "middle", fill: PIE_TEXT, fontSize: 11 },
        }] : [],
        series: [{
            name: "Participação",
            type: "pie",
            radius: isDonut ? ["39%", "70%"] : "70%",
            center: ["50%", "50%"],
            avoidLabelOverlap: true,
            minShowLabelAngle: 0,
            itemStyle: { borderColor: "#171717", borderWidth: 2 },
            label: { show: true, position: "outside", alignTo: "edge", edgeDistance: 14, distanceToLabelLine: 2, color: PIE_TEXT, fontSize: 11, formatter: formatPieLabel },
            labelLine: { show: true, length: 16, length2: 54, smooth: 0.1, lineStyle: { color: PIE_TEXT, width: 1 } },
            labelLayout: { moveOverlap: "shiftY", hideOverlap: true },
            emphasis: {
                scale: true,
                scaleSize: 6,
                label: { show: true, color: PIE_TEXT, fontSize: 12, fontWeight: "bold", formatter: formatPieLabel },
            },
            data: rows.map((row) => ({ name: String(row[0]), value: Number(row[1]) || 0 })),
        }],
        media: [{
            query: { maxWidth: 500 },
            option: {
                series: [{
                    radius: isDonut ? ["30%", "46%"] : "46%",
                    label: { fontSize: 9, edgeDistance: 4, width: 104, overflow: "break" },
                    labelLine: { length: 7, length2: 10 },
                }],
            },
        }],
    });
}

function renderFrequencyTable(frequencyRows) {
    const rows = (frequencyRows || []).map((row) => ({
        category: String(row.value ?? "—"),
        frequency: Number(row.frequency) || 0,
    }));
    const total = rows.reduce((sum, row) => sum + row.frequency, 0);
    clearElement(elements.cfreqTableBody);
    if (!rows.length) {
        const tr = elements.cfreqTableBody.insertRow();
        const cell = tr.insertCell();
        cell.colSpan = 3;
        cell.textContent = "Sem categorias para exibir.";
    }
    rows.forEach((row) => {
        const tr = elements.cfreqTableBody.insertRow();
        tr.insertCell().textContent = row.category;
        tr.insertCell().textContent = formatInteger(row.frequency);
        const percentage = total ? row.frequency * 100 / total : 0;
        tr.insertCell().textContent = percentage.toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%";
    });
    elements.cfreqTableTotal.textContent = formatInteger(total);
    elements.cfreqTablePercent.textContent = total ? "100%" : "0%";
}

async function loadTablePage(page = 0) {
    if (!state.datasetId) return;
    const requestId = ++state.tableRequestId;
    const datasetId = state.datasetId;
    const sheet = state.sheet;
    const pageSize = Number(elements.tablePageSize.value) || state.tablePageSize;
    const offset = Math.max(0, page) * pageSize;
    elements.tableSummary.textContent = "Carregando os dados da planilha…";
    elements.datasetTable.textContent = "";
    elements.tablePrev.disabled = true;
    elements.tableNext.disabled = true;
    try {
        const query = new URLSearchParams({ sheet: sheet || "", offset: String(offset), limit: String(pageSize) });
        const data = await parseResponse(await fetch(`/api/datasets/${datasetId}/rows?${query}`));
        if (requestId !== state.tableRequestId || datasetId !== state.datasetId || sheet !== state.sheet) return;
        state.tablePage = Math.floor(data.offset / pageSize);
        state.tablePageSize = pageSize;
        state.tableRowCount = data.row_count;
        state.tableColumns = data.columns || [];
        state.tableSheet = data.sheet;
        renderDatasetTable(state.tableColumns, data.records || []);
        const start = data.records.length ? data.offset + 1 : 0;
        const end = data.offset + data.records.length;
        const totalPages = Math.max(1, Math.ceil(data.row_count / pageSize));
        elements.tableSummary.textContent = `Exibindo ${formatInteger(start)}–${formatInteger(end)} de ${formatInteger(data.row_count)} registros`;
        elements.tablePageIndicator.textContent = `Página ${formatInteger(state.tablePage + 1)} de ${formatInteger(totalPages)}`;
        elements.tablePrev.disabled = state.tablePage <= 0;
        elements.tableNext.disabled = state.tablePage + 1 >= totalPages;
    } catch (error) {
        if (requestId !== state.tableRequestId) return;
        elements.tableSummary.textContent = "Não foi possível carregar os dados da planilha.";
        elements.datasetTable.textContent = error.message;
    }
}

function renderDatasetTable(columns, records) {
    clearElement(elements.datasetTable);
    const table = document.createElement("table");
    table.className = "dataset-table";
    table.setAttribute("aria-label", "Dados originais da planilha");
    const head = table.createTHead().insertRow();
    columns.forEach((column) => {
        const cell = document.createElement("th");
        cell.scope = "col";
        cell.textContent = column;
        head.appendChild(cell);
    });
    const body = table.createTBody();
    records.forEach((record) => {
        const row = body.insertRow();
        columns.forEach((_column, index) => {
            const cell = row.insertCell();
            const value = record[index];
            cell.textContent = value === null || value === undefined ? "" : String(value);
            if (value === null || value === undefined) cell.className = "null-value";
        });
    });
    if (!records.length) {
        const row = body.insertRow();
        const cell = row.insertCell();
        cell.colSpan = Math.max(1, columns.length);
        cell.textContent = "Esta aba não possui registros.";
    }
    elements.datasetTable.appendChild(table);
}

const CHART_TEXT = "#475569";
const CHART_SUBTEXT = "#71717a";
const CHART_GRID = "#e4e4e7";
const PIE_SURFACE = "#302d2b";
const PIE_TEXT = "#f8fafc";

function baseChartOption(legendNames, legendPosition = "top", scrollLegend = false) {
    const names = Array.isArray(legendNames) ? legendNames : [];
    return {
        color: chartPalette,
        backgroundColor: "transparent",
        textStyle: { fontFamily: '"Segoe UI", Arial, sans-serif', color: CHART_TEXT },
        animation: true,
        tooltip: chartTooltip("axis"),
        legend: chartLegend(names, legendPosition, scrollLegend),
    };
}

function chartLegend(names, position = "top", scroll = false) {
    const vertical = position === "left" || position === "right";
    const legend = {
        show: names.length > 0,
        data: names,
        type: scroll ? "scroll" : "plain",
        orient: vertical ? "vertical" : "horizontal",
        icon: "circle",
        itemWidth: 10,
        itemHeight: 10,
        itemGap: 14,
        textStyle: { color: CHART_TEXT, fontSize: 11 },
    };
    if (position === "bottom") Object.assign(legend, { bottom: 2, left: "center" });
    else if (position === "left") Object.assign(legend, { left: 0, top: "middle" });
    else if (position === "right") Object.assign(legend, { right: 0, top: "middle" });
    else Object.assign(legend, { top: 2, left: "center" });
    return legend;
}

function chartTooltip(trigger = "axis", pointer = "shadow", formatter) {
    return {
        show: true,
        trigger,
        ...(pointer ? { axisPointer: { type: pointer } } : {}),
        backgroundColor: "#ffffff",
        borderColor: "#e2e8f0",
        borderWidth: 1,
        textStyle: { color: "#18181b", fontSize: 12 },
        extraCssText: "border-radius:8px;box-shadow:0 8px 24px rgba(15,23,42,.16);",
        confine: true,
        ...(formatter ? { formatter } : {}),
    };
}

function chartTooltipLines(title, values, labels) {
    const rows = values.map((value, index) => {
        const label = labels?.[index];
        return '<div style="display:flex;gap:12px;justify-content:space-between"><span>' +
            (label ? escapeHtml(label) + ": " : "") + escapeHtml(value) + "</span></div>";
    }).join("");
    return '<div style="font-weight:700;margin-bottom:5px">' + escapeHtml(title) + "</div>" + rows;
}

function firstChartParam(params) {
    return Array.isArray(params) ? (params[0] || {}) : (params || {});
}

function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
        "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    })[character]);
}

function chartCategoryAxis(labels) {
    return {
        type: "category",
        data: labels,
        axisLine: { lineStyle: { color: CHART_GRID } },
        axisTick: { show: false },
        axisLabel: { color: CHART_TEXT, fontSize: 11, margin: 8 },
        nameTextStyle: { color: CHART_TEXT, fontSize: 11, fontWeight: 600 },
    };
}

function chartValueAxis() {
    return {
        type: "value",
        axisLine: { show: false },
        axisTick: { show: false },
        axisLabel: { color: CHART_TEXT, fontSize: 11 },
        splitLine: { lineStyle: { color: CHART_GRID, type: "dashed" } },
        nameTextStyle: { color: CHART_TEXT, fontSize: 11, fontWeight: 600 },
    };
}

function chartDataZoom(chartId, count, axis, horizontal, labels) {
    const container = document.getElementById(chartId)?.parentElement;
    const extent = horizontal
        ? (container?.clientHeight || 420)
        : (container?.clientWidth || Math.round(window.innerWidth * 0.82));
    const longest = Math.max(1, ...labels.map((label) => String(label).length));
    const itemExtent = horizontal ? 34 : Math.max(56, Math.min(180, longest * 5.72 + 20));
    const reserved = horizontal ? 112 : 64;
    const capacity = Math.max(1, Math.min(6, Math.floor((extent - reserved) / itemExtent)));
    if (count <= capacity) return undefined;

    const zoomStyle = {
        backgroundColor: "#f1f5f9",
        borderColor: "#334155",
        fillerColor: "#64748b",
        handleIcon: "path://M-4,-8L4,-8Q6,-8,6,-6L6,6Q6,8,4,8L-4,8Q-6,8,-6,6L-6,-6Q-6,-8,-4,-8Z",
        handleSize: "115%",
        handleStyle: { color: "#ffffff", borderColor: "#0f172a", borderWidth: 2 },
        moveHandleStyle: { color: "#64748b", opacity: 1 },
        emphasis: { handleStyle: { color: "#ffffff", borderColor: "#0f172a", borderWidth: 2 } },
    };
    const axisIndex = axis === "x" ? { xAxisIndex: [0] } : { yAxisIndex: [0] };
    const slider = {
        type: "slider",
        show: true,
        ...axisIndex,
        start: 0,
        end: 100,
        ...(horizontal ? { width: 18, right: 5, brushSelect: false } : { height: 18, bottom: 5, brushSelect: false }),
        ...zoomStyle,
        textStyle: { color: CHART_SUBTEXT, fontSize: 10 },
        showDetail: false,
        showDataShadow: false,
    };
    const inside = {
        type: "inside",
        ...axisIndex,
        start: 0,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: true,
    };
    return [slider, inside];
}

function makeChart(id, option) {
    chartOptions[id] = option;
    if (charts[id]) {
        charts[id].dispose();
        delete charts[id];
    }
    const element = document.getElementById(id);
    if (element && !element.closest("[hidden]")) renderChart(id);
}

function renderChart(id) {
    const element = document.getElementById(id);
    const option = chartOptions[id];
    if (!element || !option || element.closest("[hidden]") || !window.echarts) return null;
    let chart = charts[id];
    if (!chart) {
        chart = window.echarts.init(element, null, { renderer: "canvas", useDirtyRect: false });
        charts[id] = chart;
    }
    chart.setOption(option, { notMerge: true, lazyUpdate: true });
    chart.resize();
    return chart;
}

function renderBlockspot(heatmap) {
    if (!heatmap?.values?.length || !heatmap.metric_labels?.length) return;
    const metrics = heatmap.metric_labels;
    const groups = heatmap.group_labels || [];
    const bounds = metrics.map((_, index) => {
        const values = heatmap.values.map((row) => row[index]).filter((value) => value !== null && value !== undefined);
        return values.length ? [Math.min(...values), Math.max(...values)] : [0, 0];
    });
    const heatmapPoints = [];
    groups.forEach((label, rowIndex) => metrics.forEach((_, columnIndex) => {
        const value = heatmap.values[rowIndex]?.[columnIndex];
        if (value === null || value === undefined || !Number.isFinite(Number(value))) return;
        const [minimum, maximum] = bounds[columnIndex];
        const intensity = (Number(value) - minimum) / (maximum - minimum || 1) * 100;
        heatmapPoints.push([columnIndex, rowIndex, intensity, Number(value)]);
    }));
    const zoom = [
        ...(chartDataZoom("blkb", metrics.length, "x", false, metrics) || []),
        ...(chartDataZoom("blkb", groups.length, "y", true, groups) || []),
    ];
    makeChart("blkb", {
        ...baseChartOption([]),
        tooltip: chartTooltip("item", null, (point) => {
            const [columnIndex, rowIndex, , value] = point.data || [];
            return chartTooltipLines(groups[rowIndex], [formatNumber(value)], [metrics[columnIndex]]);
        }),
        grid: { left: 64, right: 70, top: 54, bottom: 58, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(metrics),
            axisLabel: { color: CHART_TEXT, fontSize: 11, width: 160, overflow: "truncate", rotate: metrics.length > 5 ? 20 : 0 },
        },
        yAxis: {
            ...chartCategoryAxis(groups),
            inverse: true,
            axisLabel: { color: CHART_TEXT, fontSize: 11, width: 160, overflow: "truncate", margin: 12 },
        },
        visualMap: {
            type: "continuous",
            min: 0,
            max: 100,
            dimension: 2,
            orient: "horizontal",
            left: "center",
            top: 4,
            itemWidth: 130,
            itemHeight: 9,
            calculable: false,
            text: ["Maior", "Menor"],
            textGap: 8,
            textStyle: { color: CHART_SUBTEXT, fontSize: 10 },
            inRange: { color: ["#eff6ff", "#3b82f6"] },
        },
        series: [{
            name: "Média",
            type: "heatmap",
            data: heatmapPoints,
            itemStyle: { borderColor: "#ffffff", borderWidth: 2, borderRadius: 3 },
            label: {
                show: true,
                color: "#1e3a8a",
                fontSize: 11,
                formatter: (point) => formatNumber(point.data[3]),
            },
            emphasis: {
                itemStyle: { shadowBlur: 10, shadowColor: "rgba(15,23,42,.22)" },
                label: { fontWeight: 700 },
            },
        }],
        dataZoom: zoom.length ? zoom : undefined,
    });
}

function renderBoxplot(analysis) {
    const compact = window.matchMedia("(max-width: 640px)").matches;
    const comparison = analysis.charts.group_comparison;
    const series = [["Geral", analysis.charts.box_values || []]];
    if (comparison?.groups?.length) comparison.groups.forEach((group) => series.push([group.label, group.values || []]));
    const summaries = series.map(([label, values]) => ({ label, ...summaryStats(values) })).filter((summary) => summary.n);
    state.boxSummaries = summaries;
    if (!summaries.length) return;

    const names = summaries.map((summary) => String(summary.label));
    const axisContext = document.getElementById("boxAxisContext");
    if (axisContext) {
        axisContext.hidden = !compact;
        axisContext.textContent = compact
            ? `Eixo X: ${comparison?.column || "Grupo"}. Eixo Y: ${analysis.column}.`
            : "";
    }
    const legendNames = ["Distribuição", "Média"];
    const itemAt = (params) => summaries[Number(params.dataIndex)] || summaries[0];
    makeChart("cbox", {
        ...baseChartOption(legendNames),
        tooltip: chartTooltip("item", null, (params) => {
            const summary = itemAt(params);
            return chartTooltipLines(summary.label, [
                "n = " + formatInteger(summary.n),
                "Mínimo = " + formatNumber(summary.min),
                "Q1 = " + formatNumber(summary.q1),
                "Mediana = " + formatNumber(summary.median),
                "Q3 = " + formatNumber(summary.q3),
                "Máximo = " + formatNumber(summary.max),
                "Média = " + formatNumber(summary.mean),
            ]);
        }),
        grid: { left: compact ? 46 : 58, right: 18, top: 42, bottom: compact ? 48 : 52, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(names),
            name: compact ? "Grupo" : comparison?.column || "Grupo",
            nameLocation: "middle",
            nameGap: compact ? 24 : 34,
            axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, interval: 0, rotate: names.length > 8 ? 20 : 0, hideOverlap: true },
        },
        yAxis: {
            ...chartValueAxis(),
            name: compact ? "Valor" : analysis.column,
            nameLocation: "middle",
            nameGap: compact ? 26 : 42,
            axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, formatter: (value) => formatNumber(value) },
        },
        series: [
            {
                name: "Distribuição",
                type: "boxplot",
                data: summaries.map((summary) => [summary.min, summary.q1, summary.median, summary.q3, summary.max]),
                itemStyle: { color: "rgba(59,130,246,0.22)", borderColor: chartPalette[0], borderWidth: 2 },
                emphasis: { itemStyle: { borderColor: "#1d4ed8", borderWidth: 2 } },
            },
            {
                name: "Média",
                type: "scatter",
                data: summaries.map((summary, index) => [index, summary.mean]),
                symbol: "circle",
                symbolSize: 9,
                itemStyle: { color: chartPalette[1], borderColor: "#ffffff", borderWidth: 2 },
                emphasis: { scale: 1.35 },
            },
        ],
        dataZoom: chartDataZoom("cbox", names.length, "x", false, names),
    });
}


function renderKpis(container, stats, grouped) {
    clearElement(container);
    if (!stats) return;
    const mode = grouped ? formatNumber(stats.mode) : (stats.mode_note || (stats.mode?.length ? stats.mode.map(formatNumber).join(" / ") : "—"));
    const rows = grouped
        ? [["Média", stats.mean], ["Mediana", stats.median], ["Moda", stats.mode], ["Q1 (25%)", stats.q1], ["Q2 (50%)", stats.q2], ["Q3 (75%)", stats.q3]]
        : [["Média", stats.mean], ["Mediana", stats.median], ["Moda", mode], ["Q1 (25%)", stats.q1], ["Q2 (50%)", stats.q2], ["Q3 (75%)", stats.q3]];
    rows.forEach(([label, value]) => {
        const card = document.createElement("div"); card.className = "kpi";
        const caption = document.createElement("small"); caption.textContent = label;
        const result = document.createElement("b"); result.textContent = typeof value === "string" ? value : formatNumber(value);
        card.append(caption, result); container.appendChild(card);
    });
}

function renderGroupedTable(rows) {
    clearElement(elements.tgr);
    if (!rows?.length) return;
    const table = document.createElement("table");
    const head = table.createTHead().insertRow();
    ["Classe", "Freq. (fi)", "Acum. (Fi)"].forEach((label) => { const cell = document.createElement("th"); cell.textContent = label; head.appendChild(cell); });
    const body = table.createTBody();
    rows.forEach((row) => {
        const tr = body.insertRow();
        [row.value, row.frequency, row.cumulative_frequency].forEach((value) => { const cell = tr.insertCell(); cell.textContent = String(value ?? "—"); });
    });
    elements.tgr.appendChild(table);
}

function renderDownloads(availability) {
    const analysis = state.analysis;
    const grouped = state.groupedAnalysis;
    const frequencyRows = distributionFrequencyRows(analysis);
    const makeRows = (headers, rows) => [headers, ...rows];
    const specs = [];
    const frequencyLabel = usesGroupedDistribution(analysis) ? "Intervalo de classe" : "Categoria";
    const frequencies = () => makeRows([frequencyLabel, "Frequência"], frequencyRows.map((row) => [row.value, row.frequency]));

    specs.push({ key: "bar", title: "Barras", filename: "barras", rows: frequencies, chartId: "cbar", chartIndex: 0 });
    specs.push({ key: "column", title: "Coluna", filename: "coluna", rows: frequencies, chartId: "ccolumn", chartIndex: 1 });
    specs.push({ key: "pie", title: "Rosca", filename: "rosca", rows: frequencies, chartId: "cpie", chartIndex: 2 });
    specs.push({ key: "pizza", title: "Pizza", filename: "pizza", rows: frequencies, chartId: "cpizza", chartIndex: 3 });
    specs.push({ key: "table", title: "Tabela agrupada", filename: "frequencias", rows: frequencies });
    specs.push({ key: "rawtable", title: "Tabela geral", filename: "dados_da_planilha", fullDataset: true });
    if (availability.dot) specs.push({ key: "dot", title: "Ponto", filename: "ponto", rows: () => {
        const values = scatterChartPayload(analysis);
        return makeRows([values.scatter_x_label, values.scatter_y_label], values.series_x.map((x, index) => [x, values.series_y[index]]));
    }, chartId: "cdot", chartIndex: 6 });
    if (availability.line) specs.push({ key: "line", title: "Linha", filename: "linha", rows: () => {
        const values = analysis.charts;
        return values.date_x?.length
            ? makeRows(["Data", "Respostas"], values.date_x.map((date, index) => [date, values.date_y[index]]))
            : makeRows(["Resposta", analysis.column], values.series_x.map((x, index) => [x, values.series_y[index]]));
    }, chartId: "cline", chartIndex: 7 });
    if (availability.ogv) specs.push({ key: "ogv", title: "Ogiva", filename: "ogiva", rows: () => {
        const rows = grouped.frequency_table;
        return makeRows(["Classe", "Limite superior", "Frequência acumulada"], rows.map((row) => [row.value, row.upper, row.cumulative_frequency]));
    }, chartId: "cogv", chartIndex: 8 });
    if (availability.blk) specs.push({ key: "blk", title: "Blockspot", filename: "blockspot", rows: () => {
        const heatmap = blockspotData();
        return makeRows(["Grupo", ...heatmap.metric_labels], heatmap.group_labels.map((label, index) => [label, ...heatmap.values[index]]));
    }, chartId: "blkb", chartIndex: 9 });
    if (availability.box) specs.push({ key: "box", title: "Caixa (boxplot)", filename: "caixa", rows: () => {
        const summaries = state.boxSummaries || [];
        return makeRows(["Grupo", "n", "Mínimo", "Q1", "Mediana", "Q3", "Máximo", "Média"], summaries.map((item) => [item.label, item.n, item.min, item.q1, item.median, item.q3, item.max, item.mean]));
    }, chartId: "cbox", chartIndex: 10 });
    if (availability.su) specs.push({ key: "su", title: "Medidas sem intervalo de classe", filename: "medidas_sem_classe", rows: () => {
        const stats = analysis.statistics;
        return makeRows(["Medida", "Valor"], [["n", analysis.valid_count], ["Mínimo", stats.minimum], ["Q1", stats.q1], ["Mediana", stats.median], ["Q3", stats.q3], ["Máximo", stats.maximum], ["Média", stats.mean], ["Moda", stats.mode_note || (stats.mode || []).join(" / ")]]);
    } });
    if (availability.sg) specs.push({ key: "sg", title: "Medidas com intervalo de classe", filename: "medidas_com_classe", rows: () => {
        const stats = grouped.grouped_statistics;
        const head = ["Medida", "Valor"];
        const measures = [["Média", stats.mean], ["Mediana", stats.median], ["Moda", stats.mode], ["Q1", stats.q1], ["Q2", stats.q2], ["Q3", stats.q3]];
        return [head, ...measures, ["", ""], ["Classe", "fi"], ...grouped.frequency_table.map((row) => [row.value, row.frequency])];
    } });

    state.downloads = specs;
    elements.dash.querySelectorAll(".chart-download").forEach((menu) => menu.remove());
    specs.forEach((spec) => {
        const head = document.querySelector(`#cd_${spec.key} .chart-head`);
        if (!head) return;
        const menu = document.createElement("details"); menu.className = "chart-download";
        const summary = document.createElement("summary"); summary.textContent = "Baixar";
        summary.setAttribute("aria-label", `Baixar ${spec.title}`);
        const actions = document.createElement("div"); actions.className = "download-options";
        if (spec.chartId) {
            const png = document.createElement("button"); png.type = "button"; png.dataset.png = spec.key; png.textContent = "Imagem PNG";
            actions.appendChild(png);
        }
        if (spec.rows || spec.fullDataset) {
            const csv = document.createElement("button"); csv.type = "button"; csv.dataset.csv = spec.key; csv.textContent = "Dados CSV";
            actions.appendChild(csv);
        }
        menu.append(summary, actions); head.appendChild(menu);
    });
}

function setAvailability(key, available, message) {
    const card = document.getElementById(`cd_${key}`);
    if (["bar", "column", "pie"].includes(key)) return;
    const canvasId = chartItems.find((item) => item[0] === key)?.[2];
    const canvasWrap = canvasId ? document.getElementById(canvasId)?.parentElement : null;
    const note = elements[`na_${key}`];
    if (canvasWrap) canvasWrap.hidden = !available;
    if (note) {
        note.hidden = available;
        note.textContent = available ? "" : message;
    }
    card.dataset.available = String(available);
}

function pickChart(index) {
    const previousChart = state.activeChart;
    let nextChart = Math.max(0, Math.min(index, chartItems.length - 1));
    if (state.chartAvailability?.[chartItems[nextChart]?.[0]] === false) {
        nextChart = chartItems.findIndex(([key]) => state.chartAvailability[key] !== false);
    }
    state.activeChart = Math.max(0, nextChart);
    chartItems.forEach(([key], i) => {
        const card = document.getElementById(`cd_${key}`);
        if (card) card.hidden = i !== state.activeChart;
    });
    elements.pk.querySelectorAll("button[data-i]").forEach((button, i) => {
        const active = i === state.activeChart;
        button.classList.toggle("on", active);
        button.setAttribute("aria-selected", String(active));
    });
    syncTypeControls();
    resizeActiveChart();
    if (state.activeChart === 5 && (previousChart !== 5 || state.tableSheet !== state.sheet)) loadTablePage(0);
}

function resizeActiveChart() {
    requestAnimationFrame(() => {
        const item = chartItems[state.activeChart];
        if (!item) return;
        if (state.analysis && item[0] === "pie") renderPieChart(distributionFrequencyRows(state.analysis), "donut");
        else if (state.analysis && item[0] === "pizza") renderPieChart(distributionFrequencyRows(state.analysis), "pie");
        else if (item[2]) renderChart(item[2]);
    });
}

function handleDownloadClick(event) {
    const csv = event.target.closest("button[data-csv]");
    const png = event.target.closest("button[data-png]");
    if (csv) {
        const spec = state.downloads.find((item) => item.key === csv.dataset.csv);
        if (spec?.fullDataset) downloadFullDatasetCsv(spec).catch((error) => setAnalysisError(error.message));
        else if (spec) downloadCsv(spec);
    } else if (png) {
        const spec = state.downloads.find((item) => item.key === png.dataset.png);
        if (spec) downloadPng(spec);
    }
    if (csv || png) event.target.closest("details")?.removeAttribute("open");
}

function downloadCsv(spec) {
    const rows = spec.rows();
    const csv = rows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    downloadBlob(`${spec.filename}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

async function downloadFullDatasetCsv(spec) {
    const datasetId = state.datasetId;
    const sheet = state.sheet;
    if (!datasetId) return;
    const pageSize = 5000;
    let columns = [];
    let rowCount = 0;
    let offset = 0;
    const rows = [];
    do {
        const query = new URLSearchParams({ sheet: sheet || "", offset: String(offset), limit: String(pageSize) });
        const data = await parseResponse(await fetch(`/api/datasets/${datasetId}/rows?${query}`));
        if (datasetId !== state.datasetId) return;
        columns = data.columns || columns;
        rowCount = data.row_count || 0;
        rows.push(...(data.records || []));
        offset += (data.records || []).length;
        if (!data.records?.length) break;
    } while (offset < rowCount);
    const csvRows = [columns, ...rows];
    const csv = csvRows.map((row) => row.map(csvCell).join(";")).join("\r\n");
    downloadBlob(`${spec.filename}.csv`, `\ufeff${csv}`, "text/csv;charset=utf-8");
}

function downloadPng(spec) {
    const previousTab = state.activeTab;
    const previousChart = state.activeChart;
    selectTab("dash");
    pickChart(spec.chartIndex);
    requestAnimationFrame(() => {
        const chart = renderChart(spec.chartId);
        if (chart) {
            chart.resize();
            const link = document.createElement("a");
            const backgroundColor = ["pie", "pizza"].includes(spec.key) ? PIE_SURFACE : "#ffffff";
            link.href = chart.getDataURL({ type: "png", pixelRatio: 1, backgroundColor });
            link.download = `${spec.filename}.png`;
            link.click();
        }
        selectTab(previousTab);
        pickChart(previousChart);
    });
}

function downloadTemplate() {
    const template = "\ufeffData;Departamento;Nota do atendimento (1 a 5);Tempo de espera;Velocidade da internet (Mbps)\r\n15/10/2026;Comercial;5;Entre 1 a 15 minutos;80\r\n16/10/2026;Financeiro;4;Entre 16 a 30 minutos;120\r\n";
    downloadBlob("modelo_dados.csv", template, "text/csv;charset=utf-8");
}

async function removeDataset() {
    const datasetId = state.datasetId;
    ++state.requestId;
    ++state.tableRequestId;
    if (datasetId) await deleteDatasetOnServer(datasetId);
    state.datasetId = null;
    state.fileName = null;
    state.sheets = [];
    state.sheet = null;
    state.columns = [];
    state.analysis = null;
    state.groupedAnalysis = null;
    state.scatterAnalysis = null;
    state.blockspotAnalysis = null;
    state.downloads = [];
    state.tablePage = 0;
    state.tableRowCount = 0;
    state.tableColumns = [];
    state.tableSheet = null;
    state.typeOverrides = {};
    state.orderOverrides = {};
    Object.values(charts).forEach((chart) => chart.dispose());
    Object.keys(charts).forEach((key) => delete charts[key]);
    Object.keys(chartOptions).forEach((key) => delete chartOptions[key]);
    elements.datasetSettings.hidden = true;
    elements.emptyDash.hidden = false;
    elements.flt.hidden = true;
    elements.gf.disabled = true;
    elements.gf.innerHTML = "";
    elements.file.value = "";
    elements.dash.querySelectorAll(".chart-download").forEach((menu) => menu.remove());
    clearElement(elements.datasetTable);
    elements.tableSummary.textContent = "Carregue uma planilha para consultar os dados.";
    elements.tablePageIndicator.textContent = "Página 1 de 1";
    elements.tablePrev.disabled = true;
    elements.tableNext.disabled = true;
    setUploadStatus("Dados removidos. Nenhum arquivo carregado.");
    clearAnalysisError();
    selectTab("up");
}

async function deleteDatasetOnServer(datasetId) {
    try { await fetch(`/api/datasets/${datasetId}`, { method: "DELETE" }); } catch (_) { /* a tela ainda pode ser limpa */ }
}

async function parseResponse(response) {
    let data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (!response.ok) throw new Error(data.error || "Não foi possível concluir a operação.");
    return data;
}

function setUploadStatus(message, error = false, success = false) {
    elements.ust.textContent = message;
    elements.ust.classList.toggle("err", error);
    elements.ust.classList.toggle("success", success);
}

function setAnalysisError(message) {
    elements.analysisAlert.textContent = message;
    elements.analysisAlert.hidden = false;
    setUploadStatus(message, true);
}

function clearAnalysisError() { elements.analysisAlert.hidden = true; }
function setLoading(active) { elements.loading.hidden = !active; }
function clearElement(element) { while (element.firstChild) element.removeChild(element.firstChild); }

function addOption(select, value, label, selected) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = selected;
    select.appendChild(option);
}

function selectedColumn() { return state.columns.find((column) => column.name === elements.gf.value); }
function parseOrder(value) { return value.split(",").map((item) => item.trim()).filter(Boolean); }
function blockspotData() { return state.analysis?.charts?.group_heatmap || state.blockspotAnalysis?.charts?.group_heatmap || null; }

function topFrequencies(rows, maxCategories = 12) {
    if (rows.length <= maxCategories) return rows;
    const top = rows.slice(0, maxCategories - 1);
    const otherFrequency = rows.slice(maxCategories - 1).reduce((sum, row) => sum + row[1], 0);
    return top.concat([["Outros", otherFrequency]]);
}

function summaryStats(values) {
    const clean = values.map(Number).filter(Number.isFinite);
    if (!clean.length) return { n: 0 };
    const sorted = [...clean].sort((a, b) => a - b);
    const quantile = (p) => {
        const index = (sorted.length - 1) * p;
        const lower = Math.floor(index);
        return sorted[lower] + (sorted[Math.ceil(index)] - sorted[lower]) * (index - lower);
    };
    const counts = new Map();
    clean.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));
    const highest = Math.max(...counts.values());
    const modes = [...counts.entries()].filter(([, count]) => count === highest).map(([value]) => value);
    return {
        n: clean.length, min: sorted[0], max: sorted[sorted.length - 1],
        mean: clean.reduce((sum, value) => sum + value, 0) / clean.length,
        q1: quantile(.25), median: quantile(.5), q3: quantile(.75),
        mode: modes.map(formatNumber).join(" / "),
    };
}

function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function formatInteger(value) { return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 0 }); }
function formatBytes(bytes) {
    if (!bytes) return "0 B";
    const units = ["B", "KB", "MB", "GB"];
    const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
    return `${(bytes / (1024 ** index)).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ${units[index]}`;
}
function shorten(value, length = 30) { const text = String(value); return text.length > length ? `${text.slice(0, length - 1)}…` : text; }
function csvCell(value) {
    let text = String(value ?? "");
    if (typeof value === "string" && /^[\s]*[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replaceAll('"', '""')}"`;
}
function downloadBlob(name, text, type) {
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([text], { type }));
    link.download = name;
    link.click();
    setTimeout(() => URL.revokeObjectURL(link.href), 1000);
}
