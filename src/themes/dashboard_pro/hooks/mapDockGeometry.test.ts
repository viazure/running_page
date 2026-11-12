import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  HEADER_INSET_PX,
  handoffHeightClose,
  mapDockFabVisible,
  pinAlreadyHome,
  pinTransitionFallbackMs,
  PIN_MOTION_MS,
  PIN_TOP_PX,
  PIN_TRANSITION_FALLBACK_EXTRA_MS,
  offscreenPinTop,
  slotFullyVisible,
} from './mapDockGeometry.ts';

const VIEW_BOTTOM = 800;

const rect = (top: number, height: number, width = 360) => ({
  top,
  bottom: top + height,
  width,
  height,
});

describe('slotFullyVisible', () => {
  it('accepts a slot entirely inside the area below the sticky header', () => {
    assert.equal(
      slotFullyVisible(rect(HEADER_INSET_PX + 100, 320), VIEW_BOTTOM),
      true
    );
  });

  it('rejects a slot tucked under the header', () => {
    assert.equal(slotFullyVisible(rect(40, 320), VIEW_BOTTOM), false);
  });

  it('rejects a slot whose bottom is past the viewport', () => {
    assert.equal(slotFullyVisible(rect(500, 400), VIEW_BOTTOM), false);
  });

  it('accepts subpixel geometry that is visually clear of the header', () => {
    // getBoundingClientRect returns fractional px; a strict comparison left
    // the dock pinned on real devices.
    assert.equal(
      slotFullyVisible(rect(HEADER_INSET_PX - 0.4, 320), VIEW_BOTTOM),
      true
    );
    assert.equal(slotFullyVisible(rect(400, 399.6), VIEW_BOTTOM), true);
  });

  it('rejects a slot without measurable size', () => {
    assert.equal(slotFullyVisible(rect(200, 0), VIEW_BOTTOM), false);
    assert.equal(slotFullyVisible(rect(200, 320, 0), VIEW_BOTTOM), false);
  });

  it('rejects an unknown viewport height', () => {
    assert.equal(slotFullyVisible(rect(200, 320), 0), false);
  });
});

describe('pinAlreadyHome', () => {
  it('is true when the pin sits on the slot', () => {
    assert.equal(pinAlreadyHome(400, 400), true);
    assert.equal(pinAlreadyHome(400, 412), true);
  });

  it('is false when the pin is still docked at the header', () => {
    // Dock top-20 = 80, slot mid-viewport: a silent handoff would teleport.
    assert.equal(pinAlreadyHome(400, 80), false);
  });

  it('is false before the pin has ever been written', () => {
    assert.equal(pinAlreadyHome(400, null), false);
  });
});

describe('mapDockFabVisible', () => {
  it('hides the FAB while the map slot is still below the fold', () => {
    assert.equal(
      mapDockFabVisible(rect(VIEW_BOTTOM + 50, 320), VIEW_BOTTOM),
      false
    );
  });

  it('shows the FAB once the slot is scrolled above the header', () => {
    assert.equal(mapDockFabVisible(rect(-400, 320), VIEW_BOTTOM), true);
  });

  it('shows the FAB while only the lower half peeks under the header', () => {
    assert.equal(mapDockFabVisible(rect(0, 120), VIEW_BOTTOM), true);
  });

  it('hides the FAB while most of the slot is still visible', () => {
    assert.equal(mapDockFabVisible(rect(400, 320), VIEW_BOTTOM), false);
  });
});

describe('pinTransitionFallbackMs', () => {
  it('adds the shared extra so transitionend has a bounded fallback', () => {
    assert.equal(
      pinTransitionFallbackMs(PIN_MOTION_MS),
      PIN_MOTION_MS + PIN_TRANSITION_FALLBACK_EXTRA_MS
    );
    assert.equal(pinTransitionFallbackMs(470, 80), 550);
  });
});

describe('handoffHeightClose', () => {
  it('accepts equal or 1px-apart heights so the spacer can drop immediately', () => {
    assert.equal(handoffHeightClose(320, 320), true);
    assert.equal(handoffHeightClose(320, 319.4), true);
  });

  it('rejects a real height mismatch that would jump the page', () => {
    assert.equal(handoffHeightClose(320, 520), false);
  });

  it('rejects non-finite measurements', () => {
    assert.equal(handoffHeightClose(Number.NaN, 320), false);
    assert.equal(handoffHeightClose(320, Number.POSITIVE_INFINITY), false);
  });
});

describe('offscreenPinTop', () => {
  it('places the pin fully above the viewport, not at top-20 - height', () => {
    const height = 320;
    // Legacy end/start: bottom edge sits at PIN_TOP_PX (80), still on screen.
    assert.equal(PIN_TOP_PX - height + height, PIN_TOP_PX);
    assert.equal(offscreenPinTop(height) + height, -8);
    assert.ok(offscreenPinTop(height) + height < 0);
  });

  it('rejects non-positive height without throwing', () => {
    assert.equal(offscreenPinTop(0), -8);
    assert.equal(offscreenPinTop(Number.NaN), -8);
  });
});
