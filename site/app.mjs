// Entry point: tab navigation and wiring between the pages.

import { notice, initSignButtons } from './ui.mjs';
import { initBudget, loadPlan, analyzePlan } from './budget.mjs';
import { initPlans, addPlan, renderPlans } from './plans.mjs';
import { initTools } from './tools.mjs';
import { initPrefs } from './prefs.mjs';

function showTab(id) {
  document.querySelectorAll('.page').forEach((e) => (e.hidden = e.id !== id));
  document.querySelectorAll('[data-tab]').forEach((e) => {
    if (e.dataset.tab === id) e.setAttribute('aria-current', 'page');
    else e.removeAttribute('aria-current');
  });
  if (id === 'plans') renderPlans();
}

document.querySelectorAll('[data-tab]').forEach((e) => (e.onclick = () => showTab(e.dataset.tab)));

initSignButtons();
initBudget({ addPlan });
initPlans({
  onOpen(plan, analyze) {
    loadPlan(plan);
    showTab('budget');
    if (analyze) analyzePlan(plan);
    else notice('Parameters loaded. Press Calculate to update the results.');
  },
});
initPrefs();
renderPlans();
initTools();
