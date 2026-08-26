import type { BfnProject } from '../types';

export interface BfnCatalogInstanceIds {
  moduleId: string;
  inputPortId: string;
  outputPortId: string;
  modelId: string;
  validityDomainId: string;
  inputSourceId: string;
  inputSourceOutputPortId: string;
}

function catalogInstanceSlug(responseId: string): string {
  const slug = responseId
    .toLocaleLowerCase()
    .replace(/^resp[._-]*/u, '')
    .replace(/[^a-z0-9]+/gu, '-')
    .replace(/^-+|-+$/gu, '')
    .slice(0, 48);
  return slug || 'response';
}

function occupiedProjectIds(project: BfnProject): Set<string> {
  return new Set([
    ...project.network.inputSources.flatMap((source) => [source.id, source.outputPort.id]),
    ...project.network.modules.flatMap((module) => [
      module.id,
      ...module.inputPorts.map((port) => port.id),
      ...module.outputPorts.map((port) => port.id),
      ...module.modelVariants.map((model) => model.id),
    ]),
    ...project.network.outputMonitors.flatMap((monitor) => [monitor.id, monitor.inputPort.id]),
    ...project.registry.validityDomains.map((domain) => domain.id),
  ]);
}

function idsFor(slug: string, instance: number): BfnCatalogInstanceIds {
  const root = `catalog-${slug}-${instance}`;
  return {
    moduleId: `module-${root}`,
    inputPortId: `port-${root}-input`,
    outputPortId: `port-${root}-output`,
    modelId: `model-${root}-static`,
    validityDomainId: `domain-${root}`,
    inputSourceId: `source-${root}`,
    inputSourceOutputPortId: `port-${root}-source-output`,
  };
}

function instanceIdValues(ids: BfnCatalogInstanceIds): string[] {
  return [
    ids.moduleId,
    ids.inputPortId,
    ids.outputPortId,
    ids.modelId,
    ids.validityDomainId,
    ids.inputSourceId,
    ids.inputSourceOutputPortId,
  ];
}

export function nextBfnCatalogInstanceIds(
  project: BfnProject,
  responseId: string,
): BfnCatalogInstanceIds {
  const occupied = occupiedProjectIds(project);
  const slug = catalogInstanceSlug(responseId);
  for (let instance = 1; instance < Number.MAX_SAFE_INTEGER; instance += 1) {
    const ids = idsFor(slug, instance);
    const values = instanceIdValues(ids);
    if (new Set(values).size === values.length && values.every((id) => !occupied.has(id))) {
      return ids;
    }
  }
  throw new Error('BFN_CATALOG_INSTANCE_ID_EXHAUSTED');
}
