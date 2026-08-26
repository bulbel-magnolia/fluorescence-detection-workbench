import {
  loadReleaseCatalogPresentation,
  type ReleaseCatalogLocalizedName,
  type ReleaseCatalogPresentation,
} from '../../modeling/catalog/releaseCatalogPresentation';
import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from '../types';
import {
  buildBfnCatalogDetail,
  type BfnCatalogDetailSource,
  type BfnCatalogDetailTarget,
  type BfnCatalogResponseDetail,
} from './catalogDetail';
import { verifyBfnCatalogModel } from './catalogBfnVerification';
import { BfnCatalogContractError, bfnCatalogReferencePresence } from './catalogBfnTypes';

export type BfnCatalogProvenanceStatus = 'matched' | 'source-unavailable' | 'source-mismatch';

export interface BfnCatalogRecordedReference {
  catalogId: string | null;
  releaseId: string | null;
  releaseVersion: string | null;
  responseId: string | null;
  componentId: string | null;
  inputSignalId: string | null;
  outputSignalId: string | null;
  parameterContextId: string | null;
  sourceIds: readonly string[];
  biologicalDirection: 'activation' | 'derepression' | null;
}

export interface BfnCatalogCanonicalProvenance {
  catalogVersion: string;
  componentNames: ReleaseCatalogLocalizedName;
  inputSignalNames: ReleaseCatalogLocalizedName;
  outputSignalNames: ReleaseCatalogLocalizedName | null;
  context: {
    id: string;
    hostSpecies: string | null;
    hostStrain: string | null;
  } | null;
  primarySource: BfnCatalogDetailSource | null;
  sourceCount: number;
  biologicalDirection: 'activation' | 'derepression' | null;
  responseId: string;
  parameterContextId: string;
  sourceIds: readonly string[];
  detailTarget: BfnCatalogDetailTarget;
}

export interface BfnCatalogProvenanceSummary {
  status: BfnCatalogProvenanceStatus;
  recordedReference: BfnCatalogRecordedReference;
  canonical: BfnCatalogCanonicalProvenance | null;
}

export function resolveBfnCatalogProvenance(
  project: BfnProject,
  module: BfnFunctionalModule,
  model: BfnModelVariant,
): BfnCatalogProvenanceSummary | null {
  const presence = bfnCatalogReferencePresence(model);
  if (!presence.present) return null;

  const recordedReference = readRecordedReference(presence.value);
  try {
    const verified = verifyBfnCatalogModel(project, module, model);
    const canonical = resolveCurrentCanonicalProvenance(verified.catalogReference);
    return canonical
      ? { status: 'matched', recordedReference, canonical }
      : { status: 'source-unavailable', recordedReference, canonical: null };
  } catch (error) {
    if (!(error instanceof BfnCatalogContractError)) {
      return { status: 'source-unavailable', recordedReference, canonical: null };
    }
    if (
      error.code === 'catalog_release_unavailable' ||
      error.code === 'catalog_execution_unavailable'
    ) {
      return { status: 'source-unavailable', recordedReference, canonical: null };
    }
    if (
      error.code === 'catalog_required_input_unconnected' ||
      error.code === 'catalog_input_out_of_range'
    ) {
      const canonical = resolveCurrentCanonicalProvenance(presence.value);
      return canonical
        ? { status: 'matched', recordedReference, canonical }
        : { status: 'source-unavailable', recordedReference, canonical: null };
    }
    return {
      status: 'source-mismatch',
      recordedReference,
      canonical: resolveCurrentCanonicalProvenance(presence.value),
    };
  }
}

export function bfnCatalogProvenanceSourceLabel(
  source: Pick<BfnCatalogDetailSource, 'authors' | 'year'>,
): string {
  const authors = source.authors.trim();
  const firstAuthor = authors.split(';')[0]?.trim() ?? authors;
  const alreadyAbbreviated = /\bet\s+al\.?$/iu.test(firstAuthor);
  const familyName = alreadyAbbreviated
    ? firstAuthor
    : (firstAuthor.split(/\s+/u).filter(Boolean).at(-1) ?? firstAuthor);
  const authorLabel =
    alreadyAbbreviated || !authors.includes(';') ? familyName : `${familyName} et al.`;
  return [authorLabel, source.year].filter((value) => value !== null && value !== '').join(' · ');
}

function resolveCurrentCanonicalProvenance(
  reference: unknown,
): BfnCatalogCanonicalProvenance | null {
  let presentation: ReleaseCatalogPresentation;
  try {
    presentation = loadReleaseCatalogPresentation();
  } catch {
    return null;
  }
  const recorded = readRecordedReference(reference);
  const manifest = presentation.catalog.releaseManifest;
  if (
    recorded.catalogId !== manifest.catalogId ||
    recorded.releaseId !== manifest.releaseId ||
    recorded.releaseVersion !== manifest.releaseVersion ||
    recorded.responseId === null
  ) {
    return null;
  }

  let detail: BfnCatalogResponseDetail;
  try {
    const resolved = buildBfnCatalogDetail(presentation, {
      kind: 'response',
      responseId: recorded.responseId,
    });
    if (resolved.kind !== 'response') return null;
    detail = resolved;
  } catch {
    return null;
  }
  const primarySource =
    detail.sources.find((source) => source.primary) ?? detail.sources[0] ?? null;
  return {
    catalogVersion: detail.catalogVersion,
    componentNames: detail.component.displayNames,
    inputSignalNames: detail.inputSignalNames,
    outputSignalNames: detail.outputSignalNames,
    context: detail.context
      ? {
          id: detail.context.id,
          hostSpecies: detail.context.hostSpecies,
          hostStrain: detail.context.hostStrain,
        }
      : null,
    primarySource,
    sourceCount: detail.sources.length,
    biologicalDirection: detail.runtimeModel?.biologicalDirection ?? null,
    responseId: detail.responseId,
    parameterContextId: detail.advanced.parameterContextId,
    sourceIds: detail.sources.map((source) => source.id),
    detailTarget: { kind: 'response', responseId: detail.responseId },
  };
}

function readRecordedReference(value: unknown): BfnCatalogRecordedReference {
  const record = isRecord(value) ? value : {};
  return {
    catalogId: readString(record.catalogId),
    releaseId: readString(record.releaseId),
    releaseVersion: readString(record.releaseVersion),
    responseId: readString(record.responseId),
    componentId: readString(record.componentId),
    inputSignalId: readString(record.inputSignalId),
    outputSignalId: readString(record.outputSignalId),
    parameterContextId: readString(record.parameterContextId),
    sourceIds: Array.isArray(record.sourceIds)
      ? record.sourceIds.filter((entry): entry is string => typeof entry === 'string')
      : [],
    biologicalDirection:
      record.biologicalDirection === 'activation' || record.biologicalDirection === 'derepression'
        ? record.biologicalDirection
        : null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
