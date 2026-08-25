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
    const model = createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key) => i18n.t(key),
    });
    const lowerIndex = Math.min(10, result.points.length - 2);
    const upperIndex = lowerIndex + 1;
    const lower = result.points[lowerIndex];
    const upper = result.points[upperIndex];
    if (!lower || !upper) throw new Error('Expected two adjacent points');
    const betweenCoordinate = lower.coordinate + (upper.coordinate - lower.coordinate) * 0.35;
    const onCursorIndexChange = vi.fn();
    render(
      <BfnResponseChart
        project={project}
        result={result}
        onCursorIndexChange={onCursorIndexChange}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 760, height: 300, right: 760, bottom: 300 }),
    });

    const betweenClientX = model.scales.x.map(betweenCoordinate);
    fireEvent.pointerMove(svg, { clientX: betweenClientX, clientY: 150 });

    expect(screen.getByRole('note')).toHaveTextContent('Computed point');
    expect(onCursorIndexChange).toHaveBeenCalledWith(lowerIndex);
    expect(screen.getByRole('note')).toHaveAttribute('data-index', String(lowerIndex));
    expect(screen.getByRole('note')).toHaveTextContent(`${lower.coordinate.toFixed(3)} nM`);
    expect(screen.getByRole('note')).toHaveTextContent(String(lower.output.toFixed(3)));
    expect(screen.getByRole('note')).toHaveTextContent('Input');
    expect(screen.getByRole('note')).toHaveTextContent('3OC6-HSL');
    expect(screen.getByRole('note')).toHaveTextContent('nM');
    expect(screen.getByRole('note')).toHaveTextContent('Output');
    expect(screen.getByRole('note')).toHaveTextContent('Lower');
    expect(screen.getByRole('note')).toHaveTextContent('Upper');
    if (result.annApproximation)
      expect(screen.getByRole('note')).toHaveTextContent('ANN approximation');
    expect(screen.getByRole('note')).not.toHaveTextContent('Interpolated');
    const expectedMarker = model.series.full?.points[lowerIndex];
    if (!expectedMarker) throw new Error('Expected a full-model marker');
    expect(document.querySelector('.bfn-chart__crosshair')).toHaveAttribute(
      'data-index',
      String(lowerIndex),
    );
    expect(document.querySelector('.bfn-chart__crosshair')).toHaveAttribute(
      'x1',
      String(expectedMarker.x),
    );
    expect(document.querySelector('.bfn-chart__cursor')).toHaveAttribute(
      'data-index',
      String(lowerIndex),
    );
    expect(document.querySelector('.bfn-chart__cursor')).toHaveAttribute(
      'cx',
      String(expectedMarker.x),
    );
    expect(document.querySelector('.bfn-chart__cursor')).toHaveAttribute(
      'cy',
      String(expectedMarker.y),
    );
    fireEvent.pointerMove(svg, {
      clientX: model.scales.x.map(lower.coordinate + (upper.coordinate - lower.coordinate) * 0.45),
      clientY: 150,
    });
    expect(onCursorIndexChange).toHaveBeenCalledTimes(1);
  });

  it('maps pointer coordinates through SVG letterboxing at a non-viewBox aspect ratio', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const viewState = defaultBfnChartViewState(result);
    const model = createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key) => i18n.t(key),
    });
    const lowerIndex = Math.min(10, result.points.length - 2);
    const upperIndex = lowerIndex + 1;
    const lower = result.points[lowerIndex];
    const upper = result.points[upperIndex];
    if (!lower || !upper) throw new Error('Expected two adjacent points');
    const betweenCoordinate = lower.coordinate + (upper.coordinate - lower.coordinate) * 0.35;
    const onCursorIndexChange = vi.fn();
    render(
      <BfnResponseChart
        project={project}
        result={result}
        onCursorIndexChange={onCursorIndexChange}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    const rect = { left: 100, top: 40, width: 1440, height: 480, right: 1540, bottom: 520 };
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });

    // The SVG viewBox uses the browser default preserveAspectRatio="xMidYMid meet".
    // At 1440×480 the 760×300 plot is letterboxed horizontally, so a direct
    // width/height proportion maps this event to the wrong point.
    const scale = Math.min(rect.width / geometry.width, rect.height / geometry.height);
    const offsetX = (rect.width - geometry.width * scale) / 2;
    const offsetY = (rect.height - geometry.height * scale) / 2;
    const clientX = rect.left + offsetX + model.scales.x.map(betweenCoordinate) * scale;
    const clientY = rect.top + offsetY + (geometry.padding.top + 48) * scale;
    fireEvent.pointerMove(svg, { clientX, clientY });

    expect(onCursorIndexChange).toHaveBeenCalledWith(lowerIndex);
    expect(screen.getByRole('note')).toHaveAttribute('data-index', String(lowerIndex));
  });

  it('selects the original result index among points visible in a manual X domain', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const viewState = {
      ...defaultBfnChartViewState(result),
      xDomainMode: 'manual' as const,
      xMinimum: 9.8,
      xMaximum: 15,
    };
    const model = createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key) => i18n.t(key),
    });
    const firstVisibleIndex = result.points.findIndex((point) => point.coordinate >= 9.8);
    if (firstVisibleIndex < 0) throw new Error('Expected a point inside the manual X domain');
    const onCursorIndexChange = vi.fn();
    render(
      <BfnResponseChart
        project={project}
        result={result}
        viewState={viewState}
        onCursorIndexChange={onCursorIndexChange}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({ left: 0, top: 0, width: 760, height: 300, right: 760, bottom: 300 }),
    });
    fireEvent.pointerMove(svg, { clientX: model.scales.x.map(9.8), clientY: 150 });

    expect(onCursorIndexChange).toHaveBeenCalledWith(firstVisibleIndex);
  });

  it('supports point navigation keys and Escape without changing editor shortcuts', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const parentKeyDown = vi.fn();
    render(
      <div onKeyDown={parentKeyDown}>
        <BfnResponseChart project={project} result={result} />
      </div>,
    );
    const svg = screen.getByRole('img', { name: 'Input-output response' });

    svg.focus();
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(screen.getByRole('note')).toHaveTextContent(
      `${result.points[0]?.coordinate?.toFixed(3)} nM`,
    );
    fireEvent.keyDown(svg, { key: 'ArrowRight' });
    expect(screen.getByRole('note')).toHaveTextContent('Computed point');
    const arrowLeft = createEvent.keyDown(svg, { key: 'ArrowLeft' });
    const preventDefault = vi.spyOn(arrowLeft, 'preventDefault');
    const stopPropagation = vi.spyOn(arrowLeft, 'stopPropagation');
    fireEvent(svg, arrowLeft);
    expect(screen.getByRole('note')).toHaveTextContent(
      `${result.points[0]?.coordinate?.toFixed(3)} nM`,
    );
    expect(preventDefault).toHaveBeenCalledTimes(1);
    expect(stopPropagation).toHaveBeenCalledTimes(1);
    expect(parentKeyDown).not.toHaveBeenCalled();
    const beforeShortcut = screen.getByRole('note').textContent;
    const shortcut = createEvent.keyDown(svg, { key: 'z', ctrlKey: true });
    const shortcutPreventDefault = vi.spyOn(shortcut, 'preventDefault');
    const shortcutStopPropagation = vi.spyOn(shortcut, 'stopPropagation');
    fireEvent(svg, shortcut);
    expect(shortcutPreventDefault).not.toHaveBeenCalled();
    expect(shortcutStopPropagation).not.toHaveBeenCalled();
    expect(parentKeyDown).toHaveBeenCalledTimes(1);
    const metaShortcut = createEvent.keyDown(svg, { key: 'z', metaKey: true });
    const metaPreventDefault = vi.spyOn(metaShortcut, 'preventDefault');
    const metaStopPropagation = vi.spyOn(metaShortcut, 'stopPropagation');
    fireEvent(svg, metaShortcut);
    expect(metaPreventDefault).not.toHaveBeenCalled();
    expect(metaStopPropagation).not.toHaveBeenCalled();
    expect(parentKeyDown).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('note').textContent).toBe(beforeShortcut);
    fireEvent.keyDown(svg, { key: 'End' });
    expect(screen.getByRole('note')).toHaveTextContent(`${result.points.at(-1)?.coordinate}`);
    fireEvent.keyDown(svg, { key: 'Escape' });
    expect(screen.queryByRole('note')).not.toBeInTheDocument();
  });

  it('renders dynamic input fields and extrapolation warning', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const first = result.points[0];
    if (!first) throw new Error('Expected a dynamic simulation point');
    render(
      <BfnResponseChart
        project={project}
        result={{
          ...result,
          points: [
            { ...first, extrapolated: true, inputs: { ...first.inputs, 'source-extra': 42 } },
          ],
        }}
      />,
    );
    const svg = screen.getByRole('img', { name: 'Dynamic response' });
    fireEvent.keyDown(svg, { key: 'Home' });
    const note = screen.getByRole('note');
    expect(note).toHaveTextContent('Time (h)');
    expect(note).toHaveTextContent('3OC6-HSL');
    expect(note).toHaveTextContent('source-extra');
    expect(note).toHaveTextContent('Extrapolated');
    expect(note).toHaveTextContent('Output');
    expect(note).toHaveTextContent('Lower');
    expect(note).toHaveTextContent('Upper');
  });

  it('shows ANN values only for visible accepted/rejected overlays and omits the overlay when absent', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const approximation = result.annApproximation;
    if (!approximation) throw new Error('Expected a static ANN approximation');
    const first = result.points[0];
    if (!first) throw new Error('Expected a static simulation point');
    const annValue = approximation.inputSourceIds.reduce(
      (sum, sourceId, index) =>
        sum + (first.inputs[sourceId] ?? 0) * (approximation.weights[index] ?? 0),
      approximation.effectiveIntercept,
    );
    const { rerender } = render(<BfnResponseChart project={project} result={result} />);
    const svg = screen.getByRole('img', { name: 'Input-output response' });
    fireEvent.keyDown(svg, { key: 'Home' });
    expect(screen.getByRole('note')).toHaveTextContent('ANN approximation');
    expect(screen.getByRole('note')).toHaveTextContent(annValue.toFixed(3));
    const hiddenView = { ...defaultBfnChartViewState(result), showAnn: false, cursorIndex: 0 };
    rerender(<BfnResponseChart project={project} result={result} viewState={hiddenView} />);
    expect(screen.getByRole('note')).not.toHaveTextContent('ANN approximation');
    expect(document.querySelector('.bfn-chart__ann')).not.toBeInTheDocument();
    const rejected = {
      ...result,
      annApproximation: { ...approximation, status: 'rejected' as const },
    };
    rerender(
      <BfnResponseChart
        project={project}
        result={rejected}
        viewState={{ ...defaultBfnChartViewState(rejected), cursorIndex: 0 }}
      />,
    );
    expect(screen.getByRole('note')).toHaveTextContent(
      'ANN approximation did not pass the current approximation-quality threshold',
    );
    const absent = { ...result, annApproximation: null };
    const absentView = { ...defaultBfnChartViewState(absent), cursorIndex: 0 };
    rerender(<BfnResponseChart project={project} result={absent} viewState={absentView} />);
    rerender(<BfnResponseChart project={project} result={absent} viewState={absentView} />);
    expect(screen.getByRole('note')).not.toHaveTextContent('ANN approximation');
    expect(document.querySelector('.bfn-chart__ann')).not.toBeInTheDocument();
  });

  it('notifies once for a nearest point and resets a stale local cursor when same-id data changes', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const onCursorIndexChange = vi.fn();
    const { rerender } = render(
      <BfnResponseChart
        project={project}
        result={result}
        onCursorIndexChange={onCursorIndexChange}
      />,
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
    rerender(
      <BfnResponseChart
        project={project}
        result={shortened}
        onCursorIndexChange={onCursorIndexChange}
      />,
    );
    expect(document.querySelector('.bfn-chart__cursor')).not.toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('img', { name: 'Input-output response' }), { key: 'Home' });
    expect(document.querySelector('.bfn-chart__cursor')).toHaveAttribute('data-index', '0');
  });

  it('reads the current and historical runs on their independent real-point grids', () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const sourceId = base.primaryInputSourceId;
    const current = {
      ...base,
      id: 'run-current-grid',
      points: [
        {
          ...base.points[0]!,
          coordinate: 10,
          inputs: { ...base.points[0]!.inputs, [sourceId]: 10 },
          output: 0.5,
        },
        {
          ...base.points[1]!,
          coordinate: 20,
          inputs: { ...base.points[1]!.inputs, [sourceId]: 20 },
          output: 0.8,
        },
      ],
    };
    const historical = {
      ...base,
      id: 'run-historical-grid',
      completedAt: '2026-08-25T10:00:00.000Z',
      points: [
        {
          ...base.points[0]!,
          coordinate: 9.8,
          inputs: { ...base.points[0]!.inputs, [sourceId]: 9.8 },
          output: 0.42,
        },
        {
          ...base.points[1]!,
          coordinate: 20.2,
          inputs: { ...base.points[1]!.inputs, [sourceId]: 20.2 },
          output: 0.74,
        },
      ],
    };
    const comparison = { result: historical, label: 'Comparison run · 18:00' };
    const viewState = { ...defaultBfnChartViewState(current), cursorIndex: 0 };
    const model = createBfnChartModel({
      project,
      result: current,
      comparison,
      viewState,
      geometry,
      translate: (key) => i18n.t(key),
    });

    render(
      <BfnResponseChart
        project={project}
        result={current}
        comparison={comparison}
        viewState={viewState}
        model={model}
      />,
    );

    const tooltip = screen.getByRole('note');
    expect(tooltip).toHaveTextContent('Current run');
    expect(tooltip).toHaveTextContent('10.000 nM');
    expect(tooltip).toHaveTextContent('Comparison run · 18:00');
    expect(tooltip).toHaveTextContent('9.800 nM');
    expect(tooltip).toHaveTextContent('0.420');
    expect(document.querySelector('.bfn-chart__comparison')).toHaveAttribute(
      'data-run-role',
      'comparison',
    );
    expect(document.querySelector('.bfn-chart__comparison-cursor')).toHaveAttribute(
      'data-coordinate',
      '9.8',
    );
    expect(screen.getByLabelText('Series')).toHaveTextContent('Current run');
    expect(screen.getByLabelText('Series')).toHaveTextContent('Comparison run · 18:00');
  });

  it('keeps a multi-input comparison tooltip focusable while pointer moves within the chart wrapper', () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const first = base.points[0];
    if (!first) throw new Error('Expected a dynamic simulation point');
    const extraInputs = Object.fromEntries(
      Array.from({ length: 12 }, (_, index) => [
        `source-extra-${String(index + 1).padStart(2, '0')}`,
        index + 1,
      ]),
    );
    const current = {
      ...base,
      id: 'run-dynamic-current',
      points: [
        {
          ...first,
          inputs: { ...first.inputs, ...extraInputs },
        },
      ],
    };
    const historical = {
      ...base,
      id: 'run-dynamic-history',
      completedAt: '2026-08-25T18:32:00.000Z',
      points: [{ ...first, output: first.output + 0.08 }],
    };
    const comparison = { result: historical, label: 'Comparison run · 18:32' };
    const viewState = { ...defaultBfnChartViewState(current), cursorIndex: 0 };
    const model = createBfnChartModel({
      project,
      result: current,
      comparison,
      viewState,
      geometry,
      translate: (key) => i18n.t(key),
    });
    const onCursorIndexChange = vi.fn();
    render(
      <BfnResponseChart
        project={project}
        result={current}
        comparison={comparison}
        viewState={viewState}
        model={model}
        onCursorIndexChange={onCursorIndexChange}
      />,
    );

    const tooltip = screen.getByRole('note');
    expect(tooltip).toHaveTextContent('3OC6-HSL');
    expect(tooltip).toHaveTextContent('source-extra-01');
    expect(tooltip).toHaveTextContent('source-extra-12');
    expect(tooltip).toHaveTextContent('Comparison run · 18:32');
    expect(tooltip).toHaveAttribute('tabindex', '0');
    tooltip.focus();
    expect(document.activeElement).toBe(tooltip);

    const svg = screen.getByRole('img', { name: 'Dynamic response' });
    fireEvent.pointerLeave(svg, { relatedTarget: tooltip });
    expect(onCursorIndexChange).not.toHaveBeenCalled();

    const wrapper = document.querySelector('.bfn-chart');
    if (!wrapper) throw new Error('Expected the chart wrapper');
    fireEvent.pointerLeave(wrapper);
    expect(onCursorIndexChange).toHaveBeenCalledWith(null);
  });
});
