import { describe, expect, it } from 'vitest';
import { createTemplate, validateNetworkModel } from '../modelingCore';
import type { TemplateLabels } from '../types';
import {
  applyReleaseResponseToNetwork,
  attachReleaseComponentCitation,
} from './releaseCatalogApplication';
import {
  getReleaseResponseNodeName,
  loadReleaseCatalogPresentation,
  type ReleaseCatalogPresentation,
  type ReleaseResponseVariantView,
} from './releaseCatalogPresentation';

const labels: TemplateLabels = {
  modelName: 'Release application fixture',
  description: 'Development fixture',
  nodes: {
    sensorA: 'Input A',
    sensorB: 'Input B',
    sensorC: 'Input C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Output',
  },
};

describe('release catalog application', () => {
  it('adds one trusted runnable response as an unconnected processing node', () => {
    const presentation = loadReleaseCatalogPresentation();
    const response = presentation.responseVariants.find((candidate) => candidate.runnable)!;
    const component = presentation.components.find(
      (candidate) => candidate.id === response.componentId,
    )!;
    const before = createTemplate('signal-gate', labels, '2026-08-04T00:00:00.000Z');
    const snapshot = structuredClone(before);
    const result = applyReleaseResponseToNetwork(before, presentation, response, {
      nodeId: 'release-response-node',
      x: 480,
      y: 320,
      language: 'zh-CN',
      now: '2026-08-04T00:00:01.000Z',
    });

    expect(result.ok).toBe(true);
    expect(before).toEqual(snapshot);
    if (!result.ok) return;
    expect(result.node.name).toBe(getReleaseResponseNodeName(component, response, 'zh-CN'));
    expect(result.model.edges).toEqual(before.edges);
    expect(result.model.edges).toBe(before.edges);
    expect(result.model.nodes).toHaveLength(before.nodes.length + 1);
    expect(result.node).toMatchObject({
      kind: 'processing',
      parameters: {
        baseline: 0,
        gain: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      },
      receiverResponseBinding: {
        receiverResponseId: response.id,
        componentId: response.componentId,
        inputSignalId: response.inputMolecule.id,
        outputSignalId: response.outputMolecule!.id,
        parameterContextId: response.parameterContext.id,
      },
    });
    expect(result.node.inputPorts).toEqual([
      expect.objectContaining({
        signalId: response.inputMolecule.id,
        sensitivity: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      }),
    ]);
    expect(result.node.outputPorts).toEqual([
      expect.objectContaining({
        signalId: response.outputMolecule!.id,
        strength: 1,
        parameterStatus: 'normalized-demo',
        provenance: 'catalog-reference',
      }),
    ]);
    expect(result.node.inputPorts[0]).not.toHaveProperty('weight');
    expect(result.node.catalogReference?.boundaryNote).toContain('sources=');
    expect(result.node.catalogReference?.boundaryNote).toContain('response=' + response.id);
    expect(validateNetworkModel(result.model)).toBe(true);
  });

  it('keeps an explicit display-name override ahead of the response-specific default', () => {
    const presentation = loadReleaseCatalogPresentation();
    const response = presentation.responseVariants.find((candidate) => candidate.runnable)!;
    const result = applyReleaseResponseToNetwork(
      createTemplate('signal-gate', labels),
      presentation,
      response,
      {
        nodeId: 'named-release-response',
        x: 0,
        y: 0,
        language: 'en-US',
        displayName: '  Team-calibrated receiver  ',
      },
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.node.name).toBe('Team-calibrated receiver');
  });

  it('rejects non-runtime and detached forged responses without changing the model', () => {
    const presentation = loadReleaseCatalogPresentation();
    const before = createTemplate('signal-gate', labels);
    const nonRuntime = presentation.responseVariants.find((candidate) => !candidate.runnable)!;
    const nonRuntimeResult = applyReleaseResponseToNetwork(before, presentation, nonRuntime, {
      nodeId: 'non-runtime',
      x: 0,
      y: 0,
      language: 'en-US',
    });
    expect(nonRuntimeResult).toEqual({ ok: false, issue: 'response-not-runnable' });

    const runtime = presentation.responseVariants.find((candidate) => candidate.runnable)!;
    const detached = {
      ...runtime,
      response: {
        ...runtime.response,
        sourceResponse: {
          ...runtime.response.sourceResponse!,
          ec50: runtime.response.sourceResponse!.ec50! * 2,
        },
      },
    } as ReleaseResponseVariantView;
    const detachedResult = applyReleaseResponseToNetwork(before, presentation, detached, {
      nodeId: 'detached-forgery',
      x: 0,
      y: 0,
      language: 'en-US',
    });
    expect(detachedResult).toEqual({ ok: false, issue: 'response-not-canonical' });
  });

  it('rejects a forged canonical catalog even when the whitelisted ID is retained', () => {
    const trusted = loadReleaseCatalogPresentation();
    const runtime = trusted.responseVariants.find((candidate) => candidate.runnable)!;
    const forgedCatalog = structuredClone(trusted.catalog);
    const forgedResponse = forgedCatalog.receiverResponses.find(
      (candidate) => candidate.id === runtime.id,
    )!;
    forgedResponse.sourceResponse!.ec50 = forgedResponse.sourceResponse!.ec50! * 2;
    const forgedView = {
      ...runtime,
      response: forgedResponse,
    };
    const forgedPresentation = {
      ...trusted,
      catalog: forgedCatalog,
      responseVariants: trusted.responseVariants.map((candidate) =>
        candidate.id === forgedView.id ? forgedView : candidate,
      ),
    } as ReleaseCatalogPresentation;
    const result = applyReleaseResponseToNetwork(
      createTemplate('signal-gate', labels),
      forgedPresentation,
      forgedView,
      { nodeId: 'forged-catalog', x: 0, y: 0, language: 'en-US' },
    );

    expect(result).toEqual({ ok: false, issue: 'response-not-runnable' });
  });

  it('rejects duplicate node IDs and attaches a reference without changing topology', () => {
    const presentation = loadReleaseCatalogPresentation();
    const runtime = presentation.responseVariants.find((candidate) => candidate.runnable)!;
    const before = createTemplate('signal-gate', labels);
    const duplicate = applyReleaseResponseToNetwork(before, presentation, runtime, {
      nodeId: before.nodes[0]!.id,
      x: 0,
      y: 0,
      language: 'en-US',
    });
    expect(duplicate).toEqual({ ok: false, issue: 'node-id-conflict' });

    const component = presentation.components[0]!;
    const nodeBefore = structuredClone(before.nodes[0]!);
    const attached = attachReleaseComponentCitation(
      before,
      before.nodes[0]!.id,
      presentation,
      component,
      'en-US',
    );
    expect(attached.edges).toEqual(before.edges);
    expect(attached.nodes).toHaveLength(before.nodes.length);
    expect(attached.nodes[0]).toMatchObject({
      ...nodeBefore,
      catalogReference: {
        entryId: component.id,
        displayNameSnapshot: component.names.en,
      },
    });
    expect(attached.nodes[0]?.parameters).toEqual(nodeBefore.parameters);
    expect(attached.nodes[0]?.inputPorts).toEqual(nodeBefore.inputPorts);
    expect(attached.nodes[0]?.outputPorts).toEqual(nodeBefore.outputPorts);
  });
});
