// Interface language. Text is written in English in the code and the HTML, and looked up by that
// English text in the Traditional Chinese dictionary (gettext-style), so English needs no
// dictionary and a missing translation simply shows the English.

import { ZH_TW } from './strings-zh-TW.mjs';

export const LANGUAGES = { en: 'English', 'zh-TW': '繁體中文' };
const STORAGE_KEY = 'rf.lang';
const HTML_LANG = { en: 'en', 'zh-TW': 'zh-Hant-TW' };

function initialLanguage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved in LANGUAGES) return saved;
  } catch {}
  return /^zh\b/i.test(navigator.language ?? '') ? 'zh-TW' : 'en';
}

/** The page language; fixed for the page's lifetime (switching reloads). English outside a browser. */
export const lang = typeof window === 'undefined' ? 'en' : initialLanguage();
const dictionary = lang === 'zh-TW' ? ZH_TW : {};

/** Translates English text, then fills {name} placeholders from vars. */
export function t(text, vars = {}) {
  const out = dictionary[text] ?? text;
  return out.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Locale for dates and times. */
export const locale = HTML_LANG[lang];

/** Saves the choice; the caller reloads the page. */
export function saveLanguage(next) {
  try {
    localStorage.setItem(STORAGE_KEY, next);
  } catch {}
}

const normalize = (s) => s.replace(/\s+/g, ' ').trim();
// Inline formatting whose element is translated as a whole, markup included.
const isFormatting = (el) => ['SUB', 'SUP', 'BR', 'STRONG', 'EM', 'CODE'].includes(el.tagName) || (el.tagName === 'SPAN' && !el.id);
const SKIP = new Set(['MATH', 'SCRIPT', 'STYLE', 'TEXTAREA']);
const ATTRIBUTES = ['placeholder', 'aria-label', 'title'];

function translateElement(el) {
  if (SKIP.has(el.tagName.toUpperCase())) return;
  for (const name of ATTRIBUTES) {
    const value = el.getAttribute(name);
    if (value && dictionary[normalize(value)]) el.setAttribute(name, dictionary[normalize(value)]);
  }
  const children = [...el.childNodes];
  const mixed = children.some((n) => n.nodeType === 1 && isFormatting(n)) && children.some((n) => n.nodeType === 3 && n.textContent.trim());
  if (mixed) {
    const key = normalize(el.innerHTML);
    if (dictionary[key]) {
      el.innerHTML = dictionary[key];
      return;
    }
  }
  for (const node of children) {
    if (node.nodeType === 3) {
      const key = normalize(node.textContent);
      if (key && dictionary[key]) node.textContent = node.textContent.replace(key, dictionary[key]);
    } else if (node.nodeType === 1) {
      translateElement(node);
    }
  }
}

/** Translates the static page: text, mixed-markup elements, placeholders, labels and the title. */
export function translateDocument() {
  document.documentElement.lang = HTML_LANG[lang];
  if (lang === 'en') return;
  document.title = t(document.title);
  translateElement(document.body);
}

/**
 * For checking coverage: the static texts translateDocument would look up, as dictionary keys.
 * Run in English, e.g. from the browser console.
 */
export function collectDocumentTexts(root = document.body) {
  const found = new Set();
  const visit = (el) => {
    if (SKIP.has(el.tagName.toUpperCase())) return;
    for (const name of ATTRIBUTES) if (el.getAttribute(name)) found.add(normalize(el.getAttribute(name)));
    const children = [...el.childNodes];
    const mixed =
      children.some((n) => n.nodeType === 1 && isFormatting(n)) && children.some((n) => n.nodeType === 3 && n.textContent.trim());
    if (mixed) {
      found.add(normalize(el.innerHTML));
      return;
    }
    for (const node of children) {
      if (node.nodeType === 3 && normalize(node.textContent)) found.add(normalize(node.textContent));
      else if (node.nodeType === 1) visit(node);
    }
  };
  visit(root);
  return [...found];
}
