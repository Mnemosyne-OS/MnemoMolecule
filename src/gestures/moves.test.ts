import { describe, expect, it } from 'vitest';
import { dragDegrees, zoomFactor } from './moves';

describe('the hand turns the molecule like the shell turns its map', () => {
  it('one screen height of drag is half a turn, and the speed scales it', () => {
    expect(dragDegrees(800, 800)).toBe(180);
    expect(dragDegrees(400, 800, 2)).toBe(180);
    expect(dragDegrees(-800, 800)).toBe(-180);
  });
  it('an unreadable step turns nothing', () => {
    expect(dragDegrees(10, 0)).toBeNull();
    expect(dragDegrees(Number.NaN, 800)).toBeNull();
    expect(dragDegrees(10, 800, 0)).toBeNull();
  });
});

describe('closer and farther', () => {
  it('keeps the direction and scales the step', () => {
    expect(zoomFactor(1.1)).toBeCloseTo(1.1, 9);
    expect(zoomFactor(1.1, 2)).toBeCloseTo(1.21, 9);
    expect(zoomFactor(0.9, 2)).toBeCloseTo(0.81, 9);
  });
  it('refuses a factor it cannot read', () => {
    expect(zoomFactor(0)).toBeNull();
    expect(zoomFactor(Number.NaN)).toBeNull();
  });
});
