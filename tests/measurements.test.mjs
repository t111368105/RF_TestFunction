import { test } from 'node:test';
import assert from 'node:assert/strict';
import { budget, powerAt } from '../site/calculations.mjs';
import { prepareMeasurements, measurementSummary, parsePasted } from '../site/measurements.mjs';

const values = [2400, 1, 20, 2, 2, 10, 2, 3, -90, 10, 0];
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('Older snapshots keep their single measured value at the link distance', () => {
  const s = { values, measured: ' -70 ' };
  prepareMeasurements(s);
  assert.equal(s.measureUnit, '0.001');
  assert.deepEqual(s.measurements, [{ d: '1000', p: '-70' }]);
  assert.equal('measured' in s, false);
  close(measurementSummary(s).meanDelta, -70 - budget(values).output);

  const empty = { values, measured: '' };
  prepareMeasurements(empty);
  assert.deepEqual(empty.measurements, [{ d: '', p: '' }]);
});

test('Summary skips blank rows, flags invalid ones and fits the rest', () => {
  const s = {
    values,
    measureUnit: '1',
    measurements: [
      { d: '0.5', p: String(powerAt(values, 0.5) - 1) },
      { d: '', p: '' },
      { d: '-1', p: '-60' },
      { d: '2', p: String(powerAt(values, 2) - 1) },
    ],
  };
  const m = measurementSummary(s);
  assert.deepEqual(m.rows.map((r) => [r.blank, r.valid]), [[false, true], [true, false], [false, false], [false, true]]);
  assert.equal(m.used.length, 2);
  close(m.meanDelta, -1);
  close(m.fit.n, 2);
  close(m.fit.p0, budget(values).output - 1);
});

test('Pasted spreadsheet rows', () => {
  const { rows, skipped } = parsePasted('Distance\tdBm\n1\t-45.2\n2;-51,8\n 3  -55 \n4,-60\n1,000\t-90\n\nbad');
  assert.deepEqual(rows, [
    { d: '1', p: '-45.2' },
    { d: '2', p: '-51,8' },
    { d: '3', p: '-55' },
    { d: '4', p: '-60' },
    { d: '1,000', p: '-90' },
  ]);
  assert.equal(skipped, 2);
});
