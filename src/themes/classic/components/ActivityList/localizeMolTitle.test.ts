import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { localizeMolTitle } from './localizeMolTitle.ts';

describe('localizeMolTitle', () => {
  it('replaces singular years old', () => {
    assert.equal(localizeMolTitle('Jan (1 years old)', '{n} 岁'), 'Jan (1 岁)');
  });

  it('replaces plural years old case-insensitively', () => {
    assert.equal(
      localizeMolTitle('Grid (12 Years Old)', '{n} yrs'),
      'Grid (12 yrs)'
    );
  });

  it('leaves titles without age segment alone', () => {
    assert.equal(localizeMolTitle('Month of Life', '{n} 岁'), 'Month of Life');
  });

  it('replaces every age segment in one title', () => {
    assert.equal(
      localizeMolTitle('A (2 years old) / B (10 years old)', '{n}y'),
      'A (2y) / B (10y)'
    );
  });
});
