import test from 'node:test';
import assert from 'node:assert/strict';
import { slotMatchesSearch } from './slotSearch.js';

test('slot search matches slot names case-insensitively', () => {
  const slot = { data: { name: 'FM_biaopai1_1' }, bone: { data: { name: 'bone152' } } };

  assert.equal(slotMatchesSearch(slot, 'BIAOPAI'), true);
});

test('slot search matches bone names and trims whitespace', () => {
  const slot = { data: { name: 'BG1_105' }, bone: { data: { name: 'bone69' } } };

  assert.equal(slotMatchesSearch(slot, '  ne69  '), true);
});

test('empty slot search shows every slot', () => {
  const slot = { data: { name: 'BG1_104' }, bone: { data: { name: 'bone67' } } };

  assert.equal(slotMatchesSearch(slot, ''), true);
});

test('slot search rejects unrelated text', () => {
  const slot = { data: { name: 'BG1_103' }, bone: { data: { name: 'bone70' } } };

  assert.equal(slotMatchesSearch(slot, 'weapon'), false);
});
