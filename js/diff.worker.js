import { compareTexts } from './engine.js';

self.onmessage = (event) => {
  const { id, original, modified, options, granularity } = event.data || {};
  try {
    const result = compareTexts(original, modified, options, granularity);
    self.postMessage({ id, result });
  } catch (error) {
    self.postMessage({
      id,
      error: error && error.message ? error.message : String(error),
    });
  }
};
