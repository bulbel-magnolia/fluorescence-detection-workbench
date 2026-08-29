import type {
  SenderExtensionJsonValue,
  SenderExtensionValidationIssue,
} from './senderExtensionTypes';

export function addSenderExtensionIssue(
  errors: SenderExtensionValidationIssue[],
  path: string,
  code: string,
  message: string,
): void {
  errors.push({ path, code, message });
}

export function isSenderExtensionRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isSenderExtensionJsonValue(value: unknown): value is SenderExtensionJsonValue {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    (typeof value === 'number' && Number.isFinite(value))
  )
    return true;
  if (Array.isArray(value)) return value.every(isSenderExtensionJsonValue);
  return isSenderExtensionRecord(value) && Object.values(value).every(isSenderExtensionJsonValue);
}

export function requireSenderString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  const fieldValue = value[field];
  if (typeof fieldValue !== 'string' || fieldValue.length === 0)
    addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be a non-empty string');
}

export function requireSenderNullableString(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (value[field] !== null && typeof value[field] !== 'string')
    addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be a string or null');
}

export function requireSenderBoolean(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (typeof value[field] !== 'boolean')
    addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be a boolean');
}

export function requireSenderNullableNumber(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  const candidate = value[field];
  if (candidate !== null && (typeof candidate !== 'number' || !Number.isFinite(candidate)))
    addSenderExtensionIssue(
      errors,
      path + '.' + field,
      'schema',
      'must be a finite number or null',
    );
}

export function requireSenderStringArray(
  value: Record<string, unknown>,
  field: string,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  const candidate = value[field];
  if (!Array.isArray(candidate) || candidate.some((item) => typeof item !== 'string'))
    addSenderExtensionIssue(errors, path + '.' + field, 'schema', 'must be a string array');
}

export function requireSenderNullableRange(
  value: unknown,
  path: string,
  errors: SenderExtensionValidationIssue[],
): void {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    value.some((item) => item !== null && (typeof item !== 'number' || !Number.isFinite(item)))
  )
    addSenderExtensionIssue(errors, path, 'schema', 'must be a two-value finite-number/null range');
}

export function uniqueSenderIds(
  errors: SenderExtensionValidationIssue[],
  path: string,
  ids: readonly string[],
): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) addSenderExtensionIssue(errors, path, 'duplicate-id', 'duplicate ID: ' + id);
    seen.add(id);
  }
}

export function requireSenderReferences(
  errors: SenderExtensionValidationIssue[],
  recordId: string,
  label: string,
  ids: readonly string[],
  known: ReadonlySet<string>,
): void {
  for (const id of ids)
    if (!known.has(id))
      addSenderExtensionIssue(
        errors,
        recordId,
        'unknown-reference',
        label + ' reference is unresolved: ' + id,
      );
}
