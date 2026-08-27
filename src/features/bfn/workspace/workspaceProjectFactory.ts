import { createDemoBfnProject } from '../fixtures';
import type { BfnProject } from '../types';
import type { BfnWorkspaceProjectMetadata } from './workspaceTypes';

export interface BfnWorkspaceFactoryOptions {
  now?: string;
  workspaceProjectId?: string;
  bfnProjectId?: string;
  networkId?: string;
}

function createId(prefix: string): string {
  const value =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${value}`;
}

export function createBlankBfnProject(options: BfnWorkspaceFactoryOptions = {}): BfnProject {
  const now = options.now ?? new Date().toISOString();
  const support = createDemoBfnProject(now);
  return {
    ...support,
    id: options.bfnProjectId ?? createId('bfn-project'),
    labelKey: 'bfn.project.untitledNetwork',
    network: {
      id: options.networkId ?? createId('bfn-network'),
      labelKey: 'bfn.network.untitled',
      mode: 'static',
      inputSources: [],
      modules: [],
      outputMonitors: [
        {
          kind: 'output_monitor',
          id: 'monitor-reporter',
          labelKey: 'bfn.monitors.reporter',
          inputPort: {
            id: 'monitor-reporter-in',
            entity: 'normalized_reporter_expression',
            quantityType: 'expression_level',
            unit: 'dimensionless',
            direction: 'input',
          },
          position: { x: 806, y: 142 },
        },
      ],
      edges: [],
    },
    createdAt: now,
    updatedAt: now,
    isDemo: false,
  };
}

export function duplicateBfnProject(
  source: BfnProject,
  options: BfnWorkspaceFactoryOptions = {},
): BfnProject {
  const now = options.now ?? new Date().toISOString();
  return {
    ...structuredClone(source),
    id: options.bfnProjectId ?? createId('bfn-project'),
    network: {
      ...structuredClone(source.network),
      id: options.networkId ?? createId('bfn-network'),
    },
    createdAt: now,
    updatedAt: now,
  };
}

export function createWorkspaceProjectMetadata(
  name: string,
  options: Pick<BfnWorkspaceFactoryOptions, 'now' | 'workspaceProjectId'> = {},
): BfnWorkspaceProjectMetadata {
  const now = options.now ?? new Date().toISOString();
  return {
    id: options.workspaceProjectId ?? createId('workspace-project'),
    name: name.trim(),
    createdAt: now,
    lastOpenedAt: now,
    draftUpdatedAt: now,
    nextRevision: 1,
  };
}

export function initialBfnSelection(project: BfnProject): string | null {
  return (
    project.network.modules[0]?.id ??
    project.network.inputSources[0]?.id ??
    project.network.outputMonitors[0]?.id ??
    null
  );
}

export function importedWorkspaceName(filename: string, fallback: string): string {
  const trimmed = filename.trim();
  const withoutSuffix = trimmed
    .replace(/\.bfn-ir\.json$/i, '')
    .replace(/\.json$/i, '')
    .trim();
  return withoutSuffix || fallback;
}

export function sanitizeWorkspaceExportName(name: string, fallback = 'bfn-project'): string {
  const withoutControlCharacters = Array.from(name, (character) =>
    character.charCodeAt(0) < 32 ? '-' : character,
  ).join('');
  const sanitized = withoutControlCharacters
    .trim()
    .replace(/[<>:"/\\|?*]/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/\s+/g, '-');
  return sanitized || fallback;
}
