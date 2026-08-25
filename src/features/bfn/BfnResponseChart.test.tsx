import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import { BfnResponseChart } from './BfnResponseChart';

describe('BfnResponseChart exact reading', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('selects the nearest actual point on pointer movement without interpolation', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    render(<BfnResponseChart project={project} result={result} />);
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 760, height: 300, right: 760, bottom: 300 }),
    });

    fireEvent.pointerMove(svg, { clientX: 500, clientY: 100 });

    expect(screen.getByRole('note')).toHaveTextContent('Computed point');
    const pointerCoordinate = 5 + (500 - 62) / (736 - 62) * (20 - 5);
    const selected = result.points.reduce((nearest, point, index) => {
      const distance = Math.abs(point.coordinate - pointerCoordinate);
      return distance < nearest.distance ? { index, distance } : nearest;
    }, { index: 0, distance: Number.POSITIVE_INFINITY });
    expect(screen.getByRole('note')).toHaveTextContent(
      String(result.points[selected.index]?.output.toFixed(3) ?? ''),
    );
    expect(screen.getByRole('note')).not.toHaveTextContent('Interpolated');
  });

  it('supports point navigation keys and Escape without changing editor shortcuts', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    render(<BfnResponseChart project={project} result={result} />);
    const svg = screen.getByRole('img', { name: 'Input-output response' });

    svg.focus();
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(screen.getByRole('note')).toHaveTextContent(`${result.points[0]?.coordinate?.toFixed(3)} nM`);
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(screen.getByRole('note')).toHaveTextContent('Computed point');
    fireEvent.keyDown(svg, { key: 'End' });
    expect(screen.getByRole('note')).toHaveTextContent(
      `${result.points.at(-1)?.coordinate}`,
    );
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders dynamic input fields and extrapolation warning', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const first = result.points[0];
    if (!first) throw new Error('Expected a dynamic simulation point');
    render(<BfnResponseChart project={project} result={{ ...result, points: [{ ...first, extrapolated: true }] }} />);
    const svg = screen.getByRole('img', { name: 'Dynamic response' });
    fireEvent.keyDown(svg, { key: 'Home' });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Time (h)');
    expect(note).toHaveTextContent('Extrapolated');
    expect(note).toHaveTextContent('Output');
  });
});
