import { createDemoBfnProject } from '../../fixtures';
import type {
  BfnAccumulatorDynamicModel,
  BfnContext,
  BfnDynamicModel,
  BfnFunctionalModule,
  BfnProject,
  BfnStaticModel,
} from '../../types';
import { getDesignedSenderSignalCatalog } from '../../user-defined/designed-sender/designedSenderSignalCatalog';
import { captureReusableModuleTemplatePayload } from './templateCapture';
import { createBfnModuleTemplateVersionV1 } from './templateParser';
import type {
  BfnModuleTemplateVersionV1,
  BfnReusableModulePayloadV1,
  BfnTemplateCaptureOptions,
} from './templateTypes';

export const FIXTURE_TIME = '2026-09-02T00:00:00.000Z';

export function createBlankTemplateProject(id = 'project.blank'): BfnProject {
  const project = createDemoBfnProject();
  project.id = id;
  project.isDemo = false;
  project.createdAt = FIXTURE_TIME;
  project.updatedAt = FIXTURE_TIME;
  project.network = {
    id: `${id}.network`,
    labelKey: 'bfn.template.fixture.network',
    mode: 'static',
    inputSources: [],
    modules: [],
    outputMonitors: [],
    edges: [],
  };
  project.registry = {
    entities: [],
    provenanceRecords: [],
    contexts: [],
    validityDomains: [],
    datasets: [],
    implementations: [],
    calibrationMaps: [],
  };
  return project;
}

export function createStaticTemplateProject(moduleId = 'source.module.static'): BfnProject {
  const project = createBlankTemplateProject('project.source.static');
  const inputId = `${moduleId}.port.in`;
  const outputId = `${moduleId}.port.out`;
  const contextId = `${moduleId}.context`;
  const domainId = `${moduleId}.domain`;
  const modelId = `${moduleId}.static`;
  const response = {
    family: 'hill_activation' as const,
    inputPortId: inputId,
    ymin: { value: 0.1, unit: 'RPU' as const, interval95: [0.05, 0.15] as const },
    ymax: { value: 1.2, unit: 'RPU' as const, interval95: [1, 1.4] as const },
    k: { value: 12, unit: 'nM' as const, interval95: [10, 14] as const },
    n: { value: 2, unit: 'dimensionless' as const, interval95: [1.5, 2.5] as const },
  };
  const model: BfnStaticModel = {
    id: modelId,
    version: '1.2.3',
    mode: 'static',
    family: 'hill_activation',
    response,
    contextId,
    validityDomainId: domainId,
    sourceDatasetIds: [],
    provenanceIds: [`${moduleId}.provenance.model`],
    evidenceGrade: 'fitted_from_published_data',
    uncertaintyMethod: 'parameter_interval_envelope',
    isDemo: false,
  };
  const module = baseModule(moduleId, model, inputId, outputId);
  project.network.modules.push(module);
  project.registry.entities.push(
    {
      id: `${moduleId}.entity.input`,
      origin: 'user_defined',
      displayName: 'Inducer X',
      description: 'A private input entity.',
    },
    {
      id: `${moduleId}.entity.output`,
      origin: 'user_defined',
      displayName: 'Reporter Y',
      description: null,
    },
  );
  project.registry.contexts.push(fullContext(contextId));
  project.registry.validityDomains.push({
    id: domainId,
    labelKey: 'bfn.template.fixture.domain',
    inputRanges: [{ portId: inputId, minimum: 0.1, maximum: 100, unit: 'nM' }],
    timeRangeHours: [0, 12],
    contextId,
  });
  project.registry.provenanceRecords.push(
    {
      id: `${moduleId}.provenance.model`,
      kind: 'publication',
      reference: 'doi:10.0000/template-model',
    },
    {
      id: `${moduleId}.provenance.implementation`,
      kind: 'repository_record',
      reference: 'registry:template-implementation',
    },
  );
  project.registry.implementations.push({
    id: `${moduleId}.implementation`,
    labelKey: 'bfn.template.fixture.implementation',
    promoter: 'P_TEST',
    operator: 'O_TEST',
    rbs: 'RBS_TEST',
    codingSequence: 'CDS_TEST',
    degradationTag: 'TAG_TEST',
    plasmidBackbone: 'BACKBONE_TEST',
    host: 'Escherichia coli',
    strainComposition: 'one-strain fixture',
    evidenceGrade: 'proposed_unbuilt_design',
    maturity: 'designed',
    provenanceIds: [`${moduleId}.provenance.model`, `${moduleId}.provenance.implementation`],
    isDemo: false,
  });
  return project;
}

export function createFirstOrderTemplateProject(
  moduleId = 'source.module.first-order',
): BfnProject {
  const project = createStaticTemplateProject(moduleId);
  project.network.mode = 'dynamic';
  const module = project.network.modules[0]!;
  const staticModel = module.modelVariants[0] as BfnStaticModel;
  const dynamicModel: BfnDynamicModel = {
    id: `${moduleId}.dynamic`,
    version: staticModel.version,
    mode: 'dynamic',
    family: 'first_order',
    steadyStateResponse: structuredClone(staticModel.response),
    tau: { value: 2.5, unit: 'h', interval95: [2, 3] },
    initialState: 0.12,
    contextId: staticModel.contextId,
    validityDomainId: staticModel.validityDomainId,
    sourceDatasetIds: [],
    provenanceIds: [...staticModel.provenanceIds],
    evidenceGrade: staticModel.evidenceGrade,
    uncertaintyMethod: staticModel.uncertaintyMethod,
    isDemo: false,
  };
  module.modelVariants.push(dynamicModel);
  module.activeModelIds = { static: staticModel.id, dynamic: dynamicModel.id };
  return project;
}

export function createAccumulatorTemplateProject(
  moduleId = 'source.module.accumulator',
): BfnProject {
  const project = createBlankTemplateProject('project.source.accumulator');
  project.network.mode = 'dynamic';
  const canonical = getDesignedSenderSignalCatalog()[0];
  if (!canonical) throw new Error('Canonical signal fixture unavailable.');
  const inputId = `${moduleId}.port.production`;
  const outputId = `${moduleId}.port.concentration`;
  const model: BfnAccumulatorDynamicModel = {
    id: `${moduleId}.accumulator`,
    version: '1.0.0',
    mode: 'dynamic',
    family: 'accumulator',
    inputPortId: inputId,
    outputPortId: outputId,
    initialState: 2,
    contextId: null,
    validityDomainId: `${moduleId}.domain`,
    sourceDatasetIds: [],
    provenanceIds: [],
    evidenceGrade: 'independent_assumption',
    uncertaintyMethod: 'none',
    isDemo: false,
  };
  const module: BfnFunctionalModule = {
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.signalPool.moduleLabel',
    authoring: { origin: 'user_defined', name: 'Signal Pool fixture', description: null },
    descriptionKey: 'bfn.signalPool.description',
    inputPorts: [
      {
        id: inputId,
        entity: canonical.entityId,
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputId,
        entity: canonical.entityId,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { dynamic: model.id },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 100, y: 100 },
    isDemo: false,
  };
  project.network.modules.push(module);
  project.registry.validityDomains.push({
    id: model.validityDomainId,
    labelKey: 'bfn.signalPool.validityDomain',
    inputRanges: [],
    contextId: null,
  });
  return project;
}

export function captureStaticFixture(
  project = createStaticTemplateProject(),
): BfnReusableModulePayloadV1 {
  const module = project.network.modules[0]!;
  return captureFixture(project, module.id, {
    entityPolicies: Object.fromEntries(
      [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
    ),
  });
}

export function captureFirstOrderFixture(): BfnReusableModulePayloadV1 {
  const project = createFirstOrderTemplateProject();
  return captureStaticFixture(project);
}

export function captureAccumulatorFixture(): BfnReusableModulePayloadV1 {
  const project = createAccumulatorTemplateProject();
  return captureFixture(project, project.network.modules[0]!.id, { entityPolicies: {} });
}

export function versionForPayload(
  payload: BfnReusableModulePayloadV1,
  templateId = 'template.fixture',
): BfnModuleTemplateVersionV1 {
  return createBfnModuleTemplateVersionV1({
    templateId,
    revision: 1,
    createdAt: FIXTURE_TIME,
    note: null,
    payload,
  });
}

export function captureFixture(
  project: BfnProject,
  moduleId: string,
  options: BfnTemplateCaptureOptions,
): BfnReusableModulePayloadV1 {
  const result = captureReusableModuleTemplatePayload(project, moduleId, options);
  if (!result.ok) {
    throw new Error(result.issues.map((item) => `${item.code}:${item.path}`).join(','));
  }
  return result.payload;
}

function baseModule(
  moduleId: string,
  model: BfnStaticModel,
  inputId: string,
  outputId: string,
): BfnFunctionalModule {
  return {
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.userDefined.genericModule',
    authoring: {
      origin: 'user_defined',
      name: 'Static template fixture',
      description: 'Source presentation metadata.',
    },
    descriptionKey: 'bfn.userDefined.genericDescription',
    inputPorts: [
      {
        id: inputId,
        authoring: { origin: 'user_defined', name: 'Input role' },
        entity: `${moduleId}.entity.input`,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputId,
        authoring: { origin: 'user_defined', name: 'Output role' },
        entity: `${moduleId}.entity.output`,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
    ],
    modelVariants: [model],
    activeModelIds: { static: model.id },
    implementationIds: [`${moduleId}.implementation`],
    implementationState: 'designed',
    evidenceGrade: 'fitted_from_published_data',
    position: { x: 350, y: 160 },
    isDemo: false,
  };
}

function fullContext(id: string): BfnContext {
  return {
    id,
    labelKey: 'bfn.template.fixture.context',
    documentationState: 'recorded',
    host: 'Escherichia coli',
    strain: 'MG1655',
    medium: 'M9 glucose',
    temperatureCelsius: 37,
    ph: 7.1,
    oxygenation: 'aerobic shaking',
    growthPhase: 'mid-log',
    plasmidBackbone: 'p15A',
    copyNumberRegime: 'medium-copy',
    inductionProtocol: 'induce at OD600 0.4',
    measurementTimeHours: 6,
    batch: 'batch-42',
    isDemo: false,
  };
}
