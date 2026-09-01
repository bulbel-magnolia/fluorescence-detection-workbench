import type { BfnModelVariant, BfnProject } from './types';
import { bfnCatalogReferencePresence } from './catalog/catalogBfnTypes';
import { resolveEffectiveBfnModel } from './modelResolution';

function contextBasis(context: BfnProject['registry']['contexts'][number]) {
  return Object.fromEntries(
    Object.entries(context).filter(([key]) => key !== 'documentationState'),
  );
}

function portBasis(port: BfnProject['network']['modules'][number]['inputPorts'][number]) {
  return {
    id: port.id,
    entity: port.entity,
    quantityType: port.quantityType,
    unit: port.unit,
    direction: port.direction,
  };
}

function modelBasis(model: BfnModelVariant | null) {
  if (!model) return null;
  const shared = {
    id: model.id,
    version: model.version,
    mode: model.mode,
    family: model.family,
    contextId: model.contextId,
    validityDomainId: model.validityDomainId,
    sourceDatasetIds: model.sourceDatasetIds,
    evidenceGrade: model.evidenceGrade,
    isDemo: model.isDemo,
    catalogReference: bfnCatalogReferencePresence(model).value,
    uncertaintyMethod: model.uncertaintyMethod,
  };
  if (model.mode === 'static') return { ...shared, response: model.response };
  if (model.family === 'first_order') {
    return {
      ...shared,
      steadyStateResponse: model.steadyStateResponse,
      tau: model.tau,
      initialState: model.initialState,
    };
  }
  return {
    ...shared,
    inputPortId: model.inputPortId,
    outputPortId: model.outputPortId,
    initialState: model.initialState,
  };
}

export function createBfnComputationSignature(project: BfnProject): string {
  const modules = project.network.modules.map((module) => {
    const model = resolveEffectiveBfnModel(project, module);
    return {
      kind: module.kind,
      id: module.id,
      inputPorts: module.inputPorts.map(portBasis),
      outputPorts: module.outputPorts.map(portBasis),
      implementationIds: module.implementationIds,
      evidenceGrade: module.evidenceGrade,
      isDemo: module.isDemo,
      activeModelId: model?.id ?? null,
      model: modelBasis(model),
    };
  });
  const contextIds = new Set(
    modules.flatMap((module) => (module.model ? [module.model.contextId] : [])),
  );
  const domainIds = new Set(
    modules.flatMap((module) => (module.model ? [module.model.validityDomainId] : [])),
  );

  return JSON.stringify({
    schema: project.schema,
    // Preserve the persisted BFN-IR 2.0 signature representation; the project schema version is descriptive.
    schemaVersion: '2.0',
    isDemo: project.isDemo,
    network: {
      id: project.network.id,
      mode: project.network.mode,
      inputSources: project.network.inputSources.map((source) => ({
        kind: source.kind,
        id: source.id,
        outputPort: portBasis(source.outputPort),
        staticSpecification: source.staticSpecification,
        dynamicSpecification: source.dynamicSpecification,
      })),
      modules,
      outputMonitors: project.network.outputMonitors.map((monitor) => ({
        kind: monitor.kind,
        id: monitor.id,
        inputPort: portBasis(monitor.inputPort),
      })),
      edges: project.network.edges,
    },
    analysis: project.analysis,
    registry: {
      contexts: project.registry.contexts
        .filter((context) => contextIds.has(context.id))
        .map(contextBasis),
      validityDomains: project.registry.validityDomains.filter((domain) =>
        domainIds.has(domain.id),
      ),
    },
  });
}
