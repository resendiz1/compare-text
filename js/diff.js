const WORD_PATTERN = /\s+|[\p{L}\p{N}_]+|[^\s\p{L}\p{N}_]+/gu;

export function escapeHTML(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function splitLines(text) {
  if (text === '') return [];
  const normalized = String(text).replace(/\r\n?/g, '\n');
  const lines = normalized.split('\n');
  if (normalized.endsWith('\n')) lines.pop();
  return lines;
}

export function tokenizeWords(text) {
  return String(text).match(WORD_PATTERN) || [];
}

function pushEqual(ops, aIndex, bIndex) {
  ops.push({ type: 'equal', aIndex, bIndex });
}

function pushDelete(ops, aIndex) {
  ops.push({ type: 'delete', aIndex, bIndex: null });
}

function pushInsert(ops, bIndex) {
  ops.push({ type: 'insert', aIndex: null, bIndex });
}

export function diffLines(a, b, eq = (x, y) => x === y) {
  const ops = [];

  function walk(a0, a1, b0, b1, depth) {
    while (a0 < a1 && b0 < b1 && eq(a[a0], b[b0])) {
      pushEqual(ops, a0, b0);
      a0 += 1;
      b0 += 1;
    }

    let suffix = 0;
    while (
      a0 < a1 - suffix &&
      b0 < b1 - suffix &&
      eq(a[a1 - 1 - suffix], b[b1 - 1 - suffix])
    ) {
      suffix += 1;
    }

    const ae = a1 - suffix;
    const be = b1 - suffix;

    if (a0 === ae) {
      for (let j = b0; j < be; j += 1) pushInsert(ops, j);
    } else if (b0 === be) {
      for (let i = a0; i < ae; i += 1) pushDelete(ops, i);
    } else {
      const middle = diffRange(a, b, a0, ae, b0, be, eq, depth);
      for (const op of middle) ops.push(op);
    }

    for (let k = 0; k < suffix; k += 1) pushEqual(ops, ae + k, be + k);
  }

  walk(0, a.length, 0, b.length, 0);
  return ops;
}

function diffRange(a, b, a0, a1, b0, b1, eq, depth) {
  const n = a1 - a0;
  const m = b1 - b0;

  if (n === 0) {
    const ops = [];
    for (let j = b0; j < b1; j += 1) pushInsert(ops, j);
    return ops;
  }
  if (m === 0) {
    const ops = [];
    for (let i = a0; i < a1; i += 1) pushDelete(ops, i);
    return ops;
  }

  if (n + m <= 1200) {
    return myersRange(a, b, a0, a1, b0, b1, eq);
  }

  if (n * m <= 4000000) {
    return lcsRange(a, b, a0, a1, b0, b1, eq);
  }

  const anchors = patienceAnchors(a, b, a0, a1, b0, b1);
  if (anchors.length > 0) {
    const ops = [];
    let ai = a0;
    let bi = b0;
    for (const [i, j] of anchors) {
      ops.push(...diffRange(a, b, ai, i, bi, j, eq, depth + 1));
      pushEqual(ops, i, j);
      ai = i + 1;
      bi = j + 1;
    }
    ops.push(...diffRange(a, b, ai, a1, bi, b1, eq, depth + 1));
    return ops;
  }

  if (depth < 400) {
    const anchor = closestCommonAnchor(a, b, a0, a1, b0, b1);
    if (anchor) {
      const [i, j] = anchor;
      const hasLeft = i > a0 || j > b0;
      const hasRight = i < a1 - 1 || j < b1 - 1;
      if (hasLeft || hasRight) {
        const ops = [];
        ops.push(...diffRange(a, b, a0, i, b0, j, eq, depth + 1));
        pushEqual(ops, i, j);
        ops.push(...diffRange(a, b, i + 1, a1, j + 1, b1, eq, depth + 1));
        return ops;
      }
    }
  }

  const ops = [];
  for (let i = a0; i < a1; i += 1) pushDelete(ops, i);
  for (let j = b0; j < b1; j += 1) pushInsert(ops, j);
  return ops;
}

function myersRange(a, b, a0, a1, b0, b1, eq) {
  const n = a1 - a0;
  const m = b1 - b0;
  const max = n + m;
  const offset = max + 1;
  const size = 2 * max + 3;
  const v = new Int32Array(size);
  const trace = [];
  let depth = 0;
  let found = false;

  for (let d = 0; d <= max; d += 1) {
    trace.push(v.slice());
    for (let k = -d; k <= d; k += 2) {
      let x;
      if (k === -d || (k !== d && v[k - 1 + offset] < v[k + 1 + offset])) {
        x = v[k + 1 + offset];
      } else {
        x = v[k - 1 + offset] + 1;
      }
      let y = x - k;
      while (x < n && y < m && eq(a[a0 + x], b[b0 + y])) {
        x += 1;
        y += 1;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) {
        depth = d;
        found = true;
        break;
      }
    }
    if (found) break;
  }

  let x = n;
  let y = m;
  const ops = [];

  for (let d = depth; d >= 0; d -= 1) {
    const vd = trace[d];
    const k = x - y;
    let prevK;
    if (k === -d || (k !== d && vd[k - 1 + offset] < vd[k + 1 + offset])) {
      prevK = k + 1;
    } else {
      prevK = k - 1;
    }
    const prevX = vd[prevK + offset];
    const prevY = prevX - prevK;

    while (x > prevX && y > prevY) {
      ops.push({ type: 'equal', aIndex: a0 + x - 1, bIndex: b0 + y - 1 });
      x -= 1;
      y -= 1;
    }

    if (d > 0) {
      if (x === prevX) {
        ops.push({ type: 'insert', aIndex: null, bIndex: b0 + y - 1 });
        y = prevY;
      } else {
        ops.push({ type: 'delete', aIndex: a0 + x - 1, bIndex: null });
        x = prevX;
      }
    }
  }

  return ops.reverse();
}

function lcsRange(a, b, a0, a1, b0, b1, eq) {
  const n = a1 - a0;
  const m = b1 - b0;
  const width = m + 1;
  const dp = new Uint32Array((n + 1) * width);

  for (let i = 1; i <= n; i += 1) {
    const ai = a0 + i - 1;
    for (let j = 1; j <= m; j += 1) {
      if (eq(a[ai], b[b0 + j - 1])) {
        dp[i * width + j] = dp[(i - 1) * width + (j - 1)] + 1;
      } else {
        const up = dp[(i - 1) * width + j];
        const left = dp[i * width + (j - 1)];
        dp[i * width + j] = up >= left ? up : left;
      }
    }
  }

  const ops = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (eq(a[a0 + i - 1], b[b0 + j - 1])) {
      ops.push({ type: 'equal', aIndex: a0 + i - 1, bIndex: b0 + j - 1 });
      i -= 1;
      j -= 1;
    } else if (dp[(i - 1) * width + j] >= dp[i * width + (j - 1)]) {
      ops.push({ type: 'delete', aIndex: a0 + i - 1, bIndex: null });
      i -= 1;
    } else {
      ops.push({ type: 'insert', aIndex: null, bIndex: b0 + j - 1 });
      j -= 1;
    }
  }
  while (i > 0) {
    ops.push({ type: 'delete', aIndex: a0 + i - 1, bIndex: null });
    i -= 1;
  }
  while (j > 0) {
    ops.push({ type: 'insert', aIndex: null, bIndex: b0 + j - 1 });
    j -= 1;
  }
  return ops.reverse();
}

function longestIncreasingSubsequence(pairs) {
  if (pairs.length === 0) return [];
  const tails = [];
  const tailIndices = [];
  const previous = new Int32Array(pairs.length).fill(-1);

  for (let k = 0; k < pairs.length; k += 1) {
    const value = pairs[k][1];
    let lo = 0;
    let hi = tails.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (tails[mid] < value) lo = mid + 1;
      else hi = mid;
    }
    if (lo === tails.length) {
      tails.push(value);
      tailIndices.push(k);
    } else {
      tails[lo] = value;
      tailIndices[lo] = k;
    }
    if (lo > 0) previous[k] = tailIndices[lo - 1];
  }

  const result = [];
  let k = tailIndices[tailIndices.length - 1];
  while (k !== -1) {
    result.push(pairs[k]);
    k = previous[k];
  }
  return result.reverse();
}

function patienceAnchors(a, b, a0, a1, b0, b1) {
  const countA = new Map();
  const countB = new Map();

  for (let i = a0; i < a1; i += 1) {
    countA.set(a[i], (countA.get(a[i]) || 0) + 1);
  }
  for (let j = b0; j < b1; j += 1) {
    countB.set(b[j], (countB.get(b[j]) || 0) + 1);
  }

  const positionB = new Map();
  for (let j = b0; j < b1; j += 1) {
    const value = b[j];
    if (countB.get(value) === 1) positionB.set(value, j);
  }

  const pairs = [];
  for (let i = a0; i < a1; i += 1) {
    const value = a[i];
    if (countA.get(value) === 1 && positionB.has(value)) {
      pairs.push([i, positionB.get(value)]);
    }
  }

  if (pairs.length <= 1) return pairs;
  return longestIncreasingSubsequence(pairs);
}

function closestCommonAnchor(a, b, a0, a1, b0, b1) {
  const positionB = new Map();
  for (let j = b0; j < b1; j += 1) {
    if (!positionB.has(b[j])) positionB.set(b[j], j);
  }

  let best = null;
  let bestDistance = Infinity;
  for (let i = a0; i < a1; i += 1) {
    if (!positionB.has(a[i])) continue;
    const j = positionB.get(a[i]);
    const distance = Math.abs((i - a0) - (j - b0));
    if (distance < bestDistance) {
      bestDistance = distance;
      best = [i, j];
      if (distance === 0) break;
    }
  }
  return best;
}

function bigramCounts(text) {
  const counts = new Map();
  if (text.length === 0) return counts;
  if (text.length === 1) {
    counts.set(text, 1);
    return counts;
  }
  for (let i = 0; i < text.length - 1; i += 1) {
    const gram = text.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) || 0) + 1);
  }
  return counts;
}

export function lineSimilarity(a, b) {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const countsA = bigramCounts(a);
  const countsB = bigramCounts(b);
  let intersection = 0;
  let total = 0;

  for (const [gram, count] of countsA) {
    total += count;
    const other = countsB.get(gram);
    if (other) intersection += Math.min(count, other);
  }
  for (const count of countsB.values()) total += count;

  if (total === 0) return 0;
  return (2 * intersection) / total;
}

function inlineFallback(left, right) {
  return { leftHTML: escapeHTML(left), rightHTML: escapeHTML(right), limited: true };
}

export function inlineDiff(left, right, granularity) {
  if (granularity !== 'word' && granularity !== 'char') {
    return { leftHTML: escapeHTML(left), rightHTML: escapeHTML(right), limited: false };
  }
  if (left === right) {
    return { leftHTML: escapeHTML(left), rightHTML: escapeHTML(right), limited: false };
  }

  const charMode = granularity === 'char';
  const maxLength = charMode ? 1600 : 6000;
  if (left.length > maxLength || right.length > maxLength) {
    return inlineFallback(left, right);
  }

  const leftTokens = charMode ? Array.from(left) : tokenizeWords(left);
  const rightTokens = charMode ? Array.from(right) : tokenizeWords(right);

  if (leftTokens.length + rightTokens.length > 4000) {
    return inlineFallback(left, right);
  }

  const ops = diffLines(leftTokens, rightTokens);
  let leftHTML = '';
  let rightHTML = '';

  for (const op of ops) {
    if (op.type === 'equal') {
      const token = leftTokens[op.aIndex];
      leftHTML += escapeHTML(token);
      rightHTML += escapeHTML(token);
    } else if (op.type === 'delete') {
      leftHTML += `<span class="inline-del">${escapeHTML(leftTokens[op.aIndex])}</span>`;
    } else {
      rightHTML += `<span class="inline-add">${escapeHTML(rightTokens[op.bIndex])}</span>`;
    }
  }

  return { leftHTML, rightHTML, limited: false };
}
