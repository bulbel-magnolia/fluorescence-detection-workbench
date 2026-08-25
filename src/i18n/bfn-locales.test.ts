import { describe, expect, it } from 'vitest';
import { bfnEnUS } from './locales/bfn-en-US';
import { bfnZhCN } from './locales/bfn-zh-CN';

function translationKeys(value: unknown, prefix = ''): string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    translationKeys(child, prefix ? `${prefix}.${key}` : key),
  );
}

describe('BFN locale coverage', () => {
  it('keeps Chinese and English translation keys aligned', () => {
    expect(translationKeys(bfnEnUS).sort()).toEqual(translationKeys(bfnZhCN).sort());
  });
});
