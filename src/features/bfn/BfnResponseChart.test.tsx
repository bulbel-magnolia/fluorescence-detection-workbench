import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createBfnChartModel } from './chartModel';
import { defaultBfnChartViewState, type BfnChartGeometry } from './chartTypes';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import { BfnResponseChart } from './BfnResponseChart';

const geometry: BfnChartGeometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
};

describe('BfnResponseChart exact reading', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('selects the nearest actual point on pointer movement without interpolation', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const viewState = defaultBfnChartViewState(result);
    const model = createBfnChartModel({ project, result, viewState, geometry, translate: (key) => i18n.t(key) });
    const targetIndex = Math.min(10, result.points.length - 1);
    const target = result.points[targetIndex];
    if (!target) throw new Error('Expected a target point');
    const onCursorIndexChange = vi.fn();
    render(<BfnResponseChart project={project} result={result} onCursorIndexChange={onCursorIndexChange} />);
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 760, height: 300, right: 760, bottom: 300 }),
    });

    const exactClientX = model.scales.x.map(target.coordinate);
    fireEvent.pointerMove(svg, { clientX: exactClientX, clientY: 150 });

    expect(screen.getByRole('note')).toHaveTextContent('Computed point');
    expect(onCursorIndexChange).toHaveBeenCalledWith(targetIndex);
    expect(screen.getByRole('note')).toHaveAttribute('data-index', String(targetIndex));
    expect(screen.getByRole('note')).toHaveTextContent(String(target.output.toFixed(3)));
    expect(screen.getByRole('note')).toHaveTextContent('Input');
    expect(screen.getByRole('note')).toHaveTextContent('3OC6-HSL');
    expect(screen.getByRole('note')).toHaveTextContent('nM');
    expect(screen.getByRole('note')).toHaveTextContent('Output');
    expect(screen.getByRole('note')).toHaveTextContent('Lower');
    expect(screen.getByRole('note')).toHaveTextContent('Upper');
    if (result.annApproximation) expect(screen.getByRole('note')).toHaveTextContent('ANN approximation');
    expect(screen.getByRole('note')).not.toHaveTextContent('Interpolated');
    fireEvent.pointerMove(svg, { clientX: exactClientX, clientY: 150 });
    expect(onCursorIndexChange).toHaveBeenCalledTimes(1);
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
    const arrowLeft = createEvent.keyDown(svg, { key: 'ArrowLeft' });
    const preventDefault = vi.spyOn(arrowLeft, 'preventDefault');
    const stopPropagation = vi.spyOn(arrowLeft, 'stopPropagation');
    fireEvent(svg, arrowLeft);
    expect(screen.getByRole('note')).toHaveTextContent(`${result.points[0]?.coordinate?.toFixed(3)} nM`);
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    const beforeShortcut = screen.getByRole('note').textContent;
    const shortcut = createEvent.keyDown(svg, { key: 'z', ctrlKey: true });
    const shortcutPreventDefault = vi.spyOn(shortcut, 'preventDefault');
    fireEvent(svg, shortcut);
    expect(shortcutPreventDefault).not.toHaveBeenCalled();
    expect(screen.getByRole('note').textContent).toBe(beforeShortcut);
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
    render(<BfnResponseChart project={project} result={{ ...result, points: [{ ...first, extrapolated: true, inputs: { ...first.inputs, 'source-extra': 42 } }] }} />);
    const svg = screen.getByRole('img', { name: 'Dynamic response' });
    fireEvent.keyDown(svg, { key: 'Home' });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Time (h)');
    expect(note).toHaveTextContent('3OC6-HSL');
    expect(note).toHaveTextContent('source-extra');
    expect(note).toHaveTextContent('Extrapolated');
    expect(note).toHaveTextContent('Output');
  });

  it('notifies once for a nearest point and resets a stale local cursor when same-id data changes', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const onCursorIndexChange = vi.fn();
    const { rerender } = render(
      <BfnResponseChart project={project} result={result} onCursorIndexChange={onCursorIndexChange} />,
    );
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 760, height: 300, right: 760, bottom: 300 }),
    });
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 100 });
    const firstCallCount = onCursorIndexChange.mock.calls.length;
    fireEvent.pointerMove(svg, { clientX: 300, clientY: 100 });
    expect(onCursorIndexChange).toHaveBeenCalledTimes(firstCallCount);

    const shortened = { ...result, points: [result.points[0]!] };
    rerender(<BfnResponseChart project={project} result={shortened} onCursorIndexChange={onCursorIndexChange} />);
    expect(document.querySelector('.bfn-chart__cursor')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('img', { name: 'Input-output response' }), { key: 'Home' });
    expect(document.querySelector('.bfn-chart__cursor')).toHaveAttribute('data-index', '0');
  });
});
