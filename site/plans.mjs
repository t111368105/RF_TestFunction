// Saved Plans page: list, delete and two-plan comparison. Plans live in localStorage.

import { labels, budget, validPlan, upgradePlan } from './calculations.mjs';
import { $, esc, fmt, notice, read, write, table } from './ui.mjs';

let plans = [];
let selected = []; // Ids of the plans chosen for comparison (at most two).

function store(next) {
  if (!write('rf.plans', next)) return false;
  plans = next;
  return true;
}

/** Adds a plan to the top of the list; returns false when storage fails. */
export function addPlan(p) {
  if (!store([p, ...plans])) return false;
  renderPlans();
  return true;
}

function planHtml(p) {
  const r = budget(p.values);
  const id = esc(p.id);
  return (
    '<article><label class="plan-title">' +
    `<input type="checkbox" data-select="${id}" ${selected.includes(p.id) ? 'checked' : ''}>${esc(p.name)}</label>` +
    `<p class="hint">${esc(new Date(p.date).toLocaleString())}</p>` +
    `<p>Receiver input ${fmt(r.output)} dBm · margin ${fmt(r.margin)} dB</p>` +
    '<div class="actions">' +
    `<button data-load="${id}">Load Parameters</button>` +
    `<button data-view="${id}">Analyze / Export</button>` +
    `<button data-delete="${id}">Delete</button>` +
    '</div></article>'
  );
}

function comparisonHtml(a, b) {
  const ra = budget(a.values);
  const rb = budget(b.values);
  const rows = [
    ...labels.map((l, i) => [l, fmt(a.values[i], 7), fmt(b.values[i], 7)]),
    ['Receiver input (dBm)', fmt(ra.output), fmt(rb.output)],
    ['Link margin (dB)', fmt(ra.margin), fmt(rb.margin)],
  ];
  return (
    '<article><h3>Plan Comparison: A → B</h3>' +
    table(['Parameter', 'A: ' + a.name, 'B: ' + b.name], rows) +
    `<p>Δ Receiver input (B − A): ${fmt(rb.output - ra.output)} dB<br>` +
    `Δ Margin (B − A): ${fmt(rb.margin - ra.margin)} dB</p></article>`
  );
}

export function renderPlans() {
  $('count').textContent = plans.length;
  $('plan-list').innerHTML = plans.length
    ? plans.map(planHtml).join('')
    : '<article><h3>No saved plans yet</h3>' +
      '<p>Calculate a link first, then save a named plan from the analysis section.</p></article>';
  const pair = selected.map((id) => plans.find((p) => p.id === id)).filter(Boolean);
  $('comparison').innerHTML = pair.length === 2 ? comparisonHtml(...pair) : '';
}

function onSelect(e) {
  const id = e.target.dataset.select;
  if (!id) return;
  if (e.target.checked) {
    if (selected.length >= 2) {
      e.target.checked = false;
      notice('Select at most two plans.');
      return;
    }
    selected.push(id);
  } else {
    selected = selected.filter((x) => x !== id);
  }
  renderPlans();
}

/** onOpen(plan, analyze) is called for "Load Parameters" (false) and "Analyze / Export" (true). */
export function initPlans({ onOpen }) {
  const saved = read('rf.plans', []);
  plans = Array.isArray(saved) ? saved.map(upgradePlan).filter(validPlan) : [];

  $('plan-list').onchange = onSelect;
  $('plan-list').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const id = b.dataset.load ?? b.dataset.view ?? b.dataset.delete;
    const p = plans.find((x) => x.id === id);
    if (!p) return;
    if (b.dataset.delete) {
      if (!confirm(`Delete "${p.name}"?`)) return;
      if (store(plans.filter((x) => x.id !== id))) {
        selected = selected.filter((x) => x !== id);
        renderPlans();
      }
      return;
    }
    onOpen(p, !!b.dataset.view);
  };
}
