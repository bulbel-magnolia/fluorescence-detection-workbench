import type {
  BfnBiologicalImplementation,
  BfnCalibrationMap,
  BfnContext,
  BfnExperimentalDataset,
  BfnFunctionalModule,
  BfnProject,
  BfnValidityDomain,
} from './types';

export type BfnCatalogModuleId = 'ahl-sensor' | 'reporter' | 'dual-input-gate';

export interface BfnCatalogModuleSummary {
  id: BfnCatalogModuleId;
  labelKey: string;
  descriptionKey: string;
  modelFamilyKey: string;
  evidenceKey: string;
}

export const bfnModuleCatalog: BfnCatalogModuleSummary[] = [
  {
    id: 'ahl-sensor',
    labelKey: 'bfn.modules.ahlSensor.name',
    descriptionKey: 'bfn.modules.ahlSensor.catalogDescription',
    modelFamilyKey: 'bfn.modelFamilies.hill_activation',
    evidenceKey: 'bfn.evidence.data_driven_prediction',
  },
  {
    id: 'reporter',
    labelKey: 'bfn.modules.reporter.name',
    descriptionKey: 'bfn.modules.reporter.catalogDescription',
    modelFamilyKey: 'bfn.modelFamilies.linear_transfer',
    evidenceKey: 'bfn.evidence.mechanistic_model_only',
  },
  {
    id: 'dual-input-gate',
    labelKey: 'bfn.modules.dualInput.name',
    descriptionKey: 'bfn.modules.dualInput.catalogDescription',
    modelFamilyKey: 'bfn.modelFamilies.independent_inputs',
    evidenceKey: 'bfn.evidence.independent_assumption',
  },
];

const demoContext: BfnContext = {
  id: 'ctx-demo-ecoli',
  labelKey: 'bfn.contexts.demoEcoli',
  documentationState: 'recorded',
  host: 'Escherichia coli',
  strain: 'DEMO-STRAIN',
  medium: 'DEMO-MEDIUM',
  temperatureCelsius: 37,
  ph: 7,
  oxygenation: 'illustrative-aerobic',
  growthPhase: 'illustrative-mid-log',
  plasmidBackbone: 'DEMO-BACKBONE',
  copyNumberRegime: 'illustrative-low-copy',
  inductionProtocol: 'illustrative-protocol',
  measurementTimeHours: 6,
  batch: 'DEMO-BATCH',
  isDemo: true,
};

const sensorDomain: BfnValidityDomain = {
  id: 'domain-demo-ahl',
  labelKey: 'bfn.domains.ahlDemo',
  inputRanges: [{ portId: 'ahl-sensor-in', minimum: 0.1, maximum: 100, unit: 'nM' }],
  timeRangeHours: [0, 8],
  contextId: demoContext.id,
};

const reporterDomain: BfnValidityDomain = {
  id: 'domain-demo-reporter',
  labelKey: 'bfn.domains.reporterDemo',
  inputRanges: [{ portId: 'reporter-in', minimum: 0, maximum: 1, unit: 'dimensionless' }],
  timeRangeHours: [0, 8],
  contextId: demoContext.id,
};

const dataset: BfnExperimentalDataset = {
  id: 'dataset-demo-dose-response',
  labelKey: 'bfn.datasets.demoDoseResponse',
  dataType: 'dose_response',
  inputEntities: ['3OC6-HSL'],
  outputEntities: ['normalized_promoter_activity'],
  replicates: 3,
  contextId: demoContext.id,
  rawFile: null,
  calibrationId: null,
  evidenceGrade: 'data_driven_prediction',
  isDemo: true,
};

const implementations: BfnBiologicalImplementation[] = [
  {
    id: 'impl-demo-sensor-a',
    labelKey: 'bfn.implementations.sensorA',
    promoter: 'P_SENSOR_DEMO',
    operator: 'OPERATOR_DEMO',
    rbs: 'RBS_MID_DEMO',
    codingSequence: 'RECEPTOR_CDS_DEMO',
    degradationTag: 'NONE_DEMO',
    plasmidBackbone: 'DEMO-BACKBONE',
    host: 'DEMO-STRAIN',
    strainComposition: null,
    evidenceGrade: 'proposed_unbuilt_design',
    maturity: 'not_recorded',
    provenanceIds: [],
    isDemo: true,
  },
  {
    id: 'impl-demo-reporter-a',
    labelKey: 'bfn.implementations.reporterA',
    promoter: 'P_REPORTER_DEMO',
    operator: null,
    rbs: 'RBS_REPORTER_DEMO',
    codingSequence: 'REPORTER_CDS_DEMO',
    degradationTag: 'TAG_DEMO',
    plasmidBackbone: 'DEMO-BACKBONE',
    host: 'DEMO-STRAIN',
    strainComposition: null,
    evidenceGrade: 'proposed_unbuilt_design',
    maturity: 'not_recorded',
    provenanceIds: [],
    isDemo: true,
  },
];

function sensorModule(id = 'module-ahl-sensor'): BfnFunctionalModule {
  return {
    kind: 'functional_module',
    id,
    labelKey: 'bfn.modules.ahlSensor.name',
    descriptionKey: 'bfn.modules.ahlSensor.description',
    inputPorts: [
      {
        id: `${id}-in`,
        entity: '3OC6-HSL',
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: `${id}-out`,
        entity: 'normalized_promoter_activity',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: `${id}-static-v1`,
        version: '2.0-demo.1',
        mode: 'static',
        family: 'hill_activation',
        response: {
          family: 'hill_activation',
          inputPortId: `${id}-in`,
          ymin: { value: 0.03, unit: 'dimensionless', interval95: [0.02, 0.05] },
          ymax: { value: 0.95, unit: 'dimensionless', interval95: [0.89, 1] },
          k: { value: 10, unit: 'nM', interval95: [8.5, 12] },
          n: { value: 2, unit: 'dimensionless', interval95: [1.7, 2.3] },
        },
        contextId: demoContext.id,
        validityDomainId: sensorDomain.id,
        sourceDatasetIds: [dataset.id],
        provenanceIds: [],
        evidenceGrade: 'data_driven_prediction',
        uncertaintyMethod: 'parameter_interval_envelope',
        isDemo: true,
      },
      {
        id: `${id}-dynamic-v1`,
        version: '2.0-demo.1',
        mode: 'dynamic',
        family: 'first_order',
        steadyStateResponse: {
          family: 'hill_activation',
          inputPortId: `${id}-in`,
          ymin: { value: 0.03, unit: 'dimensionless', interval95: [0.02, 0.05] },
          ymax: { value: 0.95, unit: 'dimensionless', interval95: [0.89, 1] },
          k: { value: 10, unit: 'nM', interval95: [8.5, 12] },
          n: { value: 2, unit: 'dimensionless', interval95: [1.7, 2.3] },
        },
        tau: { value: 0.8, unit: 'h', interval95: [0.6, 1.1] },
        initialState: 0.03,
        contextId: demoContext.id,
        validityDomainId: sensorDomain.id,
        sourceDatasetIds: [dataset.id],
        provenanceIds: [],
        evidenceGrade: 'data_driven_prediction',
        uncertaintyMethod: 'parameter_interval_envelope',
        isDemo: true,
      },
    ],
    activeModelIds: {
      static: `${id}-static-v1`,
      dynamic: `${id}-dynamic-v1`,
    },
    implementationIds: ['impl-demo-sensor-a'],
    implementationState: 'not_recorded',
    evidenceGrade: 'data_driven_prediction',
    position: { x: 290, y: 126 },
    isDemo: true,
  };
}

function reporterModule(id = 'module-reporter'): BfnFunctionalModule {
  return {
    kind: 'functional_module',
    id,
    labelKey: 'bfn.modules.reporter.name',
    descriptionKey: 'bfn.modules.reporter.description',
    inputPorts: [
      {
        id: `${id}-in`,
        entity: 'normalized_promoter_activity',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: `${id}-out`,
        entity: 'normalized_reporter_expression',
        quantityType: 'expression_level',
        unit: 'dimensionless',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: `${id}-static-v1`,
        version: '2.0-demo.1',
        mode: 'static',
        family: 'linear_transfer',
        response: {
          family: 'linear_transfer',
          inputPortId: `${id}-in`,
          scale: { value: 0.94, unit: 'dimensionless', interval95: [0.9, 0.98] },
          intercept: { value: 0.01, unit: 'dimensionless', interval95: [0, 0.02] },
          outputMinimum: 0,
          outputMaximum: 1,
        },
        contextId: demoContext.id,
        validityDomainId: reporterDomain.id,
        sourceDatasetIds: [dataset.id],
        provenanceIds: [],
        evidenceGrade: 'mechanistic_model_only',
        uncertaintyMethod: 'parameter_interval_envelope',
        isDemo: true,
      },
      {
        id: `${id}-dynamic-v1`,
        version: '2.0-demo.1',
        mode: 'dynamic',
        family: 'first_order',
        steadyStateResponse: {
          family: 'linear_transfer',
          inputPortId: `${id}-in`,
          scale: { value: 0.94, unit: 'dimensionless', interval95: [0.9, 0.98] },
          intercept: { value: 0.01, unit: 'dimensionless', interval95: [0, 0.02] },
          outputMinimum: 0,
          outputMaximum: 1,
        },
        tau: { value: 0.45, unit: 'h', interval95: [0.3, 0.7] },
        initialState: 0.01,
        contextId: demoContext.id,
        validityDomainId: reporterDomain.id,
        sourceDatasetIds: [dataset.id],
        provenanceIds: [],
        evidenceGrade: 'mechanistic_model_only',
        uncertaintyMethod: 'parameter_interval_envelope',
        isDemo: true,
      },
    ],
    activeModelIds: {
      static: `${id}-static-v1`,
      dynamic: `${id}-dynamic-v1`,
    },
    implementationIds: ['impl-demo-reporter-a'],
    implementationState: 'not_recorded',
    evidenceGrade: 'mechanistic_model_only',
    position: { x: 555, y: 126 },
    isDemo: true,
  };
}

function dualInputModule(id: string): BfnFunctionalModule {
  return {
    kind: 'functional_module',
    id,
    labelKey: 'bfn.modules.dualInput.name',
    descriptionKey: 'bfn.modules.dualInput.description',
    inputPorts: [
      {
        id: `${id}-in-a`,
        entity: 'normalized_signal_a',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'input',
      },
      {
        id: `${id}-in-b`,
        entity: 'normalized_signal_b',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: `${id}-out`,
        entity: 'normalized_gate_output',
        quantityType: 'activity',
        unit: 'dimensionless',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: `${id}-static-v1`,
        version: '2.0-demo.1',
        mode: 'static',
        family: 'independent_inputs',
        response: {
          family: 'independent_inputs',
          basal: { value: 0.02, unit: 'dimensionless', interval95: [0.01, 0.04] },
          outputMaximum: { value: 1, unit: 'dimensionless', interval95: [0.9, 1] },
          aggregation: 'bounded_sum',
          interactionAssumption: 'independent_unverified',
          terms: [
            {
              inputPortId: `${id}-in-a`,
              direction: 'activation',
              k: { value: 0.5, unit: 'dimensionless', interval95: [0.4, 0.6] },
              n: { value: 2, unit: 'dimensionless', interval95: [1.5, 2.5] },
              contribution: { value: 0.49, unit: 'dimensionless', interval95: [0.4, 0.55] },
            },
            {
              inputPortId: `${id}-in-b`,
              direction: 'activation',
              k: { value: 0.5, unit: 'dimensionless', interval95: [0.4, 0.6] },
              n: { value: 2, unit: 'dimensionless', interval95: [1.5, 2.5] },
              contribution: { value: 0.49, unit: 'dimensionless', interval95: [0.4, 0.55] },
            },
          ],
        },
        contextId: demoContext.id,
        validityDomainId: reporterDomain.id,
        sourceDatasetIds: [dataset.id],
        provenanceIds: [],
        evidenceGrade: 'independent_assumption',
        uncertaintyMethod: 'parameter_interval_envelope',
        isDemo: true,
      },
    ],
    activeModelIds: { static: `${id}-static-v1` },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 410, y: 330 },
    isDemo: true,
  };
}

const calibrationMap: BfnCalibrationMap = {
  id: 'calibration-map-demo-sensor',
  labelKey: 'bfn.calibration.demoSensor',
  targetModuleId: 'module-ahl-sensor',
  modelType: 'lookup_table',
  contextId: demoContext.id,
  sourceDatasetIds: [dataset.id],
  isDemo: true,
  candidates: [
    {
      id: 'candidate-demo-balanced',
      labelKey: 'bfn.candidates.balanced',
      designVariables: {
        promoter: 'P_DEMO_BALANCED',
        rbs: 'RBS_DEMO_MEDIUM',
        copyNumber: 'LOW_COPY_DEMO',
        degradationTag: 'TAG_DEMO_MEDIUM',
        receptorLevel: 'MEDIUM_DEMO',
        strainRatio: null,
      },
      predictedParameters: { ymin: 0.035, ymax: 0.94, k: 10, n: 2.1, tauHours: 1.2 },
      burden: 0.24,
      crosstalk: 0.08,
      noise: 0.18,
      geneticStability: 0.82,
      uncertainty: 0.16,
      sourceEvidenceGrade: 'data_driven_prediction',
      isDemo: true,
    },
    {
      id: 'candidate-demo-fast',
      labelKey: 'bfn.candidates.fast',
      designVariables: {
        promoter: 'P_DEMO_FAST',
        rbs: 'RBS_DEMO_STRONG',
        copyNumber: 'MEDIUM_COPY_DEMO',
        degradationTag: 'TAG_DEMO_FAST',
        receptorLevel: 'HIGH_DEMO',
        strainRatio: null,
      },
      predictedParameters: { ymin: 0.055, ymax: 0.98, k: 8.5, n: 2.35, tauHours: 0.75 },
      burden: 0.46,
      crosstalk: 0.13,
      noise: 0.25,
      geneticStability: 0.68,
      uncertainty: 0.21,
      sourceEvidenceGrade: 'data_driven_prediction',
      isDemo: true,
    },
    {
      id: 'candidate-demo-stable',
      labelKey: 'bfn.candidates.stable',
      designVariables: {
        promoter: 'P_DEMO_STABLE',
        rbs: 'RBS_DEMO_WEAK',
        copyNumber: 'LOW_COPY_DEMO',
        degradationTag: 'NONE_DEMO',
        receptorLevel: 'LOW_DEMO',
        strainRatio: null,
      },
      predictedParameters: { ymin: 0.02, ymax: 0.86, k: 13, n: 1.8, tauHours: 1.7 },
      burden: 0.13,
      crosstalk: 0.05,
      noise: 0.12,
      geneticStability: 0.91,
      uncertainty: 0.19,
      sourceEvidenceGrade: 'mechanistic_model_only',
      isDemo: true,
    },
  ],
};

export function createCatalogModule(
  catalogId: BfnCatalogModuleId,
  suffix: string,
): BfnFunctionalModule {
  if (catalogId === 'ahl-sensor') return sensorModule(`module-ahl-sensor-${suffix}`);
  if (catalogId === 'reporter') return reporterModule(`module-reporter-${suffix}`);
  return dualInputModule(`module-dual-input-${suffix}`);
}

export function createDemoBfnProject(now = '2026-08-20T00:00:00.000Z'): BfnProject {
  const sensor = sensorModule();
  const reporter = reporterModule();
  return {
    schema: 'BFN-IR',
    schemaVersion: '2.2',
    id: 'bfn-project-demo-v2',
    labelKey: 'bfn.project.demoName',
    network: {
      id: 'network-demo-ahl-reporter',
      labelKey: 'bfn.network.demoName',
      mode: 'static',
      inputSources: [
        {
          kind: 'input_source',
          id: 'source-ahl',
          labelKey: 'bfn.sources.ahl',
          outputPort: {
            id: 'source-ahl-out',
            entity: '3OC6-HSL',
            quantityType: 'concentration',
            unit: 'nM',
            direction: 'output',
          },
          staticSpecification: {
            type: 'working_range',
            minimum: 5,
            maximum: 20,
            points: 33,
            unit: 'nM',
          },
          dynamicSpecification: {
            type: 'step',
            before: 0,
            after: 20,
            atHours: 1,
            unit: 'nM',
          },
          position: { x: 24, y: 142 },
        },
      ],
      modules: [sensor, reporter],
      outputMonitors: [
        {
          kind: 'output_monitor',
          id: 'monitor-reporter',
          labelKey: 'bfn.monitors.reporter',
          inputPort: {
            id: 'monitor-reporter-in',
            entity: 'normalized_reporter_expression',
            quantityType: 'expression_level',
            unit: 'dimensionless',
            direction: 'input',
          },
          position: { x: 806, y: 142 },
        },
      ],
      edges: [
        {
          id: 'edge-source-sensor',
          source: { nodeId: 'source-ahl', portId: 'source-ahl-out' },
          target: { nodeId: sensor.id, portId: sensor.inputPorts[0]!.id },
          mapping: 'identity',
          enabled: true,
        },
        {
          id: 'edge-sensor-reporter',
          source: { nodeId: sensor.id, portId: sensor.outputPorts[0]!.id },
          target: { nodeId: reporter.id, portId: reporter.inputPorts[0]!.id },
          mapping: 'identity',
          enabled: true,
        },
        {
          id: 'edge-reporter-monitor',
          source: { nodeId: reporter.id, portId: reporter.outputPorts[0]!.id },
          target: { nodeId: 'monitor-reporter', portId: 'monitor-reporter-in' },
          mapping: 'identity',
          enabled: true,
        },
      ],
    },
    registry: {
      entities: [],
      provenanceRecords: [],
      contexts: [structuredClone(demoContext)],
      validityDomains: [
        {
          ...structuredClone(sensorDomain),
          inputRanges: [
            {
              ...sensorDomain.inputRanges[0]!,
              portId: sensor.inputPorts[0]!.id,
            },
          ],
        },
        {
          ...structuredClone(reporterDomain),
          inputRanges: [
            {
              ...reporterDomain.inputRanges[0]!,
              portId: reporter.inputPorts[0]!.id,
            },
          ],
        },
      ],
      datasets: [structuredClone(dataset)],
      implementations: structuredClone(implementations),
      calibrationMaps: [structuredClone(calibrationMap)],
    },
    analysis: {
      durationHours: 8,
      timeStepHours: 0.1,
      annThresholds: { minimumR2: 0.9, maximumNrmse: 0.1 },
    },
    createdAt: now,
    updatedAt: now,
    isDemo: true,
  };
}
