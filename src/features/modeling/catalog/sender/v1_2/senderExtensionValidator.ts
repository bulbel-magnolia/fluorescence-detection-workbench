import type { AhlHslComponentCatalogRelease } from '../../v2/releaseTypes';
import { parseSenderExtensionTables } from './senderExtensionCsv';
import { validateSenderExtensionIdentityAndBase } from './senderExtensionIdentity';
import { validateSenderExtensionIntegrity } from './senderExtensionIntegrity';
import { validateSenderExtensionJsonDocuments } from './senderExtensionSchema';
import type {
  SenderEvidenceExtension,
  SenderExtensionSourcePackageInput,
  SenderExtensionValidationIssue,
  SenderExtensionValidationResult,
} from './senderExtensionTypes';

export function validateSenderEvidenceExtensionSourcePackage(
  input: SenderExtensionSourcePackageInput,
  baseRelease: AhlHslComponentCatalogRelease,
): SenderExtensionValidationResult {
  const errors: SenderExtensionValidationIssue[] = [];
  const documents = validateSenderExtensionJsonDocuments(input, errors);
  const tables = parseSenderExtensionTables(input, errors);
  if (!documents || errors.length > 0) return invalid(errors);

  const extension: SenderEvidenceExtension = {
    ...documents,
    ...tables,
  };
  validateSenderExtensionIdentityAndBase(extension, baseRelease, errors);
  validateSenderExtensionIntegrity(extension, baseRelease, errors);
  return errors.length > 0 ? invalid(errors) : { ok: true, value: extension };
}

export function formatSenderExtensionValidationFailure(
  errors: readonly SenderExtensionValidationIssue[],
): string {
  return errors
    .map((error) => error.path + ' ' + error.message + ' [' + error.code + ']')
    .join('; ');
}

function invalid(
  errors: readonly SenderExtensionValidationIssue[],
): SenderExtensionValidationResult {
  return { ok: false, errors: Object.freeze([...errors]) };
}
