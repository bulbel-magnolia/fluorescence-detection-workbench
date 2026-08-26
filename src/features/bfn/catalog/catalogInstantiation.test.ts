import { describe, expect, it } from 'vitest';
import { createBfnComputationSignature } from '../computationSignature';
import {
  createBfnEditorHistory,
  createBfnEditorSnapshot,
  recordBfnEditorSnapshot,
  redoBfnEditorHistory,
  undoBfnEditorHistory,
} from '../editorHistory';
import { createDemoBfnProject } from '../fixtures';
import { bfnNodePositionsOverlap } from '../nodePlacement';
import { runBfnSimulation } from '../simulation';
import { addIdealConnection, validateBfnProject } from '../validation';
import { buildAllBfnCatalogRuntimeCandidates } from './catalogBfnAdapter';
import {
  instantiateBfnCatalogResponse,
  resolveBfnCatalogCandidateInput,
} from './catalogInstantiation';

const viewport = { x: 0, y: 0, width: 760, height: 410 } as const;

function missingCandidateFixture() {
  const project = createDemoBfnProject();
  const candidate = buildAllBfnCatalogRuntimeCandidates().find(
    (entry) => resolveBfnCatalogCandidateInput(project, entry)?.status === 'missing',
  );
  if (!candidate) throw new Error('Expected a Catalog response absent from the demo inputs.');
  return { project, candidate };
}

describe('BFN Catalog project instantiation', () => {
  it('recommends module plus source for zero matches and module only for all existing matches', () => {
    const { project, candidate } = missingCandidateFixture();
    expect(resolveBfnCatalogCandidateInput(project, candidate)).toEqual({
      status: 'missing',
      compatibleSources: [],
      recommendedAction: 'module_plus_input_source',
    });

    const first = project.network.inputSources[0]!;
    first.outputPort = {
      id: 'compatible-source-one-output',
      entity: candidate.inputEntity,
      quantityType: 'concentration',
      unit: 'nM',
      direction: 'output',
    };
    project.network.inputSources.push({
      ...structuredClone(first),
      id: 'compatible-source-two',
      outputPort: { ...first.outputPort, id: 'compatible-source-two-output', unit: 'M' },
    });

    const resolution = resolveBfnCatalogCandidateInput(project, candidate);
    expect(resolution?.status).toBe('available');
    expect(resolution?.recommendedAction).toBe('module_only');
    expect(resolution?.compatibleSources).toHaveLength(2);
    expect('selectedSource' in (resolution ?? {})).toBe(false);
  });

  it('adds a response module only as one collision-safe, unconnected project change', () => {
    const { project, candidate } = missingCandidateFixture();
    const before = structuredClone(project);
    const outcome = instantiateBfnCatalogResponse(project, candidate.responseId, false, viewport);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(project).toEqual(before);
    expect(outcome.nextProject.network.modules).toHaveLength(before.network.modules.length + 1);
    expect(outcome.nextProject.network.inputSources).toEqual(before.network.inputSources);
    expect(outcome.nextProject.network.edges).toEqual(before.network.edges);
    expect(outcome.nextProject.network.outputMonitors).toEqual(before.network.outputMonitors);
    expect(outcome.nextProject.registry.validityDomains).toHaveLength(
      before.registry.validityDomains.length + 1,
    );
    const module = outcome.nextProject.network.modules.find(
      (entry) => entry.id === outcome.addedModuleId,
    );
    expect(module?.displayName?.en).not.toBe('Literature catalog response module');
    expect(module?.displayName?.en).toMatch(/\//u);
    expect(outcome.addedInputSourceId).toBeUndefined();
    expect(validateBfnProject(outcome.nextProject).map((issue) => issue.code)).toContain(
      'catalog_required_input_unconnected',
    );
  });

  it('adds a source-left/module-right pair without edges or monitor changes', () => {
    const { project, candidate } = missingCandidateFixture();
    const edges = structuredClone(project.network.edges);
    const monitors = structuredClone(project.network.outputMonitors);
    const outcome = instantiateBfnCatalogResponse(project, candidate.responseId, true, viewport);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.addedInputSourceId) return;
    const module = outcome.nextProject.network.modules.find(
      (entry) => entry.id === outcome.addedModuleId,
    )!;
    const source = outcome.nextProject.network.inputSources.find(
      (entry) => entry.id === outcome.addedInputSourceId,
    )!;
    expect(source.position.x).toBeLessThan(module.position.x);
    expect(source.position.y).toBe(module.position.y);
    expect(bfnNodePositionsOverlap(source.position, module.position)).toBe(false);
    expect(outcome.nextProject.network.edges).toEqual(edges);
    expect(outcome.nextProject.network.outputMonitors).toEqual(monitors);
    expect(typeof source.displayName?.en).toBe('string');
    expect(typeof source.displayName?.zh).toBe('string');
    expect(source.displayName?.en).toMatch(/\((?:L|DL|stereo unspecified)\)/u);
  });

  it('allows duplicate response instances with distinct stable local identities', () => {
    const { project, candidate } = missingCandidateFixture();
    const first = instantiateBfnCatalogResponse(project, candidate.responseId, true, viewport);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const second = instantiateBfnCatalogResponse(
      first.nextProject,
      candidate.responseId,
      true,
      viewport,
    );
    expect(second.ok).toBe(true);
    if (!second.ok) return;

    expect(second.addedModuleId).not.toBe(first.addedModuleId);
    expect(second.addedInputSourceId).not.toBe(first.addedInputSourceId);
    const catalogModels = second.nextProject.network.modules.filter(
      (module) =>
        module.modelVariants[0]?.mode === 'static' &&
        module.modelVariants[0].catalogReference?.responseId === candidate.responseId,
    );
    expect(catalogModels).toHaveLength(2);
  });

  it('round-trips module, source, domain, selection, and the same IDs through one undo/redo', () => {
    const { project, candidate } = missingCandidateFixture();
    const previousSelection = project.network.modules[0]?.id ?? null;
    const outcome = instantiateBfnCatalogResponse(project, candidate.responseId, true, viewport);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    const before = createBfnEditorSnapshot(project, previousSelection, null);
    const after = createBfnEditorSnapshot(outcome.nextProject, outcome.addedModuleId, null);
    const recorded = recordBfnEditorSnapshot(createBfnEditorHistory(), before, 'semantic');

    const undone = undoBfnEditorHistory(recorded, after);
    expect(undone?.snapshot.project).toEqual(project);
    expect(undone?.snapshot.selectedNodeId).toBe(previousSelection);

    const redone = undone ? redoBfnEditorHistory(undone.history, undone.snapshot) : null;
    expect(redone?.snapshot.project).toEqual(outcome.nextProject);
    expect(redone?.snapshot.selectedNodeId).toBe(outcome.addedModuleId);
    expect(
      redone?.snapshot.project.network.inputSources.some(
        (source) => source.id === outcome.addedInputSourceId,
      ),
    ).toBe(true);
    expect(
      redone?.snapshot.project.registry.validityDomains.some((domain) =>
        domain.inputRanges.some((range) =>
          redone.snapshot.project.network.modules
            .find((module) => module.id === outcome.addedModuleId)
            ?.inputPorts.some((port) => port.id === range.portId),
        ),
      ),
    ).toBe(true);
  });

  it('changes the computation signature for addition while excluding display-name-only edits', () => {
    const { project, candidate } = missingCandidateFixture();
    const outcome = instantiateBfnCatalogResponse(project, candidate.responseId, false, viewport);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(createBfnComputationSignature(outcome.nextProject)).not.toBe(
      createBfnComputationSignature(project),
    );

    const renamed = structuredClone(outcome.nextProject);
    renamed.network.modules.at(-1)!.displayName = { en: 'Renamed', zh: '已重命名' };
    expect(createBfnComputationSignature(renamed)).toBe(
      createBfnComputationSignature(outcome.nextProject),
    );
  });

  it('fails atomically when fresh trust or the final adapter rejects the request', () => {
    const { project, candidate } = missingCandidateFixture();
    const before = structuredClone(project);
    const stale = instantiateBfnCatalogResponse(project, candidate.responseId, false, viewport, {
      candidateBuilder: () => {
        throw new Error('Catalog changed');
      },
    });
    expect(stale).toEqual({ ok: false, error: 'response-unavailable' });

    const conflict = instantiateBfnCatalogResponse(project, candidate.responseId, false, viewport, {
      adapter: () => ({
        ok: false,
        error: { code: 'catalog_id_conflict', kind: 'module_id', id: 'collision' },
      }),
    });
    expect(conflict).toEqual({ ok: false, error: 'project-conflict' });
    expect(project).toEqual(before);
  });

  it('runs the trusted evaluator after the user explicitly creates both connections', () => {
    const { project, candidate } = missingCandidateFixture();
    project.isDemo = false;
    project.network.inputSources = [];
    project.network.modules = [];
    project.network.edges = [];
    project.registry.validityDomains = [];
    const outcome = instantiateBfnCatalogResponse(project, candidate.responseId, true, viewport);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.addedInputSourceId) return;
    const module = outcome.nextProject.network.modules[0]!;
    const source = outcome.nextProject.network.inputSources[0]!;
    const monitor = outcome.nextProject.network.outputMonitors[0]!;
    expect(outcome.nextProject.network.edges).toEqual([]);
    expect(validateBfnProject(outcome.nextProject).map((issue) => issue.code)).toContain(
      'catalog_required_input_unconnected',
    );

    monitor.inputPort = {
      ...module.outputPorts[0]!,
      id: monitor.inputPort.id,
      direction: 'input',
    };
    const withInput = addIdealConnection(
      outcome.nextProject,
      { nodeId: source.id, portId: source.outputPort.id },
      { nodeId: module.id, portId: module.inputPorts[0]!.id },
      'edge-user-catalog-input',
    );
    const connected = addIdealConnection(
      withInput,
      { nodeId: module.id, portId: module.outputPorts[0]!.id },
      { nodeId: monitor.id, portId: monitor.inputPort.id },
      'edge-user-catalog-output',
    );
    const result = runBfnSimulation(connected);

    expect(validateBfnProject(connected).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(result.points.length).toBeGreaterThan(0);
    expect(result.points.every((point) => point.output >= 0 && point.output <= 1)).toBe(true);
  });
});
