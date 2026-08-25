import type { BfnFunctionalModule, BfnModelVariant, BfnProject } from './types';
import { activeModelForModule } from './validation';

function activeComputationModel(
  project: BfnProject,
  module: BfnFunctionalModule,
): BfnModelVariant | null {
  const direct = activeModelForModule(module, project.network.mode);
  if (direct) return direct;
  return project.network.mode === 'dynamic' ? activeModelForModule(module, 'static') : null;
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
    uncertaintyMethod: model.uncertaintyMethod,
  };
  return model.mode === 'static'
    ? { ...shared, response: model.response }
    : {
        ...shared,
        steadyStateResponse: model.steadyStateResponse,
        tau: model.tau,
        initialState: model.initialState,
      };
}

export function createBfnComputationSignature(project: BfnProject): string {
  const modules = project.network.modules.map((module) => {
    const model = activeComputationModel(project, module);
    return {
      kind: module.kind,
      id: module.id,
      inputPorts: module.inputPorts,
      outputPorts: module.outputPorts,
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
    schemaVersion: project.schemaVersion,
    isDemo: project.isDemo,
    network: {
      id: project.network.id,
      mode: project.network.mode,
      inputSources: project.network.inputSources.map((source) => ({
        kind: source.kind,
        id: source.id,
        outputPort: source.outputPort,
        staticSpecification: source.staticSpecification,
        dynamicSpecification: source.dynamicSpecification,
      })),
      modules,
      outputMonitors: project.network.outputMonitors.map((monitor) => ({
        kind: monitor.kind,
        id: monitor.id,
        inputPort: monitor.inputPort,
      })),
      edges: project.network.edges,
    },
    analysis: project.analysis,
    registry: {
      contexts: project.registry.contexts.filter((context) => contextIds.has(context.id)),
      validityDomains: project.registry.validityDomains.filter((domain) =>
        domainIds.has(domain.id),
      ),
    },
  });
}
