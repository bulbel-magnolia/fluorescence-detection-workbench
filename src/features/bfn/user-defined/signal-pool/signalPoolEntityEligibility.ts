import type { BfnPort, BfnProject } from '../../types';

export function collectSignalPoolEligibleEntityIds(project: BfnProject): string[] {
  const entityIds = new Set<string>();
  for (const port of allProjectPorts(project)) {
    if (port.quantityType === 'concentration' || port.quantityType === 'production_rate') {
      entityIds.add(port.entity);
    }
  }
  return [...entityIds];
}

function allProjectPorts(project: BfnProject): BfnPort[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
}
