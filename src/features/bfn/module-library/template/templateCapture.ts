import { assessBfnAccumulatorRuntimeContract } from '../../accumulatorRuntimeContract';
import { isBfnProjectV23 } from '../../bfnIrMigration';
import type {
  BfnAccumulatorDynamicModel,
  BfnDynamicModel,
  BfnFunctionalModule,
  BfnModelVariant,
  BfnParameterEstimate,
  BfnPort,
  BfnProject,
  BfnStaticModel,
  BfnStaticResponse,
} from '../../types';
import { captureTemplateDependencyClosure } from './templateDependencyClosure';
import { captureTemplateEntities } from './templateEntityPolicy';
import { isPlainDataRecord } from './templateInternals';
import type {
  BfnReusableModulePayloadV1,
  BfnTemplateCaptureOptions,
  BfnTemplateCaptureResult,
  BfnTemplateContractIssue,
  BfnTemplateModelBaseV1,
  BfnTemplatePortV1,
  BfnTemplateStaticResponseV1,
} from './templateTypes';
import { validateReusableModulePayload } from './templateValidation';

/** Captures one active user module without editing its source project. */
export function captureReusableModuleTemplatePayload(
  project: BfnProject,
  moduleId: string,
  options: BfnTemplateCaptureOptions,
): BfnTemplateCaptureResult {
  if (!isBfnProjectV23(project)) return failure('project_schema_invalid', 'project');
  if (!isPlainDataRecord(options) || !isPlainDataRecord(options.entityPolicies)) {
    return failure('entity_policy_invalid', 'options.entityPolicies');
  }
  const module = project.network.modules.find((candidate) => candidate.id === moduleId);
  if (!module) return failure('module_not_found', 'moduleId', [moduleId]);
  if (module.authoring?.origin !== 'user_defined') {
    return failure('module_not_user_defined', 'module.authoring');
  }
  if (module.isDemo) return failure('demo_module_unsupported', 'module.isDemo');

  const active = resolveActiveModels(module);
  if (!active.ok) return active;
  if (module.modelVariants.length !== active.models.length) {
    return failure('unsupported_dormant_model_variant', 'module.modelVariants');
  }
  if (active.models.some((model) => model.isDemo)) {
    return failure('demo_module_unsupported', 'module.modelVariants.isDemo');
  }
  const datasetIds = active.models.flatMap((model) => model.sourceDatasetIds);
  if (datasetIds.length > 0) {
    return failure('dataset_dependency_unsupported', 'module.modelVariants.sourceDatasetIds', [
      ...new Set(datasetIds),
    ]);
  }
  if (active.models.some((model) => Object.hasOwn(model, 'catalogReference'))) {
    return failure('catalog_reference_unsupported', 'module.modelVariants.catalogReference');
  }

  const sourcePorts = [...module.inputPorts, ...module.outputPorts];
  const portCapture = capturePorts(sourcePorts, module.inputPorts.length);
  if (!portCapture.ok) return portCapture;
  const entityCapture = captureTemplateEntities(
    project,
    module,
    sourcePorts,
    portCapture.portKeyBySourceId,
    options,
  );
  if (entityCapture.issues.length > 0) return { ok: false, issues: entityCapture.issues };
  const ports: BfnTemplatePortV1[] = portCapture.ports.map((port, index) => ({
    ...port,
    entityKey: entityCapture.entityKeyBySourceId.get(sourcePorts[index]!.entity)!,
  }));

  const closure = captureTemplateDependencyClosure(
    project,
    active.models,
    module.implementationIds,
    portCapture.portKeyBySourceId,
  );
  if (closure.issues.length > 0) return { ok: false, issues: closure.issues };
  const common = {
    ports,
    entities: entityCapture.entities,
    contexts: closure.contexts,
    validityDomains: closure.validityDomains,
    provenance: closure.provenance,
    implementations: closure.implementations,
    implementationKeys: closure.implementationKeys,
    moduleEvidenceGrade: module.evidenceGrade,
    implementationState: module.implementationState,
  } as const;

  let payload: BfnReusableModulePayloadV1 | null = null;
  if (active.moduleClass === 'static') {
    const model = captureStaticModel(active.staticModel, portCapture.portKeyBySourceId, closure);
    if (model) {
      payload = {
        ...common,
        moduleClass: 'static',
        activeModels: { static: 'model.static' },
        models: { static: model },
      };
    }
  } else if (active.moduleClass === 'first_order') {
    const staticModel = captureStaticModel(
      active.staticModel,
      portCapture.portKeyBySourceId,
      closure,
    );
    const dynamicModel = captureFirstOrderModel(
      active.dynamicModel,
      portCapture.portKeyBySourceId,
      closure,
    );
    if (staticModel && dynamicModel) {
      payload = {
        ...common,
        moduleClass: 'first_order',
        activeModels: { static: 'model.static', dynamic: 'model.dynamic' },
        models: { static: staticModel, dynamic: dynamicModel },
      };
    }
  } else {
    const contractIssue = assessBfnAccumulatorRuntimeContract(module, active.dynamicModel);
    if (contractIssue) {
      return failure('scientific_contract_invalid', 'module.modelVariants', [contractIssue]);
    }
    const model = captureAccumulatorModel(
      active.dynamicModel,
      portCapture.portKeyBySourceId,
      closure,
    );
    if (model) {
      payload = {
        ...common,
        moduleClass: 'accumulator',
        activeModels: { dynamic: 'model.accumulator' },
        models: { dynamic: model },
      };
    }
  }

  if (!payload) return failure('scientific_contract_invalid', 'module.modelVariants');
  const validationIssues = validateReusableModulePayload(payload);
  if (validationIssues.length > 0) {
    return failure(
      'scientific_contract_invalid',
      'module',
      validationIssues.map((item) => `${item.path}:${item.reason}`),
    );
  }
  return { ok: true, payload };
}

type ActiveModelsResult =
  | {
      readonly ok: true;
      readonly moduleClass: 'static';
      readonly models: readonly [BfnStaticModel];
      readonly staticModel: BfnStaticModel;
    }
  | {
      readonly ok: true;
      readonly moduleClass: 'first_order';
      readonly models: readonly [BfnStaticModel, BfnDynamicModel];
      readonly staticModel: BfnStaticModel;
      readonly dynamicModel: BfnDynamicModel;
    }
  | {
      readonly ok: true;
      readonly moduleClass: 'accumulator';
      readonly models: readonly [BfnAccumulatorDynamicModel];
      readonly dynamicModel: BfnAccumulatorDynamicModel;
    }
  | { readonly ok: false; readonly issues: readonly BfnTemplateContractIssue[] };

function resolveActiveModels(module: BfnFunctionalModule): ActiveModelsResult {
  const staticId = module.activeModelIds.static;
  const dynamicId = module.activeModelIds.dynamic;
  const staticModel = staticId
    ? module.modelVariants.find((candidate) => candidate.id === staticId)
    : undefined;
  const dynamicModel = dynamicId
    ? module.modelVariants.find((candidate) => candidate.id === dynamicId)
    : undefined;
  if (
    (staticId && staticModel?.mode !== 'static') ||
    (dynamicId && dynamicModel?.mode !== 'dynamic')
  ) {
    return failedActive('active_model_reference_invalid', 'module.activeModelIds');
  }
  if (staticModel?.mode === 'static' && dynamicModel === undefined) {
    if (!isSupportedStaticFamily(staticModel.family)) return unsupportedFamily(staticModel.family);
    return { ok: true, moduleClass: 'static', models: [staticModel], staticModel };
  }
  if (
    staticModel?.mode === 'static' &&
    dynamicModel?.mode === 'dynamic' &&
    dynamicModel.family === 'first_order'
  ) {
    if (!isSupportedStaticFamily(staticModel.family)) return unsupportedFamily(staticModel.family);
    return {
      ok: true,
      moduleClass: 'first_order',
      models: [staticModel, dynamicModel],
      staticModel,
      dynamicModel,
    };
  }
  if (
    staticModel === undefined &&
    dynamicModel?.mode === 'dynamic' &&
    dynamicModel.family === 'accumulator'
  ) {
    return { ok: true, moduleClass: 'accumulator', models: [dynamicModel], dynamicModel };
  }
  return failedActive('module_class_unsupported', 'module.activeModelIds');
}

function isSupportedStaticFamily(family: string): boolean {
  return [
    'hill_activation',
    'hill_repression',
    'linear_transfer',
    'identity',
    'independent_inputs',
  ].includes(family);
}

function unsupportedFamily(family: string): ActiveModelsResult {
  return {
    ok: false,
    issues: [
      {
        code: 'unsupported_model_family',
        path: 'module.modelVariants.family',
        details: [family],
      },
    ],
  };
}

function failedActive(code: BfnTemplateContractIssue['code'], path: string): ActiveModelsResult {
  return { ok: false, issues: [{ code, path }] };
}

type PortCaptureResult =
  | {
      readonly ok: true;
      readonly ports: readonly Omit<BfnTemplatePortV1, 'entityKey'>[];
      readonly portKeyBySourceId: ReadonlyMap<string, string>;
    }
  | { readonly ok: false; readonly issues: readonly BfnTemplateContractIssue[] };

function capturePorts(sourcePorts: readonly BfnPort[], inputCount: number): PortCaptureResult {
  const ids = sourcePorts.map((port) => port.id);
  if (new Set(ids).size !== ids.length) {
    return failedPorts('scientific_contract_invalid', 'module.ports', ['duplicate_port_id']);
  }
  const portKeyBySourceId = new Map<string, string>();
  const ports: Omit<BfnTemplatePortV1, 'entityKey'>[] = [];
  for (const [index, port] of sourcePorts.entries()) {
    const expectedDirection = index < inputCount ? 'input' : 'output';
    if (port.direction !== expectedDirection) {
      return failedPorts('scientific_contract_invalid', `module.ports[${index}].direction`);
    }
    const key = `${expectedDirection === 'input' ? 'port.input' : 'port.output'}.${
      expectedDirection === 'input' ? index + 1 : index - inputCount + 1
    }`;
    portKeyBySourceId.set(port.id, key);
    ports.push({
      key,
      quantityType: port.quantityType,
      unit: port.unit,
      direction: port.direction,
      ...(port.displayName ? { displayName: structuredClone(port.displayName) } : {}),
      ...(port.authoring ? { authoringName: port.authoring.name } : {}),
    });
  }
  return { ok: true, ports, portKeyBySourceId };
}

type ClosureMaps = ReturnType<typeof captureTemplateDependencyClosure>;

function captureModelBase(
  model: BfnModelVariant,
  closure: ClosureMaps,
  key: string,
): BfnTemplateModelBaseV1 | null {
  const contextKey =
    model.contextId === null ? null : closure.contextKeyBySourceId.get(model.contextId);
  const validityDomainKey = closure.domainKeyBySourceId.get(model.validityDomainId);
  const provenanceKeys = model.provenanceIds.map((id) => closure.provenanceKeyBySourceId.get(id));
  if (
    (model.contextId !== null && !contextKey) ||
    !validityDomainKey ||
    provenanceKeys.some((item) => item === undefined)
  ) {
    return null;
  }
  return {
    key,
    version: model.version,
    contextKey: contextKey ?? null,
    validityDomainKey,
    provenanceKeys: provenanceKeys.filter((item): item is string => item !== undefined),
    evidenceGrade: model.evidenceGrade,
    uncertaintyMethod: model.uncertaintyMethod,
  };
}

function captureStaticModel(
  model: BfnStaticModel,
  portKeys: ReadonlyMap<string, string>,
  closure: ClosureMaps,
) {
  const base = captureModelBase(model, closure, 'model.static');
  const response = captureResponse(model.response, portKeys);
  return base && response
    ? { ...base, mode: 'static' as const, family: model.family, response }
    : null;
}

function captureFirstOrderModel(
  model: BfnDynamicModel,
  portKeys: ReadonlyMap<string, string>,
  closure: ClosureMaps,
) {
  const base = captureModelBase(model, closure, 'model.dynamic');
  const steadyStateResponse = captureResponse(model.steadyStateResponse, portKeys);
  return base && steadyStateResponse
    ? {
        ...base,
        mode: 'dynamic' as const,
        family: 'first_order' as const,
        steadyStateResponse,
        tau: copyParameter(model.tau),
        initialState: model.initialState,
      }
    : null;
}

function captureAccumulatorModel(
  model: BfnAccumulatorDynamicModel,
  portKeys: ReadonlyMap<string, string>,
  closure: ClosureMaps,
) {
  const base = captureModelBase(model, closure, 'model.accumulator');
  const inputPortKey = portKeys.get(model.inputPortId);
  const outputPortKey = portKeys.get(model.outputPortId);
  return base && inputPortKey && outputPortKey
    ? {
        ...base,
        mode: 'dynamic' as const,
        family: 'accumulator' as const,
        inputPortKey,
        outputPortKey,
        initialState: model.initialState,
      }
    : null;
}

function captureResponse(
  response: BfnStaticResponse,
  portKeys: ReadonlyMap<string, string>,
): BfnTemplateStaticResponseV1 | null {
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    const inputPortKey = portKeys.get(response.inputPortId);
    return inputPortKey
      ? {
          family: response.family,
          inputPortKey,
          ymin: copyParameter(response.ymin),
          ymax: copyParameter(response.ymax),
          k: copyParameter(response.k),
          n: copyParameter(response.n),
        }
      : null;
  }
  if (response.family === 'linear_transfer') {
    const inputPortKey = portKeys.get(response.inputPortId);
    return inputPortKey
      ? {
          family: response.family,
          inputPortKey,
          scale: copyParameter(response.scale),
          intercept: copyParameter(response.intercept),
          ...(response.outputMinimum === undefined
            ? {}
            : { outputMinimum: response.outputMinimum }),
          ...(response.outputMaximum === undefined
            ? {}
            : { outputMaximum: response.outputMaximum }),
        }
      : null;
  }
  if (response.family === 'identity') {
    const inputPortKey = portKeys.get(response.inputPortId);
    return inputPortKey ? { family: 'identity', inputPortKey } : null;
  }
  if (response.family !== 'independent_inputs') return null;
  const terms = response.terms.flatMap((term) => {
    const inputPortKey = portKeys.get(term.inputPortId);
    return inputPortKey
      ? [
          {
            inputPortKey,
            direction: term.direction,
            k: copyParameter(term.k),
            n: copyParameter(term.n),
            contribution: copyParameter(term.contribution),
          },
        ]
      : [];
  });
  return terms.length === response.terms.length
    ? {
        family: 'independent_inputs',
        terms,
        basal: copyParameter(response.basal),
        outputMaximum: copyParameter(response.outputMaximum),
        aggregation: response.aggregation,
        interactionAssumption: response.interactionAssumption,
      }
    : null;
}

function copyParameter(parameter: BfnParameterEstimate): BfnParameterEstimate {
  return {
    value: parameter.value,
    unit: parameter.unit,
    ...(parameter.interval95
      ? { interval95: [parameter.interval95[0], parameter.interval95[1]] }
      : {}),
  };
}

function failure(
  code: BfnTemplateContractIssue['code'],
  path: string,
  details?: readonly string[],
): BfnTemplateCaptureResult {
  return { ok: false, issues: [{ code, path, ...(details ? { details } : {}) }] };
}

function failedPorts(
  code: BfnTemplateContractIssue['code'],
  path: string,
  details?: readonly string[],
): Extract<PortCaptureResult, { readonly ok: false }> {
  return { ok: false, issues: [{ code, path, ...(details ? { details } : {}) }] };
}
