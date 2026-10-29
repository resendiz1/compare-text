import test from 'node:test';
import assert from 'node:assert/strict';

import {
  diffLines,
  inlineDiff,
  lineSimilarity,
  splitLines,
} from '../js/diff.js';
import { compareTexts, normalizeLine } from '../js/engine.js';

const DEFAULT_OPTIONS = {
  ignoreCase: false,
  ignoreExtraSpaces: false,
  ignoreLeadingTrailing: false,
  ignoreBlankLines: false,
  exact: false,
};

function lcsLength(a, b) {
  const width = b.length + 1;
  const dp = new Uint32Array((a.length + 1) * width);
  for (let i = 1; i <= a.length; i += 1) {
    for (let j = 1; j <= b.length; j += 1) {
      dp[i * width + j] =
        a[i - 1] === b[j - 1]
          ? dp[(i - 1) * width + (j - 1)] + 1
          : Math.max(dp[(i - 1) * width + j], dp[i * width + (j - 1)]);
    }
  }
  return dp[a.length * width + b.length];
}

function reconstruct(a, b, ops) {
  const left = [];
  const right = [];
  for (const op of ops) {
    if (op.type !== 'insert') {
      assert.ok(op.aIndex >= 0 && op.aIndex < a.length);
      left.push(a[op.aIndex]);
    }
    if (op.type !== 'delete') {
      assert.ok(op.bIndex >= 0 && op.bIndex < b.length);
      right.push(b[op.bIndex]);
    }
  }
  return { left, right };
}

function randomArray(seed, maxLength) {
  let value = seed;
  const next = () => {
    value = (value * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  };
  const length = Math.floor(next() * (maxLength + 1));
  const result = [];
  for (let i = 0; i < length; i += 1) {
    result.push(String.fromCharCode(97 + Math.floor(next() * 5)));
  }
  return result;
}

test('splitLines handles empty text, trailing newlines and CRLF', () => {
  assert.deepEqual(splitLines(''), []);
  assert.deepEqual(splitLines('a'), ['a']);
  assert.deepEqual(splitLines('a\n'), ['a']);
  assert.deepEqual(splitLines('a\r\nb\r\n'), ['a', 'b']);
  assert.deepEqual(splitLines('\n'), ['']);
  assert.deepEqual(splitLines('a\n\n'), ['a', '']);
});

test('diffLines reconstructs both sides and keeps minimal equality', () => {
  for (let seed = 1; seed <= 60; seed += 1) {
    const a = randomArray(seed, 9);
    const b = randomArray(seed * 7 + 3, 9);
    const ops = diffLines(a, b);
    const { left, right } = reconstruct(a, b, ops);
    assert.deepEqual(left, a);
    assert.deepEqual(right, b);

    const equalCount = ops.filter((op) => op.type === 'equal').length;
    assert.equal(equalCount, lcsLength(a, b));
  }
});

test('diffLines detects pure insertions and deletions', () => {
  const inserted = diffLines(['a', 'c'], ['a', 'b', 'c']);
  assert.deepEqual(
    inserted.filter((op) => op.type !== 'equal').map((op) => op.type),
    ['insert'],
  );

  const deleted = diffLines(['a', 'b', 'c'], ['a', 'c']);
  assert.deepEqual(
    deleted.filter((op) => op.type !== 'equal').map((op) => op.type),
    ['delete'],
  );
});

test('normalizeLine applies comparison options', () => {
  assert.equal(
    normalizeLine('  Hello   World  ', {
      exact: false,
      ignoreCase: true,
      ignoreExtraSpaces: true,
      ignoreLeadingTrailing: true,
    }),
    'hello world',
  );
  assert.equal(
    normalizeLine('  Hello   World  ', {
      exact: true,
      ignoreCase: true,
      ignoreExtraSpaces: true,
      ignoreLeadingTrailing: true,
    }),
    '  Hello   World  ',
  );
  assert.equal(
    normalizeLine('a  b', {
      exact: false,
      ignoreCase: false,
      ignoreExtraSpaces: true,
      ignoreLeadingTrailing: false,
    }),
    'a b',
  );
});

test('compareTexts marks added, deleted, modified and unchanged lines', () => {
  const result = compareTexts(
    'one\ntwo\nthree\n',
    'one\nTWO\nthree\nfour\n',
    DEFAULT_OPTIONS,
    'word',
  );

  assert.deepEqual(result.stats, {
    added: 1,
    deleted: 0,
    modified: 1,
    unchanged: 2,
  });
  assert.equal(result.identical, false);
  assert.equal(result.oneEmpty, false);
  assert.equal(result.bothEmpty, false);
  assert.ok(result.similarity > 0 && result.similarity < 100);

  const modified = result.rows.find((row) => row.type === 'modify');
  assert.ok(modified);
  assert.match(modified.leftHTML, /inline-del/);
  assert.match(modified.rightHTML, /inline-add/);
});

test('compareTexts reports empty and identical states', () => {
  const empty = compareTexts('', '', DEFAULT_OPTIONS, 'word');
  assert.equal(empty.bothEmpty, true);
  assert.equal(empty.similarity, 100);
  assert.equal(empty.rows.length, 0);

  const oneEmpty = compareTexts('a\n', '', DEFAULT_OPTIONS, 'word');
  assert.equal(oneEmpty.oneEmpty, true);
  assert.equal(oneEmpty.similarity, 0);

  const identical = compareTexts('a\nb\n', 'a\nb\n', DEFAULT_OPTIONS, 'word');
  assert.equal(identical.identical, true);
  assert.equal(identical.similarity, 100);
});

test('comparison options ignore case, spaces and blank lines', () => {
  const ignoreCase = compareTexts(
    'Hello World\n',
    'hello world\n',
    { ...DEFAULT_OPTIONS, ignoreCase: true },
    'word',
  );
  assert.equal(ignoreCase.identical, true);

  const ignoreSpaces = compareTexts(
    '  a   b  \n',
    'a b\n',
    {
      ...DEFAULT_OPTIONS,
      ignoreExtraSpaces: true,
      ignoreLeadingTrailing: true,
    },
    'word',
  );
  assert.equal(ignoreSpaces.identical, true);

  const ignoreBlank = compareTexts(
    'a\n\nb\n',
    'a\nb\n',
    { ...DEFAULT_OPTIONS, ignoreBlankLines: true },
    'word',
  );
  assert.equal(ignoreBlank.identical, true);
  assert.deepEqual(
    ignoreBlank.rows.map((row) => [row.leftNo, row.rightNo]),
    [
      [1, 1],
      [3, 2],
    ],
  );

  const exact = compareTexts(
    'a b\n',
    'a  b\n',
    { ...DEFAULT_OPTIONS, ignoreExtraSpaces: true, exact: true },
    'word',
  );
  assert.equal(exact.identical, false);
  assert.equal(exact.stats.modified, 1);
});

test('inlineDiff highlights only changed words or characters', () => {
  const word = inlineDiff('hello world', 'hello brave world', 'word');
  assert.equal(word.leftHTML, 'hello world');
  assert.match(word.rightHTML, /inline-add/);
  assert.match(word.rightHTML, /brave/);

  const character = inlineDiff('cat', 'cut', 'char');
  assert.match(character.leftHTML, /inline-del/);
  assert.match(character.rightHTML, /inline-add/);

  const none = inlineDiff('a', 'b', 'none');
  assert.equal(none.leftHTML, 'a');
  assert.equal(none.rightHTML, 'b');
});

test('lineSimilarity ranks close lines above unrelated ones', () => {
  assert.equal(lineSimilarity('same text', 'same text'), 1);
  assert.ok(
    lineSimilarity('the quick brown fox', 'the quick red fox') >
      lineSimilarity('the quick brown fox', 'completely unrelated'),
  );
});
