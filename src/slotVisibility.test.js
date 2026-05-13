import test from 'node:test';
import assert from 'node:assert/strict';
import {
  applyBulkSlotVisibility,
  getBulkSlotVisibilityState,
} from './slotVisibility.js';

test('bulk slot state is checked when every filtered slot is shown', () => {
  const slots = ['head', 'body'].map((name) => ({ data: { name } }));
  const hiddenSlots = new Set();

  assert.deepEqual(getBulkSlotVisibilityState(slots, hiddenSlots), {
    checked: true,
    indeterminate: false,
    label: '全部显示',
  });
});

test('bulk slot state is indeterminate when filtered slots mix shown and hidden', () => {
  const slots = ['head', 'body'].map((name) => ({ data: { name } }));
  const hiddenSlots = new Set(['body']);

  assert.deepEqual(getBulkSlotVisibilityState(slots, hiddenSlots), {
    checked: false,
    indeterminate: true,
    label: '部分显示',
  });
});

test('bulk visibility can hide or show only the filtered slots', () => {
  const slots = ['head', 'body'].map((name) => ({ data: { name } }));
  const hiddenSlots = new Set(['weapon']);

  applyBulkSlotVisibility(slots, hiddenSlots, false);
  assert.deepEqual([...hiddenSlots].sort(), ['body', 'head', 'weapon']);

  applyBulkSlotVisibility(slots, hiddenSlots, true);
  assert.deepEqual([...hiddenSlots], ['weapon']);
});
