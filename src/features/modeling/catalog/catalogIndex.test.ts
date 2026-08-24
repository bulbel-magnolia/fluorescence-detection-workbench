import { describe, expect, it } from 'vitest';
import controlOutputPartsJson from './controlOutputParts.json';
import manifestJson from './catalogManifest.json';
import pollutantSensorsJson from './pollutantSensors.json';
import qsSystemsJson from './qsSystems.json';
import type {
  CatalogCategory,
  CatalogEntry,
  CatalogFile,
  CatalogManifest,
  CatalogSearchFilters,
  CatalogValue,
  UnknownValue,
} from './catalogTypes';
import { buildCatalogIndex, searchCatalog, type CatalogIndex } from './catalogIndex';
import { loadEvidenceCatalog } from './catalogLoader';
import {
  CATALOG_ID,
  CATALOG_VERSION,
  EXPECTED_ENTRY_IDS,
  validateCatalogBundle,
  validateCatalogEntry,
  validateCatalogFile,
  validateCatalogManifest,
} from './catalogValidator';
import { isCatalogValue } from './catalogTypes';

const known = <T>(value: T): CatalogValue<T> => ({ state: 'known', value });
const unknown = <T = never>(reason = 'not reported in the cited source'): CatalogValue<T> => ({
  state: 'unknown',
  reason,
});
const sequenceUnknown = (reason: string): UnknownValue => ({ state: 'unknown', reason });
const publicForbiddenMappings: string[] = ['edge-weight', 'km', 'hill', 'gain', 'threshold'];

const manifest: CatalogManifest = {
  schemaVersion: 'evidence-backed-components.schema.v1',
  catalogId: CATALOG_ID,
  catalogVersion: CATALOG_VERSION,
  generatedAt: '2026-08-02',
  files: {
    qsSystems: 'qsSystems.json',
    pollutantSensors: 'pollutantSensors.json',
    controlOutputParts: 'controlOutputParts.json',
  },
  counts: { 'qs-system': 5, 'pollutant-sensor': 9, 'control-output': 13, total: 27 },
};

const baseEntry = (
  id: string,
  category: CatalogCategory,
  entityType: CatalogEntry['entityType'] = 'part',
): CatalogEntry => ({
  id,
  catalogId: CATALOG_ID,
  catalogVersion: CATALOG_VERSION,
  entityType,
  name: { zh: '示例元件', en: 'Example component', aliases: ['example'] },
  category,
  roles: ['control'],
  mechanism: {
    summary: 'Source-described mechanism.',
    steps: ['A source-described step.'],
    requiredPartners: ['source-described partner'],
  },
  signals: {
    inputs: [
      {
        id: 'input',
        name: known('input'),
        direction: 'positive',
        unit: unknown('unit not reported'),
        directObservation: false,
        sourceRefs: ['source-1'],
      },
    ],
    outputs: [
      {
        id: 'output',
        name: known('output'),
        direction: 'positive',
        unit: unknown('unit not reported'),
        directObservation: false,
        sourceRefs: ['source-1'],
      },
    ],
  },
  context: {
    host: known('Escherichia coli'),
    strain: unknown(),
    vector: unknown(),
    culture: unknown(),
    temperature: unknown(),
    induction: unknown(),
    growthPhase: unknown(),
    readout: known('fluorescence'),
    other: unknown(),
  },
  evidence: {
    grade: 'B',
    reviewStatus: 'needs-review',
    scope: 'Source-described candidate evidence only.',
    directInEColi: false,
    reviewNotes: ['Initial schema fixture review.'],
    boundaryNotes: ['Candidate card; not a validated team construct.'],
  },
  literature: [
    {
      id: 'source-1',
      title: 'Example study',
      authors: 'Example Author',
      year: known(2020),
      doi: known('10.0000/example'),
      pmid: unknown('PMID not reported'),
      url: 'https://example.invalid/source-1',
      sourceType: 'primary-paper',
      supports: ['mechanism', 'signals'],
    },
  ],
  quantitativeObservations: [
    {
      metric: 'response',
      value: unknown(),
      unit: unknown(),
      sourceRef: 'source-1',
      context: {
        host: known('Escherichia coli'),
        strain: unknown(),
        vector: unknown(),
        culture: unknown(),
      },
      originalMeaning: 'No numerical value reported in this fixture.',
      transferability: 'Display-only source context.',
      modelingBoundary: {
        application: 'display-only',
        forbiddenMappings: ['edge-weight', 'km', 'hill', 'gain', 'threshold'],
      },
    },
  ],
  sequence: {
    status: 'not-reported',
    records: sequenceUnknown('sequence accession not reported'),
    isCompleteSingleSequence: false,
  },
  modeling: {
    compatibility: 'qualitative-only',
    allowedRepresentations: ['qualitative response'],
    signalMappings: ['display response only'],
    compatibleNodeKinds: ['signal'],
    forbiddenAutomaticMappings: publicForbiddenMappings,
    requiredMeasurements: ['response parameter'],
    calibrationRequirements: ['calibrate in project chassis'],
  },
  curation: {
    catalogVersion: CATALOG_VERSION,
    reviewedAt: '2026-08-02',
    reviewedBy: ['schema-review'],
    changeNotes: ['Initial fixture.'],
    withdrawalReason: unknown('not withdrawn'),
    auditChecks: { cadRSupplementChecked: false },
  },
});

const file = (category: CatalogCategory, entries: CatalogEntry[]): CatalogFile => ({
  schemaVersion: manifest.schemaVersion,
  catalogId: CATALOG_ID,
  catalogVersion: CATALOG_VERSION,
  category,
  entries,
});

const auditedCadR = (): CatalogEntry => {
  const cadr = baseEntry('sensor.cadr', 'pollutant-sensor', 'system');
  cadr.curation = { ...cadr.curation, auditChecks: { cadRSupplementChecked: true } };
  cadr.literature = [
    ...cadr.literature,
    {
      id: 'cadr-supplement',
      title: 'CadR supplementary information',
      authors: 'CadR Author',
      year: known(2020),
      doi: unknown('DOI not reported'),
      pmid: unknown('PMID not reported'),
      url: 'https://example.invalid/cadr-supplement',
      sourceType: 'supplement',
      supports: ['homolog', 'promoter', 'operator', 'sequence'],
    },
  ];
  return cadr;
};

describe('approved evidence-backed catalog schema and validator', () => {
  it('accepts a complete public-schema entry and canonical manifest/file API', () => {
    const entry = baseEntry('control.phlf', 'control-output');
    expect(validateCatalogEntry(entry, manifest).ok).toBe(true);
    expect(validateCatalogManifest(manifest)).toMatchObject({ ok: true });
    expect(
      validateCatalogFile(file('control-output', [entry]), 'control-output', manifest).ok,
    ).toBe(false);
  });

  it('rejects a known quantitative number without a known unit or source reference', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.quantitativeObservations = [
      {
        ...(Array.isArray(invalid.quantitativeObservations)
          ? invalid.quantitativeObservations[0]!
          : (() => {
              throw new Error('fixture observations missing');
            })()),
        value: known(1.2),
        unit: unknown(),
      },
    ];
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
    invalid.quantitativeObservations = [
      {
        ...(Array.isArray(invalid.quantitativeObservations)
          ? invalid.quantitativeObservations[0]!
          : (() => {
              throw new Error('fixture observations missing');
            })()),
        unit: known('fold'),
        sourceRef: 'missing-source',
      },
    ];
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects family, library, and system entries claiming one complete sequence', () => {
    for (const entityType of ['family', 'library', 'system'] as const) {
      const invalid = baseEntry('control.phlf', 'control-output', entityType);
      invalid.sequence = { ...invalid.sequence, isCompleteSingleSequence: true };
      expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
    }
  });

  it('rejects quantitative mappings that are not display-only or omit a forbidden mapping', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    const observation = Array.isArray(invalid.quantitativeObservations)
      ? invalid.quantitativeObservations[0]!
      : (() => {
          throw new Error('fixture observations missing');
        })();
    invalid.quantitativeObservations = [
      {
        ...observation,
        modelingBoundary: {
          application: 'parameterizable-after-calibration' as never,
          forbiddenMappings: ['edge-weight', 'km', 'hill', 'gain', 'threshold'],
        },
      },
    ];
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
    invalid.quantitativeObservations = [
      {
        ...observation,
        modelingBoundary: {
          application: 'display-only',
          forbiddenMappings: ['edge-weight', 'km', 'hill', 'gain'],
        },
      },
    ];
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects empty or illegal compatible node kinds', () => {
    const empty = baseEntry('control.phlf', 'control-output');
    empty.modeling = { ...empty.modeling, compatibleNodeKinds: [] };
    expect(validateCatalogEntry(empty, manifest).ok).toBe(false);
    const illegal = baseEntry('control.phlf', 'control-output');
    illegal.modeling = {
      ...illegal.modeling,
      compatibleNodeKinds: ['not-a-model-node-kind' as never],
    };
    expect(validateCatalogEntry(illegal, manifest).ok).toBe(false);
  });

  it('accumulates duplicate, unknown, cross-category, and non-lowercase ID errors', () => {
    const duplicate = baseEntry('control.phlf', 'control-output');
    const unknownId = baseEntry('control.unknown', 'control-output');
    const crossCategory = baseEntry('qs.cin', 'control-output', 'system');
    const uppercase = baseEntry('control.PHLF', 'control-output');
    const result = validateCatalogFile(
      file('control-output', [duplicate, unknownId, crossCategory, uppercase]),
      'control-output',
      manifest,
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
      expect(result.errors.some((error) => error.path.includes('id'))).toBe(true);
    }
  });

  it('reports exact nested file and bundle JSON paths', () => {
    const invalidFileEntry = baseEntry('control.phlf', 'control-output');
    invalidFileEntry.id = 'control.PHLF';
    const fileResult = validateCatalogFile(
      file('control-output', [invalidFileEntry]),
      'control-output',
      manifest,
    );
    expect(fileResult.ok).toBe(false);
    if (!fileResult.ok) {
      expect(fileResult.errors.some((error) => error.path === 'file.entries[0].id')).toBe(true);
      expect(fileResult.errors.some((error) => error.path.includes('.entry.'))).toBe(false);
    }

    const qs = EXPECTED_ENTRY_IDS['qs-system'].map((id) => baseEntry(id, 'qs-system', 'system'));
    qs[0]!.id = 'QS.CIN';
    const sensors = EXPECTED_ENTRY_IDS['pollutant-sensor'].map((id) =>
      id === 'sensor.cadr' ? auditedCadR() : baseEntry(id, 'pollutant-sensor', 'system'),
    );
    const controls = EXPECTED_ENTRY_IDS['control-output'].map((id) =>
      baseEntry(id, 'control-output'),
    );
    const bundleResult = validateCatalogBundle({
      manifest,
      files: {
        qsSystems: file('qs-system', qs),
        pollutantSensors: file('pollutant-sensor', sensors),
        controlOutputParts: file('control-output', controls),
      },
    });
    expect(bundleResult.ok).toBe(false);
    if (!bundleResult.ok) {
      expect(
        bundleResult.errors.some((error) => error.path === 'bundle.files.qsSystems.entries[0].id'),
      ).toBe(true);
      expect(
        bundleResult.errors.some(
          (error) => error.path.includes('.file.') || error.path.includes('.entry.'),
        ),
      ).toBe(false);
    }
  });

  it('rejects context fields that are not CatalogValue objects', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.context = {
      ...invalid.context,
      host: 'Escherichia coli' as never,
      strain: 'K-12' as never,
      vector: 'p1' as never,
      culture: 'LB' as never,
    };
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects CatalogValue payloads with the wrong specialized type', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.context = { ...invalid.context, host: known(42) as never };
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects empty array branches and empty signal source references', () => {
    const emptySignals = baseEntry('control.phlf', 'control-output');
    emptySignals.signals = { ...emptySignals.signals, inputs: [] };
    expect(validateCatalogEntry(emptySignals, manifest).ok).toBe(false);

    const emptyObservations = baseEntry('control.phlf', 'control-output');
    emptyObservations.quantitativeObservations = [];
    expect(validateCatalogEntry(emptyObservations, manifest).ok).toBe(false);

    const emptySequenceRecords = baseEntry('control.phlf', 'control-output');
    emptySequenceRecords.sequence = { ...emptySequenceRecords.sequence, records: [] };
    expect(validateCatalogEntry(emptySequenceRecords, manifest).ok).toBe(false);

    const emptySourceRefs = baseEntry('control.phlf', 'control-output');
    const inputSignal = Array.isArray(emptySourceRefs.signals.inputs)
      ? emptySourceRefs.signals.inputs[0]!
      : (() => {
          throw new Error('fixture inputs missing');
        })();
    emptySourceRefs.signals = {
      ...emptySourceRefs.signals,
      inputs: [{ ...inputSignal, sourceRefs: [] }],
    };
    expect(validateCatalogEntry(emptySourceRefs, manifest).ok).toBe(false);
  });

  it('rejects sparse or whitespace-only string arrays and non-finite numbers', () => {
    const sparseAliases = baseEntry('control.phlf', 'control-output');
    sparseAliases.name = { ...sparseAliases.name, aliases: new Array(1) as never };
    expect(validateCatalogEntry(sparseAliases, manifest).ok).toBe(false);

    const blankAliases = baseEntry('control.phlf', 'control-output');
    blankAliases.name = { ...blankAliases.name, aliases: ['   '] };
    expect(validateCatalogEntry(blankAliases, manifest).ok).toBe(false);

    for (const value of [Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalidNumber = baseEntry('control.phlf', 'control-output');
      const observation = Array.isArray(invalidNumber.quantitativeObservations)
        ? invalidNumber.quantitativeObservations[0]!
        : (() => {
            throw new Error('fixture observations missing');
          })();
      invalidNumber.quantitativeObservations = [
        { ...observation, value: known(value), unit: known('fold') },
      ];
      expect(validateCatalogEntry(invalidNumber, manifest).ok).toBe(false);
    }
  });

  it('rejects a public sequence record whose source is absent from literature', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.sequence = {
      status: 'available-public-accession',
      records: [
        {
          kind: 'Registry',
          accession: 'BBa_TEST',
          sequenceType: 'part',
          version: unknown('version not reported'),
          orientation: 'forward',
          sourceRef: 'missing-source',
          complete: true,
        },
      ],
      isCompleteSingleSequence: true,
    };
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects a public sequence status with unknown records', () => {
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.sequence = {
      status: 'available-public-accession',
      records: sequenceUnknown('public accession not reported'),
      isCompleteSingleSequence: false,
    };
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('rejects missing required public-schema structure', () => {
    const invalid = { ...baseEntry('control.phlf', 'control-output') };
    Reflect.deleteProperty(invalid, 'mechanism');
    Reflect.deleteProperty(invalid, 'evidence');
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('requires manifest file mapping object and exact generation date', () => {
    expect(validateCatalogManifest({ ...manifest, files: ['qsSystems.json'] }).ok).toBe(false);
    expect(validateCatalogManifest({ ...manifest, generatedAt: '2026-08-03' }).ok).toBe(false);
    expect(
      validateCatalogManifest({ ...manifest, counts: { ...manifest.counts, 'qs-system': 4 } }).ok,
    ).toBe(false);
  });

  it('uses a payload-agnostic CatalogValue guard while specialized fields validate payloads', () => {
    expect(isCatalogValue(known('typed value'))).toBe(true);
    expect(isCatalogValue(known(123))).toBe(true);
    // @ts-expect-error The guard intentionally does not accept an unsafe payload type parameter.
    isCatalogValue<string>(known(123));
    const invalid = baseEntry('control.phlf', 'control-output');
    invalid.sequence = {
      status: 'available-public-accession',
      records: [
        {
          kind: 'Registry',
          accession: 'BBa_TEST',
          sequenceType: 'not-a-sequence-type' as never,
          version: unknown('version not reported'),
          orientation: 'forward',
          sourceRef: 'source-1',
          complete: true,
        },
      ],
      isCompleteSingleSequence: true,
    };
    expect(validateCatalogEntry(invalid, manifest).ok).toBe(false);
  });

  it('requires the canonical bundle return shape and fixed IDs/counts', () => {
    const qs = EXPECTED_ENTRY_IDS['qs-system'].map((id) => baseEntry(id, 'qs-system', 'system'));
    const sensors = EXPECTED_ENTRY_IDS['pollutant-sensor'].map((id) =>
      id === 'sensor.cadr' ? auditedCadR() : baseEntry(id, 'pollutant-sensor', 'system'),
    );
    const controls = EXPECTED_ENTRY_IDS['control-output'].map((id) =>
      baseEntry(id, 'control-output'),
    );
    const result = validateCatalogBundle({
      manifest,
      files: {
        qsSystems: file('qs-system', qs),
        pollutantSensors: file('pollutant-sensor', sensors),
        controlOutputParts: file('control-output', controls),
      },
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(Object.keys(result.value.files).sort()).toEqual([
        'control-output',
        'pollutant-sensor',
        'qs-system',
      ]);
    }
    expect(
      validateCatalogBundle({
        manifest,
        files: {
          qsSystems: file('qs-system', qs.slice(0, -1)),
          pollutantSensors: file('pollutant-sensor', sensors),
          controlOutputParts: file('control-output', controls),
        },
      }).ok,
    ).toBe(false);
  });

  it('requires CadR supplement audit and rejects an S. aureus CadC/PcadA substitute', () => {
    const unaudited = baseEntry('sensor.cadr', 'pollutant-sensor', 'system');
    expect(validateCatalogEntry(unaudited, manifest).ok).toBe(false);
    const audited = auditedCadR();
    expect(validateCatalogEntry(audited, manifest).ok).toBe(true);
    const substituted = {
      ...audited,
      name: { ...audited.name, en: 'Staphylococcus aureus CadC/PcadA substitute' },
    };
    expect(validateCatalogEntry(substituted, manifest).ok).toBe(false);
  });

  it('rejects normalized CadR substitute identity variants but allows boundary explanations', () => {
    const variants = [
      { ...auditedCadR(), name: { ...auditedCadR().name, en: 'S. aureus—CadC／PcadA substitute' } },
      {
        ...auditedCadR(),
        mechanism: { ...auditedCadR().mechanism, summary: 'PcadA and CadC from S. aureus' },
      },
      {
        ...auditedCadR(),
        name: { ...auditedCadR().name, en: 'PcadA, CadC — Staphylococcus aureus regulator' },
      },
    ];
    for (const variant of variants) expect(validateCatalogEntry(variant, manifest).ok).toBe(false);

    const explained = auditedCadR();
    explained.evidence = {
      ...explained.evidence,
      boundaryNotes: ['Do not substitute S. aureus CadC／PcadA for CadR.'],
    };
    explained.literature[0] = {
      ...explained.literature[0]!,
      title: 'Boundary note distinguishes S. aureus CadC/PcadA from CadR',
    };
    expect(validateCatalogEntry(explained, manifest).ok).toBe(true);
  });

  it('allows a CadR SI sequence gap with unknown status and explicit reason', () => {
    const cadr = auditedCadR();
    cadr.sequence = {
      status: 'not-reported',
      records: sequenceUnknown('SI does not provide an accession'),
      isCompleteSingleSequence: false,
    };
    expect(validateCatalogEntry(cadr, manifest).ok).toBe(true);
  });

  it('rejects a CadR unknown or not-reported sequence record without a reason', () => {
    const cadr = auditedCadR();
    cadr.sequence = {
      status: 'unknown',
      records: { state: 'unknown' },
      isCompleteSingleSequence: false,
    };
    expect(validateCatalogEntry(cadr, manifest).ok).toBe(false);
  });

  it('does not reject literature/context boundary text mentioning S. aureus CadC/PcadA', () => {
    const cadr = auditedCadR();
    cadr.literature[0] = {
      ...cadr.literature[0]!,
      title: 'Boundary note distinguishes Staphylococcus aureus CadC/PcadA from CadR',
    };
    cadr.context = {
      ...cadr.context,
      other: known('Do not substitute Staphylococcus aureus CadC/PcadA.'),
    };
    expect(validateCatalogEntry(cadr, manifest).ok).toBe(true);
  });
});

const allFilters = {
  query: '',
  nodeKind: 'all',
  category: 'all',
  entityType: 'all',
  host: 'all',
  strain: 'all',
  evidenceGrade: 'all',
  sequenceStatus: 'all',
  modelingCompatibility: 'all',
} as const;

const canonicalEntryIds = [
  'qs.cin',
  'qs.tra',
  'qs.rhl',
  'qs.esa',
  'qs.aub',
  'sensor.cadr',
  'sensor.chrb',
  'sensor.merr',
  'sensor.cuer',
  'sensor.narx-narl',
  'sensor.nahr',
  'sensor.xyls',
  'sensor.dmpr',
  'sensor.phnr',
  'control.mutalik-bcd-library',
  'control.anderson-j231-library',
  'control.phlf',
  'control.srpr',
  'control.bm3r1',
  'control.qacr',
  'control.amtr',
  'control.star',
  'control.toehold-switch',
  'control.ssra-asv-aav-family',
  'control.riboj',
  'output.sfgfp',
  'output.mneongreen',
] as const;

const realFileCases = [
  { category: 'qs-system', value: qsSystemsJson },
  { category: 'pollutant-sensor', value: pollutantSensorsJson },
  { category: 'control-output', value: controlOutputPartsJson },
] as const;

const realFileKeyByCategory: Record<CatalogCategory, string> = {
  'qs-system': 'qsSystems',
  'pollutant-sensor': 'pollutantSensors',
  'control-output': 'controlOutputParts',
};

const filterCases: ReadonlyArray<
  readonly [
    name: string,
    positive: Partial<CatalogSearchFilters>,
    negative: Partial<CatalogSearchFilters>,
  ]
> = [
  ['node kind', { nodeKind: 'sensor' }, { nodeKind: 'reporter' }],
  ['category', { category: 'pollutant-sensor' }, { category: 'qs-system' }],
  ['entity type', { entityType: 'system' }, { entityType: 'part' }],
  ['known host', { host: 'Escherichia coli' }, { host: 'Pseudomonas putida' }],
  ['known strain', { strain: 'EK317' }, { strain: 'DH5alpha' }],
  ['evidence grade', { evidenceGrade: 'A' }, { evidenceGrade: 'B' }],
  ['sequence status', { sequenceStatus: 'partial-public' }, { sequenceStatus: 'unknown' }],
  [
    'modeling compatibility',
    { modelingCompatibility: 'parameterizable-after-calibration' },
    { modelingCompatibility: 'not-compatible' },
  ],
];

function cloneRealFiles(): Array<{ category: CatalogCategory; value: unknown }> {
  return realFileCases.map(({ category, value }) => ({
    category,
    value: structuredClone(value),
  }));
}

function requireLoadedIndex(): CatalogIndex {
  const loaded = loadEvidenceCatalog();
  if (loaded.status !== 'ready') throw new Error(loaded.message);
  return loaded.index;
}

describe('evidence-backed catalog loader and index', () => {
  it('loads all 27 entries only when the manifest and category files agree', () => {
    const loaded = loadEvidenceCatalog();
    expect(loaded.status).toBe('ready');
    if (loaded.status !== 'ready') return;

    expect(loaded.index.entries).toHaveLength(27);
    expect(loaded.index.catalogVersion).toBe('evidence-backed-components@2026-08-02.1');
    expect(loaded.index.entries.map((entry) => entry.id)).toEqual(canonicalEntryIds);
  });

  it('restores canonical 27-ID order after every valid source file is shuffled', () => {
    const shuffledFiles = cloneRealFiles().map((file) => {
      const value = file.value as { entries: unknown[] };
      value.entries.reverse();
      return file;
    });
    const built = buildCatalogIndex({
      manifest: structuredClone(manifestJson),
      files: shuffledFiles,
    });

    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;
    expect(built.index.entries.map((entry) => entry.id)).toEqual(canonicalEntryIds);
    expect(searchCatalog(built.index, allFilters).map((entry) => entry.id)).toEqual(
      canonicalEntryIds,
    );
  });

  it('indexes IDs, aliases, signals, references, context, and accessions', () => {
    const index = requireLoadedIndex();
    const cadR = index.byId.get('sensor.cadr');
    expect(cadR?.id).toBe('sensor.cadr');

    for (const query of [
      'sensor.cadr',
      'CadR.10Z',
      '镉响应模块',
      'cadmium-response module',
      'cadmium-ii',
      'he-2021-cadr-biosensor',
      '33444502',
      '10.1021/acssensors.0c02204',
      'pubmed.ncbi.nlm.nih.gov',
      'EK317',
      'NZ_BDEP01000008.1',
    ]) {
      expect(searchCatalog(index, { ...allFilters, query })).toContain(cadR);
    }

    expect(index.tokensById.get('sensor.cadr')).toContain('cadr.10z');
    expect(index.byId.get('catalog.unknown')).toBeUndefined();
  });

  it.each(filterCases)(
    'filters by %s with independent positive and negative cases',
    (_name, positive, negative) => {
      const index = requireLoadedIndex();
      const cadR = index.byId.get('sensor.cadr');
      expect(cadR).toBeDefined();
      expect(searchCatalog(index, { ...allFilters, ...positive })).toContain(cadR);
      expect(searchCatalog(index, { ...allFilters, ...negative })).not.toContain(cadR);
    },
  );

  it('does not match unknown host or strain reasons as known filter values', () => {
    const index = requireLoadedIndex();
    const cin = index.byId.get('qs.cin');
    expect(cin).toBeDefined();
    if (!cin) return;

    expect(cin.context.host.state).toBe('unknown');
    expect(cin.context.strain.state).toBe('unknown');
    if (cin.context.host.state !== 'unknown' || cin.context.strain.state !== 'unknown') return;
    expect(cin.context.host.reason).toBeTruthy();
    expect(cin.context.strain.reason).toBeTruthy();
    if (!cin.context.host.reason || !cin.context.strain.reason) return;

    expect(searchCatalog(index, { ...allFilters, host: cin.context.host.reason })).not.toContain(
      cin,
    );
    expect(
      searchCatalog(index, { ...allFilters, strain: cin.context.strain.reason }),
    ).not.toContain(cin);
  });

  it('preserves source JSON values while isolating the index from caller mutation', () => {
    const mutableManifest = structuredClone(manifestJson);
    const mutableQs = structuredClone(qsSystemsJson);
    const mutableSensors = structuredClone(pollutantSensorsJson);
    const mutableControls = structuredClone(controlOutputPartsJson);
    const built = buildCatalogIndex({
      manifest: mutableManifest,
      files: [
        { category: 'qs-system', value: mutableQs },
        { category: 'pollutant-sensor', value: mutableSensors },
        { category: 'control-output', value: mutableControls },
      ],
    });
    expect(built.status).toBe('ready');
    if (built.status !== 'ready') return;

    const originalCadR = pollutantSensorsJson.entries.find((entry) => entry.id === 'sensor.cadr');
    expect(built.index.byId.get('sensor.cadr')).toEqual(originalCadR);

    mutableManifest.catalogVersion = 'caller-mutation';
    mutableSensors.entries[0]!.name.en = 'caller-mutation';
    mutableSensors.entries[0]!.name.aliases.push('caller-mutation');

    expect(built.index.catalogVersion).toBe('evidence-backed-components@2026-08-02.1');
    expect(built.index.byId.get('sensor.cadr')?.name.en).not.toBe('caller-mutation');
    expect(built.index.byId.get('sensor.cadr')?.name.aliases).not.toContain('caller-mutation');
    expect(Object.isFrozen(built.index.entries)).toBe(true);
    expect(Object.isFrozen(built.index.byId.get('sensor.cadr')?.name.aliases)).toBe(true);
    expect((built.index.byId as unknown as { set?: unknown }).set).toBeUndefined();
    expect((built.index.tokensById as unknown as { clear?: unknown }).clear).toBeUndefined();
    expect(() => (built.index.entries as CatalogEntry[]).push(built.index.entries[0]!)).toThrow();
  });

  it('rejects a wrong manifest version even when all three files are otherwise valid', () => {
    const invalid = buildCatalogIndex({
      manifest: { ...manifest, catalogVersion: 'wrong' },
      files: cloneRealFiles(),
    });
    expect(invalid.status).toBe('unavailable');
    if (invalid.status === 'unavailable') {
      expect(invalid.errors.some((error) => error.path === 'bundle.manifest.catalogVersion')).toBe(
        true,
      );
    }
  });

  it.each(realFileCases)('rejects a bundle missing the $category file', ({ category }) => {
    const invalid = buildCatalogIndex({
      manifest: structuredClone(manifestJson),
      files: cloneRealFiles().filter((file) => file.category !== category),
    });
    expect(invalid.status).toBe('unavailable');
    if (invalid.status === 'unavailable') {
      expect(
        invalid.errors.some((error) =>
          error.path.includes(`bundle.files.${realFileKeyByCategory[category]}`),
        ),
      ).toBe(true);
    }
  });

  it.each(realFileCases)('rejects a malformed $category file', ({ category }) => {
    const invalid = buildCatalogIndex({
      manifest: structuredClone(manifestJson),
      files: cloneRealFiles().map((file) =>
        file.category === category ? { ...file, value: { malformed: true } } : file,
      ),
    });
    expect(invalid.status).toBe('unavailable');
    if (invalid.status === 'unavailable') {
      expect(
        invalid.errors.some((error) =>
          error.path.includes(`bundle.files.${realFileKeyByCategory[category]}`),
        ),
      ).toBe(true);
    }
  });
});
