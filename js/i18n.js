import es from '../locales/es.js';
import en from '../locales/en.js';

const dictionaries = { es, en };
const locales = { es: 'es-ES', en: 'en-US' };

let currentLanguage = 'es';

export function getLanguage() {
  return currentLanguage;
}

export function setLanguage(language) {
  currentLanguage = dictionaries[language] ? language : 'es';
  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLanguage;
  }
  return currentLanguage;
}

export function getLocale() {
  return locales[currentLanguage] || locales.es;
}

export function t(key, params) {
  const dictionary = dictionaries[currentLanguage] || dictionaries.es;
  let value = dictionary[key];
  if (value === undefined) value = dictionaries.es[key];
  if (value === undefined) return key;
  if (params) {
    value = value.replace(/\{(\w+)\}/g, (match, name) =>
      params[name] === undefined ? match : String(params[name]),
    );
  }
  return value;
}

export function applyTranslations(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = t(element.dataset.i18n);
  });

  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', t(element.dataset.i18nPlaceholder));
  });

  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    const value = t(element.dataset.i18nTitle);
    element.setAttribute('title', value);
    if (!element.hasAttribute('aria-label')) {
      element.setAttribute('aria-label', value);
    }
  });

  root.querySelectorAll('[data-i18n-aria-label]').forEach((element) => {
    element.setAttribute('aria-label', t(element.dataset.i18nAriaLabel));
  });

  if (typeof document !== 'undefined') {
    document.documentElement.lang = currentLanguage;
    document.title = t('app.title');
  }
}
