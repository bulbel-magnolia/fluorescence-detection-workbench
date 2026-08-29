import componentsDocument from './data/source/sender_components_v1_2.json';
import evidenceTraceCsv from './data/source/sender_evidence_trace.csv?raw';
import functionParametersCsv from './data/source/sender_function_parameters.csv?raw';
import outputsDocument from './data/source/sender_outputs_v1_2.json';
import rawPointsCsv from './data/source/sender_raw_points.csv?raw';
import rejectedCandidatesJsonl from './data/source/sender_rejected_candidates.jsonl?raw';
import sourcesCsv from './data/source/sender_sources.csv?raw';
import validationReport from './data/source/sender_validation_report.json';
import { loadAhlHslCatalogRelease } from '../../v2/catalogReleaseLoader';
import type {
  SenderEvidenceExtension,
  SenderExtensionSourcePackageInput,
} from './senderExtensionTypes';
import {
  formatSenderExtensionValidationFailure,
  validateSenderEvidenceExtensionSourcePackage,
} from './senderExtensionValidator';

const BUNDLED_SOURCE_PACKAGE: SenderExtensionSourcePackageInput = Object.freeze({
  componentsDocument,
  outputsDocument,
  validationReport,
  rawPointsCsv,
  functionParametersCsv,
  sourcesCsv,
  evidenceTraceCsv,
  rejectedCandidatesJsonl,
});

let trustedSenderExtensionCache: SenderEvidenceExtension | undefined;

export function loadSenderEvidenceExtension(
  input?: SenderExtensionSourcePackageInput,
): SenderEvidenceExtension {
  if (input === undefined && trustedSenderExtensionCache) return trustedSenderExtensionCache;
  const result = validateSenderEvidenceExtensionSourcePackage(
    input ?? BUNDLED_SOURCE_PACKAGE,
    loadAhlHslCatalogRelease().release,
  );
  if (!result.ok)
    throw new Error(
      'Sender V1.2 validation failed: ' + formatSenderExtensionValidationFailure(result.errors),
    );
  const loaded = deepFreeze(structuredClone(result.value));
  if (input === undefined) trustedSenderExtensionCache = loaded;
  return loaded;
}

export function getTrustedSenderEvidenceExtension(): SenderEvidenceExtension {
  return trustedSenderExtensionCache ?? loadSenderEvidenceExtension();
}

export function isTrustedSenderEvidenceExtension(value: unknown): value is SenderEvidenceExtension {
  return value === getTrustedSenderEvidenceExtension() && isDeepFrozen(value);
}

export function cloneBundledSenderExtensionSourcePackage(): SenderExtensionSourcePackageInput {
  return {
    componentsDocument: structuredClone(componentsDocument),
    outputsDocument: structuredClone(outputsDocument),
    validationReport: structuredClone(validationReport),
    rawPointsCsv,
    functionParametersCsv,
    sourcesCsv,
    evidenceTraceCsv,
    rejectedCandidatesJsonl,
  };
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
