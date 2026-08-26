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

  it('accepts compatible concentration units and converts across the ideal edge', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    source.outputPort.unit = 'uM';
    source.staticSpecification = { type: 'fixed_value', value: 0.01, unit: 'uM' };
    const edge = project.network.edges[0]!;

    const issues = checkIdealConnection(
      { ...project, network: { ...project.network, edges: project.network.edges.slice(1) } },
      edge.source,
      edge.target,
      edge.id,
    );

    expect(issues.filter((issue) => issue.severity === 'error')).toEqual([]);
    expect(valueAcrossEdge(0.01, project, edge)).toBeCloseTo(10, 8);
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
});
