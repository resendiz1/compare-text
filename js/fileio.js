export const ACCEPTED_EXTENSIONS = [
  '.txt',
  '.md',
  '.csv',
  '.html',
  '.htm',
  '.css',
  '.js',
  '.json',
];

const MAX_SIZE = 5 * 1024 * 1024;

export function extensionOf(name) {
  const index = String(name).lastIndexOf('.');
  return index === -1 ? '' : String(name).slice(index).toLowerCase();
}

export function isSupportedFile(file) {
  return Boolean(file) && ACCEPTED_EXTENSIONS.includes(extensionOf(file.name));
}

export function readTextFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('read-error'));
      return;
    }
    if (!isSupportedFile(file)) {
      reject(new Error('unsupported'));
      return;
    }
    if (file.size > MAX_SIZE) {
      reject(new Error('too-large'));
      return;
    }

    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ''));
    reader.onerror = () => reject(new Error('read-error'));
    reader.readAsText(file);
  });
}
