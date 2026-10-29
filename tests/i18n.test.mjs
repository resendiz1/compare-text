import test from 'node:test';
import assert from 'node:assert/strict';

import es from '../locales/es.js';
import en from '../locales/en.js';

test('Spanish and English dictionaries share the same keys', () => {
  const spanish = Object.keys(es).sort();
  const english = Object.keys(en).sort();
  assert.deepEqual(english, spanish);
});

test('every translation is a non-empty string', () => {
  for (const [key, value] of Object.entries({ ...es, ...en })) {
    assert.equal(typeof value, 'string', `translation ${key} is not a string`);
    assert.ok(value.length > 0, `translation ${key} is empty`);
  }
});

test('placeholders match between languages', () => {
  const placeholders = (value) =>
    [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

  for (const key of Object.keys(es)) {
    assert.deepEqual(
      placeholders(en[key]),
      placeholders(es[key]),
      `placeholder mismatch for ${key}`,
    );
  }
});
