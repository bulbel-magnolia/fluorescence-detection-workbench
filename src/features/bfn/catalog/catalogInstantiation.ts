import {
  isTrustedReleaseCatalogPresentation,
  loadReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
} from '../../modeling/catalog/releaseCatalogPresentation';
import {
  findBfnCatalogPairPlacement,
  findBfnModulePlacement,
  type BfnCanvasViewport,
} from '../nodePlacement';
import type { BfnPort, BfnProject } from '../types';
import {
  buildBfnCatalogRuntimeCandidate,
  instantiateCatalogResponseInBfnProject,
  isTrustedBfnCatalogRuntimeCandidate,
  type BfnCatalogInstantiationResult,
} from './catalogBfnAdapter';
import type { BfnCatalogRuntimeCandidate } from './catalogBfnTypes';
import {
  findCompatibleBfnSignalSources,
  type BfnCatalogInputResolution,
} from './catalogInputResolution';
import { bfnCatalogComponentDisplayName } from './catalogDetail';
import { bfnCatalogSignalDisplayName } from './catalogDiscovery';
import { nextBfnCatalogInstanceIds } from './catalogInstanceIds';

export type BfnCatalogProjectInstantiationError =
  'response-unavailable' | 'catalog-state-changed' | 'project-conflict';

export type BfnCatalogProjectInstantiationResult =
  | {
      ok: true;
      nextProject: BfnProject;
      addedModuleId: string;
      addedInputSourceId?: string;
      inputResolution: BfnCatalogInputResolution;
    }
  | { ok: false; error: BfnCatalogProjectInstantiationError };

interface BfnCatalogInstantiationDependencies {
  presentation?: ReleaseCatalogPresentation;
  candidateBuilder?: (responseId: string) => BfnCatalogRuntimeCandidate;
  adapter?: typeof instantiateCatalogResponseInBfnProject;
}

export function requiredInputPortForBfnCatalogCandidate(
  candidate: BfnCatalogRuntimeCandidate,
): BfnPort | null {
  if (!isTrustedBfnCatalogRuntimeCandidate(candidate)) return null;
  return {
    id: 'catalog-input-resolution-probe',
    entity: candidate.inputEntity,
    quantityType: 'concentration',
    unit: 'M',
    direction: 'input',
  };
}

export function resolveBfnCatalogCandidateInput(
  project: BfnProject,
  candidate: BfnCatalogRuntimeCandidate,
): BfnCatalogInputResolution | null {
  const requiredPort = requiredInputPortForBfnCatalogCandidate(candidate);
  return requiredPort ? findCompatibleBfnSignalSources(project, requiredPort) : null;
}

export function instantiateBfnCatalogResponse(
  project: BfnProject,
  responseId: string,
  createInputSource: boolean,
  viewport: BfnCanvasViewport,
  dependencies: BfnCatalogInstantiationDependencies = {},
): BfnCatalogProjectInstantiationResult {
  const candidateBuilder = dependencies.candidateBuilder ?? buildBfnCatalogRuntimeCandidate;
  let candidate: BfnCatalogRuntimeCandidate;
  try {
    candidate = candidateBuilder(responseId);
  } catch {
    return { ok: false, error: 'response-unavailable' };
  }
  if (candidate.responseId !== responseId || !isTrustedBfnCatalogRuntimeCandidate(candidate)) {
    return { ok: false, error: 'response-unavailable' };
  }

  let presentation: ReleaseCatalogPresentation;
  try {
    presentation = dependencies.presentation ?? loadReleaseCatalogPresentation();
  } catch {
    return { ok: false, error: 'catalog-state-changed' };
  }
  if (!isTrustedReleaseCatalogPresentation(presentation)) {
    return { ok: false, error: 'catalog-state-changed' };
  }
  const response = presentation.responseVariants.find((entry) => entry.id === responseId);
  const component = presentation.components.find(
    (entry) => entry.id === candidate.catalogReference.componentId,
  );
  if (!response?.runnable || !component || response.componentId !== component.id) {
    return { ok: false, error: 'catalog-state-changed' };
  }
  const inputResolution = resolveBfnCatalogCandidateInput(project, candidate);
  if (!inputResolution) return { ok: false, error: 'catalog-state-changed' };

  const ids = nextBfnCatalogInstanceIds(project, responseId);
  const pairPlacement = createInputSource ? findBfnCatalogPairPlacement(project, viewport) : null;
  const modulePosition = pairPlacement?.module ?? findBfnModulePlacement(project, viewport);
  const adapter = dependencies.adapter ?? instantiateCatalogResponseInBfnProject;
  const result: BfnCatalogInstantiationResult = createInputSource
    ? adapter(project, candidate, {
        moduleId: ids.moduleId,
        modulePosition,
        inputPortId: ids.inputPortId,
        outputPortId: ids.outputPortId,
        modelId: ids.modelId,
        validityDomainId: ids.validityDomainId,
        createInputSource: true,
        inputSourceId: ids.inputSourceId,
        inputSourcePosition: pairPlacement?.inputSource ?? { x: 12, y: 20 },
        inputSourceOutputPortId: ids.inputSourceOutputPortId,
      })
    : adapter(project, candidate, {
        moduleId: ids.moduleId,
        modulePosition,
        inputPortId: ids.inputPortId,
        outputPortId: ids.outputPortId,
        modelId: ids.modelId,
        validityDomainId: ids.validityDomainId,
        createInputSource: false,
      });
  if (!result.ok) {
    return {
      ok: false,
      error:
        result.error.code === 'catalog_id_conflict' ? 'project-conflict' : 'catalog-state-changed',
    };
  }

  const moduleDisplayName = {
    en: bfnCatalogComponentDisplayName(component, 'en-US'),
    zh: bfnCatalogComponentDisplayName(component, 'zh-CN'),
  };
  const sourceDisplayName = {
    en: bfnCatalogSignalDisplayName(
      response.inputMolecule.names,
      response.inputMolecule.abbreviations,
      'en-US',
    ),
    zh: bfnCatalogSignalDisplayName(
      response.inputMolecule.names,
      response.inputMolecule.abbreviations,
      'zh-CN',
    ),
  };
  const nextProject: BfnProject = {
    ...result.nextProject,
    network: {
      ...result.nextProject.network,
      modules: result.nextProject.network.modules.map((module) =>
        module.id === result.addedModuleId
          ? {
              ...module,
              displayName: moduleDisplayName,
              inputPorts: module.inputPorts.map((port) => ({
                ...port,
                displayName: sourceDisplayName,
              })),
            }
          : module,
      ),
      inputSources: result.nextProject.network.inputSources.map((source) =>
        source.id === result.addedInputSourceId
          ? {
              ...source,
              displayName: sourceDisplayName,
              outputPort: { ...source.outputPort, displayName: sourceDisplayName },
            }
          : source,
      ),
    },
  };
  return {
    ok: true,
    nextProject,
    addedModuleId: result.addedModuleId,
    ...(result.addedInputSourceId === undefined
      ? {}
      : { addedInputSourceId: result.addedInputSourceId }),
    inputResolution,
  };
}
