import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LOSS_ITEMS, lossItemsOf, lossItemsSummary } from '../site/path-losses.mjs';

const values = [2400, 1, 20, 2, 2, 0, 0, 0, -90, 0, 4];

test('Every loss item has a unique key and form id', () => {
  assert.equal(new Set(LOSS_ITEMS.map((i) => i.key)).size, LOSS_ITEMS.length);
  assert.ok(LOSS_ITEMS.every((i) => i.id === 'loss-' + i.key));
});

test('Plans from every storage version load their loss items', () => {
  // Current: an object keyed by item.
  const current = lossItemsOf({ values, lossItems: { vegetation: '2.5', pointing: '1' } });
  assert.equal(current.vegetation, '2.5');
  assert.equal(current.pointing, '1');
  assert.equal(current.cloud, '0');
  // Earlier: a list of four items.
  const list = lossItemsOf({ values, lossItems: ['3', '1', '0.5', '2'] });
  assert.deepEqual([list.polarization, list.pointing, list.atmospheric, list.other], ['3', '1', '0.5', '2']);
  // First: only the total.
  assert.equal(lossItemsOf({ values }).other, '4');
  assert.equal(Object.keys(lossItemsOf({ values })).length, LOSS_ITEMS.length);
});

test('Summary lists only the non-zero items', () => {
  assert.equal(lossItemsSummary(lossItemsOf({ values, lossItems: {} })), 'None');
  assert.equal(
    lossItemsSummary(lossItemsOf({ values, lossItems: { polarization: '3.01', multipath: '0', building: '12' } })),
    'Polarization mismatch 3.01, Building entry 12',
  );
});
