import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from '../fixtures';
import type { BfnPort } from '../types';
import { findCompatibleBfnSignalSources } from './catalogInputResolution';

const requiredPort: BfnPort = {
  id: 'catalog-required-input',
  entity: 'N-(3-oxohexanoyl)-L-homoserine lactone',
  quantityType: 'concentration',
  unit: 'M',
  direction: 'input',
};

describe('Catalog BFN input resolution', () => {
  it('recommends adding an input source when no exact signal identity is available', () => {
    const project = createDemoBfnProject();
    const result = findCompatibleBfnSignalSources(project, requiredPort);

    expect(result).toEqual({
      status: 'missing',
      compatibleSources: [],
      recommendedAction: 'module_plus_input_source',
    });
  });

  it('accepts exact entity and quantity matches with M or nM units', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.outputPort.entity = requiredPort.entity;
    source.outputPort.quantityType = requiredPort.quantityType;
    source.outputPort.unit = 'nM';

    const result = findCompatibleBfnSignalSources(project, requiredPort);

    expect(result.status).toBe('available');
    expect(result.recommendedAction).toBe('module_only');
    expect(result.compatibleSources).toEqual([
      {
        nodeId: source.id,
        nodeKind: 'input_source',
        port: source.outputPort,
      },
    ]);
  });

  it('includes all compatible module outputs without selecting one or including monitors', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.outputPort = { ...requiredPort, id: 'source-match', direction: 'output', unit: 'uM' };
    const module = project.network.modules[0]!;
    module.outputPorts = [
      { ...requiredPort, id: 'module-match-one', direction: 'output', unit: 'M' },
      { ...requiredPort, id: 'module-match-two', direction: 'output', unit: 'nM' },
    ];
    project.network.outputMonitors[0]!.inputPort = {
      ...requiredPort,
      id: 'monitor-match',
      direction: 'input',
    };

    const result = findCompatibleBfnSignalSources(project, requiredPort);

    expect(result.compatibleSources.map((entry) => entry.port.id)).toEqual([
      'source-match',
      'module-match-one',
      'module-match-two',
    ]);
    expect(result.compatibleSources.map((entry) => entry.port.id)).not.toContain('monitor-match');
    expect('selectedSource' in result).toBe(false);
  });

  it.each([
    ['different entity', { entity: 'similar display name' }],
    ['different quantity', { quantityType: 'activity' as const }],
    ['incompatible unit dimension', { unit: 'dimensionless' as const }],
  ])('rejects a source with %s', (_label, mutation) => {
    const project = createDemoBfnProject();
    project.network.inputSources[0]!.outputPort = {
      ...requiredPort,
      id: 'near-match',
      direction: 'output',
      ...mutation,
    };

    expect(findCompatibleBfnSignalSources(project, requiredPort).status).toBe('missing');
  });

  it('handles an imported unknown unit without throwing from the shared unit system', () => {
    const project = createDemoBfnProject();
    const port = project.network.inputSources[0]!.outputPort;
    port.entity = requiredPort.entity;
    port.quantityType = requiredPort.quantityType;
    Object.assign(port, { unit: 'ppm' });

    expect(() => findCompatibleBfnSignalSources(project, requiredPort)).not.toThrow();
    expect(findCompatibleBfnSignalSources(project, requiredPort).status).toBe('missing');
  });
});
