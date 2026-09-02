import { describe, expect, it } from 'vitest';
import {
  buildAllBfnCatalogRuntimeCandidates,
  instantiateCatalogResponseInBfnProject,
} from '../../catalog/catalogBfnAdapter';
import { runBfnSimulation } from '../../simulation';
import type { BfnProject } from '../../types';
import type { DesignedSenderAuthoringState } from '../../user-defined/designed-sender/designedSenderContract';
import {
  buildDesignedSenderDraft,
  createInitialDesignedSenderAuthoringState,
} from '../../user-defined/designed-sender/designedSenderDraft';
import { getDesignedSenderSignalCatalog } from '../../user-defined/designed-sender/designedSenderSignalCatalog';
import type { SignalPoolDraft } from '../../user-defined/signal-pool/signalPoolContract';
import { materializeSignalPool } from '../../user-defined/signal-pool/signalPoolMaterialization';
import { materializeUserDefinedStaticModule } from '../../user-defined/userModuleMaterialization';
import { captureReusableModuleTemplatePayload } from './templateCapture';
import { instantiateReusableModuleTemplate } from './templateInstantiation';
import { createReusableModuleScientificProjection } from './templateProjection';
import {
  captureFixture,
  createAccumulatorTemplateProject,
  createBlankTemplateProject,
  createFirstOrderTemplateProject,
  createStaticTemplateProject,
  versionForPayload,
} from './templateTestFixtures';

describe('reusable module template capture', () => {
  it('is deterministic across repeated capture and scientifically identical source IDs', () => {
    const firstProject = createStaticTemplateProject('source.module.deterministic-one');
    const secondProject = createStaticTemplateProject('source.module.deterministic-two');
    const first = captureFixtureWithEmbedded(firstProject);
    const repeated = captureFixtureWithEmbedded(firstProject);
    const second = captureFixtureWithEmbedded(secondProject);

    expect(repeated).toEqual(first);
    expect(second).toEqual(first);
  });

  it('captures a static module and the complete minimal dependency closure without source IDs', () => {
    const project = createStaticTemplateProject();
    const before = structuredClone(project);
    const module = project.network.modules[0]!;
    const result = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: {
        [module.inputPorts[0]!.entity]: 'embedded',
        [module.outputPorts[0]!.entity]: 'embedded',
      },
    });

    expect(result.ok).toBe(true);
    expect(project).toEqual(before);
    if (!result.ok) return;
    expect(result.payload).toMatchObject({
      moduleClass: 'static',
      activeModels: { static: 'model.static' },
      moduleEvidenceGrade: 'fitted_from_published_data',
      implementationState: 'designed',
    });
    expect(result.payload.ports.map((port) => port.key)).toEqual(['port.input.1', 'port.output.1']);
    expect(result.payload.contexts[0]).toMatchObject({
      host: 'Escherichia coli',
      strain: 'MG1655',
      oxygenation: 'aerobic shaking',
      growthPhase: 'mid-log',
      inductionProtocol: 'induce at OD600 0.4',
      batch: 'batch-42',
    });
    expect(result.payload.validityDomains[0]).toMatchObject({
      inputRanges: [{ portKey: 'port.input.1', minimum: 0.1, maximum: 100, unit: 'nM' }],
      timeRangeHours: [0, 12],
    });
    expect(result.payload.provenance).toHaveLength(2);
    expect(result.payload.implementations[0]).toMatchObject({
      promoter: 'P_TEST',
      maturity: 'designed',
      provenanceKeys: ['provenance.1', 'provenance.2'],
    });
    const serialized = JSON.stringify(result.payload);
    expect(serialized).not.toContain(module.id);
    expect(serialized).not.toContain(module.inputPorts[0]!.id);
    expect(serialized).not.toContain(module.modelVariants[0]!.id);
    expect(serialized).not.toContain('"position"');
  });

  it('captures paired first-order active models with response, tau, C0, intervals, and time range', () => {
    const project = createFirstOrderTemplateProject();
    const module = project.network.modules[0]!;
    const payload = captureFixture(project, module.id, {
      entityPolicies: {
        [module.inputPorts[0]!.entity]: 'embedded',
        [module.outputPorts[0]!.entity]: 'embedded',
      },
    });

    expect(payload.moduleClass).toBe('first_order');
    if (payload.moduleClass !== 'first_order') return;
    expect(payload.activeModels).toEqual({
      static: 'model.static',
      dynamic: 'model.dynamic',
    });
    expect(payload.models.dynamic.steadyStateResponse).toEqual(payload.models.static.response);
    expect(payload.models.dynamic.tau).toEqual({ value: 2.5, unit: 'h', interval95: [2, 3] });
    expect(payload.models.dynamic.initialState).toBe(0.12);
    expect(payload.validityDomains[0]?.timeRangeHours).toEqual([0, 12]);
  });

  it('captures a legal existing identity model without adding identity to ordinary authoring', () => {
    const project = createStaticTemplateProject('source.module.identity');
    const module = project.network.modules[0]!;
    const input = module.inputPorts[0]!;
    const output = module.outputPorts[0]!;
    output.entity = input.entity;
    output.quantityType = input.quantityType;
    output.unit = input.unit;
    const model = module.modelVariants[0]!;
    if (model.mode !== 'static') throw new Error('Expected static fixture.');
    model.family = 'identity';
    model.response = { family: 'identity', inputPortId: input.id };
    project.registry.validityDomains[0]!.inputRanges = [];

    const capture = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: { [input.entity]: 'embedded' },
    });
    expect(capture.ok).toBe(true);
    if (capture.ok && capture.payload.moduleClass === 'static') {
      expect(capture.payload.models.static).toMatchObject({
        family: 'identity',
        response: { family: 'identity', inputPortKey: 'port.input.1' },
      });
    }
  });

  it('captures a production Signal Pool result as dynamic-only accumulator representation', () => {
    const project = createBlankTemplateProject('signal-pool-production-source');
    const canonical = getDesignedSenderSignalCatalog()[0]!;
    const moduleId = 'user.module.signal-pool-capture';
    const draft: SignalPoolDraft = {
      id: moduleId,
      origin: 'user_defined',
      name: 'Captured pool',
      description: null,
      signal: {
        source: 'known',
        catalogSignalId: canonical.catalogSignalId,
        entityId: canonical.entityId,
        displayName: canonical.displayName,
      },
      inputPort: {
        id: `${moduleId}.port.input.production-rate`,
        entityId: canonical.entityId,
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'input',
      },
      outputPort: {
        id: `${moduleId}.port.output.concentration`,
        entityId: canonical.entityId,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
      initialConcentration: 3.5,
    };
    const materialized = materializeSignalPool(draft, project);
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const capture = captureReusableModuleTemplatePayload(materialized.nextProject, moduleId, {
      entityPolicies: {},
    });

    expect(capture.ok).toBe(true);
    if (!capture.ok || capture.payload.moduleClass !== 'accumulator') return;
    expect(capture.payload.models.dynamic).toMatchObject({
      family: 'accumulator',
      initialState: 3.5,
      uncertaintyMethod: 'none',
      evidenceGrade: 'independent_assumption',
    });
    expect(capture.payload.models).not.toHaveProperty('static');
    expect(capture.payload.models.dynamic).not.toHaveProperty('tau');
    expect(capture.payload.models.dynamic).not.toHaveProperty('steadyStateResponse');

    const instantiated = instantiateReusableModuleTemplate(
      versionForPayload(capture.payload, 'template.signal-pool-production'),
      createBlankTemplateProject('project.signal-pool-target'),
      {},
      {
        instanceId: 'instance.signal-pool-production',
        instanceName: 'Signal pool copy',
        instanceDescription: null,
      },
    );
    expect(instantiated.ok).toBe(true);
    if (instantiated.ok) {
      const instance = instantiated.nextProject.network.modules[0]!;
      expect(instance.activeModelIds).toEqual({
        dynamic: 'instance.signal-pool-production.model.accumulator.v1',
      });
      expect(instance.modelVariants).toEqual([
        expect.objectContaining({
          mode: 'dynamic',
          family: 'accumulator',
          initialState: 3.5,
          uncertaintyMethod: 'none',
          evidenceGrade: 'independent_assumption',
        }),
      ]);
      expect(instance.modelVariants[0]).not.toHaveProperty('steadyStateResponse');
      expect(instance.modelVariants[0]).not.toHaveProperty('tau');
      expect(instance.inputPorts[0]).toMatchObject({
        entity: canonical.entityId,
        quantityType: 'production_rate',
        unit: 'nM/h',
      });
      expect(instance.outputPorts[0]).toMatchObject({
        entity: canonical.entityId,
        quantityType: 'concentration',
        unit: 'nM',
      });
    }
  });

  it('captures a production Designed Sender result only as generic static representation', () => {
    const project = createBlankTemplateProject('designed-sender-production-source');
    const initial = createInitialDesignedSenderAuthoringState(project);
    const canonical = getDesignedSenderSignalCatalog().find(
      (signal) => signal.catalogSignalId === 'ahl.3oc6.l',
    )!;
    const state: DesignedSenderAuthoringState = {
      ...initial,
      name: 'Designed Sender capture',
      description: 'Generic representation boundary.',
      controlInput: {
        ...initial.controlInput,
        name: 'Control input',
        entityMode: 'new',
        newEntityName: 'IPTG',
        unit: 'uM',
        minimum: '0',
        maximum: '100',
      },
      output: {
        ...initial.output,
        name: 'AHL production role',
        signalMode: 'known',
        catalogSignalId: canonical.catalogSignalId,
        unit: 'nM/h',
      },
      hillK: parameter('12'),
      hillN: parameter('2'),
      minimumOutput: parameter('0.1'),
      maximumOutput: parameter('4.2'),
    };
    const build = buildDesignedSenderDraft(state, project);
    expect(build.ok).toBe(true);
    if (!build.ok) return;
    const materialized = materializeUserDefinedStaticModule(build.draft, project, {
      authoritativeEntities: build.authoritativeSignal
        ? [
            {
              id: build.authoritativeSignal.entityId,
              displayName: build.authoritativeSignal.displayName,
            },
          ]
        : [],
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;
    const module = materialized.nextProject.network.modules[0]!;
    const capture = captureReusableModuleTemplatePayload(materialized.nextProject, module.id, {
      entityPolicies: { [module.inputPorts[0]!.entity]: 'embedded' },
    });

    expect(capture.ok).toBe(true);
    if (!capture.ok || capture.payload.moduleClass !== 'static') return;
    expect(capture.payload).not.toHaveProperty('designedSender');
    expect(capture.payload.ports).toEqual([
      expect.objectContaining({ direction: 'input', quantityType: 'concentration', unit: 'uM' }),
      expect.objectContaining({
        direction: 'output',
        quantityType: 'production_rate',
        unit: 'nM/h',
      }),
    ]);
    expect(capture.payload.entities).toContainEqual(
      expect.objectContaining({
        mode: 'canonical',
        catalogId: canonical.catalogSignalId,
        entityId: canonical.entityId,
      }),
    );
    expect(capture.payload.models.static.response).toMatchObject({
      family: 'hill_activation',
      k: { value: 12, unit: 'uM' },
      ymax: { value: 4.2, unit: 'nM/h' },
    });

    const instantiated = instantiateReusableModuleTemplate(
      versionForPayload(capture.payload, 'template.designed-sender-generic'),
      createBlankTemplateProject('project.designed-sender-target'),
      {},
      {
        instanceId: 'instance.designed-sender-generic',
        instanceName: 'Generic sender copy',
        instanceDescription: null,
      },
    );
    expect(instantiated.ok).toBe(true);
    if (!instantiated.ok) return;
    const runnable = instantiated.nextProject;
    const sender = runnable.network.modules.find(
      (candidate) => candidate.id === instantiated.addedModuleId,
    )!;
    const input = sender.inputPorts[0]!;
    const output = sender.outputPorts[0]!;
    runnable.network.inputSources.push({
      kind: 'input_source',
      id: 'source.control',
      labelKey: 'bfn.sources.ahl',
      outputPort: {
        id: 'source.control.output',
        entity: input.entity,
        quantityType: input.quantityType,
        unit: input.unit,
        direction: 'output',
      },
      staticSpecification: { type: 'fixed_value', value: 12, unit: input.unit },
      dynamicSpecification: { type: 'constant', value: 12, unit: input.unit },
      position: { x: 20, y: 100 },
    });
    runnable.network.outputMonitors.push({
      kind: 'output_monitor',
      id: 'monitor.production-rate',
      labelKey: 'bfn.monitors.reporter',
      inputPort: {
        id: 'monitor.production-rate.input',
        entity: output.entity,
        quantityType: output.quantityType,
        unit: output.unit,
        direction: 'input',
      },
      position: { x: 800, y: 100 },
    });
    runnable.network.edges.push(
      {
        id: 'edge.control.sender',
        source: { nodeId: 'source.control', portId: 'source.control.output' },
        target: { nodeId: sender.id, portId: input.id },
        mapping: 'identity',
        enabled: true,
      },
      {
        id: 'edge.sender.monitor',
        source: { nodeId: sender.id, portId: output.id },
        target: {
          nodeId: 'monitor.production-rate',
          portId: 'monitor.production-rate.input',
        },
        mapping: 'identity',
        enabled: true,
      },
    );
    const execution = runBfnSimulation(runnable, '2026-09-02T00:00:00.000Z');
    expect(execution.engineVersion).toBe('BFN-SIM-2.2');
    expect(execution.points[0]?.output).toBeCloseTo((0.1 + 4.2) / 2, 12);
  });

  it.each([
    [
      'module without user authoring',
      (project: BfnProject) => delete project.network.modules[0]!.authoring,
    ],
    ['demo module', (project: BfnProject) => (project.network.modules[0]!.isDemo = true)],
    [
      'unresolved active model',
      (project: BfnProject) => (project.network.modules[0]!.activeModelIds = { static: 'missing' }),
    ],
    [
      'active dataset dependency',
      (project: BfnProject) =>
        (project.network.modules[0]!.modelVariants[0]!.sourceDatasetIds = ['dataset.external']),
    ],
    [
      'unknown model family',
      (project: BfnProject) =>
        (project.network.modules[0]!.modelVariants[0]!.family = 'future_family' as 'identity'),
    ],
  ])('rejects %s', (_label, mutate) => {
    const project = createStaticTemplateProject();
    mutate(project);
    const module = project.network.modules[0]!;
    const result = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: {
        [module.inputPorts[0]!.entity]: 'embedded',
        [module.outputPorts[0]!.entity]: 'embedded',
      },
    });
    expect(result.ok).toBe(false);
  });

  it('rejects a production Catalog Receiver instead of copying it as user-defined', () => {
    const project = createBlankTemplateProject('project.catalog-receiver-source');
    const candidate = buildAllBfnCatalogRuntimeCandidates()[0]!;
    const materialized = instantiateCatalogResponseInBfnProject(project, candidate, {
      moduleId: 'catalog.receiver.module',
      modulePosition: { x: 300, y: 160 },
      inputPortId: 'catalog.receiver.input',
      outputPortId: 'catalog.receiver.output',
      modelId: 'catalog.receiver.model',
      validityDomainId: 'catalog.receiver.domain',
      createInputSource: false,
    });
    expect(materialized.ok).toBe(true);
    if (!materialized.ok) return;

    expect(
      captureReusableModuleTemplatePayload(materialized.nextProject, materialized.addedModuleId, {
        entityPolicies: {},
      }),
    ).toMatchObject({ ok: false, issues: [{ code: 'module_not_user_defined' }] });
  });

  it('rejects a catalog reference attached to any active model runtime object', () => {
    const project = createFirstOrderTemplateProject('source.module.dynamic-catalog-ref');
    const module = project.network.modules[0]!;
    Object.assign(module.modelVariants[1]!, { catalogReference: { forged: true } });

    expect(
      captureReusableModuleTemplatePayload(project, module.id, {
        entityPolicies: Object.fromEntries(
          [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
        ),
      }),
    ).toMatchObject({ ok: false, issues: [{ code: 'catalog_reference_unsupported' }] });
  });

  it('rejects extra dormant variants without silently dropping them', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    module.modelVariants.push({
      ...structuredClone(module.modelVariants[0]!),
      id: `${module.id}.dormant`,
    });
    const result = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: Object.fromEntries(
        [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
      ),
    });
    expect(result).toMatchObject({
      ok: false,
      issues: [{ code: 'unsupported_dormant_model_variant' }],
    });
  });

  it.each(['context', 'domain', 'provenance', 'implementation'] as const)(
    'rejects a missing %s dependency',
    (kind) => {
      const project = createStaticTemplateProject();
      if (kind === 'context') project.registry.contexts = [];
      if (kind === 'domain') project.registry.validityDomains = [];
      if (kind === 'provenance') project.registry.provenanceRecords = [];
      if (kind === 'implementation') project.registry.implementations = [];
      const module = project.network.modules[0]!;
      const result = captureReusableModuleTemplatePayload(project, module.id, {
        entityPolicies: Object.fromEntries(
          [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
        ),
      });
      expect(result.ok).toBe(false);
    },
  );

  it('recognizes exact canonical identity and fails on a conflicting registry definition', () => {
    const project = createAccumulatorTemplateProject();
    const module = project.network.modules[0]!;
    const accepted = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: {},
    });
    expect(accepted.ok).toBe(true);
    if (accepted.ok) {
      expect(accepted.payload.entities[0]).toMatchObject({ mode: 'canonical' });
    }
    project.registry.entities.push({
      id: module.inputPorts[0]!.entity,
      origin: 'user_defined',
      displayName: 'Forged canonical name',
      description: null,
    });
    expect(
      captureReusableModuleTemplatePayload(project, module.id, { entityPolicies: {} }),
    ).toMatchObject({ ok: false, issues: [{ code: 'canonical_entity_conflict' }] });
  });

  it('requires an explicit policy for private entities and validates embedded eligibility', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    const missingPolicy = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: {},
    });
    expect(missingPolicy.ok).toBe(false);
    if (!missingPolicy.ok) {
      expect(missingPolicy.issues.some((issue) => issue.code === 'entity_policy_missing')).toBe(
        true,
      );
    }

    const missingDefinition = createStaticTemplateProject();
    const missingModule = missingDefinition.network.modules[0]!;
    missingDefinition.registry.entities = missingDefinition.registry.entities.filter(
      (entity) => entity.id !== missingModule.inputPorts[0]!.entity,
    );
    expect(
      captureReusableModuleTemplatePayload(missingDefinition, missingModule.id, {
        entityPolicies: {
          [missingModule.inputPorts[0]!.entity]: 'embedded',
          [missingModule.outputPorts[0]!.entity]: 'embedded',
        },
      }),
    ).toMatchObject({ ok: false, issues: [{ code: 'entity_definition_missing' }] });

    const malformedDefinition = createStaticTemplateProject();
    const malformedModule = malformedDefinition.network.modules[0]!;
    Object.assign(malformedDefinition.registry.entities[0]!, {
      legacyOwner: 'legacy-module',
    });
    const malformedResult = captureReusableModuleTemplatePayload(
      malformedDefinition,
      malformedModule.id,
      {
        entityPolicies: {
          [malformedModule.inputPorts[0]!.entity]: 'embedded',
          [malformedModule.outputPorts[0]!.entity]: 'embedded',
        },
      },
    );
    expect(malformedResult).toMatchObject({
      ok: false,
      issues: [{ code: 'embedded_entity_ineligible' }],
    });
  });

  it('forces externally referenced entities to slots across modules, Sources, Monitors, and Datasets', () => {
    const project = createStaticTemplateProject();
    const module = project.network.modules[0]!;
    const sharedId = module.outputPorts[0]!.entity;
    project.network.inputSources.push({
      kind: 'input_source',
      id: 'external.source',
      labelKey: 'bfn.fixture.source',
      outputPort: {
        id: 'external.source.port',
        entity: sharedId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
      staticSpecification: { type: 'fixed_value', value: 1, unit: 'RPU' },
      dynamicSpecification: { type: 'constant', value: 1, unit: 'RPU' },
      position: { x: 1, y: 1 },
    });
    project.network.outputMonitors.push({
      kind: 'output_monitor',
      id: 'external.monitor',
      labelKey: 'bfn.fixture.monitor',
      inputPort: {
        id: 'external.monitor.port',
        entity: sharedId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
      position: { x: 2, y: 2 },
    });
    project.registry.datasets.push({
      id: 'external.dataset',
      labelKey: 'bfn.fixture.dataset',
      dataType: 'multi_input',
      inputEntities: [sharedId],
      outputEntities: [sharedId],
      replicates: 1,
      contextId: project.registry.contexts[0]!.id,
      rawFile: null,
      calibrationId: null,
      evidenceGrade: 'independent_assumption',
      isDemo: false,
    });
    const embedded = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: {
        [module.inputPorts[0]!.entity]: 'embedded',
        [sharedId]: 'embedded',
      },
    });
    expect(embedded).toMatchObject({
      ok: false,
      issues: [{ code: 'embedded_entity_ineligible' }],
    });

    const slot = captureReusableModuleTemplatePayload(project, module.id, {
      entityPolicies: { [module.inputPorts[0]!.entity]: 'embedded' },
    });
    expect(slot.ok).toBe(true);
    if (slot.ok) {
      expect(slot.payload.entities).toContainEqual(
        expect.objectContaining({
          mode: 'slot',
          sourceEntityId: sharedId,
          requirements: [expect.objectContaining({ portKey: 'port.output.1' })],
        }),
      );
    }
  });

  it.each(['module', 'source', 'monitor', 'dataset'] as const)(
    'detects an isolated external %s Entity reference and forces a slot',
    (kind) => {
      const project = createStaticTemplateProject(`source.module.external-${kind}`);
      const module = project.network.modules[0]!;
      const sharedId = module.outputPorts[0]!.entity;
      attachExternalEntityReference(project, sharedId, kind);

      expect(
        captureReusableModuleTemplatePayload(project, module.id, {
          entityPolicies: {
            [module.inputPorts[0]!.entity]: 'embedded',
            [sharedId]: 'embedded',
          },
        }),
      ).toMatchObject({ ok: false, issues: [{ code: 'embedded_entity_ineligible' }] });

      const captured = captureReusableModuleTemplatePayload(project, module.id, {
        entityPolicies: { [module.inputPorts[0]!.entity]: 'embedded' },
      });
      expect(captured.ok).toBe(true);
      if (captured.ok) {
        expect(captured.payload.entities).toContainEqual(
          expect.objectContaining({ mode: 'slot', sourceEntityId: sharedId }),
        );
      }
    },
  );

  it('captures partial and null Context relations exactly', () => {
    const partial = createStaticTemplateProject('source.module.partial');
    Object.assign(partial.registry.contexts[0]!, {
      documentationState: 'partial',
      strain: null,
      medium: null,
      temperatureCelsius: null,
    });
    const partialPayload = captureFixtureWithEmbedded(partial);
    expect(partialPayload.contexts[0]).toMatchObject({
      documentationState: 'partial',
      host: 'Escherichia coli',
      strain: null,
    });

    const noContext = createStaticTemplateProject('source.module.no-context');
    const noContextModule = noContext.network.modules[0]!;
    noContextModule.modelVariants[0]!.contextId = null;
    noContext.registry.validityDomains[0]!.contextId = null;
    noContext.registry.contexts = [];
    const noContextPayload = captureFixtureWithEmbedded(noContext);
    expect(noContextPayload.contexts).toEqual([]);
    const noContextModel =
      noContextPayload.moduleClass === 'accumulator'
        ? noContextPayload.models.dynamic
        : noContextPayload.models.static;
    expect(noContextModel.contextKey).toBeNull();
  });

  it('keeps projections independent of source presentation metadata', () => {
    const original = createStaticTemplateProject();
    const renamed = structuredClone(original);
    renamed.id = 'another.project.id';
    const module = renamed.network.modules[0]!;
    module.authoring!.name = 'Renamed presentation';
    module.position = { x: 900, y: 450 };
    expect(createReusableModuleScientificProjection(captureFixtureWithEmbedded(original))).toEqual(
      createReusableModuleScientificProjection(captureFixtureWithEmbedded(renamed)),
    );
  });
});

function captureFixtureWithEmbedded(project: BfnProject) {
  const module = project.network.modules[0]!;
  return captureFixture(project, module.id, {
    entityPolicies: Object.fromEntries(
      [...module.inputPorts, ...module.outputPorts].map((port) => [port.entity, 'embedded']),
    ),
  });
}

function parameter(value: string) {
  return { value, lower: '', upper: '' };
}

function attachExternalEntityReference(
  project: BfnProject,
  entityId: string,
  kind: 'module' | 'source' | 'monitor' | 'dataset',
): void {
  if (kind === 'source') {
    project.network.inputSources.push({
      kind: 'input_source',
      id: 'isolated.external.source',
      labelKey: 'bfn.fixture.source',
      outputPort: {
        id: 'isolated.external.source.port',
        entity: entityId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
      staticSpecification: { type: 'fixed_value', value: 1, unit: 'RPU' },
      dynamicSpecification: { type: 'constant', value: 1, unit: 'RPU' },
      position: { x: 1, y: 1 },
    });
    return;
  }
  if (kind === 'monitor') {
    project.network.outputMonitors.push({
      kind: 'output_monitor',
      id: 'isolated.external.monitor',
      labelKey: 'bfn.fixture.monitor',
      inputPort: {
        id: 'isolated.external.monitor.port',
        entity: entityId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
      position: { x: 2, y: 2 },
    });
    return;
  }
  if (kind === 'dataset') {
    project.registry.datasets.push({
      id: 'isolated.external.dataset',
      labelKey: 'bfn.fixture.dataset',
      dataType: 'multi_input',
      inputEntities: [entityId],
      outputEntities: [entityId],
      replicates: 1,
      contextId: project.registry.contexts[0]!.id,
      rawFile: null,
      calibrationId: null,
      evidenceGrade: 'independent_assumption',
      isDemo: false,
    });
    return;
  }

  const moduleId = 'isolated.external.module';
  const inputPortId = `${moduleId}.input`;
  const outputPortId = `${moduleId}.output`;
  const modelId = `${moduleId}.model`;
  const domainId = `${moduleId}.domain`;
  project.registry.validityDomains.push({
    id: domainId,
    labelKey: 'bfn.fixture.externalDomain',
    inputRanges: [],
    contextId: null,
  });
  project.network.modules.push({
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.fixture.externalModule',
    authoring: { origin: 'user_defined', name: 'External reference', description: null },
    descriptionKey: 'bfn.fixture.externalModuleDescription',
    inputPorts: [
      {
        id: inputPortId,
        entity: entityId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: outputPortId,
        entity: entityId,
        quantityType: 'activity',
        unit: 'RPU',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: modelId,
        version: '1.0',
        mode: 'static',
        family: 'identity',
        response: { family: 'identity', inputPortId },
        contextId: null,
        validityDomainId: domainId,
        sourceDatasetIds: [],
        provenanceIds: [],
        evidenceGrade: 'independent_assumption',
        uncertaintyMethod: 'none',
        isDemo: false,
      },
    ],
    activeModelIds: { static: modelId },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 3, y: 3 },
    isDemo: false,
  });
}
