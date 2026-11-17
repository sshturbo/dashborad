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
    downloads: [],
    activeChart: 0,
    chartAvailability: null,
    responsiveMobile: null,
    activeTab: "landing",
    requestId: 0,
    tableRequestId: 0,
    tablePage: 0,
    tablePageSize: 100,
    tableRowCount: 0,
    tableColumns: [],
    tableSheet: null,
    typeOverrides: {},
    orderOverrides: {},
    ordinalDraft: [],
    ordinalDraftSource: null,
    ordinalEditing: null,
    ordinalPage: 0,
};

const elements = {};
const charts = {};
const chartOptions = {};
const chartItems = [
    ["bar", "Barra", "cbar"], ["column", "Coluna", "ccolumn"], ["pie", "Rosca", "cpie"], ["pizza", "Pizza", "cpizza"],
    ["table", "Tabela agrupada", null], ["rawtable", "Tabela geral", null],
    ["dot", "Ponto", "cdot"], ["line", "Linha", "cline"], ["ogv", "Ogiva", "cogv"],
    ["box", "Boxplot", "cbox"], ["su", "Medidas sem classe", null], ["sg", "Medidas com classe", null],
];
const chartPalette = ["#7751bd", "#b33180", "#ffb21a", "#8c68d1", "#d94d9b", "#5c91e5", "#38b9cf", "#f1844c", "#54bd9b", "#df6f62"];
const boxColor = "#5b9bd5";
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
        "flt", "gf", "pk", "dash", "up", "landing", "startAnalysis", "homeLink", "workspaceHeading", "emptyDash", "analysisAlert",
        "dashboardLayout", "pageTitle", "pageSubtitle", "contextFile",
        "file", "drop", "ust", "datasetSettings", "fileName", "fileMeta", "sheetSelect", "sheetField", "typeSelect",
        "ordinalField", "ordinalSummary", "ordinalOrderHint", "editOrdinalOrder",
        "ordinalDialog", "ordinalDialogVariable", "ordinalDialogStatus", "ordinalList", "ordinalReset", "ordinalReverse",
        "ordinalApply", "ordinalCancel", "ordinalClose", "ordinalAnnounce", "ordinalPagination", "ordinalPrevious", "ordinalNext", "ordinalPageLabel",
        "secondaryField", "secondaryColumn", "groupedToggle",
        "binsField", "binsInput", "inferenceHint", "rangeNotice", "rowCount", "columnCount", "tpl", "rst", "loading",
        "kun", "kgr", "tgr", "cfreqTableBody", "cfreqTableTotal", "cfreqTablePercent",
        "groupedVariable", "groupedMethod", "groupedMeasuresNote", "individualMeasuresNote",
        "validCount", "missingCount", "distinctCount", "distinctLabel",
        "datasetTable", "tableSummary", "tablePageSize", "tablePrev", "tableNext", "tablePageIndicator",
        "na_dot", "na_line", "na_ogv", "na_box", "na_su", "na_sg",
    ].forEach((id) => { elements[id] = document.getElementById(id); });

    bindEvents();
    observeChartSizes();
    selectTab("landing");
    pickChart(0);
}

function bindEvents() {
    elements.startAnalysis.addEventListener("click", () => selectTab(state.datasetId ? "dash" : "up"));
    elements.homeLink.addEventListener("click", () => selectTab("landing"));
    elements.file.addEventListener("change", (event) => uploadFile(event.target.files[0]));
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
            const type = populateVariableTypeOptions(column, elements.typeSelect.value);
            state.typeOverrides[column.name] = type;
            updateInferenceHint(column, type);
        }
        syncTypeControls();
        runAnalysis();
    });
    elements.editOrdinalOrder.addEventListener("click", openOrdinalOrganizer);
    [elements.ordinalCancel, elements.ordinalClose].forEach((button) => button.addEventListener("click", () => elements.ordinalDialog.close()));
    elements.ordinalDialog.addEventListener("close", () => {
        document.body.classList.remove("ordinal-dialog-open");
        state.ordinalDraft = [];
        state.ordinalEditing = null;
    });
    elements.ordinalList.addEventListener("click", (event) => {
        const button = event.target.closest("button[data-move]");
        if (button) moveOrdinalCategory(Number(button.dataset.index), Number(button.dataset.move));
    });
    elements.ordinalReverse.addEventListener("click", () => {
        state.ordinalDraft.reverse(); state.ordinalDraftSource = "custom"; state.ordinalPage = 0;
        elements.ordinalList.scrollTop = 0;
        renderOrdinalList(); elements.ordinalAnnounce.textContent = "Ordem das categorias invertida.";
    });
    elements.ordinalReset.addEventListener("click", () => {
        const column = selectedColumn();
        state.ordinalDraft = [...(column.ordinal_default_order || column.inferred_order || ordinalOrderForColumn(column))];
        state.ordinalDraftSource = column.ordinal_default_source || (column.inferred_order?.length ? "recognized" : "appearance");
        state.ordinalPage = 0; elements.ordinalList.scrollTop = 0; renderOrdinalList();
        elements.ordinalAnnounce.textContent = "Ordem inicial restaurada.";
    });
    elements.ordinalPrevious.addEventListener("click", () => { state.ordinalPage--; elements.ordinalList.scrollTop = 0; renderOrdinalList(); });
    elements.ordinalNext.addEventListener("click", () => { state.ordinalPage++; elements.ordinalList.scrollTop = 0; renderOrdinalList(); });
    elements.ordinalApply.addEventListener("click", applyOrdinalOrder);
    elements.secondaryColumn.addEventListener("change", runAnalysis);
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
    document.addEventListener("click", (event) => {
        elements.dash.querySelectorAll(".chart-download[open]").forEach((menu) => {
            if (!menu.contains(event.target)) menu.open = false;
        });
    });
    document.addEventListener("keydown", (event) => {
        if (event.key !== "Escape") return;
        elements.dash.querySelectorAll(".chart-download[open]").forEach((menu) => {
            menu.open = false;
            if (menu.contains(document.activeElement)) menu.querySelector("summary")?.focus();
        });
    });
}

function selectTab(tab) {
    if (!["landing", "dash", "up"].includes(tab)) return;
    if (tab === "up" && state.datasetId) tab = "dash";
    if (tab === "dash" && !state.datasetId) tab = "up";
    state.activeTab = tab;
    ["landing", "dash", "up"].forEach((id) => { elements[id].hidden = id !== tab; });
    elements.workspaceHeading.hidden = tab === "landing";
    document.body.dataset.view = tab;
    elements.flt.hidden = !(tab === "dash" && state.columns.length);
    elements.dashboardLayout.hidden = tab !== "dash";
    syncPageContext();
    if (tab === "dash") resizeActiveChart();
}

function syncPageContext() {
    const pages = {
        landing: ["pesquisa analytics", ""],
        dash: ["pesquisa analytics", "Explore as respostas e escolha a visualização para sua análise."],
        up: ["carregar dados", "Importe sua base para começar a análise."],
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
        state.typeOverrides = {};
        state.orderOverrides = {};
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
    else populateVariableTypeOptions(null);
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
    if (quantitative.length) appendOptionGroup(elements.gf, "Numéricas (contagens, medidas e faixas)", quantitative);
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
    const requestedType = state.typeOverrides[column.name] || column.inferred_type;
    const type = populateVariableTypeOptions(column, requestedType);
    if (type !== requestedType) delete state.typeOverrides[column.name];
    renderOrdinalSummary();
    updateInferenceHint(column, type);
    populateComparisonColumns(column);
    syncTypeControls();
}

function allowedTypesForColumn(column) {
    if (!column) return [];
    const family = column.inferred_type.startsWith("quantitative_") ? "quantitative_" : "qualitative_";
    const types = column.allowed_types || Object.keys(variableTypeLabels);
    return types.filter((type) => type.startsWith(family) && variableTypeLabels[type]);
}

function ordinalOrderForColumn(column = selectedColumn()) {
    return column ? (state.orderOverrides[column.name] || column.ordinal_order || column.inferred_order || []) : [];
}

function renderOrdinalSummary() {
    const column = selectedColumn();
    const order = ordinalOrderForColumn(column);
    elements.editOrdinalOrder.disabled = !order.length;
    const preview = order.slice(0, 3).join(" → ") + (order.length > 3 ? ` · +${order.length - 3}` : "");
    elements.ordinalSummary.textContent = preview || "Carregando categorias…";
    elements.ordinalSummary.title = order.length <= 20 ? order.join(" → ") : preview;
    const source = column && state.orderOverrides[column.name] ? "custom" : column?.ordinal_order_source || (column?.inferred_order?.length ? "recognized" : "appearance");
    elements.ordinalOrderHint.textContent = !order.length ? "As categorias serão carregadas automaticamente." : source === "recognized"
        ? "Escala reconhecida automaticamente, do menor para o maior nível."
        : source === "custom" ? "Ordem personalizada, do menor para o maior nível."
            : "Ordem inicial da planilha. Revise a sequência dos níveis em Organizar.";
}

function cacheOrdinalOrder(analysis) {
    if (analysis.variable_type !== "qualitative_ordinal" || !analysis.ordinal_order?.length) return;
    const column = selectedColumn();
    if (!column || column.name !== analysis.column) return;
    column.ordinal_order = [...analysis.ordinal_order];
    column.ordinal_order_source = analysis.ordinal_order_source;
    if (analysis.ordinal_order_source !== "custom") {
        column.ordinal_default_order = [...analysis.ordinal_order];
        column.ordinal_default_source = analysis.ordinal_order_source;
    }
    if (state.orderOverrides[column.name]) state.orderOverrides[column.name] = [...analysis.ordinal_order];
    renderOrdinalSummary();
}

function openOrdinalOrganizer() {
    const column = selectedColumn(), order = ordinalOrderForColumn(column);
    if (!column || !order.length || elements.typeSelect.value !== "qualitative_ordinal") return;
    state.ordinalDraft = [...order];
    state.ordinalDraftSource = state.orderOverrides[column.name] ? "custom" : column.ordinal_order_source || "recognized";
    state.ordinalEditing = { column: column.name, dataset: state.datasetId, sheet: state.sheet };
    state.ordinalPage = 0;
    elements.ordinalList.scrollTop = 0;
    elements.ordinalDialogVariable.textContent = column.name;
    elements.ordinalReset.textContent = (column.ordinal_default_source === "recognized" || column.inferred_order?.length) ? "Usar sugestão" : "Ordem da planilha";
    elements.ordinalAnnounce.textContent = "";
    renderOrdinalList();
    document.body.classList.add("ordinal-dialog-open");
    elements.ordinalDialog.showModal();
}

function renderOrdinalList() {
    const pageSize = 50, count = state.ordinalDraft.length;
    state.ordinalPage = Math.max(0, Math.min(state.ordinalPage, Math.ceil(count / pageSize) - 1));
    const start = state.ordinalPage * pageSize, end = Math.min(count, start + pageSize);
    const scrollTop = elements.ordinalList.scrollTop;
    clearElement(elements.ordinalList);
    elements.ordinalList.start = start + 1;
    state.ordinalDraft.slice(start, end).forEach((category, offset) => {
        const index = start + offset;
        const item = document.createElement("li"); item.dataset.index = String(index); item.tabIndex = -1;
        const position = document.createElement("span"); position.className = "ordinal-position"; position.textContent = String(index + 1); position.setAttribute("aria-hidden", "true");
        const name = document.createElement("span"); name.className = "ordinal-category"; name.textContent = category;
        const controls = document.createElement("div"); controls.className = "ordinal-move-controls";
        for (const [direction, symbol, label] of [[-1, "↑", "Subir"], [1, "↓", "Descer"]]) {
            const button = document.createElement("button"); button.type = "button"; button.textContent = symbol;
            button.dataset.move = String(direction); button.dataset.index = String(index);
            button.disabled = index + direction < 0 || index + direction >= count;
            button.setAttribute("aria-label", `${label} ${category}`); controls.appendChild(button);
        }
        item.append(position, name, controls); elements.ordinalList.appendChild(item);
    });
    elements.ordinalList.scrollTop = scrollTop;
    elements.ordinalPagination.hidden = count <= pageSize;
    elements.ordinalPageLabel.textContent = `${start + 1}–${end} de ${formatInteger(count)}`;
    elements.ordinalPrevious.disabled = state.ordinalPage === 0;
    elements.ordinalNext.disabled = end === count;
    elements.ordinalApply.disabled = !count;
    elements.ordinalReverse.disabled = count < 2;
    elements.ordinalDialogStatus.textContent = state.ordinalDraftSource === "recognized" ? "A escala foi reconhecida pelos nomes das categorias."
        : state.ordinalDraftSource === "custom" ? "Sua sequência será usada nos gráficos e nas frequências acumuladas."
            : "Não há uma escala reconhecida para estes nomes. A lista começa na ordem da planilha; ajuste a sequência dos níveis.";
}

function moveOrdinalCategory(index, direction) {
    const target = index + direction;
    if (index < 0 || target < 0 || index >= state.ordinalDraft.length || target >= state.ordinalDraft.length) return;
    const category = state.ordinalDraft[index];
    [state.ordinalDraft[index], state.ordinalDraft[target]] = [state.ordinalDraft[target], state.ordinalDraft[index]];
    state.ordinalDraftSource = "custom"; state.ordinalPage = Math.floor(target / 50);
    renderOrdinalList();
    const item = elements.ordinalList.querySelector(`li[data-index="${target}"]`);
    const button = item.querySelector(`button[data-move="${direction}"]:not(:disabled)`) || item.querySelector("button:not(:disabled)");
    (button || item).focus(); item.scrollIntoView({ block: "nearest" });
    elements.ordinalAnnounce.textContent = `${category}: posição ${target + 1} de ${state.ordinalDraft.length}.`;
}

function applyOrdinalOrder() {
    const editing = state.ordinalEditing, column = selectedColumn();
    if (!editing || !column || editing.column !== column.name || editing.dataset !== state.datasetId || editing.sheet !== state.sheet) {
        elements.ordinalDialog.close(); return;
    }
    if (state.ordinalDraftSource === "custom") state.orderOverrides[column.name] = [...state.ordinalDraft];
    else delete state.orderOverrides[column.name];
    elements.ordinalDialog.close(); renderOrdinalSummary(); runAnalysis();
}

function populateVariableTypeOptions(column, requestedType) {
    const allowed = allowedTypesForColumn(column);
    clearElement(elements.typeSelect);
    elements.typeSelect.disabled = !allowed.length;
    if (!allowed.length) {
        addOption(elements.typeSelect, "", "Selecione uma variável", true);
        return "";
    }
    const type = allowed.includes(requestedType) ? requestedType : column.inferred_type;
    allowed.forEach((value) => addOption(elements.typeSelect, value, variableTypeLabels[value], value === type));
    elements.typeSelect.value = type;
    return type;
}

function updateInferenceHint(column, appliedType) {
    const suggestedLabel = column.type_label || variableTypeLabels[column.inferred_type] || "Não identificado";
    const appliedLabel = variableTypeLabels[appliedType] || suggestedLabel;
    const responseDescription = responseTypeDescriptions[column.inferred_type] || "resposta ainda não classificada";
    const manualAdjustment = appliedType !== column.inferred_type ? " (ajustada manualmente)" : "";
    const allowedLabels = allowedTypesForColumn(column).map((type) => variableTypeLabels[type].toLowerCase()).join(" ou ");

    elements.inferenceHint.textContent = `Pergunta selecionada: “${column.name}”. Respostas identificadas como ${responseDescription}. Sugestão: ${suggestedLabel}; classificação usada: ${appliedLabel}${manualAdjustment}. Opções compatíveis com os dados desta coluna: ${allowedLabels}.`;
    elements.rangeNotice.hidden = !column.has_reported_intervals;
    elements.rangeNotice.textContent = column.has_reported_intervals
        ? "Os gráficos e tabelas preservam as faixas originais da pesquisa. " + (column.has_open_intervals
            ? "Há faixa aberta, como ‘mais de’: a média não é calculada sem conhecer o limite que falta."
            : "As medidas por classe são estimativas; não há valores individuais observados.")
        : "";
    if (column.has_reported_intervals) elements.inferenceHint.textContent += " " + elements.rangeNotice.textContent;
}

function populateComparisonColumns(column) {
    const numeric = state.columns.filter((item) => item.inferred_type.startsWith("quantitative_") && !item.has_reported_intervals);

    clearElement(elements.secondaryColumn);
    addOption(elements.secondaryColumn, "", "Valores individuais por resposta", true);
    numeric.filter((item) => item.name !== column.name).forEach((item) => addOption(elements.secondaryColumn, item.name, item.name, false));
    elements.secondaryColumn.value = "";
}

function syncTypeControls() {
    const type = elements.typeSelect.value;
    const quantitative = type.startsWith("quantitative_");
    const reportedIntervals = Boolean(selectedColumn()?.has_reported_intervals);
    const activeChart = chartItems[state.activeChart]?.[0];
    const boxIndex = chartItems.findIndex(([key]) => key === "box");
    const boxButton = elements.pk.querySelector(`button[data-i="${boxIndex}"]`);
    if (boxButton) boxButton.hidden = !quantitative || reportedIntervals;
    elements.ordinalField.hidden = type !== "qualitative_ordinal";
    if (type === "qualitative_ordinal") renderOrdinalSummary();
    elements.secondaryField.hidden = activeChart !== "dot" || !quantitative || reportedIntervals;
    const classControls = elements.groupedToggle.closest(".advanced-settings");
    if (classControls) classControls.hidden = !quantitative || reportedIntervals || ["box", "dot"].includes(activeChart);
    const secondaryLabel = elements.secondaryField.querySelector(".lb");
    if (secondaryLabel) secondaryLabel.textContent = "Comparar com outra variável (opcional)";
    if ((!quantitative || reportedIntervals) && state.activeChart === boxIndex) {
        pickChart(0);
        return;
    }
    elements.groupedToggle.disabled = !quantitative || reportedIntervals;
    if (!quantitative || reportedIntervals) elements.groupedToggle.checked = false;
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
    const secondaryColumn = quantitative && !column.has_reported_intervals ? (elements.secondaryColumn.value || null) : null;
    const common = {
        dataset_id: state.datasetId,
        sheet: state.sheet,
        column: column.name,
        variable_type: type,
        ordinal_order: type === "qualitative_ordinal" ? (state.orderOverrides[column.name] || null) : null,
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
        const [analysis, groupedAnalysis, scatterAnalysis] = await Promise.all(requests);
        if (request !== state.requestId) return;
        state.analysis = analysis;
        state.groupedAnalysis = groupedAnalysis;
        state.scatterAnalysis = scatterAnalysis;
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
    cacheOrdinalOrder(analysis);
    syncDistributionTitles(analysis);
    syncChartContext(analysis);
    renderCharts(analysis);
    syncVariableSummary(analysis);
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
        line: analysis.has_reported_intervals || hasDate || (quantitative && Boolean(chartData.series_y?.length)),
        ogv: quantitative && Boolean(state.groupedAnalysis?.has_reported_intervals || state.groupedAnalysis?.charts?.cumulative_x?.length),
        box: quantitative && Boolean(chartData.box_values?.length),
        su: quantitative && Boolean(analysis.statistics),
        sg: quantitative && Boolean(state.groupedAnalysis?.grouped_statistics),
    };
    const messages = {
        dot: analysis.has_reported_intervals ? "As respostas já são faixas; não há valores individuais para o gráfico de pontos." : "Não há valores numéricos suficientes para montar o gráfico de pontos.",
        line: "Sem coluna de data no arquivo. Escolha uma variável numérica para ver os valores por ordem de resposta.",
        ogv: "Escolha uma variável numérica com frequências acumuladas por valor ou faixa.",
        box: analysis.has_reported_intervals ? "As respostas já são faixas; não há valores individuais para o boxplot." : "O boxplot exige dados numéricos. Selecione uma variável numérica.",
        su: analysis.statistics_note || "Escolha uma variável numérica para ver estas medidas.",
        sg: "Escolha uma variável numérica para ver as medidas com intervalo de classe.",
    };
    ["dot", "line", "ogv", "box", "su", "sg"].forEach((key) => setAvailability(key, availability[key], messages[key]));
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
    const reported = state.groupedAnalysis?.column === analysis.column && state.groupedAnalysis?.grouping?.source === "reported_intervals";
    return reported || analysis.variable_type === "quantitative_continuous" ||
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

function syncVariableSummary(analysis = state.analysis) {
    if (!analysis) return;
    const individual = ["dot", "box"].includes(chartItems[state.activeChart]?.[0]);
    const rows = individual ? (analysis.frequency_table || []) : distributionFrequencyRows(analysis);
    elements.validCount.textContent = formatInteger(analysis.valid_count || 0);
    elements.missingCount.textContent = formatInteger(analysis.missing_count || 0);
    elements.distinctCount.textContent = formatInteger(rows.length);
    elements.distinctLabel.textContent = individual ? "Valores distintos" : usesGroupedDistribution(analysis) ? "Faixas" : "Categorias";
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
        cd_line: analysis.has_reported_intervals ? "Linha — frequência por faixa" : "Linha — evolução das respostas",
        cd_ogv: analysis.has_reported_intervals ? "Ogiva — frequência acumulada por faixa" : "Ogiva — frequência acumulada",
    };
    Object.entries(titles).forEach(([cardId, title]) => {
        const heading = document.querySelector(`#${cardId} .chart-head h2`);
        if (heading) heading.textContent = title;
    });
    document.querySelector("#cd_line .chart-head p").textContent = analysis.has_reported_intervals
        ? "Compare as frequências nas faixas originais da pesquisa, em ordem."
        : "Acompanhe a tendência no período ou na ordem de resposta.";
    document.querySelector("#cd_ogv .chart-head p").textContent = analysis.has_reported_intervals
        ? "Veja as respostas acumuladas até cada faixa original da pesquisa."
        : "Veja o crescimento acumulado ao longo dos limites de classe.";
    const tableHeading = document.querySelector("#cd_table thead th");
    if (tableHeading) tableHeading.textContent = grouped ? "Intervalo de classe" : "Categoria";
    document.querySelector("#cd_table table")?.setAttribute(
        "aria-label",
        grouped ? "Frequência e participação por intervalo de classe" : "Frequência e participação por categoria",
    );
}

function syncChartContext(analysis) {
    elements.dash.querySelectorAll(".chart-card .cv").forEach((surface) => {
        let label = surface.querySelector(".chart-variable-label");
        if (!label) {
            label = document.createElement("p");
            label.className = "chart-variable-label";
            surface.prepend(label);
        }
        const key = surface.closest(".chart-card").id.replace(/^cd_/, "");
        label.textContent = chartContextLabel(key, analysis);
    });
}

function chartContextLabel(key, analysis) {
    if (key === "dot") {
        const scatter = scatterChartPayload(analysis);
        if (scatter && !elements.secondaryColumn.value) return analysis.column;
        if (scatter?.scatter_x_label && scatter?.scatter_y_label) return `${scatter.scatter_y_label} por ${scatter.scatter_x_label}`;
    }
    if (key === "box") {
        return analysis.variable_type.startsWith("quantitative_") ? analysis.column : "Boxplot";
    }
    return analysis.column;
}


function renderCharts(analysis) {
    const compactRanges = analysis.has_reported_intervals && window.matchMedia("(max-width: 640px)").matches;
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
        const paired = Boolean(elements.secondaryColumn.value);
        const xLabel = paired ? scatter.scatter_x_label : "Ordem da resposta";
        const points = scatter.series_x.map((x, index) => [Number(x), Number(scatter.series_y[index])]);
        const name = scatter.scatter_y_label + " por " + (paired ? scatter.scatter_x_label : "resposta");
        const heading = document.querySelector("#cd_dot .chart-head h2");
        if (heading) heading.textContent = paired ? "Pontos — relação entre variáveis" : "Pontos — valores individuais";
        const axisContext = document.getElementById("dotAxisContext");
        if (axisContext) axisContext.textContent = `Eixo X: ${xLabel}. Eixo Y: ${scatter.scatter_y_label}. Cada ponto representa uma resposta individual.`;
        makeChart("cdot", {
            ...baseChartOption([compact ? (paired ? "Relação entre variáveis" : "Respostas individuais") : name]),
            tooltip: chartTooltip("item", null, (point) => chartTooltipLines(name, [
                xLabel + ": " + formatNumber(point.value[0]),
                String(scatter.scatter_y_label) + ": " + formatNumber(point.value[1]),
            ])),
            grid: { left: compact ? 42 : 56, right: 18, top: 42, bottom: compact ? 54 : 54, containLabel: true },
            xAxis: {
                ...chartValueAxis(),
                name: compact && paired ? "Eixo X" : xLabel,
                nameLocation: "middle",
                nameGap: compact ? 24 : 34,
                minInterval: paired ? undefined : 1,
                min: paired ? undefined : 1,
                max: paired ? undefined : Math.max(2, points.length),
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
    const rangeLine = analysis.has_reported_intervals;
    const lineLabels = rangeLine ? frequency.map((row) => row.value) : dateLabels.length
        ? dateLabels.map((date) => String(date).slice(8, 10) + "/" + String(date).slice(5, 7) + "/" + String(date).slice(2, 4))
        : analysis.charts.series_x.map(String);
    const lineValues = rangeLine ? frequency.map((row) => row.frequency) : dateLabels.length ? analysis.charts.date_y : analysis.charts.series_y;
    const lineXTitle = rangeLine ? "Faixas informadas" : dateLabels.length ? "Data da resposta" : "Ordem da resposta";
    const lineYTitle = rangeLine ? "Frequência (respostas)" : dateLabels.length ? "Número de respostas por dia" : analysis.column;
    const lineName = rangeLine ? "Respostas por faixa" : dateLabels.length ? "Respostas por dia" : analysis.column;
    makeChart("cline", {
        ...baseChartOption([lineName]),
        tooltip: chartTooltip("axis", "line", (params) => {
            const point = firstChartParam(params);
            return chartTooltipLines(point.axisValueLabel || point.name, [formatNumber(point.value)], [point.seriesName || lineName]);
        }),
        grid: { left: 52, right: 22, top: 40, bottom: compactRanges ? 86 : 56, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(lineLabels),
            boundaryGap: rangeLine,
            name: lineXTitle,
            nameLocation: "middle",
            nameGap: compactRanges ? 72 : 38,
            axisLabel: { color: CHART_TEXT, fontSize: 11, rotate: lineLabels.length > 8 ? 25 : 0, hideOverlap: true, ...(rangeLine ? reportedRangeAxisLabels(lineLabels) : {}) },
        },
        yAxis: {
            ...chartValueAxis(),
            name: lineYTitle,
            nameLocation: "middle",
            nameGap: 44,
            min: rangeLine || dateLabels.length ? 0 : undefined,
            axisLabel: { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatNumber(value) },
        },
        series: [{
            name: lineName,
            type: "line",
            smooth: !rangeLine,
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
        const reported = state.groupedAnalysis.has_reported_intervals;
        const rangeLabels = state.groupedAnalysis.frequency_table.map((row) => row.value);
        const ogivePoints = reported
            ? state.groupedAnalysis.frequency_table.map((row) => [row.value, row.cumulative_frequency])
            : groupedCharts.cumulative_x.map((x, index) => [Number(x), Number(groupedCharts.cumulative_y[index])]);
        const ogiveName = reported ? "Frequência acumulada por faixa" : "Frequência acumulada";
        makeChart("cogv", {
            ...baseChartOption([ogiveName]),
            tooltip: chartTooltip("axis", "line", (params) => {
                const point = firstChartParam(params);
                return chartTooltipLines(ogiveName, [
                    reported ? "Faixa: " + point.value[0] : "Limite da classe: " + formatNumber(point.value[0]),
                    "Acumulada: " + formatInteger(point.value[1]) + " respostas",
                ]);
            }),
            grid: { left: 60, right: 24, top: 40, bottom: compactRanges ? 86 : 58, containLabel: true },
            xAxis: {
                ...(reported ? chartCategoryAxis(rangeLabels) : chartValueAxis()),
                name: reported ? "Faixas informadas" : "Limite da classe — " + analysis.column,
                nameLocation: "middle",
                nameGap: compactRanges ? 72 : 38,
                axisLabel: reported ? { color: CHART_TEXT, fontSize: 11, ...reportedRangeAxisLabels(rangeLabels) } : { color: CHART_TEXT, fontSize: 11, formatter: (value) => formatNumber(value) },
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
            dataZoom: chartDataZoom("cogv", ogivePoints.length, "x", false, reported ? rangeLabels : []),
        });
    }

    if (quantitative && analysis.charts.box_values?.length) renderBoxplot(analysis);
    renderKpis(elements.kun, analysis.statistics, false);
    if (state.groupedAnalysis) {
        renderKpis(elements.kgr, state.groupedAnalysis.grouped_statistics, true);
        renderGroupedTable(state.groupedAnalysis);
    }
    elements.individualMeasuresNote.textContent = analysis.statistics_note || "Medidas calculadas sobre os valores individuais.";
}

function renderColumnChart(rows, distributionLabel) {
    rows = rows || [];
    const labels = rows.map((row) => String(row.value));
    const values = rows.map((row) => Number(row.frequency) || 0);
    const seriesName = "Respostas";
    const compactRanges = state.analysis?.has_reported_intervals && window.matchMedia("(max-width: 640px)").matches;
    const dataZoom = chartDataZoom("ccolumn", labels.length, "x", false, labels);
    makeChart("ccolumn", {
        ...baseChartOption([]),
        tooltip: chartTooltip("axis", "shadow", (params) => {
            const point = firstChartParam(params);
            return chartTooltipLines(point.axisValueLabel || point.name, [formatInteger(point.value)], [seriesName]);
        }),
        grid: { left: 64, right: 24, top: 40, bottom: compactRanges ? 86 : 64, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(labels),
            name: distributionLabel,
            nameLocation: "middle",
            nameGap: compactRanges ? 72 : 42,
            axisLabel: {
                color: CHART_TEXT,
                fontSize: 11,
                interval: 0,
                rotate: labels.length > 6 ? 25 : 0,
                hideOverlap: true,
                ...(state.analysis?.has_reported_intervals ? reportedRangeAxisLabels(labels) : {}),
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

const CHART_TEXT = "#dce8fa";
const CHART_SUBTEXT = "#9eafd0";
const CHART_GRID = "rgba(192,211,242,.2)";
const PIE_SURFACE = "#0a2149";
const PIE_TEXT = "#f4f7ff";

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
        backgroundColor: "#102b55",
        borderColor: "#5375a7",
        borderWidth: 1,
        textStyle: { color: "#f4f7ff", fontSize: 12 },
        extraCssText: "border-radius:8px;box-shadow:0 8px 24px rgba(0,8,26,.45);",
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

function reportedRangeAxisLabels(labels) {
    const width = elements.dash.clientWidth || window.innerWidth;
    return {
        interval: 0,
        rotate: 0,
        hideOverlap: false,
        width: Math.max(36, Math.min(180, (width - 100) / Math.max(1, labels.length) - 8)),
        overflow: "break",
        lineHeight: 14,
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
    const capacity = Math.max(1, Math.floor((extent - reserved) / itemExtent));
    if (count <= capacity) return undefined;
    const axisIndex = axis === "x" ? { xAxisIndex: [0] } : { yAxisIndex: [0] };
    const inside = {
        type: "inside",
        ...axisIndex,
        start: 0,
        end: 100,
        zoomOnMouseWheel: false,
        moveOnMouseWheel: false,
    };
    return [inside];
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

function renderBoxplot(analysis) {
    const compact = window.matchMedia("(max-width: 640px)").matches;
    const summary = summaryStats(analysis.charts.box_values || []);
    if (!summary.n) return;
    summary.label = analysis.column || "Distribuição geral";
    state.boxSummaries = [summary];
    const names = ["Distribuição geral"];
    const labelLevels = new Map();
    const addLevel = (value, label) => {
        const key = String(value);
        const item = labelLevels.get(key) || { value, labels: [] };
        item.labels.push(label);
        labelLevels.set(key, item);
    };
    addLevel(summary.min, "Mínimo");
    if (summary.whiskerMin !== summary.min) addLevel(summary.whiskerMin, "Bigode inf.");
    addLevel(summary.q1, "Q1");
    addLevel(summary.median, "Mediana");
    addLevel(summary.q3, "Q3");
    if (summary.whiskerMax !== summary.max) addLevel(summary.whiskerMax, "Bigode sup.");
    addLevel(summary.max, "Máximo");
    const levelLabels = [...labelLevels.values()]
        .map((item) => {
            const lines = [];
            for (const label of item.labels) {
                const last = lines.length - 1;
                if (last >= 0 && `${lines[last]} · ${label}`.length <= (compact ? 20 : 32)) lines[last] += ` · ${label}`;
                else lines.push(label);
            }
            lines[lines.length - 1] += ` = ${formatNumber(item.value)}`;
            return { ...item, text: lines.join("\n"), height: lines.length * (compact ? 13 : 15) };
        })
        .sort((a, b) => a.value - b.value);
    makeChart("cbox", {
        ...baseChartOption([]),
        tooltip: chartTooltip("item", null, (params) => {
            const point = firstChartParam(params);
            if (point.seriesName === "Valores atípicos") {
                const value = Array.isArray(point.data) ? point.data[1] : point.value;
                return chartTooltipLines(analysis.column, ["Valor atípico = " + formatNumber(value)]);
            }
            return chartTooltipLines(summary.label, [
                "n = " + formatInteger(summary.n),
                "Mínimo amostral = " + formatNumber(summary.min),
                "Cerca inferior = " + formatNumber(summary.lowerFence),
                "Bigode inferior = " + formatNumber(summary.whiskerMin),
                "Q1 = " + formatNumber(summary.q1),
                "Mediana = " + formatNumber(summary.median),
                "Q3 = " + formatNumber(summary.q3),
                "Bigode superior = " + formatNumber(summary.whiskerMax),
                "Cerca superior = " + formatNumber(summary.upperFence),
                "Máximo amostral = " + formatNumber(summary.max),
                "IQR = " + formatNumber(summary.iqr),
                "Valores atípicos = " + formatInteger(summary.outliers.length),
                "Média = " + formatNumber(summary.mean),
            ]);
        }),
        grid: { left: compact ? 46 : 58, right: compact ? 142 : 178, top: 24, bottom: compact ? 48 : 52, containLabel: true },
        xAxis: {
            ...chartCategoryAxis(names),
            name: "Distribuição",
            nameLocation: "middle",
            nameGap: compact ? 24 : 34,
            axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, interval: 0 },
        },
        yAxis: {
            ...chartValueAxis(),
            scale: true,
            name: "Valores",
            nameLocation: "middle",
            nameGap: compact ? 26 : 42,
            axisLabel: { color: CHART_TEXT, fontSize: compact ? 10 : 11, formatter: (value) => formatNumber(value) },
        },
        series: [{
            name: "Boxplot",
            type: "boxplot",
            layout: "vertical",
            boxWidth: [30, 54],
            data: [{
                value: [summary.whiskerMin, summary.q1, summary.median, summary.q3, summary.whiskerMax],
                itemStyle: { color: colorWithAlpha(boxColor, 0.56), borderColor: boxColor, borderWidth: 2 },
            }],
            itemStyle: { borderWidth: 2 },
            emphasis: { itemStyle: { borderWidth: 2 } },
        }, {
            name: "Extremos dos bigodes",
            type: "custom",
            coordinateSystem: "cartesian2d",
            silent: true,
            clip: false,
            z: 10,
            encode: { x: 0, y: 1, tooltip: 2 },
            data: levelLabels.map((item) => [names[0], item.value, item.text]),
            renderItem: (params, api) => {
                if (params.dataIndex !== 0) return null;
                const coordinates = levelLabels.map((item) => {
                    const [x, y] = api.coord([names[0], item.value]);
                    return { ...item, x, valueY: y, y };
                }).sort((a, b) => a.valueY - b.valueY);
                const top = params.coordSys.y + coordinates[0].height / 2 + 2;
                const bottom = params.coordSys.y + params.coordSys.height - coordinates.at(-1).height / 2 - 2;
                coordinates.forEach((item, index) => {
                    if (index) item.y = Math.max(item.y, coordinates[index - 1].y + (coordinates[index - 1].height + item.height) / 2 + 4);
                });
                const overflow = coordinates.at(-1).y - bottom;
                if (overflow > 0) coordinates.forEach((item) => { item.y -= overflow; });
                const underflow = top - coordinates[0].y;
                if (underflow > 0) coordinates.forEach((item) => { item.y += underflow; });
                const centerX = coordinates[0].x;
                const labelX = centerX + 38;
                const children = [];
                coordinates.forEach((item) => {
                    children.push({
                        type: "line",
                        shape: { x1: centerX + 12, y1: item.valueY, x2: centerX + 30, y2: item.y },
                        style: { stroke: "rgba(220,232,250,.48)", lineWidth: .8 },
                    });
                    if (item.value === summary.whiskerMin || item.value === summary.whiskerMax) {
                        children.push({
                            type: "line",
                            shape: { x1: centerX - 9, y1: item.valueY, x2: centerX + 9, y2: item.valueY },
                            style: { stroke: boxColor, lineWidth: 3 },
                        });
                    }
                    children.push({
                        type: "text",
                        style: {
                            x: labelX, y: item.y, text: item.text, fill: CHART_TEXT,
                            font: compact ? '10px "Segoe UI", Arial, sans-serif' : '11px "Segoe UI", Arial, sans-serif',
                            lineHeight: compact ? 13 : 15,
                            textAlign: "left", textVerticalAlign: "middle",
                            textBackgroundColor: "rgba(4,22,49,.72)", textPadding: [2, 4], borderRadius: 3,
                        },
                    });
                });
                return { type: "group", children };
            },
        }, {
            name: "Valores atípicos",
            type: "scatter",
            symbolSize: 9,
            data: summary.outliers.map((value) => [names[0], value]),
            itemStyle: { color: "#ffbd63", borderColor: "#fff1d7", borderWidth: 1.5 },
        }],
    });
}


function renderKpis(container, stats, grouped) {
    clearElement(container);
    if (!stats) return;
    const mode = grouped ? (stats.mode_note || formatNumber(stats.mode)) : (stats.mode_note || (stats.mode?.length ? stats.mode.map(formatNumber).join(" / ") : "—"));
    const rows = grouped
        ? [["Média estimada", stats.mean], ["Mediana estimada", stats.median], ["Moda", mode], ["Q1 (25%)", stats.q1], ["Q2 (50%)", stats.q2], ["Q3 (75%)", stats.q3]]
        : [["Média", stats.mean], ["Mediana", stats.median], ["Moda", mode], ["Q1 (25%)", stats.q1], ["Q2 (50%)", stats.q2], ["Q3 (75%)", stats.q3]];
    rows.forEach(([label, value]) => {
        const card = document.createElement("div"); card.className = "kpi";
        const caption = document.createElement("small"); caption.textContent = label;
        const result = document.createElement("b"); result.textContent = typeof value === "string" ? value : formatNumber(value);
        if (typeof value === "string" && value.length > 16) result.classList.add("kpi-text");
        card.append(caption, result); container.appendChild(card);
    });
}

function renderGroupedTable(analysis) {
    const rows = analysis.frequency_table;
    clearElement(elements.tgr);
    if (!rows?.length) return;
    const reported = analysis.grouping?.source === "reported_intervals";
    elements.groupedVariable.textContent = analysis.column;
    const method = reported ? "Faixas originais da planilha" : analysis.grouping?.method === "manual" ? "Classes definidas manualmente" : "Classes calculadas automaticamente";
    elements.groupedMethod.textContent = `${method} · ${formatInteger(rows.length)} ${rows.length === 1 ? "classe" : "classes"} · ${formatInteger(analysis.valid_count)} respostas`;
    elements.groupedMeasuresNote.textContent = reported && analysis.grouping?.note
        ? analysis.grouping.note
        : `${analysis.grouping?.note || ""} ${analysis.grouped_statistics?.note || "Média estimada pelos pontos médios; mediana e quartis por interpolação das classes."}`.trim();
    const table = document.createElement("table");
    table.className = "reference-frequency-table";
    table.setAttribute("aria-label", "Tabela de intervalos, frequência e frequência acumulada");
    const head = table.createTHead().insertRow();
    const firstHeader = /\bidade[s]?\b|faixa\s+et[aá]ria/i.test(analysis.column) ? "Idades" : "Intervalos";
    [firstHeader, "Frequência", "Frequência Acumulada"].forEach((label, index) => {
        const cell = document.createElement("th"); cell.scope = "col";
        const title = document.createElement("span"); title.className = "frequency-heading";
        if (index === 2) {
            title.append("Frequência", document.createElement("br"), "Acumulada");
        } else title.textContent = label;
        cell.appendChild(title);
        if (index) {
            const formula = document.createElement("span"); formula.className = "frequency-formula";
            const symbol = document.createElement("i"); symbol.textContent = "f";
            const subscript = document.createElement("sub"); subscript.textContent = index === 1 ? "i" : "ac";
            formula.append("(", symbol, subscript, ")"); cell.appendChild(formula);
        }
        head.appendChild(cell);
    });
    const body = table.createTBody();
    rows.forEach((row) => {
        const tr = body.insertRow();
        const interval = tr.insertCell();
        if (!reported && Number.isFinite(row.lower) && Number.isFinite(row.upper)) {
            const bound = (value) => Number(value).toLocaleString("pt-BR", { useGrouping: false, maximumSignificantDigits: 15 });
            interval.textContent = `${bound(row.lower)} – ${bound(row.upper)}`;
        } else interval.textContent = row.value;
        interval.title = row.value;
        interval.setAttribute("aria-label", row.value);
        [row.frequency, row.cumulative_frequency].forEach((value) => { tr.insertCell().textContent = formatInteger(value); });
    });
    const footer = table.createTFoot().insertRow();
    const totalLabel = document.createElement("th"); totalLabel.scope = "row"; totalLabel.textContent = "TOTAL"; footer.appendChild(totalLabel);
    footer.insertCell().textContent = formatInteger(analysis.valid_count);
    footer.insertCell();
    elements.tgr.appendChild(table);
}

function renderDownloads(availability) {
    const analysis = state.analysis;
    const grouped = state.groupedAnalysis;
    const frequencyRows = distributionFrequencyRows(analysis);
    const makeRows = (headers, rows) => [headers, ...rows];
    const specs = [];
    const frequencyLabel = usesGroupedDistribution(analysis) ? `${analysis.column} (intervalo de classe)` : analysis.column;
    const frequencies = () => makeRows([frequencyLabel, "Frequência"], frequencyRows.map((row) => [row.value, row.frequency]));

    specs.push({ key: "bar", title: "Barras", filename: "barras", rows: frequencies, chartId: "cbar", chartIndex: 0 });
    specs.push({ key: "column", title: "Coluna", filename: "coluna", rows: frequencies, chartId: "ccolumn", chartIndex: 1 });
    specs.push({ key: "pie", title: "Rosca", filename: "rosca", rows: frequencies, chartId: "cpie", chartIndex: 2 });
    specs.push({ key: "pizza", title: "Pizza", filename: "pizza", rows: frequencies, chartId: "cpizza", chartIndex: 3 });
    specs.push({ key: "table", title: "Tabela agrupada", filename: "frequencias", rows: frequencies });
    specs.push({ key: "rawtable", title: "Tabela geral", filename: "dados_da_planilha", fullDataset: true });
    if (availability.dot) specs.push({ key: "dot", title: "Ponto", filename: "ponto", rows: () => {
        const values = scatterChartPayload(analysis);
        const xLabel = elements.secondaryColumn.value ? values.scatter_x_label : "Ordem da resposta";
        return makeRows([xLabel, values.scatter_y_label], values.series_x.map((x, index) => [x, values.series_y[index]]));
    }, chartId: "cdot", chartIndex: 6 });
    if (availability.line) specs.push({ key: "line", title: "Linha", filename: "linha", rows: () => {
        const values = analysis.charts;
        if (analysis.has_reported_intervals) return frequencies();
        return values.date_x?.length
            ? makeRows(["Data", "Respostas"], values.date_x.map((date, index) => [date, values.date_y[index]]))
            : makeRows(["Resposta", analysis.column], values.series_x.map((x, index) => [x, values.series_y[index]]));
    }, chartId: "cline", chartIndex: 7 });
    if (availability.ogv) specs.push({ key: "ogv", title: "Ogiva", filename: "ogiva", rows: () => {
        const rows = grouped.frequency_table;
        return makeRows(["Classe", "Limite superior", "Frequência acumulada"], rows.map((row) => [row.value, row.upper, row.cumulative_frequency]));
    }, chartId: "cogv", chartIndex: 8 });
    if (availability.box) specs.push({ key: "box", title: "Boxplot", filename: "boxplot", rows: () => {
        const summary = state.boxSummaries?.[0];
        if (!summary) return [];
        return makeRows(["Variável", "n", "Mínimo amostral", "Cerca inferior", "Bigode inferior", "Q1", "Mediana", "Q3", "Bigode superior", "Cerca superior", "Máximo amostral", "Valores atípicos", "IQR", "Média"], [
            [analysis.column, summary.n, summary.min, summary.lowerFence, summary.whiskerMin, summary.q1, summary.median, summary.q3, summary.whiskerMax, summary.upperFence, summary.max, summary.outliers.join(" | "), summary.iqr, summary.mean],
        ]);
    }, chartId: "cbox", chartIndex: 9 });
    if (availability.su) specs.push({ key: "su", title: "Medidas sem intervalo de classe", filename: "medidas_sem_classe", rows: () => {
        const stats = analysis.statistics;
        return makeRows(["Medida", "Valor"], [["n", analysis.valid_count], ["Mínimo", stats.minimum], ["Q1", stats.q1], ["Mediana", stats.median], ["Q3", stats.q3], ["Máximo", stats.maximum], ["Média", stats.mean], ["Moda", stats.mode_note || (stats.mode || []).join(" / ")]]);
    } });
    if (availability.sg) specs.push({ key: "sg", title: "Medidas com intervalo de classe", filename: "medidas_com_classe", rows: () => {
        const stats = grouped.grouped_statistics;
        const head = ["Medida", "Valor"];
        const measures = [["Variável", analysis.column], ["Método das classes", grouped.grouping?.source === "reported_intervals" ? "Faixas originais da planilha" : grouped.grouping?.method || "automático"], ["n", grouped.valid_count], ["Média estimada", stats.mean], ["Mediana estimada", stats.median], ["Moda", stats.mode_note || stats.mode], ["Q1", stats.q1], ["Q2", stats.q2], ["Q3", stats.q3], ["Origem dos intervalos", grouped.grouping?.note || ""], ["Observação", stats.note]];
        return [head, ...measures, ["", ""], ["Classe", "Limite inferior", "Limite superior", "Ponto médio (xi)", "fi", "Fi", "%"], ...grouped.frequency_table.map((row) => [row.value, row.lower, row.upper, row.midpoint, row.frequency, row.cumulative_frequency, row.percentage]), ["Total", "", "", "", grouped.valid_count, grouped.valid_count, 100]];
    } });

    specs.forEach((spec) => {
        spec.contextLabel = spec.fullDataset ? null : chartContextLabel(spec.key, analysis);
        const context = spec.fullDataset ? (state.fileName || "planilha").replace(/\.[^.]+$/, "") : spec.contextLabel;
        spec.filename = `${spec.filename}_${filenamePart(context)}`;
    });
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
    const nextKey = chartItems[nextChart]?.[0];
    if (nextKey === "box" && !elements.typeSelect.value.startsWith("quantitative_")) nextChart = 0;
    if (state.chartAvailability?.[chartItems[nextChart]?.[0]] === false) {
        nextChart = chartItems.findIndex(([key]) => state.chartAvailability[key] !== false);
    }
    state.activeChart = Math.max(0, nextChart);
    chartItems.forEach(([key], i) => {
        const card = document.getElementById(`cd_${key}`);
        if (card) card.hidden = i !== state.activeChart;
        const head = card?.querySelector(".chart-head");
        if (head) {
            let role = head.querySelector(".chart-slot");
            if (!role) {
                role = document.createElement("span");
                role.className = "chart-slot";
                head.appendChild(role);
            }
            role.textContent = i === state.activeChart ? "GRÁFICO PRINCIPAL" : "";
            role.hidden = i !== state.activeChart;
        }
    });
    elements.pk.querySelectorAll("button[data-i]").forEach((button, i) => {
        const active = i === state.activeChart;
        button.classList.toggle("on", active);
        button.setAttribute("aria-selected", String(active));
    });
    syncTypeControls();
    syncVariableSummary();
    resizeActiveChart();
    if (state.activeChart === 5 && (previousChart !== 5 || state.tableSheet !== state.sheet)) loadTablePage(0);
}

function observeChartSizes() {
    if (!window.ResizeObserver) return;
    const observer = new ResizeObserver((entries) => {
        const activeId = chartItems[state.activeChart]?.[2];
        if (entries.some((entry) => entry.target.id === activeId && entry.contentRect.width > 0 && entry.contentRect.height > 0)) {
            resizeActiveChart();
        }
    });
    document.querySelectorAll(".chart-engine").forEach((element) => observer.observe(element));
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

async function handleDownloadClick(event) {
    const button = event.target.closest("button[data-csv], button[data-png]");
    if (!button || button.disabled) return;
    const spec = state.downloads.find((item) => item.key === (button.dataset.csv || button.dataset.png));
    if (!spec) return;
    const menu = button.closest(".chart-download");
    const buttons = [...menu.querySelectorAll("button")];
    const originalText = button.textContent;
    buttons.forEach((action) => { action.disabled = true; });
    menu.setAttribute("aria-busy", "true");
    button.textContent = "Gerando arquivo…";
    try {
        if (button.dataset.png) await downloadPng(spec);
        else if (spec.fullDataset) await downloadFullDatasetCsv(spec);
        else downloadCsv(spec);
        menu.open = false;
    } catch (error) {
        setAnalysisError(`Não foi possível baixar o arquivo. ${error.message}`);
    } finally {
        buttons.forEach((action) => { action.disabled = false; });
        button.textContent = originalText;
        menu.removeAttribute("aria-busy");
    }
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

async function downloadPng(spec) {
    const option = chartOptions[spec.chartId];
    const source = document.getElementById(spec.chartId);
    if (!option || !source || !window.echarts) throw new Error("O gráfico ainda não está pronto.");
    const width = Math.max(640, Math.round(source.clientWidth));
    const height = Math.max(360, Math.round(source.clientHeight));
    const host = document.createElement("div");
    host.className = "chart-export-surface";
    host.style.width = `${width}px`;
    host.style.height = `${height}px`;
    host.setAttribute("aria-hidden", "true");
    document.body.appendChild(host);
    let exportChart;
    try {
        exportChart = window.echarts.init(host, null, { renderer: "canvas", width, height });
        exportChart.setOption({ ...option, animation: false, animationDuration: 0, animationDurationUpdate: 0 }, { notMerge: true, lazyUpdate: false });
        const image = new Image();
        await new Promise((resolve, reject) => {
            image.onload = resolve;
            image.onerror = () => reject(new Error("Não foi possível preparar a imagem do gráfico."));
            image.src = exportChart.getDataURL({ type: "png", pixelRatio: 2, backgroundColor: PIE_SURFACE });
        });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Seu navegador não conseguiu gerar a imagem.");
        const padding = 24;
        const lineHeight = 24;
        const titleFont = '600 17px "Segoe UI", Arial, sans-serif';
        context.font = titleFont;
        const lines = wrapCanvasText(context, spec.contextLabel || spec.title, width - padding * 2);
        const headerHeight = padding * 2 + lines.length * lineHeight + 20;
        canvas.width = width * 2;
        canvas.height = (height + headerHeight) * 2;
        context.scale(2, 2);
        context.fillStyle = PIE_SURFACE;
        context.fillRect(0, 0, width, height + headerHeight);
        context.font = titleFont;
        context.textBaseline = "top";
        context.fillStyle = PIE_TEXT;
        lines.forEach((line, index) => context.fillText(line, padding, padding + index * lineHeight));
        context.font = '12px "Segoe UI", Arial, sans-serif';
        context.fillStyle = CHART_SUBTEXT;
        context.fillText(spec.title, padding, padding + lines.length * lineHeight + 4);
        context.drawImage(image, 0, headerHeight, width, height);
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("Não foi possível gerar o PNG.");
        downloadBlob(`${spec.filename}.png`, blob, "image/png");
    } finally {
        exportChart?.dispose();
        host.remove();
    }
}

function wrapCanvasText(context, text, width) {
    const lines = [];
    let line = "";
    for (const word of String(text).trim().split(/\s+/)) {
        const candidate = line ? `${line} ${word}` : word;
        if (context.measureText(candidate).width <= width) {
            line = candidate;
            continue;
        }
        if (line) lines.push(line);
        line = "";
        for (const character of word) {
            if (line && context.measureText(line + character).width > width) {
                lines.push(line);
                line = "";
            }
            line += character;
        }
    }
    if (line) lines.push(line);
    return lines.length ? lines : [""];
}

function filenamePart(value) {
    return String(value || "variavel").normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 180).replace(/_+$/, "") || "variavel";
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
    state.downloads = [];
    state.activeChart = 0;
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
    elements.validCount.textContent = "—";
    elements.missingCount.textContent = "—";
    elements.distinctCount.textContent = "—";
    elements.distinctLabel.textContent = "Categorias";
    elements.flt.hidden = true;
    elements.gf.disabled = true;
    elements.gf.innerHTML = "";
    populateVariableTypeOptions(null);
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
function topFrequencies(rows, maxCategories = 12) {
    if (rows.length <= maxCategories) return rows;
    const top = rows.slice(0, maxCategories - 1);
    const otherFrequency = rows.slice(maxCategories - 1).reduce((sum, row) => sum + row[1], 0);
    return top.concat([["Outros", otherFrequency]]);
}

function summaryStats(values) {
    const clean = values.filter((value) => value !== null && value !== undefined && value !== "").map(Number).filter(Number.isFinite);
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
    const q1 = quantile(.25);
    const median = quantile(.5);
    const q3 = quantile(.75);
    const iqr = q3 - q1;
    const lowerFence = q1 - 1.5 * iqr;
    const upperFence = q3 + 1.5 * iqr;
    const inliers = sorted.filter((value) => value >= lowerFence && value <= upperFence);
    const outliers = sorted.filter((value) => value < lowerFence || value > upperFence);
    return {
        n: clean.length, min: sorted[0], max: sorted[sorted.length - 1],
        mean: clean.reduce((sum, value) => sum + value, 0) / clean.length,
        q1, median, q3, iqr, lowerFence, upperFence,
        whiskerMin: inliers[0], whiskerMax: inliers[inliers.length - 1], outliers,
        mode: modes.map(formatNumber).join(" / "),
    };
}

function formatNumber(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "—";
    return Number(value).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

function colorWithAlpha(hexColor, alpha) {
    const match = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hexColor);
    if (!match) return hexColor;
    const [red, green, blue] = match.slice(1).map((component) => parseInt(component, 16));
    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
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
    const url = URL.createObjectURL(text instanceof Blob ? text : new Blob([text], { type }));
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    try { link.click(); } finally {
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 60000);
    }
}
