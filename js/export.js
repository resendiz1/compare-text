import { escapeHTML } from './diff.js';
import { getLanguage, getLocale, t } from './i18n.js';

function formatDate() {
  try {
    return new Intl.DateTimeFormat(getLocale(), {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(new Date());
  } catch (error) {
    return new Date().toISOString();
  }
}

function optionList(options) {
  if (options.exact) return [t('options.exact')];
  const active = [];
  if (options.ignoreCase) active.push(t('options.ignoreCase'));
  if (options.ignoreExtraSpaces) active.push(t('options.ignoreExtraSpaces'));
  if (options.ignoreLeadingTrailing) {
    active.push(t('options.ignoreLeadingTrailing'));
  }
  if (options.ignoreBlankLines) active.push(t('options.ignoreBlankLines'));
  return active.length > 0 ? active : [t('report.noOptions')];
}

export function buildDiffText(result) {
  if (!result || !result.hasChanges) return '';
  const lines = [];
  let lastHunk = null;

  for (const row of result.rows) {
    if (row.type === 'equal') {
      lastHunk = null;
      continue;
    }
    if (row.hunk !== lastHunk) {
      lines.push('');
      lines.push(`@@ ${t('results.hunk')} ${row.hunk} @@`);
      lastHunk = row.hunk;
    }
    if (row.type === 'delete') {
      lines.push(`- ${row.leftText}`);
    } else if (row.type === 'insert') {
      lines.push(`+ ${row.rightText}`);
    } else {
      lines.push(`- ${row.leftText}`);
      lines.push(`+ ${row.rightText}`);
    }
  }

  return lines.join('\n').trim();
}

export function buildTxtReport(result, state) {
  const lines = [];
  lines.push(t('report.title'));
  lines.push(t('report.generated', { date: formatDate() }));
  lines.push('');
  lines.push(`${t('report.options')}: ${optionList(state.options).join('; ')}`);
  lines.push(`${t('report.similarity')}: ${result.similarity}%`);
  lines.push(`${t('report.added')}: ${result.stats.added}`);
  lines.push(`${t('report.deleted')}: ${result.stats.deleted}`);
  lines.push(`${t('report.modified')}: ${result.stats.modified}`);
  lines.push(`${t('report.unchanged')}: ${result.stats.unchanged}`);
  lines.push('');
  lines.push(`--- ${t('report.original')}`);
  lines.push(`+++ ${t('report.modifiedText')}`);
  lines.push('');

  if (!result.hasChanges) {
    lines.push(t('report.noChanges'));
  } else {
    for (const row of result.rows) {
      if (row.type === 'equal') lines.push(`  ${row.leftText}`);
      else if (row.type === 'delete') lines.push(`- ${row.leftText}`);
      else if (row.type === 'insert') lines.push(`+ ${row.rightText}`);
      else {
        lines.push(`- ${row.leftText}`);
        lines.push(`+ ${row.rightText}`);
      }
    }
  }

  return lines.join('\n');
}

function diffHTML(result) {
  if (!result.hasChanges) {
    return `<p class="report-empty">${escapeHTML(t('report.noChanges'))}</p>`;
  }

  const body = result.rows
    .map((row) => {
      if (row.type === 'equal') {
        return `<span class="r-equal">  ${escapeHTML(row.leftText)}</span>`;
      }
      if (row.type === 'delete') {
        return `<span class="r-del">- ${escapeHTML(row.leftText)}</span>`;
      }
      if (row.type === 'insert') {
        return `<span class="r-add">+ ${escapeHTML(row.rightText)}</span>`;
      }
      return `<span class="r-del">- ${escapeHTML(row.leftText)}</span>\n<span class="r-add">+ ${escapeHTML(row.rightText)}</span>`;
    })
    .join('\n');

  return `<pre class="report-diff">${body}</pre>`;
}

function buildReportBody(result, state) {
  const empty = result.bothEmpty;
  const similarity = empty ? '—' : `${result.similarity}%`;
  const options = optionList(state.options);

  return `<div class="report">
  <header class="report-header">
    <h1>${escapeHTML(t('report.title'))}</h1>
    <p class="report-meta">${escapeHTML(t('report.generated', { date: formatDate() }))}</p>
  </header>
  <section class="report-summary">
    <div class="report-stat report-stat-add"><span>${escapeHTML(t('report.added'))}</span><strong>${result.stats.added}</strong></div>
    <div class="report-stat report-stat-del"><span>${escapeHTML(t('report.deleted'))}</span><strong>${result.stats.deleted}</strong></div>
    <div class="report-stat report-stat-mod"><span>${escapeHTML(t('report.modified'))}</span><strong>${result.stats.modified}</strong></div>
    <div class="report-stat report-stat-same"><span>${escapeHTML(t('report.unchanged'))}</span><strong>${result.stats.unchanged}</strong></div>
    <div class="report-stat report-stat-sim"><span>${escapeHTML(t('report.similarity'))}</span><strong>${similarity}</strong></div>
  </section>
  <section class="report-options">
    <h2>${escapeHTML(t('report.options'))}</h2>
    <p>${escapeHTML(options.join(' · '))}</p>
  </section>
  <section class="report-diff-section">
    <h2>${escapeHTML(t('report.diff'))}</h2>
    ${diffHTML(result)}
  </section>
</div>`;
}

const REPORT_CSS = `
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    background: #ffffff;
    color: #1b1f24;
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
    line-height: 1.5;
  }
  .report { max-width: 1100px; margin: 0 auto; }
  .report-header h1 { margin: 0 0 4px; font-size: 26px; }
  .report-meta { margin: 0 0 24px; color: #5c6670; font-size: 14px; }
  .report-summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
    gap: 10px;
    margin-bottom: 24px;
  }
  .report-stat {
    border: 1px solid #d9dee6;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    background: #f8fafc;
  }
  .report-stat span { font-size: 12px; text-transform: uppercase; letter-spacing: 0.04em; color: #5c6670; }
  .report-stat strong { font-size: 20px; }
  .report-stat-add { background: #eaf7ef; border-color: #9fd8b5; }
  .report-stat-del { background: #fdeeee; border-color: #efb3b3; }
  .report-stat-mod { background: #fff5e2; border-color: #eccb8d; }
  .report-stat-sim { background: #eaf1fe; border-color: #b4cbf5; }
  .report-options h2, .report-diff-section h2 { font-size: 16px; margin: 0 0 8px; }
  .report-options p { margin: 0 0 24px; color: #33404d; }
  .report-diff {
    margin: 0;
    padding: 16px;
    border: 1px solid #d9dee6;
    border-radius: 10px;
    background: #f8fafc;
    font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    font-size: 13px;
    line-height: 1.55;
    white-space: pre-wrap;
    word-break: break-word;
    overflow-wrap: anywhere;
  }
  .report-diff span { display: block; padding: 0 6px; border-radius: 4px; }
  .r-equal { color: #33404d; }
  .r-del { background: #fdeeee; color: #9b1c1c; }
  .r-add { background: #eaf7ef; color: #166534; }
  .report-empty { color: #5c6670; }
  @media print {
    body { padding: 0; }
    .report { max-width: none; }
  }
`;

export function buildHtmlReport(result, state) {
  return `<!doctype html>
<html lang="${getLanguage()}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHTML(t('report.title'))}</title>
<style>${REPORT_CSS}</style>
</head>
<body>
${buildReportBody(result, state)}
</body>
</html>`;
}

export function buildPrintFragment(result, state) {
  return buildReportBody(result, state);
}

export function buildJsonReport(result, state) {
  return JSON.stringify(
    {
      title: t('report.title'),
      generatedAt: new Date().toISOString(),
      language: getLanguage(),
      options: { ...state.options },
      stats: { ...result.stats },
      similarity: result.similarity,
      counts: {
        originalLines: result.leftCount,
        modifiedLines: result.rightCount,
      },
      rows: result.rows.map((row) => ({
        type: row.type,
        originalLine: row.leftNo,
        modifiedLine: row.rightNo,
        original: row.leftText,
        modified: row.rightText,
      })),
    },
    null,
    2,
  );
}

export function download(filename, content, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

export function fileStamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, '0');
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
}
