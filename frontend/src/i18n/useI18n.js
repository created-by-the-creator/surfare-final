import en from './en.json';
import tl from './tl.json';
import taglish from './taglish.json';

const translations = { en, tl, taglish };
const owns = (dictionary, key) => Object.prototype.hasOwnProperty.call(dictionary, key);

export function hasTranslation(lang, key) {
  return owns(translations[lang] ?? en, key) || owns(en, key);
}

export function translate(lang, key, values = {}) {
  const dictionary = translations[lang] ?? en;
  const inLanguage = owns(dictionary, key);
  const inEnglish = owns(en, key);
  if (!inLanguage && import.meta.env.DEV) {
    console.warn(`Missing "${lang}" translation for "${key}"; using a safe fallback.`);
  }
  const template = inLanguage ? dictionary[key] : inEnglish ? en[key] : en['fallback.missing'];
  return String(template).replace(/\{(\w+)\}/g, (_, name) => values[name] ?? '');
}

export function htmlLanguage(lang) {
  return lang === 'en' ? 'en' : 'fil';
}
