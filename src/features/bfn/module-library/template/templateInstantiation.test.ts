import { describe, expect, it } from 'vitest';
import { assessBfnAccumulatorRuntimeContract } from '../../accumulatorRuntimeContract';
import { captureReusableModuleTemplatePayload } from './templateCapture';
import { createInstantiatedReusableModuleScientificProjection } from './templateInstanceProjection';
import { instantiateReusableModuleTemplate } from './templateInstantiation';
import {
  createReusableModuleScientificProjection,
  reusableModuleScientificProjectionsEqual,
} from './templateProjection';
import { createBfnModuleTemplatePayloadSignature } from './templateSignature';
import type {
  BfnReusableModulePayloadV1,
  BfnTemplateEntityBindingDecisions,
  BfnTemplateInstantiationOptions,
} from './templateTypes';
import {
  captureAccumulatorFixture,
  captureFirstOrderFixture,
  captureStaticFixture,
  createAccumulatorTemplateProject,
  createBlankTemplateProject,
  createFirstOrderTemplateProject,
  createStaticTemplateProject,
  versionForPayload,
} from './templateTestFixtures';

describe('reusable module template instantiation', () => {
  it('roundtrips a static payload with fresh IDs and full scientific projection equality', () => {
    const payload = captureStaticFixture();
    const version = versionForPayload(payload);
    const target = createBlankTemplateProject('project.target.static');
    target.network.inputSources.push(sourceNode('existing.source', 'unrelated.entity'));
    target.network.outputMonitors.push(monitorNode('existing.monitor', 'unrelated.entity'));
    target.network.edges.push({
      id: 'existing.edge',
      source: { nodeId: 'existing.source', portId: 'existing.source.port' },
      target: { nodeId: 'existing.monitor', portId: 'existing.monitor.port' },
      mapping: 'identity',
      enabled: false,
    });
    const targetBefore = structuredClone(target);
    const versionBefore = structuredClone(version);
    const result = instantiateReusableModuleTemplate(
      version,
      target,
      {},
      options('instance.static'),
    );

    expect(result.ok).toBe(true);
    expect(target).toEqual(targetBefore);
    expect(version).toEqual(versionBefore);
    if (!result.ok) return;
    const instance = result.nextProject.network.modules.find(
      (module) => module.id === result.addedModuleId,
    )!;
    expect(instance.authoring).toEqual({
      origin: 'user_defined',
      name: 'Reusable instance',
      description: 'Independent copy.',
    });
    expect(instance.position).not.toEqual({ x: 350, y: 160 });
    expect(Object.values(result.idMap.portIds)).not.toContain('source.module.static.port.in');
    expect(result.nextProject.registry.contexts).toHaveLength(1);
    expect(result.nextProject.registry.validityDomains).toHaveLength(1);
    expect(result.nextProject.registry.provenanceRecords).toHaveLength(2);
    expect(result.nextProject.registry.implementations).toHaveLength(1);
    expect(result.nextProject.registry.entities).toHaveLength(2);
    const projection = createInstantiatedReusableModuleScientificProjection(
      result.nextProject,
      result.addedModuleId,
      payload,
      result.idMap,
    );
    expect(projection).not.toBeNull();
    expect(
      reusableModuleScientificProjectionsEqual(
        createReusableModuleScientificProjection(payload),
        projection!,
      ),
    ).toBe(true);
    expect(result.nextProject.network.inputSources).toEqual(targetBefore.network.inputSources);
    expect(result.nextProject.network.outputMonitors).toEqual(targetBefore.network.outputMonitors);
    expect(result.nextProject.network.edges).toEqual(targetBefore.network.edges);
    expect(result.nextProject.network.mode).toBe(targetBefore.network.mode);
    expect(result.nextProject.analysis).toEqual(targetBefore.analysis);
  });

  it('roundtrips paired first-order representation without changing its runtime contract', () => {
    const payload = captureFirstOrderFixture();
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload),
      createBlankTemplateProject('project.target.first-order'),
      {},
      options('instance.first-order'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const module = result.nextProject.network.modules[0]!;
    expect(module.modelVariants).toHaveLength(2);
    const staticModel = module.modelVariants.find((model) => model.mode === 'static');
    const dynamicModel = module.modelVariants.find(
      (model) => model.mode === 'dynamic' && model.family === 'first_order',
    );
    expect(dynamicModel).toMatchObject({
      tau: { value: 2.5, unit: 'h', interval95: [2, 3] },
      initialState: 0.12,
    });
    expect(
      dynamicModel?.mode === 'dynamic' && dynamicModel.family === 'first_order'
        ? dynamicModel.steadyStateResponse
        : null,
    ).toEqual(staticModel?.mode === 'static' ? staticModel.response : null);
    expect(result.nextProject.registry.validityDomains[0]?.timeRangeHours).toEqual([0, 12]);
  });

  it('roundtrips accumulator as dynamic-only and retains canonical identity', () => {
    const payload = captureAccumulatorFixture();
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload),
      createBlankTemplateProject('project.target.accumulator'),
      {},
      options('instance.accumulator'),
    );

    expect(result.ok).toBe(true);
    if (!result.ok || payload.moduleClass !== 'accumulator') return;
    const module = result.nextProject.network.modules[0]!;
    const model = module.modelVariants[0]!;
    expect(module.modelVariants).toHaveLength(1);
    expect(module.activeModelIds).toEqual({ dynamic: 'instance.accumulator.model.accumulator.v1' });
    expect(model).toMatchObject({
      mode: 'dynamic',
      family: 'accumulator',
      initialState: 2,
      uncertaintyMethod: 'none',
      evidenceGrade: 'independent_assumption',
    });
    expect(model).not.toHaveProperty('response');
    expect(model).not.toHaveProperty('steadyStateResponse');
    expect(model).not.toHaveProperty('tau');
    expect(result.nextProject.registry.entities).toEqual([]);
    expect(result.idMap.entityIds[payload.entities[0]!.key]).toBe(
      payload.entities[0]!.mode === 'canonical' ? payload.entities[0]!.entityId : undefined,
    );
    if (model.mode === 'dynamic' && model.family === 'accumulator') {
      expect(assessBfnAccumulatorRuntimeContract(module, model)).toBeNull();
    }
  });

  it('creates all project-local IDs independently across two instances', () => {
    const payload = captureStaticFixture();
    const version = versionForPayload(payload);
    const first = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject('project.target.twice'),
      {},
      options('instance.one'),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = instantiateReusableModuleTemplate(
      version,
      first.nextProject,
      {},
      options('instance.two'),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    for (const key of [
      'portIds',
      'modelIds',
      'entityIds',
      'contextIds',
      'validityDomainIds',
      'provenanceIds',
      'implementationIds',
    ] as const) {
      expect(Object.values(first.idMap[key])).not.toEqual(Object.values(second.idMap[key]));
      expect(
        Object.values(first.idMap[key]).some((id) => Object.values(second.idMap[key]).includes(id)),
      ).toBe(false);
    }
    expect(
      createInstantiatedReusableModuleScientificProjection(
        first.nextProject,
        first.addedModuleId,
        payload,
        first.idMap,
      ),
    ).toEqual(
      createInstantiatedReusableModuleScientificProjection(
        second.nextProject,
        second.addedModuleId,
        payload,
        second.idMap,
      ),
    );
  });

  it('keeps canonical IDs stable across instances', () => {
    const payload = captureAccumulatorFixture();
    const version = versionForPayload(payload);
    const first = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject('project.target.canonical'),
      {},
      options('canonical.one'),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = instantiateReusableModuleTemplate(
      version,
      first.nextProject,
      {},
      options('canonical.two'),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(first.idMap.entityIds).toEqual(second.idMap.entityIds);
  });

  it('maps every port of one embedded Entity to one fresh instance-local ID', () => {
    const source = createAccumulatorTemplateProject('source.module.embedded-accumulator');
    const module = source.network.modules[0]!;
    const sourceEntityId = `${module.id}.private-signal`;
    module.inputPorts[0]!.entity = sourceEntityId;
    module.outputPorts[0]!.entity = sourceEntityId;
    source.registry.entities.push({
      id: sourceEntityId,
      origin: 'user_defined',
      displayName: 'Private signal',
      description: null,
    });
    const captured = captureReusableModuleTemplatePayload(source, module.id, {
      entityPolicies: { [sourceEntityId]: 'embedded' },
    });
    expect(captured.ok).toBe(true);
    if (!captured.ok) return;
    const version = versionForPayload(captured.payload, 'template.embedded-multi-port');
    const first = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject('project.embedded-target'),
      {},
      options('embedded.one'),
    );
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = instantiateReusableModuleTemplate(
      version,
      first.nextProject,
      {},
      options('embedded.two'),
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    const firstPorts = [
      ...first.nextProject.network.modules[0]!.inputPorts,
      ...first.nextProject.network.modules[0]!.outputPorts,
    ];
    const secondModule = second.nextProject.network.modules.find(
      (candidate) => candidate.id === second.addedModuleId,
    )!;
    const secondPorts = [...secondModule.inputPorts, ...secondModule.outputPorts];
    expect(new Set(firstPorts.map((port) => port.entity)).size).toBe(1);
    expect(new Set(secondPorts.map((port) => port.entity)).size).toBe(1);
    expect(firstPorts[0]!.entity).not.toBe(sourceEntityId);
    expect(secondPorts[0]!.entity).not.toBe(sourceEntityId);
    expect(secondPorts[0]!.entity).not.toBe(firstPorts[0]!.entity);
  });

  it('enforces explicit same-entity slot decisions without name matching', () => {
    const payload = createSlotPayload();
    const version = versionForPayload(payload, 'template.slot');
    const slot = payload.entities.find((entity) => entity.mode === 'slot')!;
    const target = createBlankTemplateProject('project.target.slot');
    target.registry.entities.push({
      id: 'target.entity.same',
      origin: 'user_defined',
      displayName: slot.displayName,
      description: slot.description,
    });

    expect(
      instantiateReusableModuleTemplate(version, target, {}, options('slot.missing')),
    ).toMatchObject({ ok: false, issues: [{ code: 'entity_binding_missing' }] });
    expect(
      instantiateReusableModuleTemplate(
        version,
        target,
        {
          [slot.key]: {
            mode: 'existing_same_entity',
            targetEntityId: 'target.entity.absent',
            identityConfirmation: 'same_scientific_entity',
          },
        },
        options('slot.absent'),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'entity_target_missing' }] });
    expect(
      instantiateReusableModuleTemplate(
        version,
        target,
        {
          [slot.key]: {
            mode: 'existing_same_entity',
            targetEntityId: 'target.entity.same',
          },
        } as unknown as BfnTemplateEntityBindingDecisions,
        options('slot.no-confirmation'),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'entity_binding_invalid' }] });

    const existing = instantiateReusableModuleTemplate(
      version,
      target,
      {
        [slot.key]: {
          mode: 'existing_same_entity',
          targetEntityId: 'target.entity.same',
          identityConfirmation: 'same_scientific_entity',
        },
      },
      options('slot.existing'),
    );
    expect(existing.ok).toBe(true);
    if (existing.ok) {
      expect(existing.idMap.entityIds[slot.key]).toBe('target.entity.same');
      expect(existing.nextProject.registry.entities).toHaveLength(2);
      expect(
        existing.nextProject.registry.entities.filter(
          (entity) => entity.id === 'target.entity.same',
        ),
      ).toHaveLength(1);
    }

    const create = instantiateReusableModuleTemplate(
      version,
      target,
      {
        [slot.key]: {
          mode: 'create_same_entity',
          identityConfirmation: 'same_scientific_entity',
        },
      },
      options('slot.created'),
    );
    expect(create.ok).toBe(true);
    if (create.ok) {
      expect(create.idMap.entityIds[slot.key]).toBe(`slot.created.${slot.key}`);
      expect(create.nextProject.registry.entities).toContainEqual(
        expect.objectContaining({ id: `slot.created.${slot.key}`, displayName: slot.displayName }),
      );
    }
  });

  it('maps every port requirement of one slot to the same explicit Entity', () => {
    const payload = createAccumulatorSlotPayload();
    const slot = payload.entities.find((entity) => entity.mode === 'slot')!;
    expect(slot.mode === 'slot' ? slot.requirements : []).toHaveLength(2);
    const target = createBlankTemplateProject('project.target.multi-port-slot');
    target.registry.entities.push({
      id: 'target.shared.signal',
      origin: 'user_defined',
      displayName: 'Shared signal',
      description: null,
    });
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload),
      target,
      {
        [slot.key]: {
          mode: 'existing_same_entity',
          targetEntityId: 'target.shared.signal',
          identityConfirmation: 'same_scientific_entity',
        },
      },
      options('slot.multi-port'),
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(
        [
          ...result.nextProject.network.modules[0]!.inputPorts,
          ...result.nextProject.network.modules[0]!.outputPorts,
        ].map((port) => port.entity),
      ).toEqual(['target.shared.signal', 'target.shared.signal']);
    }
  });

  it('rejects two distinct slots that converge on one existing target Entity', () => {
    const payload = createTwoSlotPayload();
    const slots = payload.entities.filter((entity) => entity.mode === 'slot');
    expect(slots).toHaveLength(2);
    const target = createBlankTemplateProject('project.target.injective-slots');
    target.registry.entities.push({
      id: 'target.entity.one',
      origin: 'user_defined',
      displayName: 'One concrete identity',
      description: null,
    });
    const bindings = Object.fromEntries(
      slots.map((slot) => [
        slot.key,
        {
          mode: 'existing_same_entity',
          targetEntityId: 'target.entity.one',
          identityConfirmation: 'same_scientific_entity',
        },
      ]),
    ) as BfnTemplateEntityBindingDecisions;

    expect(
      instantiateReusableModuleTemplate(
        versionForPayload(payload, 'template.two-slots'),
        target,
        bindings,
        options('instance.two-slots'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'entity_mapping_non_injective', details: ['target.entity.one'] }],
    });
  });

  it('rejects canonical and slot Entity keys that converge on one canonical identity', () => {
    const payload = createCanonicalAndSlotPayload();
    const canonical = payload.entities.find((entity) => entity.mode === 'canonical')!;
    const slot = payload.entities.find((entity) => entity.mode === 'slot')!;
    if (canonical.mode !== 'canonical') throw new Error('Expected canonical fixture.');
    const target = createBlankTemplateProject('project.target.canonical-slot');
    target.network.inputSources.push(sourceNode('canonical.reference', canonical.entityId));

    expect(
      instantiateReusableModuleTemplate(
        versionForPayload(payload, 'template.canonical-slot'),
        target,
        {
          [slot.key]: {
            mode: 'existing_same_entity',
            targetEntityId: canonical.entityId,
            identityConfirmation: 'same_scientific_entity',
          },
        },
        options('instance.canonical-slot'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [{ code: 'entity_mapping_non_injective', details: [canonical.entityId] }],
    });
  });

  it('rejects a re-signed canonical-as-slot create_same_entity before materialization', () => {
    const payload = createCanonicalAsSlotPayload();
    const validVersion = versionForPayload(captureStaticFixture(), 'template.canonical-as-slot');
    const forgedVersion = {
      ...validVersion,
      payload,
      payloadSignature: createBfnModuleTemplatePayloadSignature(payload),
    };
    const slot = payload.entities.find((entity) => entity.mode === 'slot')!;

    expect(
      instantiateReusableModuleTemplate(
        forgedVersion,
        createBlankTemplateProject('project.target.canonical-as-slot'),
        {
          [slot.key]: {
            mode: 'create_same_entity',
            identityConfirmation: 'same_scientific_entity',
          },
        },
        options('instance.canonical-as-slot'),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'template_schema_invalid' }] });
  });

  it('roundtrips a shared noncanonical slot as an independent same-identity copy', () => {
    const payload = createSlotPayload();
    const slot = payload.entities.find((entity) => entity.mode === 'slot')!;
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload, 'template.shared-noncanonical-slot'),
      createBlankTemplateProject('project.target.shared-noncanonical-slot'),
      {
        [slot.key]: {
          mode: 'create_same_entity',
          identityConfirmation: 'same_scientific_entity',
        },
      },
      options('instance.shared-noncanonical-slot'),
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.nextProject.registry.entities).toContainEqual(
        expect.objectContaining({
          id: `instance.shared-noncanonical-slot.${slot.key}`,
          displayName: slot.displayName,
        }),
      );
    }
  });

  it('makes instance projection reject a concrete Entity-relation collapse', () => {
    const payload = captureStaticFixture();
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload),
      createBlankTemplateProject('project.target.projection-collapse'),
      {},
      options('instance.projection-collapse'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const collapsedProject = structuredClone(result.nextProject);
    const collapsedMap = structuredClone(result.idMap);
    const [firstEntity, secondEntity] = payload.entities;
    if (!firstEntity || !secondEntity) throw new Error('Expected two Entity keys.');
    const concreteId = collapsedMap.entityIds[firstEntity.key]!;
    (collapsedMap.entityIds as Record<string, string>)[secondEntity.key] = concreteId;
    collapsedProject.network.modules[0]!.outputPorts[0]!.entity = concreteId;

    expect(
      createInstantiatedReusableModuleScientificProjection(
        collapsedProject,
        result.addedModuleId,
        payload,
        collapsedMap,
      ),
    ).toBeNull();
  });

  it('fails closed on explicit and derived ID collisions without retrying', () => {
    const payload = captureStaticFixture();
    const target = createBlankTemplateProject('project.target.collision');
    target.registry.provenanceRecords.push({
      id: 'instance.collision.provenance.1',
      kind: 'user_note',
      reference: 'occupies a derived ID',
    });
    expect(
      instantiateReusableModuleTemplate(
        versionForPayload(payload),
        target,
        {},
        options('instance.collision'),
      ),
    ).toMatchObject({
      ok: false,
      issues: [
        {
          code: 'generated_id_collision',
          details: ['instance.collision.provenance.1'],
        },
      ],
    });
  });

  it('rejects unexpected bindings and malformed target projects', () => {
    const version = versionForPayload(captureStaticFixture());
    expect(
      instantiateReusableModuleTemplate(
        version,
        createBlankTemplateProject(),
        {
          'entity.not-a-slot': {
            mode: 'create_same_entity',
            identityConfirmation: 'same_scientific_entity',
          },
        },
        options('unexpected.binding'),
      ),
    ).toMatchObject({ ok: false, issues: [{ code: 'unexpected_entity_binding' }] });
    const malformed = createBlankTemplateProject();
    malformed.schemaVersion = '2.2' as '2.3';
    expect(
      instantiateReusableModuleTemplate(version, malformed, {}, options('bad.target')),
    ).toMatchObject({ ok: false, issues: [{ code: 'target_project_schema_invalid' }] });
  });

  it.each([
    [
      'first-order steady-state response',
      (target: ReturnType<typeof createFirstOrderTemplateProject>) => {
        const model = target.network.modules[0]!.modelVariants[1]!;
        delete (model as unknown as { steadyStateResponse?: unknown }).steadyStateResponse;
      },
    ],
    [
      'ValidityDomain ranges',
      (target: ReturnType<typeof createFirstOrderTemplateProject>) => {
        (target.registry.validityDomains[0] as unknown as { inputRanges: unknown }).inputRanges =
          null;
      },
    ],
    [
      'Dataset Entity arrays',
      (target: ReturnType<typeof createFirstOrderTemplateProject>) => {
        target.registry.datasets.push({
          id: 'target.dataset',
          labelKey: 'bfn.template.fixture.dataset',
          dataType: 'multi_input',
          inputEntities: [],
          outputEntities: [],
          replicates: 1,
          contextId: target.registry.contexts[0]!.id,
          rawFile: null,
          calibrationId: null,
          evidenceGrade: 'independent_assumption',
          isDemo: false,
        });
        (target.registry.datasets[0] as unknown as { outputEntities: unknown }).outputEntities =
          null;
      },
    ],
  ])('fails closed without throwing for malformed target %s data', (_label, mutate) => {
    const target = createFirstOrderTemplateProject('target.existing.malformed');
    mutate(target);
    const version = versionForPayload(captureStaticFixture());

    expect(() =>
      instantiateReusableModuleTemplate(version, target, {}, options('instance.malformed-target')),
    ).not.toThrow();
    expect(
      instantiateReusableModuleTemplate(version, target, {}, options('instance.malformed-target')),
    ).toMatchObject({ ok: false, issues: [{ code: 'target_project_schema_invalid' }] });
  });

  it('reserves dangling target references against every generated ID namespace', () => {
    const payload = captureStaticFixture();
    const instanceId = 'instance.dangling-guard';
    const target = createStaticTemplateProject('target.existing.dangling');
    const existingModule = target.network.modules[0]!;
    const existingModel = existingModule.modelVariants[0]!;
    existingModel.contextId = `${instanceId}.context.1`;
    existingModel.validityDomainId = `${instanceId}.domain.1`;
    existingModule.implementationIds = [`${instanceId}.implementation.1`];
    existingModule.implementationState = 'designed';
    target.registry.validityDomains[0]!.inputRanges[0]!.portId = `${instanceId}.port.input.1`;
    target.registry.validityDomains[0]!.contextId = `${instanceId}.context.1`;
    target.network.edges.push({
      id: 'edge.with.dangling.references',
      source: {
        nodeId: instanceId,
        portId: `${instanceId}.port.input.1`,
      },
      target: {
        nodeId: 'missing.monitor',
        portId: `${instanceId}.port.output.1`,
      },
      mapping: 'identity',
      enabled: false,
    });
    target.registry.calibrationMaps.push({
      id: 'calibration.with.dangling.references',
      labelKey: 'bfn.template.fixture.calibration',
      targetModuleId: instanceId,
      modelType: 'lookup_table',
      contextId: `${instanceId}.context.1`,
      sourceDatasetIds: [],
      candidates: [],
      isDemo: false,
    });
    const before = structuredClone(target);
    const result = instantiateReusableModuleTemplate(
      versionForPayload(payload),
      target,
      {},
      options(instanceId),
    );

    expect(result).toMatchObject({ ok: false, issues: [{ code: 'generated_id_collision' }] });
    if (!result.ok) {
      expect(result.issues[0]?.details).toEqual(
        expect.arrayContaining([
          instanceId,
          `${instanceId}.port.input.1`,
          `${instanceId}.port.output.1`,
          `${instanceId}.context.1`,
          `${instanceId}.domain.1`,
          `${instanceId}.implementation.1`,
        ]),
      );
    }
    expect(target).toEqual(before);
    expect(target.network.modules.some((module) => module.id === instanceId)).toBe(false);
    expect(
      target.registry.contexts.some((context) => context.id === `${instanceId}.context.1`),
    ).toBe(false);
    expect(
      target.registry.validityDomains.some((domain) => domain.id === `${instanceId}.domain.1`),
    ).toBe(false);
  });

  it('is copy-on-create in both directions', () => {
    const payload = captureStaticFixture();
    const version = structuredClone(versionForPayload(payload));
    const result = instantiateReusableModuleTemplate(
      version,
      createBlankTemplateProject(),
      {},
      options('copy.on.create'),
    );
    expect(result.ok).toBe(true);
    if (!result.ok || payload.moduleClass !== 'static') return;
    const templateResponse = payload.models.static.response;
    const originalK =
      templateResponse.family === 'hill_activation' || templateResponse.family === 'hill_repression'
        ? templateResponse.k.value
        : null;
    const model = result.nextProject.network.modules[0]!.modelVariants[0]!;
    if (
      model.mode === 'static' &&
      (model.response.family === 'hill_activation' || model.response.family === 'hill_repression')
    ) {
      model.response.k.value = 999;
    }
    const versionPayload = version.payload;
    if (versionPayload.moduleClass === 'accumulator') return;
    const unchangedTemplateResponse = versionPayload.models.static.response;
    expect(
      unchangedTemplateResponse.family === 'hill_activation' ||
        unchangedTemplateResponse.family === 'hill_repression'
        ? unchangedTemplateResponse.k.value
        : null,
    ).toBe(originalK);
    const payloadRecord = version.payload as unknown as {
      models: { static: { response: { k: { value: number } } } };
    };
    payloadRecord.models.static.response.k.value = 777;
    expect(
      model.mode === 'static' &&
        (model.response.family === 'hill_activation' || model.response.family === 'hill_repression')
        ? model.response.k.value
        : null,
    ).toBe(999);
  });
});

function createSlotPayload(): BfnReusableModulePayloadV1 {
  const project = createStaticTemplateProject('source.module.slot');
  const module = project.network.modules[0]!;
  const sharedId = module.outputPorts[0]!.entity;
  project.network.outputMonitors.push(monitorNode('shared.monitor', sharedId));
  const capture = captureReusableModuleTemplatePayload(project, module.id, {
    entityPolicies: { [module.inputPorts[0]!.entity]: 'embedded' },
  });
  if (!capture.ok) throw new Error('Slot fixture capture failed.');
  return capture.payload;
}

function createAccumulatorSlotPayload(): BfnReusableModulePayloadV1 {
  const project = createBlankTemplateProject('source.accumulator.slot');
  project.network.mode = 'dynamic';
  const moduleId = 'source.accumulator.slot.module';
  const entityId = 'source.shared.signal';
  project.registry.entities.push({
    id: entityId,
    origin: 'user_defined',
    displayName: 'Shared signal',
    description: null,
  });
  project.registry.validityDomains.push({
    id: `${moduleId}.domain`,
    labelKey: 'bfn.signalPool.validityDomain',
    inputRanges: [],
    contextId: null,
  });
  project.network.modules.push({
    kind: 'functional_module',
    id: moduleId,
    labelKey: 'bfn.signalPool.moduleLabel',
    authoring: { origin: 'user_defined', name: 'Shared accumulator', description: null },
    descriptionKey: 'bfn.signalPool.description',
    inputPorts: [
      {
        id: `${moduleId}.input`,
        entity: entityId,
        quantityType: 'production_rate',
        unit: 'nM/h',
        direction: 'input',
      },
    ],
    outputPorts: [
      {
        id: `${moduleId}.output`,
        entity: entityId,
        quantityType: 'concentration',
        unit: 'nM',
        direction: 'output',
      },
    ],
    modelVariants: [
      {
        id: `${moduleId}.model`,
        version: '1.0.0',
        mode: 'dynamic',
        family: 'accumulator',
        inputPortId: `${moduleId}.input`,
        outputPortId: `${moduleId}.output`,
        initialState: 0,
        contextId: null,
        validityDomainId: `${moduleId}.domain`,
        sourceDatasetIds: [],
        provenanceIds: [],
        evidenceGrade: 'independent_assumption',
        uncertaintyMethod: 'none',
        isDemo: false,
      },
    ],
    activeModelIds: { dynamic: `${moduleId}.model` },
    implementationIds: [],
    implementationState: 'unspecified',
    evidenceGrade: 'independent_assumption',
    position: { x: 20, y: 20 },
    isDemo: false,
  });
  project.network.outputMonitors.push({
    ...monitorNode('external.signal.monitor', entityId),
    inputPort: {
      ...monitorNode('external.signal.monitor', entityId).inputPort,
      quantityType: 'concentration',
      unit: 'nM',
    },
  });
  const result = captureReusableModuleTemplatePayload(project, moduleId, { entityPolicies: {} });
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.code).join(','));
  return result.payload;
}

function createTwoSlotPayload(): BfnReusableModulePayloadV1 {
  const project = createStaticTemplateProject('source.module.two-slots');
  const module = project.network.modules[0]!;
  project.network.outputMonitors.push(
    monitorNode('shared.input.monitor', module.inputPorts[0]!.entity),
    monitorNode('shared.output.monitor', module.outputPorts[0]!.entity),
  );
  const result = captureReusableModuleTemplatePayload(project, module.id, {
    entityPolicies: {},
  });
  if (!result.ok) throw new Error(result.issues.map((issue) => issue.code).join(','));
  return result.payload;
}

function createCanonicalAndSlotPayload(): BfnReusableModulePayloadV1 {
  const payload = structuredClone(captureStaticFixture());
  const entities = [...payload.entities];
  const canonical = captureAccumulatorFixture().entities[0]!;
  if (canonical.mode !== 'canonical') throw new Error('Expected canonical fixture.');
  const slotPort = payload.ports[0]!;
  entities[0] = {
    key: entities[0]!.key,
    mode: 'slot',
    sourceEntityId: 'external.noncanonical.input',
    displayName: 'External noncanonical input',
    description: null,
    requirements: [
      {
        portKey: slotPort.key,
        direction: slotPort.direction,
        quantityType: slotPort.quantityType,
        unit: slotPort.unit,
      },
    ],
  };
  entities[1] = {
    ...structuredClone(canonical),
    key: entities[1]!.key,
  };
  return { ...payload, entities };
}

function createCanonicalAsSlotPayload(): BfnReusableModulePayloadV1 {
  const payload = createCanonicalAndSlotPayload();
  const canonical = payload.entities.find((entity) => entity.mode === 'canonical')!;
  const slot = payload.entities.find((entity) => entity.mode === 'slot')!;
  if (canonical.mode !== 'canonical' || slot.mode !== 'slot') {
    throw new Error('Expected canonical and slot fixtures.');
  }
  return {
    ...payload,
    entities: payload.entities.map((entity) =>
      entity.key === slot.key
        ? {
            ...entity,
            sourceEntityId: canonical.entityId,
            displayName: canonical.displayName,
          }
        : entity,
    ),
  };
}

function options(instanceId: string): BfnTemplateInstantiationOptions {
  return {
    instanceId,
    instanceName: 'Reusable instance',
    instanceDescription: 'Independent copy.',
  };
}

function sourceNode(id: string, entity: string) {
  return {
    kind: 'input_source' as const,
    id,
    labelKey: 'bfn.fixture.source',
    outputPort: {
      id: `${id}.port`,
      entity,
      quantityType: 'activity' as const,
      unit: 'RPU' as const,
      direction: 'output' as const,
    },
    staticSpecification: { type: 'fixed_value' as const, value: 1, unit: 'RPU' as const },
    dynamicSpecification: { type: 'constant' as const, value: 1, unit: 'RPU' as const },
    position: { x: 10, y: 10 },
  };
}

function monitorNode(id: string, entity: string) {
  return {
    kind: 'output_monitor' as const,
    id,
    labelKey: 'bfn.fixture.monitor',
    inputPort: {
      id: `${id}.port`,
      entity,
      quantityType: 'activity' as const,
      unit: 'RPU' as const,
      direction: 'input' as const,
    },
    position: { x: 800, y: 300 },
  };
}
