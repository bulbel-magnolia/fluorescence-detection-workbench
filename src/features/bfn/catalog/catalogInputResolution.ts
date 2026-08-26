import type { BfnPort, BfnProject } from '../types';
import { areUnitsCompatible, isBfnUnit } from '../unitSystem';

export interface BfnCompatibleSignalSource {
  nodeId: string;
  nodeKind: 'input_source' | 'functional_module';
  port: BfnPort;
}

export type BfnCatalogInputResolution =
  | {
      status: 'available';
      compatibleSources: BfnCompatibleSignalSource[];
      recommendedAction: 'module_only';
    }
  | {
      status: 'missing';
      compatibleSources: [];
      recommendedAction: 'module_plus_input_source';
    };

function compatible(source: BfnPort, required: BfnPort): boolean {
  return (
    source.direction === 'output' &&
    required.direction === 'input' &&
    source.entity === required.entity &&
    source.quantityType === required.quantityType &&
    isBfnUnit(source.unit) &&
    isBfnUnit(required.unit) &&
    areUnitsCompatible(source.unit, required.unit)
  );
}

export function findCompatibleBfnSignalSources(
  project: BfnProject,
  requiredPort: BfnPort,
): BfnCatalogInputResolution {
  const sourceMatches: BfnCompatibleSignalSource[] = project.network.inputSources.flatMap(
    (source) =>
      compatible(source.outputPort, requiredPort)
        ? [{ nodeId: source.id, nodeKind: 'input_source' as const, port: source.outputPort }]
        : [],
  );
  const moduleMatches: BfnCompatibleSignalSource[] = project.network.modules.flatMap((module) =>
    module.outputPorts.flatMap((port) =>
      compatible(port, requiredPort)
        ? [{ nodeId: module.id, nodeKind: 'functional_module' as const, port }]
        : [],
    ),
  );
  const compatibleSources = [...sourceMatches, ...moduleMatches];
  return compatibleSources.length > 0
    ? { status: 'available', compatibleSources, recommendedAction: 'module_only' }
    : { status: 'missing', compatibleSources: [], recommendedAction: 'module_plus_input_source' };
}
