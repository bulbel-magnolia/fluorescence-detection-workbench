import type {
  CatalogEntry,
  CatalogLiterature,
  CatalogSignal,
  CatalogValue,
  UnknownValue,
} from '../catalogTypes';
import { COMPONENT_CATALOG_V2_SCHEMA_VERSION } from './catalogTypes';
import type {
  CatalogV2Admission,
  CatalogV2Component,
  CatalogV2ParameterContext,
  CatalogV2Signal,
  CatalogV2SenderOutput,
  CatalogV2Source,
  ComponentCatalogV2,
  CatalogV2DemoBoundary,
} from './catalogTypes';

/** Options are deterministic so the adapter remains a pure function. */
export interface LegacyCatalogAdapterOptions {
  catalogId?: string;
  releaseId?: string;
  releaseVersion?: string;
  generatedAt?: string;
}

const LEGACY_SOURCE_PREFIX = 'legacy-source';
const LEGACY_CONTEXT_PREFIX = 'legacy-context';
const LEGACY_SIGNAL_PREFIX = 'legacy-signal';
const LEGACY_COMPONENT_PREFIX = 'legacy-component';
const LEGACY_SENDER_PREFIX = 'legacy-sender';

/**
 * Convert V1 evidence entries to explicit V2 reference/calibration records.
 *
 * The adapter deliberately creates no receiver-response, effective-pair, or
 * fixed-weight records: the old catalog does not establish those relations.
 * A downstream curator can add them after a measured calibration is available.
 */
export function adaptCatalogEntriesToV2(
  entries: readonly CatalogEntry[],
  options: LegacyCatalogAdapterOptions = {},
): ComponentCatalogV2 {
  const sourceByKey = new Map<string, CatalogV2Source>();
  const sourceIdsByEntry = new Map<string, string[]>();
  const sourceRefMapByEntry = new Map<string, Map<string, string>>();

  for (const entry of entries) {
    const sourceRefMap = new Map<string, string>();
    const entrySourceIds: string[] = [];
    for (const literature of entry.literature) {
      const sourceId = sourceIdFor(entry.id, literature.id);
      sourceRefMap.set(literature.id, sourceId);
      entrySourceIds.push(sourceId);
      sourceByKey.set(`${entry.id}:${literature.id}`, toSource(entry, literature, sourceId));
    }
    sourceRefMapByEntry.set(entry.id, sourceRefMap);
    sourceIdsByEntry.set(entry.id, entrySourceIds);
  }

  const contexts: CatalogV2ParameterContext[] = [];
  const signals: CatalogV2Signal[] = [];
  const components: CatalogV2Component[] = [];
  const senderOutputs: CatalogV2SenderOutput[] = [];

  for (const entry of entries) {
    const entrySourceIds = sourceIdsByEntry.get(entry.id) ?? [];
    const sourceRefMap = sourceRefMapByEntry.get(entry.id) ?? new Map<string, string>();
    const ensureSourceRef = (reference: string): string => {
      const existing = sourceRefMap.get(reference);
      if (existing) return existing;
      const fallbackId = sourceIdFor(entry.id, reference);
      sourceRefMap.set(reference, fallbackId);
      entrySourceIds.push(fallbackId);
      sourceByKey.set(`${entry.id}:${reference}`, {
        id: fallbackId,
        kind: 'legacy-catalog',
        label: `Unresolved legacy source reference: ${reference}`,
        isDemo: false,
        supports: [],
        notes: ['The legacy source identifier is retained without a reconstructed citation.'],
      });
      return fallbackId;
    };

    const contextId = `${LEGACY_CONTEXT_PREFIX}:${entry.id}`;
    const contextBoundary = legacyBoundary(
      'No parameter transfer is asserted for this migrated context.',
      ['reference review', 'calibration planning'],
      ['runtime quantitative use before calibration'],
    );
    contexts.push({
      id: contextId,
      label: `Legacy context for ${entry.id}`,
      parameters: [],
      sourceIds: unique(entrySourceIds),
      certainty: 'unknown',
      demoBoundary: contextBoundary,
      notes: ['Migrated from the V1 context; conditions require curator confirmation.'],
    });

    const inputResult = migrateSignals(entry, entry.signals.inputs, 'input', ensureSourceRef);
    const outputResult = migrateSignals(entry, entry.signals.outputs, 'output', ensureSourceRef);
    signals.push(...inputResult.signals, ...outputResult.signals);

    const admissionStatus =
      entry.modeling.compatibility === 'parameterizable-after-calibration'
        ? 'calibration-candidate'
        : 'reference-only';
    const admission: CatalogV2Admission = {
      status: admissionStatus,
      simulationReady: false,
      constructionReady: false,
      parameterSourceIds: unique(entrySourceIds),
      parameterContextId: contextId,
      demoBoundary: legacyBoundary(
        admissionStatus === 'calibration-candidate'
          ? 'Calibration candidate only; no fixed weight is supplied by the legacy catalog.'
          : 'Reference record only; no runtime parameter is supplied by the legacy catalog.',
        admissionStatus === 'calibration-candidate'
          ? ['calibration planning', 'evidence review']
          : ['reference review'],
        ['runtime quantitative use', 'automatic graph weighting'],
      ),
      rationale:
        admissionStatus === 'calibration-candidate'
          ? 'V1 marked this entry parameterizable after calibration; V2 preserves that as a candidate only.'
          : 'V1 evidence is retained for reference without inferring an executable model.',
    };

    const inputSignalIds = inputResult.signals.map((signal) => signal.id);
    const outputSignalIds = outputResult.signals.map((signal) => signal.id);
    const nodeType = inferNodeType(inputSignalIds.length, outputSignalIds.length, entry);
    const evidenceNotes = [
      `Legacy evidence grade: ${entry.evidence.grade}.`,
      `Legacy review status: ${entry.evidence.reviewStatus}.`,
      ...entry.evidence.reviewNotes,
    ];
    if (inputResult.wasUnknown) evidenceNotes.push('Legacy input signal list was unknown.');
    if (outputResult.wasUnknown) evidenceNotes.push('Legacy output signal list was unknown.');
    if (
      entry.quantitativeObservations !== undefined &&
      !Array.isArray(entry.quantitativeObservations)
    )
      evidenceNotes.push(
        'Legacy quantitative observations were unknown; no V2 weight was generated.',
      );

    const mechanismLabels = unique([
      ...entry.roles,
      ...(entry.roles.includes('quorum-sensing') ? ['quorum-sensing'] : []),
    ]);
    components.push({
      id: `${LEGACY_COMPONENT_PREFIX}:${entry.id}`,
      label: entry.name.en,
      nodeType,
      mechanismLabels,
      inputSignalIds,
      outputSignalIds,
      parameterContextIds: [contextId],
      sourceIds: unique(entrySourceIds),
      evidence: {
        grade: entry.evidence.grade,
        reviewStatus: entry.evidence.reviewStatus,
        scope: entry.evidence.scope,
        directInEColi: entry.evidence.directInEColi,
        sourceIds: unique(entrySourceIds),
        notes: evidenceNotes,
        boundaryNotes: [...entry.evidence.boundaryNotes, ...entry.modeling.calibrationRequirements],
      },
      admission,
      notes: [
        'Migrated from the evidence-backed V1 catalog.',
        'No fixed weight, concentration equation, or quantitative runtime status was inferred.',
      ],
      legacy: {
        catalogId: entry.catalogId,
        catalogVersion: entry.catalogVersion,
        entryId: entry.id,
        category: entry.category,
        entityType: entry.entityType,
        signalEvidence: [
          ...inputResult.sourceRefs.map((ref) => `input:${ref}`),
          ...outputResult.sourceRefs.map((ref) => `output:${ref}`),
        ],
      },
    });

    // A sender output is only a structural observation.  It is intentionally
    // not a response model and has no fixedWeightCandidate field.
    outputResult.signals.forEach((signal, index) => {
      senderOutputs.push({
        id: `${LEGACY_SENDER_PREFIX}:${entry.id}:${index + 1}`,
        senderComponentId: `${LEGACY_COMPONENT_PREFIX}:${entry.id}`,
        inputSignalId: inputSignalIds[0] ?? null,
        outputSignalId: signal.id,
        outputOrdinal: index + 1,
        parameterContextId: contextId,
        sourceIds: unique(entrySourceIds),
        admission: { ...admission, demoBoundary: { ...admission.demoBoundary } },
        demoBoundary: { ...admission.demoBoundary },
        notes: [
          'Legacy output retained as a sender observation; response and weight require calibration.',
        ],
      });
    });
  }

  const sourceList = [...sourceByKey.values()];
  const releaseManifest = {
    schemaVersion: COMPONENT_CATALOG_V2_SCHEMA_VERSION,
    catalogId: options.catalogId ?? 'component-catalog-v2-legacy-adapter',
    releaseId: options.releaseId ?? 'legacy-adapter-development',
    releaseVersion: options.releaseVersion ?? 'v2-legacy-reference.1',
    generatedAt: options.generatedAt ?? 'legacy-adapter',
    status: 'draft' as const,
    counts: {
      signals: signals.length,
      components: components.length,
      parameterContexts: contexts.length,
      receiverResponses: 0,
      senderOutputs: senderOutputs.length,
      effectivePairs: 0,
      compatibilityRelations: 0,
      sources: sourceList.length,
    },
    ...(entries[0]
      ? {
          derivedFrom: {
            catalogId: entries[0].catalogId,
            catalogVersion: entries[0].catalogVersion,
          },
        }
      : {}),
    notes: [
      'Generated by the V1-to-V2 migration adapter.',
      'All migrated records are reference-only or calibration-candidate records.',
    ],
  };

  return {
    releaseManifest,
    signals,
    components,
    parameterContexts: contexts,
    receiverResponses: [],
    senderOutputs,
    effectivePairs: [],
    compatibilityRelations: [],
    sources: sourceList,
  };
}

export const migrateCatalogEntriesToV2 = adaptCatalogEntriesToV2;
export const adaptLegacyCatalogEntries = adaptCatalogEntriesToV2;

function toSource(
  entry: CatalogEntry,
  literature: CatalogLiterature,
  sourceId: string,
): CatalogV2Source {
  const year = knownValue(literature.year);
  const citation =
    year === undefined
      ? `${literature.authors}. ${literature.title}.`
      : `${literature.authors}. ${literature.title} (${year}).`;
  return {
    id: sourceId,
    kind: literature.sourceType,
    label: `${entry.id}: ${literature.title}`,
    citation,
    locator: literature.url,
    isDemo: false,
    supports: [...literature.supports],
    notes: ['Citation migrated from the V1 literature record.'],
  };
}

function migrateSignals(
  entry: CatalogEntry,
  value: CatalogSignal[] | UnknownValue,
  direction: 'input' | 'output',
  ensureSourceRef: (reference: string) => string,
): { signals: CatalogV2Signal[]; wasUnknown: boolean; sourceRefs: string[] } {
  if (!Array.isArray(value)) return { signals: [], wasUnknown: true, sourceRefs: [] };
  const sourceRefs: string[] = [];
  const signals = value.map((signal) => {
    const refs =
      signal.sourceRefs.length > 0
        ? [...signal.sourceRefs]
        : entry.literature.map((literature) => literature.id);
    sourceRefs.push(...refs);
    const sourceIds = unique(refs.map(ensureSourceRef));
    const name = knownValue(signal.name) ?? signal.id;
    const unit = knownValue(signal.unit) ?? 'unknown';
    return {
      id: `${LEGACY_SIGNAL_PREFIX}:${entry.id}:${direction}:${signal.id}`,
      label: name,
      unit,
      direction,
      kind: inferSignalKind(signal.id),
      precision: {
        measurementKind: 'continuous' as const,
        statement:
          'Legacy signal precision and transferability are not established by this adapter.',
      },
      sourceIds,
      legacySourceRefs: [...signal.sourceRefs],
      notes: [
        `Migrated from legacy ${direction} signal ${signal.id}.`,
        signal.directObservation
          ? 'Legacy record marks this signal as a direct observation.'
          : 'Legacy record does not mark this signal as a direct observation.',
      ],
    };
  });
  return { signals, wasUnknown: false, sourceRefs: unique(sourceRefs) };
}

function inferNodeType(
  inputCount: number,
  outputCount: number,
  entry: CatalogEntry,
): 'input' | 'processing' | 'output' {
  if (inputCount === 0 && outputCount > 0) return 'output';
  if (outputCount === 0 && inputCount > 0) return 'input';
  // A quorum-sensing role remains a mechanism label; it never becomes a node type.
  void entry;
  return 'processing';
}

function inferSignalKind(
  id: string,
): 'fluorescence' | 'analyte' | 'regulatory' | 'control' | 'quality' | 'state' | 'unknown' {
  const normalized = id.toLowerCase();
  if (/(gfp|fluor|mneon|rfp|reporter)/.test(normalized)) return 'fluorescence';
  if (/(pollut|metal|cadmium|chrom|mercur|arsenic|analyte)/.test(normalized)) return 'analyte';
  if (/(promoter|regulat|repressor|transcription|operator)/.test(normalized)) return 'regulatory';
  return 'unknown';
}

function sourceIdFor(entryId: string, sourceRef: string): string {
  return `${LEGACY_SOURCE_PREFIX}:${entryId}:${sourceRef}`;
}

function knownValue<T>(value: CatalogValue<T>): T | undefined {
  return value.state === 'known' ? value.value : undefined;
}

function legacyBoundary(
  description: string,
  permittedUses: string[],
  forbiddenUses: string[],
): CatalogV2DemoBoundary {
  return { isDemo: false, description, permittedUses, forbiddenUses };
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}
