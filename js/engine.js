import {
  diffLines,
  escapeHTML,
  inlineDiff,
  lineSimilarity,
  splitLines,
} from './diff.js';

const ALIGN_THRESHOLD = 320;
const ALIGN_MAX_CELLS = 20000;

export function normalizeLine(line, options) {
  if (options.exact) return line;
  let value = line;
  if (options.ignoreLeadingTrailing) value = value.trim();
  if (options.ignoreExtraSpaces) value = value.replace(/[^\S\r\n]+/g, ' ');
  if (options.ignoreCase) value = value.toLowerCase();
  return value;
}

function buildEntries(text, options) {
  const lines = splitLines(text);
  const entries = [];
  for (let index = 0; index < lines.length; index += 1) {
    const raw = lines[index];
    if (options.ignoreBlankLines && raw.trim() === '') continue;
    entries.push({
      raw,
      no: index + 1,
      norm: normalizeLine(raw, options),
    });
  }
  return entries;
}

function makeRow(type, left, right, granularity, similarity = 0) {
  const row = {
    type,
    left: left || null,
    right: right || null,
    leftNo: left ? left.no : null,
    rightNo: right ? right.no : null,
    leftText: left ? left.raw : '',
    rightText: right ? right.raw : '',
    leftHTML: '',
    rightHTML: '',
    hunk: null,
    similarity,
  };

  if (type === 'equal') {
    row.leftHTML = escapeHTML(row.leftText);
    row.rightHTML = escapeHTML(row.rightText);
  } else if (type === 'delete') {
    row.leftHTML = escapeHTML(row.leftText);
  } else if (type === 'insert') {
    row.rightHTML = escapeHTML(row.rightText);
  } else {
    const inline = inlineDiff(row.leftText, row.rightText, granularity);
    row.leftHTML = inline.leftHTML;
    row.rightHTML = inline.rightHTML;
    row.inlineLimited = inline.limited;
  }

  return row;
}

function alignChangeBlock(deletions, insertions, granularity) {
  const n = deletions.length;
  const m = insertions.length;

  if (n === 0) {
    return insertions.map((entry) => makeRow('insert', null, entry, granularity));
  }
  if (m === 0) {
    return deletions.map((entry) => makeRow('delete', entry, null, granularity));
  }

  const pairs = [];

  if (n * m <= ALIGN_MAX_CELLS) {
    const scores = new Int32Array(n * m);
    for (let i = 0; i < n; i += 1) {
      for (let j = 0; j < m; j += 1) {
        scores[i * m + j] = Math.round(
          lineSimilarity(deletions[i].norm, insertions[j].norm) * 1000,
        );
      }
    }

    const width = m + 1;
    const dp = new Int32Array((n + 1) * width);
    const NEGATIVE = -1000000000;

    for (let i = 1; i <= n; i += 1) {
      for (let j = 1; j <= m; j += 1) {
        const score = scores[(i - 1) * m + (j - 1)];
        const pair =
          score >= ALIGN_THRESHOLD
            ? dp[(i - 1) * width + (j - 1)] + (score - ALIGN_THRESHOLD)
            : NEGATIVE;
        const remove = dp[(i - 1) * width + j];
        const add = dp[i * width + (j - 1)];
        dp[i * width + j] = Math.max(pair, remove, add);
      }
    }

    let i = n;
    let j = m;
    while (i > 0 && j > 0) {
      const score = scores[(i - 1) * m + (j - 1)];
      const pair =
        score >= ALIGN_THRESHOLD
          ? dp[(i - 1) * width + (j - 1)] + (score - ALIGN_THRESHOLD)
          : NEGATIVE;
      if (pair === dp[i * width + j] && score >= ALIGN_THRESHOLD) {
        pairs.push([i - 1, j - 1, score / 1000]);
        i -= 1;
        j -= 1;
      } else if (dp[(i - 1) * width + j] === dp[i * width + j]) {
        i -= 1;
      } else {
        j -= 1;
      }
    }
    pairs.reverse();
  } else {
    const limit = Math.min(n, m);
    for (let index = 0; index < limit; index += 1) {
      const score = lineSimilarity(deletions[index].norm, insertions[index].norm);
      if (score * 1000 >= ALIGN_THRESHOLD) {
        pairs.push([index, index, score]);
      }
    }
  }

  if (pairs.length === 0 && n === m) {
    for (let index = 0; index < n; index += 1) {
      pairs.push([
        index,
        index,
        lineSimilarity(deletions[index].norm, insertions[index].norm),
      ]);
    }
  }

  const rows = [];
  let deletedIndex = 0;
  let insertedIndex = 0;

  for (const [di, ii, similarity] of pairs) {
    while (deletedIndex < di) {
      rows.push(makeRow('delete', deletions[deletedIndex], null, granularity));
      deletedIndex += 1;
    }
    while (insertedIndex < ii) {
      rows.push(makeRow('insert', null, insertions[insertedIndex], granularity));
      insertedIndex += 1;
    }
    rows.push(
      makeRow(
        'modify',
        deletions[deletedIndex],
        insertions[insertedIndex],
        granularity,
        similarity,
      ),
    );
    deletedIndex += 1;
    insertedIndex += 1;
  }

  while (deletedIndex < n) {
    rows.push(makeRow('delete', deletions[deletedIndex], null, granularity));
    deletedIndex += 1;
  }
  while (insertedIndex < m) {
    rows.push(makeRow('insert', null, insertions[insertedIndex], granularity));
    insertedIndex += 1;
  }

  return rows;
}

function buildRows(ops, leftEntries, rightEntries, granularity) {
  const rows = [];
  let index = 0;

  while (index < ops.length) {
    const op = ops[index];
    if (op.type === 'equal') {
      rows.push(
        makeRow(
          'equal',
          leftEntries[op.aIndex],
          rightEntries[op.bIndex],
          granularity,
          1,
        ),
      );
      index += 1;
      continue;
    }

    const deletions = [];
    const insertions = [];
    while (index < ops.length && ops[index].type !== 'equal') {
      const current = ops[index];
      if (current.type === 'delete') deletions.push(leftEntries[current.aIndex]);
      else insertions.push(rightEntries[current.bIndex]);
      index += 1;
    }
    rows.push(...alignChangeBlock(deletions, insertions, granularity));
  }

  return rows;
}

function assignHunks(rows) {
  const hunks = [];
  let current = null;

  for (const row of rows) {
    if (row.type === 'equal') {
      row.hunk = null;
      current = null;
      continue;
    }

    if (!current) {
      current = {
        id: hunks.length + 1,
        added: 0,
        deleted: 0,
        modified: 0,
      };
      hunks.push(current);
    }

    row.hunk = current.id;
    if (row.type === 'insert') current.added += 1;
    else if (row.type === 'delete') current.deleted += 1;
    else current.modified += 1;
  }

  return hunks;
}

function computeStats(rows) {
  const stats = { added: 0, deleted: 0, modified: 0, unchanged: 0 };
  for (const row of rows) {
    if (row.type === 'insert') stats.added += 1;
    else if (row.type === 'delete') stats.deleted += 1;
    else if (row.type === 'modify') stats.modified += 1;
    else stats.unchanged += 1;
  }
  return stats;
}

function computeSimilarity(rows, leftCount, rightCount, bothEmpty) {
  if (bothEmpty) return 100;
  const total = leftCount + rightCount;
  if (total === 0) {
    return rows.some((row) => row.type !== 'equal') ? 0 : 100;
  }

  let matched = 0;
  for (const row of rows) {
    if (row.type === 'equal') matched += 2;
    else if (row.type === 'modify') matched += row.similarity * 2;
  }

  return Math.max(0, Math.min(100, Math.round((matched / total) * 100)));
}

export function compareTexts(original, modified, options, granularity = 'word') {
  const safeOptions = {
    ignoreCase: Boolean(options && options.ignoreCase),
    ignoreExtraSpaces: Boolean(options && options.ignoreExtraSpaces),
    ignoreLeadingTrailing: Boolean(options && options.ignoreLeadingTrailing),
    ignoreBlankLines: Boolean(options && options.ignoreBlankLines),
    exact: Boolean(options && options.exact),
  };

  const leftEntries = buildEntries(original, safeOptions);
  const rightEntries = buildEntries(modified, safeOptions);

  const ops = diffLines(
    leftEntries.map((entry) => entry.norm),
    rightEntries.map((entry) => entry.norm),
  );

  const rows = buildRows(ops, leftEntries, rightEntries, granularity);
  const hunks = assignHunks(rows);
  const stats = computeStats(rows);
  const bothEmpty = original === '' && modified === '';
  const oneEmpty = (original === '') !== (modified === '');
  const hasChanges = stats.added + stats.deleted + stats.modified > 0;
  const similarity = computeSimilarity(
    rows,
    leftEntries.length,
    rightEntries.length,
    bothEmpty,
  );

  return {
    rows,
    hunks,
    stats,
    similarity,
    leftCount: leftEntries.length,
    rightCount: rightEntries.length,
    bothEmpty,
    oneEmpty,
    identical: !bothEmpty && !oneEmpty && !hasChanges,
    hasChanges,
    options: safeOptions,
    granularity,
  };
}
