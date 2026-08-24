import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { createTemplate, simulateNetwork } from './modelingCore';
import { SimulationChart } from './SimulationChart';
import type { TemplateLabels } from './types';

const labels: TemplateLabels = {
  modelName: 'Chart test',
  description: 'Illustrative model',
  nodes: {
    sensorA: 'A',
    sensorB: 'B',
    sensorC: 'C',
    integration: 'Integration',
    gate: 'Gate',
    memory: 'Memory',
    response: 'Response',
    reporter: 'Reporter',
  },
};

describe('SimulationChart', () => {
  it('renders final node values and convergence without time frames', () => {
    const result = simulateNetwork(createTemplate('signal-gate', labels), {
      now: '2026-08-03T00:00:00.000Z',
    });
    const { container } = render(
      <SimulationChart
        result={result}
        emptyLabel="Empty"
        outputLabel="Output"
        valueLabel="Value"
        thresholds={[0.35, 0.68]}
        nodeLabel="Nodes"
      />,
    );

    expect(container.querySelector('[data-simulation-mode="steady-state"]')).not.toBeNull();
    expect(screen.getByTestId('simulation-convergence')).toHaveTextContent(
      `${result.convergence.iterations}/${result.convergence.maxIterations}`,
    );
    expect(container.querySelectorAll('rect.simulation-chart__bar--current')).toHaveLength(
      Object.keys(result.finalValues).length,
    );
    expect(container.querySelector('path.simulation-chart__line')).toBeNull();
    expect(container.querySelector('path.simulation-chart__area')).toBeNull();
    expect(container.querySelector('[data-node-id="reporter"]')).not.toBeNull();
  });

  it('separates molar concentration inputs from normalized steady-state bars', () => {
    const result = simulateNetwork(createTemplate('signal-gate', labels), {
      now: '2026-08-03T00:00:00.000Z',
    });
    result.finalValues['sensor-a'] = 4.68e-5;
    const { container } = render(
      <SimulationChart
        result={result}
        emptyLabel="Empty"
        outputLabel="Output"
        valueLabel="Relative response"
        thresholds={[0.35, 0.68]}
        nodeLabel="Nodes"
        nodeLabels={{ 'sensor-a': 'C4-HSL input' }}
        concentrationNodeIds={['sensor-a']}
        concentrationLabel="Molar inputs"
      />,
    );

    expect(container.querySelector('[data-node-id="sensor-a"]')).toBeNull();
    expect(container.querySelector('[data-concentration-node-id="sensor-a"]')).toHaveTextContent(
      'C4-HSL input4.68e-5 M',
    );
    expect(screen.getByRole('region', { name: 'Molar inputs' })).toBeInTheDocument();
  });
});
