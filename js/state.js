export const STORAGE_KEY = 'comparadorTextos.v1';
export const HISTORY_KEY = 'comparadorTextos.v1.history';
export const MAX_HISTORY = 30;
export const HISTORY_BUDGET = 1024 * 1024;
export const FILTER_KEYS = ['add', 'del', 'mod', 'equal'];

export function defaultOptions() {
  return {
    ignoreCase: false,
    ignoreExtraSpaces: false,
    ignoreLeadingTrailing: false,
    ignoreBlankLines: false,
    exact: false,
  };
}

function systemTheme() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia) {
      return window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light';
    }
  } catch (error) {
    return 'light';
  }
  return 'light';
}

function initialTheme() {
  if (typeof document !== 'undefined') {
    const current = document.documentElement.dataset.theme;
    if (current === 'light' || current === 'dark') return current;
  }
  return systemTheme();
}

export const state = {
  original: '',
  modified: '',
  options: defaultOptions(),
  view: 'side',
  inline: 'word',
  syncScroll: true,
  filters: new Set(FILTER_KEYS),
  theme: initialTheme(),
  language: 'es',
  activeExample: null,
  result: null,
};

let undoStack = [];
let redoStack = [];
let pendingSnapshot = null;
let pendingTimer = null;

function snapshot() {
  return { original: state.original, modified: state.modified };
}

function sameSnapshot(left, right) {
  return (
    left &&
    right &&
    left.original === right.original &&
    left.modified === right.modified
  );
}

function snapshotSize(item) {
  return (item.original.length + item.modified.length) * 2;
}

function trimStack(stack) {
  while (stack.length > MAX_HISTORY) stack.shift();
  let total = stack.reduce((sum, item) => sum + snapshotSize(item), 0);
  while (total > HISTORY_BUDGET && stack.length > 5) {
    total -= snapshotSize(stack.shift());
  }
}

function sanitizeStack(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (item) =>
        item &&
        typeof item.original === 'string' &&
        typeof item.modified === 'string',
    )
    .slice(-MAX_HISTORY);
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return false;

    if (typeof data.original === 'string') state.original = data.original;
    if (typeof data.modified === 'string') state.modified = data.modified;

    if (data.options && typeof data.options === 'object') {
      for (const key of Object.keys(state.options)) {
        if (typeof data.options[key] === 'boolean') {
          state.options[key] = data.options[key];
        }
      }
    }

    if (data.view === 'side' || data.view === 'unified') state.view = data.view;
    if (['word', 'char', 'none'].includes(data.inline)) state.inline = data.inline;
    if (typeof data.syncScroll === 'boolean') state.syncScroll = data.syncScroll;
    if (Array.isArray(data.filters)) {
      state.filters = new Set(
        data.filters.filter((filter) => FILTER_KEYS.includes(filter)),
      );
    }
    if (data.theme === 'light' || data.theme === 'dark') state.theme = data.theme;
    if (data.language === 'es' || data.language === 'en') {
      state.language = data.language;
    }
    if (typeof data.activeExample === 'string' || data.activeExample === null) {
      state.activeExample = data.activeExample;
    }

    return true;
  } catch (error) {
    return false;
  }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY);
    if (!raw) return;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return;
    undoStack = sanitizeStack(data.undo);
    redoStack = sanitizeStack(data.redo);
  } catch (error) {
    undoStack = [];
    redoStack = [];
  }
}

export function saveState() {
  try {
    const payload = {
      version: 1,
      original: state.original,
      modified: state.modified,
      options: state.options,
      view: state.view,
      inline: state.inline,
      syncScroll: state.syncScroll,
      filters: [...state.filters],
      theme: state.theme,
      language: state.language,
      activeExample: state.activeExample,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    return false;
  }
}

function saveHistory() {
  try {
    localStorage.setItem(
      HISTORY_KEY,
      JSON.stringify({ undo: undoStack, redo: redoStack }),
    );
    return true;
  } catch (error) {
    return false;
  }
}

export function touchHistory() {
  if (!pendingSnapshot) pendingSnapshot = snapshot();
  clearTimeout(pendingTimer);
  pendingTimer = setTimeout(() => {
    commitPendingHistory();
  }, 700);
}

export function commitPendingHistory() {
  clearTimeout(pendingTimer);
  if (!pendingSnapshot) return;
  const item = pendingSnapshot;
  pendingSnapshot = null;
  if (sameSnapshot(item, undoStack[undoStack.length - 1])) return;
  undoStack.push(item);
  trimStack(undoStack);
  redoStack = [];
  saveHistory();
}

export function pushHistory() {
  commitPendingHistory();
  const item = snapshot();
  if (sameSnapshot(item, undoStack[undoStack.length - 1])) return;
  undoStack.push(item);
  trimStack(undoStack);
  redoStack = [];
  saveHistory();
}

export function undo() {
  commitPendingHistory();
  if (undoStack.length === 0) return null;
  redoStack.push(snapshot());
  trimStack(redoStack);
  const previous = undoStack.pop();
  state.original = previous.original;
  state.modified = previous.modified;
  saveHistory();
  return previous;
}

export function redo() {
  commitPendingHistory();
  if (redoStack.length === 0) return null;
  undoStack.push(snapshot());
  trimStack(undoStack);
  const next = redoStack.pop();
  state.original = next.original;
  state.modified = next.modified;
  saveHistory();
  return next;
}

export function canUndo() {
  return undoStack.length > 0 || pendingSnapshot !== null;
}

export function canRedo() {
  return redoStack.length > 0;
}

export function clearHistory() {
  clearTimeout(pendingTimer);
  undoStack = [];
  redoStack = [];
  pendingSnapshot = null;
  try {
    localStorage.removeItem(HISTORY_KEY);
  } catch (error) {
    /* ignore storage errors */
  }
}

export function clearSavedData() {
  clearHistory();
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(HISTORY_KEY);
    return true;
  } catch (error) {
    return false;
  }
}
