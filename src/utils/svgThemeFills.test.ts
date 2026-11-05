import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { mapHardcodedSvgFill } from './svgThemeFills.ts';

const palette = {
  card: '#ffffff',
  border: '#e8e4de',
  accent: '#5b4bdb',
  muted: '#8a8680',
  run: '#c45c26',
  special2: '#5b4bdb',
};

describe('mapHardcodedSvgFill', () => {
  it('maps dark bg fills to card', () => {
    assert.equal(mapHardcodedSvgFill('#222222', palette), '#ffffff');
    assert.equal(mapHardcodedSvgFill('#222', palette), '#ffffff');
  });

  it('maps inactive cell fills to border', () => {
    assert.equal(mapHardcodedSvgFill('#444444', palette), '#e8e4de');
  });

  it('maps accent and named colors', () => {
    assert.equal(mapHardcodedSvgFill('#4DD2FF', palette), '#5b4bdb');
    assert.equal(mapHardcodedSvgFill('yellow', palette), '#c45c26');
    assert.equal(mapHardcodedSvgFill('red', palette), '#5b4bdb');
    assert.equal(mapHardcodedSvgFill('gray', palette), '#8a8680');
  });

  it('returns null for unrelated fills', () => {
    assert.equal(mapHardcodedSvgFill('none', palette), null);
    assert.equal(mapHardcodedSvgFill('#abcdef', palette), null);
  });
});
