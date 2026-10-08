// Entry point: language, tab navigation and wiring between the pages.

import { notice, initSignButtons } from './ui.mjs';
import { t, lang, saveLanguage, translateDocument } from './i18n.mjs';
import { initBudget, loadPlan, analyzePlan, currentSnapshot, showCalculation } from './budget.mjs';
import { initPlans, addPlan, renderPlans } from './plans.mjs';
import { initTools } from './tools.mjs';
import { initPrefs } from './prefs.mjs';

// Switching language reloads the page; this carries the open tab, scroll position and current
// calculation across the reload.
const SWITCH_KEY = 'rf.languageSwitch';
let currentTab = 'budget';

function showTab(id) {
  currentTab = id;
  document.querySelectorAll('.page').forEach((e) => (e.hidden = e.id !== id));
  document.querySelectorAll('[data-tab]').forEach((e) => {
    if (e.dataset.tab === id) e.setAttribute('aria-current', 'page');
    else e.removeAttribute('aria-current');
  });
  if (id === 'plans') renderPlans();
}

function switchLanguage(next) {
  try {
    sessionStorage.setItem(
      SWITCH_KEY,
      JSON.stringify({ tab: currentTab, scrollY: window.scrollY, snapshot: currentSnapshot() }),
    );
  } catch {}
  saveLanguage(next);
  location.reload();
}

function restoreAfterSwitch() {
  let state = null;
  try {
    state = JSON.parse(sessionStorage.getItem(SWITCH_KEY));
    sessionStorage.removeItem(SWITCH_KEY);
  } catch {}
  if (!state) return;
  if (state.snapshot) showCalculation(state.snapshot);
  showTab(state.tab ?? 'budget');
  window.scrollTo(0, state.scrollY ?? 0);
}

translateDocument();
document.getElementById('language').value = lang;
document.getElementById('language').onchange = (e) => switchLanguage(e.target.value);

document.querySelectorAll('[data-tab]').forEach((e) => (e.onclick = () => showTab(e.dataset.tab)));

initSignButtons();
initBudget({ addPlan });
initPlans({
  onOpen(plan, analyze) {
    loadPlan(plan);
    showTab('budget');
    if (analyze) analyzePlan(plan);
    else notice(t('Parameters loaded and calculated.'));
  },
});
initPrefs();
renderPlans();
initTools();
restoreAfterSwitch();
// The inline script in index.html hides the page until the static text is translated.
document.documentElement.classList.remove('i18n-pending');
