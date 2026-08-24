import releaseJson from './data/ahl-hsl-component-database-v1.1.json';
import { adaptCatalogReleaseToV2 } from './catalogReleaseAdapter';
import { validateCatalogV2 } from './catalogValidator';
import {
  validateCatalogRelease,
  type CatalogReleaseValidationIssue,
} from './catalogReleaseValidator';
import type { ComponentCatalogV2 } from './catalogTypes';
import type { AhlHslComponentCatalogRelease } from './releaseTypes';

export interface LoadedCatalogRelease {
  /** Strictly validated, immutable V1.1 source release for presentation metadata. */
  release: AhlHslComponentCatalogRelease;
  catalog: ComponentCatalogV2;
  warnings: readonly CatalogReleaseValidationIssue[];
}

let trustedLoadedCatalogCache: LoadedCatalogRelease | undefined;

export function loadAhlHslCatalogRelease(raw: unknown = releaseJson): LoadedCatalogRelease {
  const rawResult = validateCatalogRelease(raw);
  if (!rawResult.ok) throw new Error(formatValidationFailure('raw release', rawResult.fatalErrors));

  const release = deepFreeze(structuredClone(rawResult.value));
  const adapted = adaptCatalogReleaseToV2(release);
  const canonicalResult = validateCatalogV2(adapted);
  if (!canonicalResult.ok)
    throw new Error(formatValidationFailure('canonical V2 release', canonicalResult.errors));

  const loaded = Object.freeze({
    release,
    catalog: deepFreeze(canonicalResult.value),
    warnings: Object.freeze([...rawResult.warnings]),
  });
  if (raw === releaseJson) trustedLoadedCatalogCache = loaded;
  return loaded;
}

export const loadCatalogRelease = loadAhlHslCatalogRelease;

/** Return the one bundled, validated, deeply frozen V1.1 release. */
export function getTrustedAhlHslCatalogRelease(): LoadedCatalogRelease {
  return trustedLoadedCatalogCache ?? loadAhlHslCatalogRelease();
}

/**
 * Presentation and citation APIs accept only a deeply frozen release whose
 * content is exactly equal to the bundled release.  A byte-identical frozen
 * clone is safe; any changed value, omitted record, or mutable node is not.
 */
export function isTrustedLoadedCatalogRelease(value: unknown): value is LoadedCatalogRelease {
  try {
    const trusted = getTrustedAhlHslCatalogRelease();
    return (
      value === trusted ||
      (isDeepFrozen(value) && deepEqual(value, trusted))
    );
  } catch {
    return false;
  }
}

function formatValidationFailure(
  label: string,
  errors: readonly { path: string; message: string; code?: string }[],
): string {
  return (
    label +
    ' validation failed: ' +
    errors
      .map(
        (error) => error.path + ' ' + error.message + (error.code ? ' [' + error.code + ']' : ''),
      )
      .join('; ')
  );
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== 'object' || value === null || Object.isFrozen(value)) return value;
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child);
  return Object.freeze(value);
}

function isDeepFrozen(value: unknown): boolean {
  if (typeof value !== 'object' || value === null) return true;
  if (!Object.isFrozen(value)) return false;
  return Object.values(value as Record<string, unknown>).every(isDeepFrozen);
}

function deepEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (typeof left !== typeof right || left === null || right === null) return false;
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length)
      return false;
    return left.every((item, index) => deepEqual(item, right[index]));
  }
  if (!isRecord(left) || !isRecord(right)) return false;
  const leftKeys = Object.keys(left).sort();
  const rightKeys = Object.keys(right).sort();
  if (!deepEqual(leftKeys, rightKeys)) return false;
  return leftKeys.every((key) => deepEqual(left[key], right[key]));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export type { AhlHslComponentCatalogRelease };
