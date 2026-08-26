import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import { nextBfnCatalogInstanceIds } from './catalogInstanceIds';

describe('Catalog project-local instance IDs', () => {
  it('generates a complete deterministic set outside every project ID namespace', () => {
    const project = createDemoBfnProject();
    const ids = nextBfnCatalogInstanceIds(project, 'resp.example.signal');
    const values = [
      ids.moduleId,
      ids.inputPortId,
      ids.outputPortId,
      ids.modelId,
      ids.validityDomainId,
      ids.inputSourceId,
      ids.inputSourceOutputPortId,
    ];
    const occupied = new Set([
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

    expect(new Set(values).size).toBe(7);
    expect(values.every((id) => !occupied.has(id))).toBe(true);
    expect(nextBfnCatalogInstanceIds(project, 'resp.example.signal')).toEqual(ids);
  });

  it('advances the whole set when any candidate ID collides', () => {
    const project = createDemoBfnProject();
    const first = nextBfnCatalogInstanceIds(project, 'resp.example.signal');
    project.network.modules[0]!.inputPorts[0]!.id = first.modelId;

    const next = nextBfnCatalogInstanceIds(project, 'resp.example.signal');

    expect(next.moduleId).toContain('-2');
    expect([
      next.moduleId,
      next.inputPortId,
      next.outputPortId,
      next.modelId,
      next.validityDomainId,
      next.inputSourceId,
      next.inputSourceOutputPortId,
    ]).not.toContain(first.modelId);
  });
});
