import type { BfnProject } from './types';

export function findBfnOutputReachableModuleIds(
  project: BfnProject,
  monitorId: string,
): Set<string> {
  const monitor = project.network.outputMonitors.find((candidate) => candidate.id === monitorId);
  if (!monitor) return new Set();

  const modulesById = new Map(
    project.network.modules.map((module) => [module.id, module] as const),
  );
  const reachableModuleIds = new Set<string>();

  const visitIncoming = (nodeId: string, inputPortIds: ReadonlySet<string>): void => {
    for (const edge of project.network.edges) {
      if (!edge.enabled || edge.target.nodeId !== nodeId || !inputPortIds.has(edge.target.portId)) {
        continue;
      }
      const sourceModule = modulesById.get(edge.source.nodeId);
      if (
        !sourceModule ||
        !sourceModule.outputPorts.some((port) => port.id === edge.source.portId) ||
        reachableModuleIds.has(sourceModule.id)
      ) {
        continue;
      }
      reachableModuleIds.add(sourceModule.id);
      visitIncoming(sourceModule.id, new Set(sourceModule.inputPorts.map((port) => port.id)));
    }
  };

  visitIncoming(monitor.id, new Set([monitor.inputPort.id]));
  return reachableModuleIds;
}
