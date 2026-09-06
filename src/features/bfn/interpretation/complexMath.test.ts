import { describe, expect, it } from 'vitest';
import {
  bfnComplexAdd,
  bfnComplexMagnitude,
  bfnComplexMultiply,
  bfnComplexPhaseDegrees,
  bfnComplexScale,
  isFiniteBfnComplex,
  isZeroBfnComplex,
} from './complexMath';

describe('BFN interpretation complex math', () => {
  it('adds, multiplies, and scales without mutating its operands', () => {
    const left = Object.freeze({ re: 2, im: 3 });
    const right = Object.freeze({ re: 4, im: -1 });

    expect(bfnComplexAdd(left, right)).toEqual({ re: 6, im: 2 });
    expect(bfnComplexMultiply(left, right)).toEqual({ re: 11, im: 10 });
    expect(bfnComplexScale(left, -2)).toEqual({ re: -4, im: -6 });
    expect(left).toEqual({ re: 2, im: 3 });
    expect(right).toEqual({ re: 4, im: -1 });
  });

  it('uses Euclidean magnitude and detects exact zero only', () => {
    expect(bfnComplexMagnitude({ re: 3, im: 4 })).toBe(5);
    expect(isZeroBfnComplex({ re: 0, im: -0 })).toBe(true);
    expect(isZeroBfnComplex({ re: Number.MIN_VALUE, im: 0 })).toBe(false);
  });

  it('rejects every non-finite coordinate', () => {
    expect(isFiniteBfnComplex({ re: 1, im: -2 })).toBe(true);
    expect(isFiniteBfnComplex({ re: Number.NaN, im: 0 })).toBe(false);
    expect(isFiniteBfnComplex({ re: 0, im: Number.POSITIVE_INFINITY })).toBe(false);
  });

  it('normalizes phase to (-180, 180] including signed zero at the negative axis', () => {
    expect(bfnComplexPhaseDegrees({ re: 1, im: 0 })).toBe(0);
    expect(bfnComplexPhaseDegrees({ re: 0, im: 1 })).toBe(90);
    expect(bfnComplexPhaseDegrees({ re: 0, im: -1 })).toBe(-90);
    expect(bfnComplexPhaseDegrees({ re: -1, im: 0 })).toBe(180);
    expect(bfnComplexPhaseDegrees({ re: -1, im: -0 })).toBe(180);
  });
});
