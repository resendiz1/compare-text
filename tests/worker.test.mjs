import test from 'node:test';
import assert from 'node:assert/strict';

const messages = [];
globalThis.self = {
  postMessage(message) {
    messages.push(message);
  },
};

await import('../js/diff.worker.js');

const options = {
  ignoreCase: false,
  ignoreExtraSpaces: false,
  ignoreLeadingTrailing: false,
  ignoreBlankLines: false,
  exact: false,
};

test('worker returns a comparison result', () => {
  messages.length = 0;
  globalThis.self.onmessage({
    data: {
      id: 9,
      original: 'a\n',
      modified: 'a\nb\n',
      options,
      granularity: 'word',
    },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 9);
  assert.equal(messages[0].result.stats.added, 1);
  assert.equal(messages[0].result.identical, false);
  assert.equal(messages[0].error, undefined);
});

test('worker reports comparison errors without throwing', () => {
  messages.length = 0;
  const brokenOptions = Object.defineProperty({}, 'ignoreCase', {
    get() {
      throw new Error('broken options');
    },
  });
  globalThis.self.onmessage({
    data: {
      id: 10,
      original: 'a\n',
      modified: 'b\n',
      options: brokenOptions,
      granularity: 'word',
    },
  });

  assert.equal(messages.length, 1);
  assert.equal(messages[0].id, 10);
  assert.equal(typeof messages[0].error, 'string');
});
