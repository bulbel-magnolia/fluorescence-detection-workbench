export interface BfnComplex {
  readonly re: number;
  readonly im: number;
}

function complex(re: number, im: number): BfnComplex {
  return Object.freeze({ re, im });
}

export function bfnComplexAdd(left: BfnComplex, right: BfnComplex): BfnComplex {
  return complex(left.re + right.re, left.im + right.im);
}

export function bfnComplexMultiply(left: BfnComplex, right: BfnComplex): BfnComplex {
  return complex(left.re * right.re - left.im * right.im, left.re * right.im + left.im * right.re);
}

export function bfnComplexScale(value: BfnComplex, scale: number): BfnComplex {
  return complex(value.re * scale, value.im * scale);
}

export function isFiniteBfnComplex(value: BfnComplex): boolean {
  return Number.isFinite(value.re) && Number.isFinite(value.im);
}

export function isZeroBfnComplex(value: BfnComplex): boolean {
  return value.re === 0 && value.im === 0;
}

export function bfnComplexMagnitude(value: BfnComplex): number {
  return Math.hypot(value.re, value.im);
}

export function bfnComplexPhaseDegrees(value: BfnComplex): number {
  const degrees = (Math.atan2(value.im, value.re) * 180) / Math.PI;
  const normalized = ((((degrees + 180) % 360) + 360) % 360) - 180;
  if (normalized === -180) return 180;
  return Object.is(normalized, -0) ? 0 : normalized;
}
