import type { BfnReusableModulePayloadV1 } from './templateTypes';
import { canonicalJson } from './templateInternals';
import { createReusableModuleScientificProjection } from './templateProjection';

/**
 * Produces a deterministic scientific-payload fingerprint. This small local
 * hash is an equality aid, not a cryptographic signature or authenticity proof.
 */
export function createBfnModuleTemplatePayloadSignature(
  payload: BfnReusableModulePayloadV1,
): string {
  const canonical = canonicalJson(createReusableModuleScientificProjection(payload));
  const primary = fnv1a(canonical, 0x811c9dc5);
  const secondary = fnv1a(canonical, 0x9e3779b1);
  return `bfn-template-v1:${hex(primary)}${hex(secondary)}:${canonical.length}`;
}

function fnv1a(value: string, seed: number): number {
  let hash = seed >>> 0;
  for (let index = 0; index < value.length; index += 1) {
    const codePoint = value.charCodeAt(index);
    hash ^= codePoint & 0xff;
    hash = Math.imul(hash, 0x01000193) >>> 0;
    hash ^= codePoint >>> 8;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash;
}

function hex(value: number): string {
  return value.toString(16).padStart(8, '0');
}
