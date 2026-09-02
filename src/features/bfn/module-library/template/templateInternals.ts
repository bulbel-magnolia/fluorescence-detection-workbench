export const bfnTemplateQuantityTypes = new Set<string>([
  'concentration',
  'amount',
  'production_rate',
  'expression_level',
  'activity',
  'flux',
  'fraction',
  'cell_density',
]);

export const bfnTemplateUnits = new Set<string>([
  'M',
  'mM',
  'uM',
  'nM',
  'pM',
  'nM/h',
  'uM/h',
  'molecules/cell',
  'RPU',
  'dimensionless',
  'OD600',
]);

export const bfnTemplateParameterUnits = new Set<string>([...bfnTemplateUnits, 'h']);

export const bfnTemplateEvidenceGrades = new Set<string>([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
  'mechanistic_model_only',
  'data_driven_prediction',
  'independent_assumption',
  'proposed_unbuilt_design',
]);

export const bfnTemplateUncertaintyMethods = new Set<string>([
  'parameter_interval_envelope',
  'posterior_samples',
  'bootstrap',
  'covariance',
  'none',
  'not_recorded',
]);

export const bfnTemplateImplementationMaturities = new Set<string>([
  'not_recorded',
  'designed',
  'candidate',
  'reported',
  'validated',
]);

export const bfnTemplateImplementationStates = new Set<string>([
  'unspecified',
  ...bfnTemplateImplementationMaturities,
]);

export const bfnTemplateProvenanceKinds = new Set<string>([
  'dataset',
  'publication',
  'repository_record',
  'user_note',
]);

export const bfnTemplateContextDocumentationStates = new Set<string>([
  'recorded',
  'partial',
  'not_recorded',
]);

export const bfnTemplateStaticFamilies = new Set<string>([
  'hill_activation',
  'hill_repression',
  'linear_transfer',
  'identity',
  'independent_inputs',
]);

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isValidTimestamp(value: unknown): value is string {
  return isNonEmptyString(value) && Number.isFinite(Date.parse(value));
}

/**
 * Template import accepts only ordinary data records. Accessors and custom
 * prototypes are rejected before any field value is consumed.
 */
export function isPlainDataRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value) as unknown;
  if (prototype !== Object.prototype && prototype !== null) return false;
  return Object.values(Object.getOwnPropertyDescriptors(value)).every(
    (descriptor) => 'value' in descriptor && descriptor.enumerable,
  );
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const allowed = new Set([...required, ...optional]);
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== 'string')) return false;
  const keys = ownKeys.filter((key): key is string => typeof key === 'string');
  return (
    required.every((key) => Object.prototype.hasOwnProperty.call(value, key)) &&
    keys.every((key) => allowed.has(key))
  );
}

export function ownValue(value: Record<string, unknown>, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

export function isDataArray(value: unknown): value is unknown[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype) return false;
  const descriptors = Object.getOwnPropertyDescriptors(value);
  const ownKeys = Reflect.ownKeys(value);
  return (
    ownKeys.every((key) => typeof key === 'string') &&
    Object.keys(value).length === value.length &&
    Object.entries(descriptors).every(([key, descriptor]) => {
      if (key === 'length') return 'value' in descriptor;
      return /^\d+$/.test(key) && 'value' in descriptor && descriptor.enumerable;
    })
  );
}

export function isDeepDataTree(value: unknown, seen = new Set<object>()): boolean {
  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'boolean' ||
    isFiniteNumber(value)
  ) {
    return true;
  }
  if (typeof value !== 'object' || seen.has(value)) return false;
  seen.add(value);
  if (isDataArray(value)) return value.every((item) => isDeepDataTree(item, seen));
  if (!isPlainDataRecord(value)) return false;
  return Object.values(value).every((item) => isDeepDataTree(item, seen));
}

export function uniqueStrings(values: readonly string[]): boolean {
  return new Set(values).size === values.length;
}

export function canonicalJson(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new Error('BFN_MODULE_TEMPLATE_CANONICALIZATION_INVALID');
    return Object.is(value, -0) ? '0' : JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  if (!isPlainDataRecord(value)) {
    throw new Error('BFN_MODULE_TEMPLATE_CANONICALIZATION_INVALID');
  }
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(ownValue(value, key))}`)
    .join(',')}}`;
}

export function canonicalDeepEqual(left: unknown, right: unknown): boolean {
  try {
    return canonicalJson(left) === canonicalJson(right);
  } catch {
    return false;
  }
}

export function compareCanonical(left: unknown, right: unknown): number {
  const leftCanonical = canonicalJson(left);
  const rightCanonical = canonicalJson(right);
  return leftCanonical < rightCanonical ? -1 : leftCanonical > rightCanonical ? 1 : 0;
}

export function cloneData<T>(value: T): T {
  return structuredClone(value);
}

export function deepFreezeData<T>(value: T): T {
  if (value !== null && typeof value === 'object') {
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (descriptor && 'value' in descriptor) deepFreezeData(descriptor.value);
    }
    Object.freeze(value);
  }
  return value;
}
