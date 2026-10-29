import {
  FILTER_KEYS,
  canRedo,
  canUndo,
  clearSavedData,
  commitPendingHistory,
  defaultOptions,
  loadHistory,
  loadState,
  pushHistory,
  redo,
  saveState,
  state,
  touchHistory,
  undo,
} from './state.js';
import { applyTranslations, getLocale, setLanguage, t } from './i18n.js';
import { splitLines } from './diff.js';
import { compareTexts } from './engine.js';
import { renderDiffHTML } from './render.js';
import { applySearch, clearSearch, stepSearch } from './search.js';
import {
  buildDiffText,
  buildHtmlReport,
  buildJsonReport,
  buildPrintFragment,
  buildTxtReport,
  download,
  fileStamp,
} from './export.js';
import { readTextFile } from './fileio.js';
import { examples } from './examples.js';

const $ = (id) => document.getElementById(id);

const els = {
  language: $('language-select'),
  theme: $('theme-toggle'),
  print: $('print-button'),
  original: $('original-text'),
  modified: $('modified-text'),
  originalMeta: $('original-meta'),
  modifiedMeta: $('modified-meta'),
  originalFile: $('original-file'),
  modifiedFile: $('modified-file'),
  examples: $('examples-select'),
  swap: $('swap-button'),
  clear: $('clear-button'),
  reset: $('reset-button'),
  undo: $('undo-button'),
  redo: $('redo-button'),
  optIgnoreCase: $('opt-ignore-case'),
  optIgnoreExtra: $('opt-ignore-extra'),
  optIgnoreLeading: $('opt-ignore-leading'),
  optIgnoreBlank: $('opt-ignore-blank'),
  optExact: $('opt-exact'),
  view: $('view-select'),
  inline: $('inline-select'),
  syncScroll: $('sync-scroll'),
  statAdded: $('stat-added'),
  statDeleted: $('stat-deleted'),
  statModified: $('stat-modified'),
  statUnchanged: $('stat-unchanged'),
  similarityBar: $('similarity-bar'),
  similarityFill: $('similarity-fill'),
  similarityValue: $('similarity-value'),
  filterChips: Array.from(document.querySelectorAll('.filter-chip')),
  searchInput: $('search-input'),
  searchCount: $('search-count'),
  searchPrev: $('search-prev'),
  searchNext: $('search-next'),
  copyOriginal: $('copy-original'),
  copyModified: $('copy-modified'),
  copyDifferences: $('copy-differences'),
  copyReport: $('copy-report'),
  exportButtons: Array.from(document.querySelectorAll('[data-export]')),
  statusBanner: $('status-banner'),
  diffOutput: $('diff-output'),
  toast: $('toast'),
  printReport: $('print-report'),
  clearStorage: $('clear-storage'),
};

const optionInputs = [
  els.optIgnoreCase,
  els.optIgnoreExtra,
  els.optIgnoreLeading,
  els.optIgnoreBlank,
];

let toastTimer = null;
let searchTimer = null;
let saveTimer = null;
let diffTimer = null;
let worker = null;
let workerBroken = false;
let activeJob = 0;
let computing = false;
let storageErrorShown = false;
let scrollLock = false;

function formatNumber(value) {
  try {
    return new Intl.NumberFormat(getLocale()).format(value);
  } catch (error) {
    return String(value);
  }
}

function toast(message) {
  els.toast.textContent = message;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    els.toast.classList.remove('show');
  }, 2600);
}

function setMeta(element, text) {
  const lines = splitLines(text).length;
  element.textContent = `${t('panel.lines', { count: formatNumber(lines) })} · ${t('panel.chars', { count: formatNumber(text.length) })}`;
}

function updateMeta() {
  setMeta(els.originalMeta, els.original.value);
  setMeta(els.modifiedMeta, els.modified.value);
}

function applyTheme(theme) {
  state.theme = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.dataset.theme = state.theme;
  els.theme.setAttribute('aria-label', t('theme.toggle'));
  els.theme.setAttribute('title', t('theme.toggle'));
}

function updateOptionDisabled() {
  const exact = els.optExact.checked;
  optionInputs.forEach((input) => {
    input.disabled = exact;
  });
}

function syncFilterChips() {
  const allActive =
    state.filters.size === FILTER_KEYS.length &&
    FILTER_KEYS.every((filter) => state.filters.has(filter));
  els.filterChips.forEach((chip) => {
    const filter = chip.dataset.filter;
    const pressed = filter === 'all' ? allActive : state.filters.has(filter);
    chip.setAttribute('aria-pressed', String(pressed));
  });
}

function updateHistoryButtons() {
  els.undo.disabled = !canUndo();
  els.redo.disabled = !canRedo();
}

function syncUI() {
  els.language.value = state.language;
  els.optIgnoreCase.checked = state.options.ignoreCase;
  els.optIgnoreExtra.checked = state.options.ignoreExtraSpaces;
  els.optIgnoreLeading.checked = state.options.ignoreLeadingTrailing;
  els.optIgnoreBlank.checked = state.options.ignoreBlankLines;
  els.optExact.checked = state.options.exact;
  els.view.value = state.view;
  els.inline.value = state.inline;
  els.syncScroll.checked = state.syncScroll;
  updateOptionDisabled();
  syncFilterChips();
  updateHistoryButtons();
}

function renderExamples() {
  const selected = state.activeExample || '';
  els.examples.innerHTML = '';
  const placeholder = document.createElement('option');
  placeholder.value = '';
  placeholder.textContent = t('examples.placeholder');
  els.examples.appendChild(placeholder);

  for (const example of examples) {
    const option = document.createElement('option');
    option.value = example.id;
    option.textContent = t(example.titleKey);
    option.title = t(example.descKey);
    els.examples.appendChild(option);
  }

  els.examples.value = examples.some((example) => example.id === selected)
    ? selected
    : '';
}

function readTexts() {
  state.original = els.original.value;
  state.modified = els.modified.value;
}

function readOptions() {
  state.options.ignoreCase = els.optIgnoreCase.checked;
  state.options.ignoreExtraSpaces = els.optIgnoreExtra.checked;
  state.options.ignoreLeadingTrailing = els.optIgnoreLeading.checked;
  state.options.ignoreBlankLines = els.optIgnoreBlank.checked;
  state.options.exact = els.optExact.checked;
}

function applyStateTexts() {
  els.original.value = state.original;
  els.modified.value = state.modified;
  state.activeExample = null;
  els.examples.value = '';
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    if (!saveState() && !storageErrorShown) {
      storageErrorShown = true;
      toast(t('status.storageError'));
    }
  }, 400);
}

function setComputing(value) {
  computing = value;
  els.diffOutput.setAttribute('aria-busy', String(value));
  if (value) {
    showBanner(t('status.computing'), 'info');
  }
}

function showBanner(message, variant) {
  els.statusBanner.textContent = message;
  els.statusBanner.className = `banner banner-${variant}`;
  els.statusBanner.hidden = false;
}

function hideBanner() {
  els.statusBanner.textContent = '';
  els.statusBanner.className = 'banner';
  els.statusBanner.hidden = true;
}

function renderBanner(result, visible) {
  if (!result) {
    showBanner(t('status.emptyBoth'), 'info');
    return;
  }
  if (result.bothEmpty) {
    showBanner(t('status.emptyBoth'), 'info');
    return;
  }
  if (result.oneEmpty) {
    showBanner(t('status.emptyOne'), 'warn');
    return;
  }
  if (result.identical) {
    showBanner(t('status.identical'), 'success');
    return;
  }
  if (visible === 0) {
    const allActive =
      state.filters.size === FILTER_KEYS.length &&
      FILTER_KEYS.every((filter) => state.filters.has(filter));
    showBanner(
      t(allActive ? 'status.noDiff' : 'status.noFilter'),
      allActive ? 'info' : 'warn',
    );
    return;
  }
  if (visible < result.rows.length) {
    showBanner(
      t('status.shown', {
        shown: formatNumber(visible),
        total: formatNumber(result.rows.length),
      }),
      'info',
    );
    return;
  }
  hideBanner();
}

function updateStats(result) {
  const stats = result
    ? result.stats
    : { added: 0, deleted: 0, modified: 0, unchanged: 0 };
  els.statAdded.textContent = formatNumber(stats.added);
  els.statDeleted.textContent = formatNumber(stats.deleted);
  els.statModified.textContent = formatNumber(stats.modified);
  els.statUnchanged.textContent = formatNumber(stats.unchanged);

  if (!result || result.bothEmpty) {
    els.similarityValue.textContent = '—';
    els.similarityFill.style.width = '0%';
    els.similarityBar.setAttribute('aria-valuenow', '0');
    return;
  }

  const value = Math.max(0, Math.min(100, result.similarity));
  els.similarityValue.textContent = `${formatNumber(value)}%`;
  els.similarityFill.style.width = `${value}%`;
  els.similarityBar.setAttribute('aria-valuenow', String(value));
}

function updateSearchCount(info) {
  const query = els.searchInput.value;
  if (!query) {
    els.searchCount.textContent = '';
    return;
  }
  if (!info || info.count === 0) {
    els.searchCount.textContent = t('results.searchNoMatch');
    return;
  }
  els.searchCount.textContent = t('results.searchCount', {
    current: formatNumber(info.index + 1),
    total: formatNumber(info.count),
  });
}

function reapplySearch() {
  const query = els.searchInput.value;
  if (!query) {
    clearSearch(els.diffOutput);
    updateSearchCount({ count: 0, index: -1 });
    return;
  }
  const info = applySearch(els.diffOutput, query);
  updateSearchCount(info);
}

function render() {
  computing = false;
  els.diffOutput.setAttribute('aria-busy', 'false');
  const result = state.result;

  if (!result) {
    updateStats(null);
    els.diffOutput.innerHTML = '';
    showBanner(t('status.emptyBoth'), 'info');
    updateSearchCount({ count: 0, index: -1 });
    return;
  }

  updateStats(result);
  const rendered = renderDiffHTML(result, {
    view: state.view,
    filters: state.filters,
  });
  els.diffOutput.innerHTML = rendered.html;
  renderBanner(result, rendered.visible);
  reapplySearch();
}

function handleResult(result) {
  state.result = result;
  render();
  updateHistoryButtons();
}

function ensureWorker() {
  if (worker || workerBroken) return worker;
  if (typeof Worker === 'undefined') {
    workerBroken = true;
    return null;
  }

  try {
    worker = new Worker(new URL('./diff.worker.js', import.meta.url), {
      type: 'module',
    });

    worker.onmessage = (event) => {
      const data = event.data || {};
      if (data.id !== activeJob) return;
      if (data.error) {
        computeOnMain({
          id: activeJob,
          original: state.original,
          modified: state.modified,
          options: { ...state.options },
          granularity: state.inline,
        });
        return;
      }
      handleResult(data.result);
    };

    worker.onerror = () => {
      workerBroken = true;
      if (worker) {
        try {
          worker.terminate();
        } catch (error) {
          /* ignore */
        }
        worker = null;
      }
      computeOnMain({
        id: activeJob,
        original: state.original,
        modified: state.modified,
        options: { ...state.options },
        granularity: state.inline,
      });
    };
  } catch (error) {
    workerBroken = true;
    worker = null;
  }

  return worker;
}

function computeOnMain(job) {
  setTimeout(() => {
    try {
      const result = compareTexts(
        job.original,
        job.modified,
        job.options,
        job.granularity,
      );
      if (job.id === activeJob) handleResult(result);
    } catch (error) {
      if (job.id === activeJob) {
        setComputing(false);
        console.error(error);
        showBanner(t('status.noDiff'), 'warn');
      }
    }
  }, 0);
}

function runDiff() {
  const id = ++activeJob;

  if (state.original === '' && state.modified === '') {
    handleResult(compareTexts('', '', state.options, state.inline));
    return;
  }

  const job = {
    id,
    original: state.original,
    modified: state.modified,
    options: { ...state.options },
    granularity: state.inline,
  };

  setComputing(true);
  const instance = ensureWorker();

  if (instance) {
    try {
      instance.postMessage(job);
      return;
    } catch (error) {
      workerBroken = true;
      try {
        instance.terminate();
      } catch (terminateError) {
        /* ignore */
      }
      worker = null;
    }
  }

  computeOnMain(job);
}

function requestDiff(delay = 300) {
  clearTimeout(diffTimer);
  diffTimer = setTimeout(runDiff, delay);
}

function doUndo() {
  const previous = undo();
  if (!previous) return;
  applyStateTexts();
  updateMeta();
  scheduleSave();
  updateHistoryButtons();
  requestDiff(0);
}

function doRedo() {
  const next = redo();
  if (!next) return;
  applyStateTexts();
  updateMeta();
  scheduleSave();
  updateHistoryButtons();
  requestDiff(0);
}

function syncScroll(from, to) {
  if (!state.syncScroll || scrollLock) return;
  const fromMax = from.scrollHeight - from.clientHeight;
  const toMax = to.scrollHeight - to.clientHeight;
  if (fromMax <= 0 || toMax <= 0) return;
  const ratio = from.scrollTop / fromMax;
  scrollLock = true;
  to.scrollTop = ratio * toMax;
  requestAnimationFrame(() => {
    scrollLock = false;
  });
}

function fallbackCopy(text) {
  const area = document.createElement('textarea');
  area.value = text;
  area.setAttribute('readonly', '');
  area.style.position = 'fixed';
  area.style.opacity = '0';
  area.style.pointerEvents = 'none';
  document.body.appendChild(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('copy-failed');
}

async function copyToClipboard(text) {
  if (!text) {
    toast(t('export.empty'));
    return;
  }

  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
    } else {
      fallbackCopy(text);
    }
    toast(t('copy.success'));
  } catch (error) {
    try {
      fallbackCopy(text);
      toast(t('copy.success'));
    } catch (fallbackError) {
      toast(t('copy.error'));
    }
  }
}

async function handleFile(input, target) {
  const file = input.files && input.files[0];
  input.value = '';
  if (!file) return;

  try {
    const text = await readTextFile(file);
    pushHistory();
    if (target === 'original') {
      state.original = text;
      els.original.value = text;
    } else {
      state.modified = text;
      els.modified.value = text;
    }
    state.activeExample = null;
    els.examples.value = '';
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(0);
  } catch (error) {
    let reason = t('status.fileRead');
    if (error.message === 'unsupported') reason = t('status.fileUnsupported');
    else if (error.message === 'too-large') reason = t('status.fileTooLarge');
    toast(t('status.loadError', { reason }));
  }
}

function handlePrint() {
  if (!state.result || state.result.bothEmpty) {
    toast(t('export.empty'));
    return;
  }
  els.printReport.innerHTML = buildPrintFragment(state.result, state);
  window.print();
}

function bindEvents() {
  els.original.addEventListener('input', () => {
    touchHistory();
    readTexts();
    if (state.activeExample) {
      state.activeExample = null;
      els.examples.value = '';
    }
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(320);
  });

  els.modified.addEventListener('input', () => {
    touchHistory();
    readTexts();
    if (state.activeExample) {
      state.activeExample = null;
      els.examples.value = '';
    }
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(320);
  });

  [els.optIgnoreCase, els.optIgnoreExtra, els.optIgnoreLeading, els.optIgnoreBlank, els.optExact].forEach(
    (input) => {
      input.addEventListener('change', () => {
        readOptions();
        updateOptionDisabled();
        scheduleSave();
        requestDiff(0);
      });
    },
  );

  els.view.addEventListener('change', () => {
    state.view = els.view.value === 'unified' ? 'unified' : 'side';
    scheduleSave();
    render();
  });

  els.inline.addEventListener('change', () => {
    state.inline = ['word', 'char', 'none'].includes(els.inline.value)
      ? els.inline.value
      : 'word';
    scheduleSave();
    requestDiff(0);
  });

  els.syncScroll.addEventListener('change', () => {
    state.syncScroll = els.syncScroll.checked;
    scheduleSave();
  });

  els.filterChips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const filter = chip.dataset.filter;
      if (filter === 'all') {
        state.filters = new Set(FILTER_KEYS);
      } else if (state.filters.has(filter)) {
        state.filters.delete(filter);
      } else {
        state.filters.add(filter);
      }
      syncFilterChips();
      scheduleSave();
      render();
    });
  });

  els.theme.addEventListener('click', () => {
    applyTheme(state.theme === 'dark' ? 'light' : 'dark');
    scheduleSave();
  });

  els.language.addEventListener('change', () => {
    state.language = setLanguage(els.language.value);
    applyTranslations();
    applyTheme(state.theme);
    renderExamples();
    updateMeta();
    scheduleSave();
    render();
  });

  els.examples.addEventListener('change', () => {
    const id = els.examples.value;
    if (!id) return;
    const example = examples.find((item) => item.id === id);
    if (!example) return;

    pushHistory();
    state.original = example.original;
    state.modified = example.modified;
    state.activeExample = id;
    els.original.value = state.original;
    els.modified.value = state.modified;
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(0);
  });

  els.swap.addEventListener('click', () => {
    pushHistory();
    const previousOriginal = state.original;
    state.original = state.modified;
    state.modified = previousOriginal;
    state.activeExample = null;
    els.examples.value = '';
    els.original.value = state.original;
    els.modified.value = state.modified;
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(0);
  });

  els.clear.addEventListener('click', () => {
    if (!window.confirm(t('confirm.clear'))) return;
    pushHistory();
    state.original = '';
    state.modified = '';
    state.activeExample = null;
    els.examples.value = '';
    els.original.value = '';
    els.modified.value = '';
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(0);
  });

  els.reset.addEventListener('click', () => {
    if (!window.confirm(t('confirm.reset'))) return;
    pushHistory();
    state.original = '';
    state.modified = '';
    state.activeExample = null;
    state.options = defaultOptions();
    state.view = 'side';
    state.inline = 'word';
    state.syncScroll = true;
    state.filters = new Set(FILTER_KEYS);
    els.examples.value = '';
    els.original.value = '';
    els.modified.value = '';
    syncUI();
    updateMeta();
    scheduleSave();
    updateHistoryButtons();
    requestDiff(0);
  });

  els.clearStorage.addEventListener('click', () => {
    if (!window.confirm(t('confirm.clearStorage'))) return;
    clearSavedData();
    updateHistoryButtons();
    toast(t('data.cleared'));
  });

  els.undo.addEventListener('click', doUndo);
  els.redo.addEventListener('click', doRedo);

  document.addEventListener('keydown', (event) => {
    const modifier = event.ctrlKey || event.metaKey;
    if (!modifier) return;
    if (event.target && event.target.closest && event.target.closest('#search-input')) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === 'z' && !event.shiftKey) {
      event.preventDefault();
      doUndo();
    } else if ((key === 'z' && event.shiftKey) || key === 'y') {
      event.preventDefault();
      doRedo();
    }
  });

  els.original.addEventListener('scroll', () => syncScroll(els.original, els.modified));
  els.modified.addEventListener('scroll', () => syncScroll(els.modified, els.original));

  document.querySelectorAll('[data-load-target]').forEach((button) => {
    button.addEventListener('click', () => {
      const target = button.dataset.loadTarget;
      const input = target === 'original' ? els.originalFile : els.modifiedFile;
      input.click();
    });
  });

  els.originalFile.addEventListener('change', () =>
    handleFile(els.originalFile, 'original'),
  );
  els.modifiedFile.addEventListener('change', () =>
    handleFile(els.modifiedFile, 'modified'),
  );

  els.copyOriginal.addEventListener('click', () => copyToClipboard(state.original));
  els.copyModified.addEventListener('click', () => copyToClipboard(state.modified));
  els.copyDifferences.addEventListener('click', () => {
    if (!state.result || !state.result.hasChanges) {
      toast(t('export.empty'));
      return;
    }
    copyToClipboard(buildDiffText(state.result));
  });
  els.copyReport.addEventListener('click', () => {
    if (!state.result || state.result.bothEmpty) {
      toast(t('export.empty'));
      return;
    }
    copyToClipboard(buildTxtReport(state.result, state));
  });

  els.exportButtons.forEach((button) => {
    button.addEventListener('click', () => {
      if (!state.result || state.result.bothEmpty) {
        toast(t('export.empty'));
        return;
      }
      const kind = button.dataset.export;
      const stamp = fileStamp();
      if (kind === 'txt') {
        download(
          `comparacion-${stamp}.txt`,
          buildTxtReport(state.result, state),
          'text/plain;charset=utf-8',
        );
      } else if (kind === 'html') {
        download(
          `comparacion-${stamp}.html`,
          buildHtmlReport(state.result, state),
          'text/html;charset=utf-8',
        );
      } else if (kind === 'json') {
        download(
          `comparacion-${stamp}.json`,
          buildJsonReport(state.result, state),
          'application/json;charset=utf-8',
        );
      }
      toast(t('export.success'));
    });
  });

  els.print.addEventListener('click', handlePrint);
  window.addEventListener('beforeprint', () => {
    if (state.result) {
      els.printReport.innerHTML = buildPrintFragment(state.result, state);
    }
  });

  els.diffOutput.addEventListener('click', (event) => {
    const button = event.target.closest('[data-hunk-toggle]');
    if (!button) return;
    const id = button.dataset.hunkToggle;
    const expanded = button.getAttribute('aria-expanded') === 'true';
    const nextExpanded = !expanded;
    button.setAttribute('aria-expanded', String(nextExpanded));
    button.setAttribute(
      'title',
      t(nextExpanded ? 'results.collapseHunk' : 'results.expandHunk'),
    );
    els.diffOutput.querySelectorAll(`[data-hunk="${id}"]`).forEach((row) => {
      row.hidden = !nextExpanded;
    });
  });

  els.searchInput.addEventListener('input', () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(reapplySearch, 120);
  });

  els.searchInput.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const info = stepSearch(event.shiftKey ? -1 : 1);
    updateSearchCount(info);
  });

  els.searchPrev.addEventListener('click', () => {
    const info = stepSearch(-1);
    updateSearchCount(info);
  });

  els.searchNext.addEventListener('click', () => {
    const info = stepSearch(1);
    updateSearchCount(info);
  });

  window.addEventListener('beforeunload', () => {
    commitPendingHistory();
    saveState();
  });
}

function init() {
  loadState();
  loadHistory();
  setLanguage(state.language);
  applyTranslations();
  applyTheme(state.theme);
  syncUI();
  renderExamples();
  els.original.value = state.original;
  els.modified.value = state.modified;
  updateMeta();
  bindEvents();
  updateHistoryButtons();
  requestDiff(0);
}

init();
