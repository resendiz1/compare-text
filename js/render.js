import { escapeHTML } from './diff.js';
import { t } from './i18n.js';

const FILTER_FOR_TYPE = {
  equal: 'equal',
  insert: 'add',
  delete: 'del',
  modify: 'mod',
};

const ROW_CLASS = {
  equal: 'row-equal',
  insert: 'row-add',
  delete: 'row-del',
  modify: 'row-mod',
};

function hunkHeader(hunk) {
  const summary = t('results.hunkSummary', {
    added: hunk.added,
    deleted: hunk.deleted,
    modified: hunk.modified,
  });
  return `<button type="button" class="hunk-header" data-hunk-toggle="${hunk.id}" aria-expanded="true" title="${escapeHTML(t('results.collapseHunk'))}">
    <span class="hunk-title">${escapeHTML(t('results.hunk'))} ${hunk.id}</span>
    <span class="hunk-summary">${escapeHTML(summary)}</span>
    <span class="hunk-chevron" aria-hidden="true">▾</span>
  </button>`;
}

function lineNumber(value) {
  return value === null || value === undefined ? '' : String(value);
}

function sideRow(row) {
  const leftEmpty = !row.left;
  const rightEmpty = !row.right;
  const hunk = row.hunk ? ` data-hunk="${row.hunk}"` : '';
  return `<div class="diff-row ${ROW_CLASS[row.type]}"${hunk}>
    <div class="ln${leftEmpty ? ' ln-empty' : ''}">${lineNumber(row.leftNo)}</div>
    <div class="code code-left${leftEmpty ? ' code-empty' : ''}">${leftEmpty ? '' : row.leftHTML}</div>
    <div class="ln${rightEmpty ? ' ln-empty' : ''}">${lineNumber(row.rightNo)}</div>
    <div class="code code-right${rightEmpty ? ' code-empty' : ''}">${rightEmpty ? '' : row.rightHTML}</div>
  </div>`;
}

function unifiedRows(row) {
  const hunk = row.hunk ? ` data-hunk="${row.hunk}"` : '';

  if (row.type === 'equal') {
    return `<div class="diff-row row-equal"${hunk}>
      <div class="ln">${lineNumber(row.leftNo)}</div>
      <div class="ln">${lineNumber(row.rightNo)}</div>
      <div class="sign" aria-hidden="true"></div>
      <div class="code">${row.leftHTML}</div>
    </div>`;
  }

  if (row.type === 'insert') {
    return `<div class="diff-row row-add"${hunk}>
      <div class="ln ln-empty"></div>
      <div class="ln">${lineNumber(row.rightNo)}</div>
      <div class="sign" aria-hidden="true">+</div>
      <div class="code">${row.rightHTML}</div>
    </div>`;
  }

  if (row.type === 'delete') {
    return `<div class="diff-row row-del"${hunk}>
      <div class="ln">${lineNumber(row.leftNo)}</div>
      <div class="ln ln-empty"></div>
      <div class="sign" aria-hidden="true">−</div>
      <div class="code">${row.leftHTML}</div>
    </div>`;
  }

  return `<div class="diff-row row-mod row-mod-del"${hunk}>
      <div class="ln">${lineNumber(row.leftNo)}</div>
      <div class="ln ln-empty"></div>
      <div class="sign" aria-hidden="true">−</div>
      <div class="code">${row.leftHTML}</div>
    </div>
    <div class="diff-row row-mod row-mod-add"${hunk}>
      <div class="ln ln-empty"></div>
      <div class="ln">${lineNumber(row.rightNo)}</div>
      <div class="sign" aria-hidden="true">+</div>
      <div class="code">${row.rightHTML}</div>
    </div>`;
}

export function renderDiffHTML(result, { view, filters }) {
  if (!result || result.bothEmpty || result.rows.length === 0) {
    return { html: '', visible: 0 };
  }

  const visibleRows = result.rows.filter((row) =>
    filters.has(FILTER_FOR_TYPE[row.type]),
  );
  if (visibleRows.length === 0) return { html: '', visible: 0 };

  const hunkById = new Map(result.hunks.map((hunk) => [hunk.id, hunk]));
  let lastHunk = null;

  if (view === 'unified') {
    let body = '';
    for (const row of visibleRows) {
      if (row.hunk && row.hunk !== lastHunk) {
        const hunk = hunkById.get(row.hunk);
        if (hunk) body += hunkHeader(hunk);
      }
      lastHunk = row.hunk;
      body += unifiedRows(row);
    }
    return {
      html: `<div class="diff-grid diff-unified">
        <div class="diff-colhead" aria-hidden="true">
          <span class="ln-head">#</span>
          <span class="ln-head">#</span>
          <span class="sign-head"></span>
          <span class="col-title">${escapeHTML(t('results.modifiedColumn'))}</span>
        </div>
        ${body}
      </div>`,
      visible: visibleRows.length,
    };
  }

  let body = '';
  for (const row of visibleRows) {
    if (row.hunk && row.hunk !== lastHunk) {
      const hunk = hunkById.get(row.hunk);
      if (hunk) body += hunkHeader(hunk);
    }
    lastHunk = row.hunk;
    body += sideRow(row);
  }

  return {
    html: `<div class="diff-grid diff-side">
      <div class="diff-colhead">
        <span class="ln-head" aria-hidden="true">#</span>
        <span class="col-title">${escapeHTML(t('results.originalColumn'))}</span>
        <span class="ln-head" aria-hidden="true">#</span>
        <span class="col-title">${escapeHTML(t('results.modifiedColumn'))}</span>
      </div>
      ${body}
    </div>`,
    visible: visibleRows.length,
  };
}
