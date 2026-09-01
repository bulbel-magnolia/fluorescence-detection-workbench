import { describe, expect, it } from 'vitest';
import { AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST } from '../../modeling/catalog/v2/catalogRuntimeDemoWhitelist';
import { instantiateBfnCatalogResponse } from '../catalog/catalogInstantiation';
import { createCatalogModule, createDemoBfnProject } from '../fixtures';
import { runBfnSimulation } from '../simulation';
import { addIdealConnection, validateBfnProject } from '../validation';
import {
  createBlankBfnProject,
  duplicateBfnProject,
  importedWorkspaceName,
  initialBfnSelection,
  sanitizeWorkspaceExportName,
} from './workspaceProjectFactory';

const now = '2026-08-27T05:00:00.000Z';

describe('workspace BFN project factories', () => {
  it('creates the exact non-demo 0 input / 0 module / 1 output scientific blank', () => {
    const project = createBlankBfnProject({
      now,
      bfnProjectId: 'blank-bfn',
      networkId: 'blank-network',
    });

    expect(project).toMatchObject({
      schema: 'BFN-IR',
      schemaVersion: '2.3',
      id: 'blank-bfn',
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    });
    expect(project.network).toMatchObject({
      id: 'blank-network',
      inputSources: [],
      modules: [],
      edges: [],
    });
    expect(project.network.outputMonitors).toHaveLength(1);
    expect(project.network.outputMonitors[0]?.id).toBe('monitor-reporter');
    expect(project.network.outputMonitors[0]?.inputPort).toMatchObject({
      entity: 'normalized_reporter_expression',
      quantityType: 'expression_level',
      unit: 'dimensionless',
    });
    expect(initialBfnSelection(project)).toBe('monitor-reporter');
    expect(validateBfnProject(project).map((issue) => issue.code)).toContain(
      'missing_required_input',
    );
  });

  it('duplicates only the draft with new project/network identities and preserved internals', () => {
    const source = createDemoBfnProject('2026-08-20T00:00:00.000Z');
    const duplicate = duplicateBfnProject(source, {
      now,
      bfnProjectId: 'copy-bfn',
      networkId: 'copy-network',
    });

    expect(duplicate.id).toBe('copy-bfn');
    expect(duplicate.network.id).toBe('copy-network');
    expect(duplicate.createdAt).toBe(now);
    expect(duplicate.updatedAt).toBe(now);
    expect(duplicate.network.modules).toEqual(source.network.modules);
    expect(duplicate.network.modules).not.toBe(source.network.modules);
    expect(duplicate.network.modules[0]?.id).toBe(source.network.modules[0]?.id);
  });

  it('supports built-in modules without making an unused blank project a demo', () => {
    const blank = createBlankBfnProject({ now });
    const module = createCatalogModule('reporter', 'blank-regression');

    expect(blank.registry.contexts.length).toBeGreaterThan(0);
    expect(module.kind).toBe('functional_module');
    expect(blank.isDemo).toBe(false);
  });

  it('adds a trusted Catalog response and source without edges, then runs after manual wiring', () => {
    const blank = createBlankBfnProject({ now });
    const responseId = AHL_HSL_RUNTIME_DEMO_RESPONSE_WHITELIST[0]!.id;
    const outcome = instantiateBfnCatalogResponse(blank, responseId, true, {
      x: 0,
      y: 0,
      width: 960,
      height: 410,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok || !outcome.addedInputSourceId) throw new Error('catalog setup failed');
    expect(outcome.nextProject.network.edges).toEqual([]);

    const source = outcome.nextProject.network.inputSources.find(
      (entry) => entry.id === outcome.addedInputSourceId,
    )!;
    const module = outcome.nextProject.network.modules.find(
      (entry) => entry.id === outcome.addedModuleId,
    )!;
    const monitor = outcome.nextProject.network.outputMonitors[0]!;
    const withInput = addIdealConnection(
      outcome.nextProject,
      { nodeId: source.id, portId: source.outputPort.id },
      { nodeId: module.id, portId: module.inputPorts[0]!.id },
      'manual-source-module',
    );
    const connected = addIdealConnection(
      withInput,
      { nodeId: module.id, portId: module.outputPorts[0]!.id },
      { nodeId: monitor.id, portId: monitor.inputPort.id },
      'manual-module-output',
    );

    expect(validateBfnProject(connected).filter((issue) => issue.severity === 'error')).toEqual([]);
    const result = runBfnSimulation(connected);
    expect(result.points.length).toBeGreaterThan(1);
    const model = connected.network.modules[0]?.modelVariants[0];
    expect(model?.mode).toBe('static');
    if (model?.mode !== 'static') throw new Error('expected static Catalog model');
    expect(model.catalogReference?.responseId).toBe(responseId);
  });

  it('derives import names and safe export filenames without changing BFN identifiers', () => {
    expect(importedWorkspaceName('Receiver design.bfn-ir.json', 'Fallback')).toBe(
      'Receiver design',
    );
    expect(importedWorkspaceName('.json', 'Fallback')).toBe('Fallback');
    expect(sanitizeWorkspaceExportName('AHL / Receiver: 01')).toBe('AHL---Receiver--01');
  });
});
