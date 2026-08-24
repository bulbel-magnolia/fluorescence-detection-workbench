import type {
  CatalogApplicationAssessment,
  CatalogApplicationMode,
  CatalogEntry,
  CatalogNetworkRole,
  CatalogNodeKind,
  CatalogParameterStatus,
  CatalogSignal,
  LiteratureCandidateReference,
  ModelingCompatibility,
} from './catalogTypes';

export const CATALOG_NETWORK_ROLES: readonly CatalogNetworkRole[] = [
  'input',
  'processing',
  'output',
];

export const CATALOG_PARAMETER_STATUSES: readonly CatalogParameterStatus[] = [
  'quantitative-available',
  'normalized-demo-only',
  'parameterizable-after-calibration',
  'compatibility-information',
  'reference-only',
];

/**
 * Map the schema compatibility boundary to a user-facing availability state.
 * Numeric observations are deliberately ignored: the schema marks them as
 * display-only and does not provide a validated model parameter.
 */
export function getCatalogParameterStatus(entry: CatalogEntry): CatalogParameterStatus {
  return parameterStatusForCompatibility(entry.modeling.compatibility);
}

export const assessCatalogParameterStatus = getCatalogParameterStatus;

export function parameterStatusForCompatibility(
  compatibility: ModelingCompatibility,
): CatalogParameterStatus {
  // Reserved for a future schema revision that explicitly certifies a
  // transferable parameter set. No current catalog entry uses this value.
  if ((compatibility as string) === 'quantitative-available') {
    return 'quantitative-available';
  }
  switch (compatibility) {
    case 'normalized-demo-only':
      return 'normalized-demo-only';
    case 'parameterizable-after-calibration':
      return 'parameterizable-after-calibration';
    case 'not-compatible':
      return 'compatibility-information';
    case 'qualitative-only':
    case 'unknown':
      return 'reference-only';
  }
}

/** Return all network roles that can represent an entry. */
export function getCatalogNetworkRoles(entry: CatalogEntry): CatalogNetworkRole[] {
  const inputMolecules = getCatalogInputMolecules(entry);
  const outputMolecules = getCatalogOutputMolecules(entry);
  const kinds = entry.modeling.compatibleNodeKinds;

  if (
    entry.roles.includes('output') ||
    kinds.includes('reporter') ||
    (entry.category === 'control-output' && entry.id.startsWith('output.'))
  ) {
    return ['output'];
  }
  if (inputMolecules.length === 0 && outputMolecules.length > 0) return ['input'];
  if (inputMolecules.length > 0 && outputMolecules.length === 0) return ['output'];
  return ['processing'];
}

export function networkRoleForNodeKind(nodeKind: CatalogNodeKind): CatalogNetworkRole {
  if (nodeKind === 'sensor' || nodeKind === 'signal') return 'input';
  if (nodeKind === 'reporter') return 'output';
  return 'processing';
}

export function getCatalogInputMolecules(entry: CatalogEntry): string[] {
  return signalLabels(entry.signals.inputs);
}

export function getCatalogOutputMolecules(entry: CatalogEntry): string[] {
  return signalLabels(entry.signals.outputs);
}

export function getCatalogMoleculeLabel(signal: CatalogSignal): string {
  return signal.name.state === 'known' ? signal.name.value : signal.id;
}

function signalLabels(signals: CatalogSignal[] | { state: 'unknown' }): string[] {
  if (!Array.isArray(signals)) return [];
  return unique(signals.map(getCatalogMoleculeLabel));
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

export interface CatalogApplicationOptions {
  requestedMode?: CatalogApplicationMode;
  canApply?: boolean;
}

/**
 * Pure gate for the primary Apply to network action. It never mutates model
 * state; the host page decides how to create or update a node.
 */
export function assessCatalogApplication(
  entry: CatalogEntry,
  targetNetworkRole?: CatalogNetworkRole | null,
  options: CatalogApplicationOptions = {},
): CatalogApplicationAssessment {
  const parameterStatus = getCatalogParameterStatus(entry);
  const role = targetNetworkRole ?? null;
  const applicationMode = options.requestedMode ?? defaultApplicationMode(parameterStatus);

  if (role === null) {
    return {
      targetNetworkRole: null,
      applicationMode,
      allowed: false,
      reason: 'no-target-role',
      parameterStatus,
    };
  }
  if (!getCatalogNetworkRoles(entry).includes(role)) {
    return {
      targetNetworkRole: role,
      applicationMode,
      allowed: false,
      reason: 'incompatible-network-role',
      parameterStatus,
    };
  }
  if (options.canApply === false) {
    return {
      targetNetworkRole: role,
      applicationMode,
      allowed: false,
      reason: 'catalog-read-only',
      parameterStatus,
    };
  }
  if (entry.evidence.reviewStatus !== 'passed') {
    return {
      targetNetworkRole: role,
      applicationMode,
      allowed: false,
      reason: 'review-required',
      parameterStatus,
    };
  }

  switch (parameterStatus) {
    case 'quantitative-available':
      return result(
        role,
        applicationMode,
        applicationMode === 'quantitative',
        'ready',
        parameterStatus,
      );
    case 'normalized-demo-only':
      return result(
        role,
        applicationMode,
        applicationMode === 'demo',
        'demo-only',
        parameterStatus,
      );
    case 'parameterizable-after-calibration':
      return result(
        role,
        applicationMode,
        applicationMode === 'calibration',
        'requires-calibration',
        parameterStatus,
      );
    case 'compatibility-information':
      return result(role, applicationMode, false, 'compatibility-only', parameterStatus);
    case 'reference-only':
      return result(role, applicationMode, false, 'reference-only', parameterStatus);
  }
}

function result(
  targetNetworkRole: CatalogNetworkRole,
  applicationMode: CatalogApplicationMode,
  allowed: boolean,
  reason: CatalogApplicationAssessment['reason'],
  parameterStatus: CatalogParameterStatus,
): CatalogApplicationAssessment {
  return { targetNetworkRole, applicationMode, allowed, reason, parameterStatus };
}

function defaultApplicationMode(status: CatalogParameterStatus): CatalogApplicationMode {
  switch (status) {
    case 'quantitative-available':
      return 'quantitative';
    case 'normalized-demo-only':
      return 'demo';
    case 'parameterizable-after-calibration':
      return 'calibration';
    case 'compatibility-information':
      return 'candidate';
    case 'reference-only':
      return 'reference';
  }
}

export function createLiteratureCandidateReference(
  entry: CatalogEntry,
  displayNameSnapshot: string,
): LiteratureCandidateReference {
  const boundaryNote = entry.evidence.boundaryNotes[0];
  return {
    catalogId: entry.catalogId,
    catalogVersion: entry.catalogVersion,
    entryId: entry.id,
    displayNameSnapshot,
    sourceStatus: entry.evidence.reviewStatus,
    ...(boundaryNote ? { boundaryNote } : {}),
  };
}
