import { describe, expect, it } from 'vitest';
import { createDemoBfnProject } from './fixtures';
import { checkIdealConnection, validateBfnProject, valueAcrossEdge } from './validation';

describe('BFN-IR ideal connection validation', () => {
  it('accepts the complete demo DAG without structural errors', () => {
    const project = createDemoBfnProject();
    expect(validateBfnProject(project).filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(project.network.edges.every((edge) => edge.mapping === 'identity')).toBe(true);
    expect(project.network.edges.some((edge) => 'weight' in edge || 'bias' in edge)).toBe(false);
  });

  it('accepts nM-to-M concentration normalization while preserving an identity edge', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.outputPort.unit = 'nM';
    source.staticSpecification = { type: 'fixed_value', value: 100, unit: 'nM' };
    const edge = project.network.edges[0]!;
    const target = project.network.modules[0]!.inputPorts[0]!;
    target.unit = 'M';

    const issues = checkIdealConnection(
      { ...project, network: { ...project.network, edges: project.network.edges.slice(1) } },
      edge.source,
      edge.target,
      edge.id,
    );

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(edge.mapping).toBe('identity');
    expect(valueAcrossEdge(100, project, edge)).toBeCloseTo(1e-7, 18);
  });

  it('rejects a production-rate signal connected directly to a concentration port', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.outputPort.quantityType = 'production_rate';
    source.outputPort.unit = 'nM/h';
    const edge = project.network.edges[0]!;

    const issues = checkIdealConnection(
      { ...project, network: { ...project.network, edges: project.network.edges.slice(1) } },
      edge.source,
      edge.target,
      edge.id,
    );

    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['quantity_mismatch', 'unit_dimension_mismatch']),
    );
    expect(issues.filter((issue) => issue.code === 'quantity_mismatch')).toHaveLength(1);
    expect(issues.filter((issue) => issue.code === 'unit_dimension_mismatch')).toHaveLength(1);
  });

  it('rejects a second upstream source for the same input port', () => {
    const project = createDemoBfnProject();
    const edge = project.network.edges[0]!;
    const issues = checkIdealConnection(project, edge.source, edge.target, 'second-edge');
    expect(issues.map((issue) => issue.code)).toContain('target_already_connected');
  });

  it('rejects a static self-loop', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    module.inputPorts[0] = {
      ...module.inputPorts[0]!,
      entity: module.outputPorts[0]!.entity,
      quantityType: module.outputPorts[0]!.quantityType,
      unit: module.outputPorts[0]!.unit,
    };
    project.network.edges = project.network.edges.filter(
      (edge) => edge.target.nodeId !== module.id,
    );
    const issues = checkIdealConnection(
      project,
      { nodeId: module.id, portId: module.outputPorts[0]!.id },
      { nodeId: module.id, portId: module.inputPorts[0].id },
    );
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining(['self_connection', 'static_cycle']),
    );
  });

  it('keeps an unconnected generic module input as a warning', () => {
    const project = createDemoBfnProject();
    const sensor = project.network.modules[0]!;
    const inputPort = sensor.inputPorts[0]!;
    project.network.edges = project.network.edges.filter(
      (edge) => edge.target.portId !== inputPort.id,
    );

    const issue = validateBfnProject(project).find(
      (candidate) => candidate.subjectId === inputPort.id,
    );

    expect(issue).toMatchObject({ code: 'missing_required_input', severity: 'warning' });
  });

  it('blocks an unconnected modeled input on an output-reachable user-defined module', () => {
    const project = createDemoBfnProject();
    const sensor = project.network.modules[0]!;
    sensor.authoring = {
      origin: 'user_defined',
      name: 'Authored sensor',
      description: null,
    };
    const inputPort = sensor.inputPorts[0]!;
    project.network.edges = project.network.edges.filter(
      (edge) => edge.target.portId !== inputPort.id,
    );

    expect(validateBfnProject(project)).toContainEqual(
      expect.objectContaining({
        code: 'missing_required_input',
        severity: 'error',
        subjectId: inputPort.id,
      }),
    );
  });

  it('accepts an explicitly connected zero and does not block an unreachable authored module', () => {
    const project = createDemoBfnProject();
    const sensor = project.network.modules[0]!;
    sensor.authoring = {
      origin: 'user_defined',
      name: 'Authored sensor',
      description: null,
    };
    project.network.inputSources[0]!.staticSpecification = {
      type: 'fixed_value',
      value: 0,
      unit: 'nM',
    };
    const unreachable = createDemoBfnProject().network.modules[0]!;
    unreachable.id = 'module-user-unreachable';
    unreachable.authoring = {
      origin: 'user_defined',
      name: 'Unreachable authored module',
      description: null,
    };
    unreachable.inputPorts = unreachable.inputPorts.map((port) => ({
      ...port,
      id: `unreachable-${port.id}`,
    }));
    project.network.modules.push(unreachable);

    const issues = validateBfnProject(project);

    expect(
      issues.some(
        (issue) => issue.subjectId === sensor.inputPorts[0]!.id && issue.severity === 'error',
      ),
    ).toBe(false);
    expect(
      issues.some(
        (issue) => issue.subjectId === unreachable.inputPorts[0]!.id && issue.severity === 'error',
      ),
    ).toBe(false);
  });

  it('emits fact-based context applicability issues without the legacy context-ID warning', () => {
    const project = createDemoBfnProject();
    const originalTemperature = project.registry.contexts[0]!.temperatureCelsius;
    if (originalTemperature === null) throw new Error('Expected a recorded demo temperature.');
    const compared = {
      ...structuredClone(project.registry.contexts[0]!),
      id: 'context-known-temperature-difference',
      temperatureCelsius: originalTemperature + 4,
    };
    project.registry.contexts.push(compared);
    const reporter = project.network.modules[1]!;
    const model = reporter.modelVariants.find(
      (candidate) => candidate.id === reporter.activeModelIds.static,
    );
    if (!model) throw new Error('Expected reporter static model.');
    model.contextId = compared.id;

    const codes = validateBfnProject(project).map((issue) => issue.code);
    expect(codes).toContain('context_applicability_mismatch');
    expect(codes).not.toContain('context_mismatch');
  });

  it('keeps Catalog trust failure authoritative while context comparison becomes unavailable', () => {
    const project = createDemoBfnProject();
    const sensor = project.network.modules[0]!;
    const model = sensor.modelVariants.find(
      (candidate) => candidate.id === sensor.activeModelIds.static,
    );
    if (!model) throw new Error('Expected sensor static model.');
    Object.assign(model, { catalogReference: { kind: 'catalog_receiver_response' } });

    const issues = validateBfnProject(project);
    expect(issues.map((issue) => issue.code)).toEqual(
      expect.arrayContaining([
        'catalog_model_reference_invalid',
        'context_applicability_unavailable',
      ]),
    );
    expect(issues.map((issue) => issue.code)).not.toContain('temporal_execution_unsupported');
  });
});
