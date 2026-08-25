import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ModelingPage } from './ModelingPage';
import { createBfnChartModel } from '../features/bfn/chartModel';
import { defaultBfnChartViewState, type BfnChartGeometry } from '../features/bfn/chartTypes';
import { BfnChartControls } from '../features/bfn/BfnChartControls';
import { createDemoBfnProject } from '../features/bfn/fixtures';
import {
  BFN_PROJECT_STORAGE_KEY,
  BFN_RUN_STORAGE_KEY,
  saveBfnRun,
} from '../features/bfn/repository';
import { runBfnSimulation } from '../features/bfn/simulation';
import type { BfnProject, BfnSimulationResult } from '../features/bfn/types';

const geometry: BfnChartGeometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
};

function StatefulChartControls({
  project,
  result,
}: {
  project: BfnProject;
  result: BfnSimulationResult;
}) {
  const [viewState, setViewState] = useState(() => defaultBfnChartViewState(result));
  const model = createBfnChartModel({
    project,
    result,
    viewState,
    geometry,
    translate: (key) => key,
  });
  return (
    <>
      <BfnChartControls
        result={result}
        model={model}
        viewState={viewState}
        onViewStateChange={setViewState}
        onReset={() => setViewState(defaultBfnChartViewState(result))}
      />
      <output data-testid="applied-chart-state">{JSON.stringify(viewState)}</output>
    </>
  );
}

describe('Batch 4 precise chart reading controls', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en-US');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('keeps view controls ephemeral and preserves autosave, freshness, and editor history state', () => {
    vi.useFakeTimers();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<ModelingPage />);
    act(() => {
      vi.advanceTimersByTime(320);
    });
    const baselineProject = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    expect(baselineProject).not.toBeNull();
    expect(
      setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY).length,
    ).toBeGreaterThan(0);
    setItemSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const dock = document.querySelector('.bfn-result-panel');
    if (!dock) throw new Error('Result dock was not rendered');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    const freshnessBefore = dock.querySelector('.inline-status')?.textContent;

    const xAxis = within(dock as HTMLElement)
      .getByText('X axis')
      .closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    fireEvent.click(within(xAxis as HTMLElement).getByRole('button', { name: /Log10/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(dock.querySelector('.inline-status')?.textContent).toBe(freshnessBefore);
    expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY)).toHaveLength(
      0,
    );
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(baselineProject);
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });

  it('prevents hiding every actual Y line and allows uncertainty/ANN toggles', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const full = screen.getByRole('button', { name: /Network response/ });
    const uncertainty = screen.getByRole('button', { name: /Parameter interval/ });
    const ann = screen.getByRole('button', { name: /ANN approximation/ });
    await user.click(full);
    expect(
      within(document.querySelector('.bfn-chart-controls') as HTMLElement).getByText(
        'Keep at least one actual Y series visible.',
      ),
    ).toBeInTheDocument();
    expect(full).toHaveAttribute('aria-pressed', 'true');
    await user.click(uncertainty);
    expect(uncertainty).toHaveAttribute('aria-pressed', 'false');
    await user.click(ann);
    expect(ann).toHaveAttribute('aria-pressed', 'false');
  });

  it('shows only available series, applies axis ranges, and delegates reset', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const withoutAnn = { ...result, annApproximation: null };
    const viewState = defaultBfnChartViewState(withoutAnn);
    const model = createBfnChartModel({
      project,
      result: withoutAnn,
      viewState,
      geometry,
      translate: (key) => key,
    });
    const onViewStateChange = vi.fn();
    const onReset = vi.fn();
    render(
      <BfnChartControls
        result={withoutAnn}
        model={model}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onReset={onReset}
      />,
    );
    expect(screen.queryByRole('button', { name: 'ANN approximation' })).not.toBeInTheDocument();
    const controls = document.querySelector('.bfn-chart-controls') as HTMLElement;
    const uncertainty = within(controls).getByRole('button', { name: 'Parameter interval' });
    fireEvent.click(uncertainty);
    expect(onViewStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ showUncertainty: false }),
    );
    const xAxis = within(controls).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    fireEvent.click(within(xAxis).getByRole('button', { name: 'Manual' }));
    expect(onViewStateChange).toHaveBeenCalledWith(
      expect.objectContaining({ xDomainMode: 'manual' }),
    );
    fireEvent.click(within(controls).getByRole('button', { name: 'Reset view' }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });

  it('applies valid manual bounds, rejects invalid drafts, and resets the stateful chart view', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    render(<StatefulChartControls project={project} result={result} />);
    const controls = document.querySelector('.bfn-chart-controls') as HTMLElement;
    const xAxis = within(controls).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    fireEvent.click(within(xAxis).getByRole('button', { name: 'Manual' }));
    let applied = JSON.parse(
      screen.getByTestId('applied-chart-state').textContent ?? '{}',
    ) as Record<string, unknown>;
    expect(applied).toMatchObject({ xDomainMode: 'manual' });
    expect(applied.xMinimum).toBeLessThan(applied.xMaximum as number);
    const bounds = within(xAxis).getAllByRole('spinbutton');
    fireEvent.change(bounds[0]!, { target: { value: '6' } });
    fireEvent.change(bounds[1]!, { target: { value: '18' } });
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<
      string,
      unknown
    >;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.change(bounds[0]!, { target: { value: '20' } });
    expect(within(xAxis).getByRole('status')).toHaveTextContent(
      'Enter finite values with minimum less than maximum.',
    );
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<
      string,
      unknown
    >;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.change(bounds[0]!, { target: { value: '' } });
    expect(within(xAxis).getByRole('status')).toHaveTextContent(
      'Enter finite values with minimum less than maximum.',
    );
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<
      string,
      unknown
    >;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.click(within(controls).getByRole('button', { name: 'Reset view' }));
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<
      string,
      unknown
    >;
    expect(applied).toMatchObject({
      xScale: 'linear',
      yScale: 'linear',
      xDomainMode: 'auto',
      yDomainMode: 'auto',
      showFullModel: true,
      showUncertainty: true,
      showAnn: true,
      cursorIndex: null,
    });
  });

  it('keeps X and Y validation feedback attached to their own axis controls', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const invalid = {
      ...result,
      points: result.points.slice(0, 2).map((point, index) => ({
        ...point,
        coordinate: index === 0 ? 0 : 1,
        output: index === 0 ? -1 : 1,
        lower: index === 0 ? -1 : 1,
        upper: index === 0 ? -1 : 1,
      })),
    };
    const viewState = defaultBfnChartViewState(invalid);
    const model = createBfnChartModel({
      project,
      result: invalid,
      viewState,
      geometry,
      translate: (key) => key,
    });
    const onViewStateChange = vi.fn();
    render(
      <BfnChartControls
        result={invalid}
        model={model}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onReset={vi.fn()}
      />,
    );
    const xAxis = document.querySelector('[data-axis="x"]');
    const yAxis = document.querySelector('[data-axis="y"]');
    if (!xAxis || !yAxis) throw new Error('Axis controls were not rendered');
    fireEvent.click(within(xAxis as HTMLElement).getByText('X axis'));
    fireEvent.click(within(xAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(xAxis as HTMLElement).getByRole('status')).toHaveTextContent(
      'non-positive value',
    );
    expect(within(yAxis as HTMLElement).queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(within(yAxis as HTMLElement).getByText('Y axis'));
    fireEvent.click(within(yAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(yAxis as HTMLElement).getByRole('status')).toHaveTextContent(
      'non-positive value',
    );
    expect(onViewStateChange).not.toHaveBeenCalled();
  });

  it('rejects Log10 when candidate manual bounds include zero and keeps linear applied state', () => {
    const project = createDemoBfnProject();
    const result = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const viewState = {
      ...defaultBfnChartViewState(result),
      yDomainMode: 'manual' as const,
      yMinimum: 0,
      yMaximum: 1,
    };
    const model = createBfnChartModel({
      project,
      result,
      viewState,
      geometry,
      translate: (key) => key,
    });
    const onViewStateChange = vi.fn();
    render(
      <BfnChartControls
        result={result}
        model={model}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onReset={vi.fn()}
      />,
    );
    const yAxis = document.querySelector('[data-axis="y"]');
    if (!yAxis) throw new Error('Y axis controls were not rendered');
    fireEvent.click(within(yAxis as HTMLElement).getByText('Y axis'));
    fireEvent.click(within(yAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(yAxis as HTMLElement).getByRole('button', { name: 'Linear' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(document.querySelector('.bfn-chart-controls') as HTMLElement).getByRole('status'),
    ).toHaveTextContent('positive');
    expect(onViewStateChange).not.toHaveBeenCalled();
  });

  it('clears axis and last-series feedback before delegating Reset view', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const invalid = {
      ...base,
      id: 'bfn-run-feedback-invalid',
      points: base.points.slice(0, 2).map((point, index) => ({
        ...point,
        coordinate: index,
        output: index + 1,
        lower: index + 0.5,
        upper: index + 1.5,
      })),
    };
    const viewState = defaultBfnChartViewState(invalid);
    const model = createBfnChartModel({
      project,
      result: invalid,
      viewState,
      geometry,
      translate: (key) => key,
    });
    const onViewStateChange = vi.fn();
    const onReset = vi.fn();
    render(
      <BfnChartControls
        result={invalid}
        model={model}
        viewState={viewState}
        onViewStateChange={onViewStateChange}
        onReset={onReset}
      />,
    );
    const controls = document.querySelector('.bfn-chart-controls') as HTMLElement;
    const xAxis = within(controls).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    await user.click(within(xAxis).getByText('X axis'));
    await user.click(within(xAxis).getByRole('button', { name: 'Log10' }));
    expect(within(xAxis).getByRole('status')).toHaveTextContent('non-positive value');
    await user.click(within(controls).getByRole('button', { name: 'Network response' }));
    expect(
      within(controls).getByText('Keep at least one actual Y series visible.'),
    ).toBeInTheDocument();

    await user.click(within(controls).getByRole('button', { name: 'Reset view' }));
    expect(onReset).toHaveBeenCalledTimes(1);
    expect(within(controls).queryAllByRole('status')).toHaveLength(0);
  });

  it('clears local validation feedback when the selected result changes', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const invalid = {
      ...base,
      id: 'bfn-run-feedback-invalid-selection',
      points: base.points.slice(0, 2).map((point, index) => ({
        ...point,
        coordinate: index,
        output: index + 1,
        lower: index + 0.5,
        upper: index + 1.5,
      })),
    };
    const valid = { ...base, id: 'bfn-run-feedback-valid-selection' };
    const invalidView = defaultBfnChartViewState(invalid);
    const validView = defaultBfnChartViewState(valid);
    const invalidModel = createBfnChartModel({
      project,
      result: invalid,
      viewState: invalidView,
      geometry,
      translate: (key) => key,
    });
    const validModel = createBfnChartModel({
      project,
      result: valid,
      viewState: validView,
      geometry,
      translate: (key) => key,
    });
    const { rerender } = render(
      <BfnChartControls
        result={invalid}
        model={invalidModel}
        viewState={invalidView}
        onViewStateChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    const controls = document.querySelector('.bfn-chart-controls') as HTMLElement;
    const xAxis = within(controls).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    await user.click(within(xAxis).getByText('X axis'));
    await user.click(within(xAxis).getByRole('button', { name: 'Log10' }));
    expect(within(xAxis).getByRole('status')).toHaveTextContent('non-positive value');

    rerender(
      <BfnChartControls
        result={valid}
        model={validModel}
        viewState={validView}
        onViewStateChange={vi.fn()}
        onReset={vi.fn()}
      />,
    );
    await waitFor(() =>
      expect(
        within(document.querySelector('.bfn-chart-controls') as HTMLElement).queryByRole('status'),
      ).not.toBeInTheDocument(),
    );
  });

  it('preserves scientific view controls when selecting another stored run and clears the cursor', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const first = {
      ...base,
      id: 'bfn-run-view-state-first',
      completedAt: '2026-08-26T00:00:00.000Z',
    };
    const second = {
      ...base,
      id: 'bfn-run-view-state-second',
      completedAt: '2026-08-26T01:00:00.000Z',
      points: base.points.map((point) => ({
        ...point,
        output: point.output + 0.1,
        lower: point.lower + 0.1,
        upper: point.upper + 0.1,
      })),
    };
    saveBfnRun(first);
    saveBfnRun(second);
    render(<ModelingPage />);
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history');
    if (!history) throw new Error('Run history was not rendered');
    const getRunButtons = (): HTMLElement[] =>
      within(history as HTMLElement)
        .getAllByRole('button')
        .filter((button) => !button.classList.contains('danger-text-button'));
    await user.click(getRunButtons()[1]!);

    const panel = document.querySelector('.bfn-result-panel') as HTMLElement;
    const controls = panel.querySelector('.bfn-chart-controls') as HTMLElement;
    if (!controls) throw new Error('Chart controls were not rendered');
    const xAxis = within(panel).getByText('X axis').closest('details');
    const yAxis = within(panel).getByText('Y axis').closest('details');
    if (!xAxis || !yAxis) throw new Error('Axis controls were not rendered');
    // Native details must be opened before interacting with their controls.
    await user.click(within(xAxis).getByText('X axis'));
    await user.click(within(xAxis).getByRole('button', { name: 'Log10' }));
    await user.click(within(xAxis).getByRole('button', { name: 'Manual' }));
    const xBounds = within(xAxis).getAllByRole('spinbutton');
    fireEvent.change(xBounds[0]!, { target: { value: '4' } });
    fireEvent.change(xBounds[1]!, { target: { value: '18' } });
    await user.click(within(yAxis).getByText('Y axis'));
    await user.click(within(yAxis).getByRole('button', { name: 'Log10' }));
    await user.click(within(yAxis).getByRole('button', { name: 'Manual' }));
    const yBounds = within(yAxis).getAllByRole('spinbutton');
    fireEvent.change(yBounds[0]!, { target: { value: '0.1' } });
    fireEvent.change(yBounds[1]!, { target: { value: '2' } });
    await user.click(within(controls).getByRole('button', { name: 'Parameter interval' }));
    await user.click(within(controls).getByRole('button', { name: 'ANN approximation' }));

    const chart = within(panel).getByRole('img', { name: 'Input-output response' });
    chart.focus();
    await user.keyboard('{Home}');
    expect(within(panel).getByRole('note')).toBeInTheDocument();
    expect(within(xAxis).getByRole('button', { name: 'Log10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(xAxis).getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(yAxis).getByRole('button', { name: 'Log10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(yAxis).getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(controls).getByRole('button', { name: 'Parameter interval' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(controls).getByRole('button', { name: 'ANN approximation' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await user.click(getRunButtons()[0]!);
    const nextControls = panel.querySelector('.bfn-chart-controls') as HTMLElement;
    if (!nextControls) throw new Error('Chart controls were not rendered after selection');
    const nextXAxis = within(panel).getByText('X axis').closest('details');
    const nextYAxis = within(panel).getByText('Y axis').closest('details');
    if (!nextXAxis || !nextYAxis)
      throw new Error('Axis controls were not rendered after selection');
    expect(within(nextXAxis).getByRole('button', { name: 'Log10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(nextXAxis).getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(nextXAxis).getAllByRole('spinbutton')[0]).toHaveValue(4);
    expect(within(nextXAxis).getAllByRole('spinbutton')[1]).toHaveValue(18);
    expect(within(nextYAxis).getByRole('button', { name: 'Log10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(nextYAxis).getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(within(nextYAxis).getAllByRole('spinbutton')[0]).toHaveValue(0.1);
    expect(within(nextYAxis).getAllByRole('spinbutton')[1]).toHaveValue(2);
    expect(
      within(nextControls).getByRole('button', { name: 'Parameter interval' }),
    ).toHaveAttribute('aria-pressed', 'false');
    expect(within(nextControls).getByRole('button', { name: 'ANN approximation' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(within(panel).queryByRole('note')).not.toBeInTheDocument();
  });

  it('keeps two result-dock runs selectable and confirms clearing without changing the project', async () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T00:00:00.000Z');
    const first = {
      ...base,
      id: 'bfn-run-history-first',
      completedAt: '2026-08-26T00:00:00.000Z',
    };
    const second = {
      ...base,
      id: 'bfn-run-history-second',
      completedAt: '2026-08-26T01:00:00.000Z',
      points: base.points.map((point) => ({
        ...point,
        output: point.output + 0.1,
        lower: point.lower + 0.1,
        upper: point.upper + 0.1,
      })),
    };
    saveBfnRun(first);
    saveBfnRun(second);
    const user = userEvent.setup();
    render(<ModelingPage />);
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
    const projectBeforeHistoryActions = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history');
    if (!history) throw new Error('Run history was not rendered');
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toContain('bfn-run-history-first');
    const getRunButtons = (): HTMLElement[] =>
      within(history as HTMLElement)
        .getAllByRole('button')
        .filter((button) => !button.classList.contains('danger-text-button'));
    const initialRunButtons = getRunButtons();
    expect(initialRunButtons).toHaveLength(2);
    expect(new Set(initialRunButtons.map((button) => button.textContent)).size).toBe(2);
    expect(initialRunButtons[0]).toHaveTextContent(second.points.at(-1)?.output.toFixed(3) ?? '');
    expect(initialRunButtons[1]).toHaveTextContent(first.points.at(-1)?.output.toFixed(3) ?? '');
    const resultPanel = document.querySelector('.bfn-result-panel') as HTMLElement;
    const assertSelectedRun = (run: BfnSimulationResult): void => {
      const outputArticle = Array.from(
        resultPanel.querySelectorAll('.bfn-result-facts article'),
      ).find((article) => article.textContent?.includes('Current output'));
      expect(outputArticle).toHaveTextContent(run.points.at(-1)?.output.toFixed(3) ?? '');
      expect(resultPanel).toHaveTextContent(
        `Last run: ${new Date(run.completedAt).toLocaleString('en-US')}`,
      );
      expect(resultPanel).toHaveTextContent('Previous result');
    };
    await user.click(initialRunButtons[0]!);
    assertSelectedRun(second);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
    await user.click(getRunButtons()[1]!);
    assertSelectedRun(first);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
    const clearButton = within(history as HTMLElement).getByRole('button', {
      name: 'Clear history',
    });
    await user.click(clearButton);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Clear run history?');
    await user.click(within(dialog).getByRole('button', { name: 'Keep history' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(clearButton);
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }),
    );
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBeNull();
    expect(
      within(document.querySelector('.bfn-run-history') as HTMLElement).getByText(
        /After an analysis/,
      ),
    ).toBeInTheDocument();
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
  });

  it('keeps export and copy actions isolated from project storage, freshness, history, and Undo/Redo', async () => {
    const clipboardDescriptor = Object.getOwnPropertyDescriptor(navigator, 'clipboard');
    const createObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
    const revokeObjectUrlDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
    const writeText = vi.fn(() => Promise.resolve());
    const createObjectURL = vi.fn(() => 'blob:bfn-integration-export');
    const revokeObjectURL = vi.fn();
    const user = userEvent.setup();
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    });
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    });
    const anchorClick = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);

    try {
      const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
      render(<ModelingPage />);
      await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
      await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
      const panel = document.querySelector('.bfn-result-panel') as HTMLElement;
      const undo = screen.getByRole('button', { name: 'Undo' });
      const redo = screen.getByRole('button', { name: 'Redo' });
      const projectBefore = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
      const historyBefore = localStorage.getItem(BFN_RUN_STORAGE_KEY);
      const freshnessBefore = panel.querySelector('.inline-status')?.textContent;
      const undoBefore = undo.hasAttribute('disabled');
      const redoBefore = redo.hasAttribute('disabled');
      setItemSpy.mockClear();

      await user.click(within(panel).getByText('Export'));
      await user.click(within(panel).getByRole('button', { name: 'Download SVG' }));
      await user.click(within(panel).getByRole('button', { name: 'Copy data' }));
      await waitFor(() =>
        expect(within(panel).getByRole('status')).toHaveTextContent('Data copied.'),
      );
      await user.click(within(panel).getByRole('button', { name: 'Copy caption' }));
      await waitFor(() =>
        expect(within(panel).getByRole('status')).toHaveTextContent('Caption copied.'),
      );

      expect(anchorClick).toHaveBeenCalledOnce();
      expect(createObjectURL).toHaveBeenCalledOnce();
      expect(revokeObjectURL).toHaveBeenCalledWith('blob:bfn-integration-export');
      expect(writeText).toHaveBeenCalledTimes(2);
      expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBefore);
      expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBe(historyBefore);
      expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY)).toHaveLength(
        0,
      );
      expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_RUN_STORAGE_KEY)).toHaveLength(0);
      expect(panel.querySelector('.inline-status')?.textContent).toBe(freshnessBefore);
      expect(undo.hasAttribute('disabled')).toBe(undoBefore);
      expect(redo.hasAttribute('disabled')).toBe(redoBefore);
    } finally {
      anchorClick.mockRestore();
      if (clipboardDescriptor) Object.defineProperty(navigator, 'clipboard', clipboardDescriptor);
      else Reflect.deleteProperty(navigator, 'clipboard');
      if (createObjectUrlDescriptor)
        Object.defineProperty(URL, 'createObjectURL', createObjectUrlDescriptor);
      else Reflect.deleteProperty(URL, 'createObjectURL');
      if (revokeObjectUrlDescriptor)
        Object.defineProperty(URL, 'revokeObjectURL', revokeObjectUrlDescriptor);
      else Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
  });

  it('shows an explicit empty comparison state without rendering an empty select', async () => {
    const project = createDemoBfnProject();
    const onlyRun = {
      ...runBfnSimulation(project, '2026-08-26T08:00:00.000Z'),
      id: 'run-only-comparison-candidate',
    };
    saveBfnRun(onlyRun);
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history') as HTMLElement;
    const runButton = within(history)
      .getByText(new Date(onlyRun.completedAt).toLocaleString('en-US'))
      .closest('button');
    if (!runButton) throw new Error('Stored run button was not rendered');
    await user.click(runButton);

    expect(screen.getByText('No compatible historical runs.')).toBeInTheDocument();
    expect(
      screen.queryByRole('combobox', { name: 'Compare with historical run' }),
    ).not.toBeInTheDocument();
  });

  it('selects one compatible run without touching editor state and clears it for an incompatible result', async () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const comparison = {
      ...base,
      id: 'run-comparison-compatible',
      completedAt: '2026-08-25T18:32:00',
      points: base.points.map((point) => ({ ...point, output: point.output + 0.08 })),
    };
    const incompatible = {
      ...base,
      id: 'run-comparison-incompatible',
      completedAt: '2026-08-25T10:00:00.000Z',
      outputMonitorId: 'monitor-incompatible',
    };
    const current = { ...base, id: 'run-comparison-current' };
    saveBfnRun(comparison);
    saveBfnRun(incompatible);
    saveBfnRun(current);
    const user = userEvent.setup();
    const setItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    render(<ModelingPage />);
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history') as HTMLElement;
    const buttonFor = (run: BfnSimulationResult): HTMLButtonElement => {
      const button = within(history)
        .getByText(new Date(run.completedAt).toLocaleString('en-US'))
        .closest('button');
      if (!button) throw new Error(`Stored run button ${run.id} was not rendered`);
      return button;
    };
    await user.click(buttonFor(current));
    const panel = document.querySelector('.bfn-result-panel') as HTMLElement;
    const xAxis = within(panel).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    await user.click(within(xAxis).getByText('X axis'));
    await user.click(within(xAxis).getByRole('button', { name: 'Manual' }));
    const xBoundsBefore = within(xAxis)
      .getAllByRole('spinbutton')
      .map((input) => (input as HTMLInputElement).value);
    const projectBefore = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    const historyBefore = localStorage.getItem(BFN_RUN_STORAGE_KEY);
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    const freshnessBefore = panel.querySelector('.inline-status')?.textContent;
    setItemSpy.mockClear();

    const selector = within(panel).getByRole('combobox', { name: 'Compare with historical run' });
    const fullComparisonTime = new Date(comparison.completedAt).toLocaleString('en-US');
    expect(within(selector).getByRole('option', { name: /Steady-state.*nM/ })).toHaveTextContent(
      fullComparisonTime,
    );
    await user.selectOptions(selector, comparison.id);

    expect(panel.querySelector('.bfn-chart__comparison')).toHaveAttribute(
      'data-run-role',
      'comparison',
    );
    const legend = panel.querySelector('.bfn-chart__legend') as HTMLElement;
    expect(legend).toHaveTextContent('Current run');
    expect(legend).toHaveTextContent('Comparison run · 18:32');
    expect(legend).not.toHaveTextContent(fullComparisonTime);
    expect(legend).not.toHaveTextContent(':00');
    expect(within(xAxis).getByRole('button', { name: 'Manual' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(
      within(xAxis)
        .getAllByRole('spinbutton')
        .map((input) => (input as HTMLInputElement).value),
    ).toEqual(xBoundsBefore);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBefore);
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBe(historyBefore);
    expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY)).toHaveLength(
      0,
    );
    expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_RUN_STORAGE_KEY)).toHaveLength(0);
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(panel.querySelector('.inline-status')?.textContent).toBe(freshnessBefore);

    await user.click(buttonFor(incompatible));
    expect(
      within(panel).queryByRole('combobox', { name: 'Compare with historical run' }),
    ).not.toBeInTheDocument();
    expect(
      within(panel).getByText(
        'Comparison cleared because it is no longer compatible or available.',
      ),
    ).toBeInTheDocument();
    expect(panel.querySelector('.bfn-chart__comparison')).not.toBeInTheDocument();
  });

  it('renders a localized compact comparison label for a repository-accepted invalid timestamp', async () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const comparison = {
      ...base,
      id: 'run-invalid-comparison-time',
      completedAt: 'not-a-timestamp',
    };
    const current = { ...base, id: 'run-valid-current-time' };
    saveBfnRun(comparison);
    saveBfnRun(current);
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history') as HTMLElement;
    const currentButton = within(history)
      .getByText(new Date(current.completedAt).toLocaleString('en-US'))
      .closest('button');
    if (!currentButton) throw new Error('Current run button was not rendered');
    await user.click(currentButton);
    const panel = document.querySelector('.bfn-result-panel') as HTMLElement;

    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Compare with historical run' }),
      comparison.id,
    );

    expect(panel.querySelector('.bfn-chart__legend')).toHaveTextContent('Comparison run · Unknown');
  });

  it('clears the selected comparison when run history is cleared', async () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const current = { ...base, id: 'run-clear-comparison-current' };
    const comparison = {
      ...base,
      id: 'run-clear-comparison-history',
      completedAt: '2026-08-25T10:00:00.000Z',
    };
    saveBfnRun(comparison);
    saveBfnRun(current);
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history') as HTMLElement;
    const currentButton = within(history)
      .getByText(new Date(current.completedAt).toLocaleString('en-US'))
      .closest('button');
    if (!currentButton) throw new Error('Current run button was not rendered');
    await user.click(currentButton);
    const panel = document.querySelector('.bfn-result-panel') as HTMLElement;
    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Compare with historical run' }),
      comparison.id,
    );
    expect(panel.querySelector('.bfn-chart__comparison')).toBeInTheDocument();

    await user.click(within(history).getByRole('button', { name: 'Clear history' }));
    await user.click(
      within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }),
    );

    expect(panel.querySelector('.bfn-chart__comparison')).not.toBeInTheDocument();
    expect(
      within(panel).getByText(
        'Comparison cleared because it is no longer compatible or available.',
      ),
    ).toBeInTheDocument();
    expect(
      within(panel).queryByRole('combobox', { name: 'Compare with historical run' }),
    ).not.toBeInTheDocument();
  });

  it('returns an invalidated comparison log axis to Linear while preserving manual bounds', async () => {
    const project = createDemoBfnProject();
    const base = runBfnSimulation(project, '2026-08-26T10:00:00.000Z');
    const current = { ...base, id: 'run-log-current' };
    const comparison = {
      ...base,
      id: 'run-log-comparison',
      completedAt: '2026-08-25T10:00:00.000Z',
      points: base.points.map((point, index) => ({
        ...point,
        output: index === 0 ? 0 : point.output,
      })),
    };
    saveBfnRun(comparison);
    saveBfnRun(current);
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Expand analysis results' }));
    const history = document.querySelector('.bfn-run-history') as HTMLElement;
    const currentButton = within(history)
      .getByText(new Date(current.completedAt).toLocaleString('en-US'))
      .closest('button');
    if (!currentButton) throw new Error('Current run button was not rendered');
    await user.click(currentButton);
    const panel = document.querySelector('.bfn-result-panel') as HTMLElement;
    const yAxis = within(panel).getByText('Y axis').closest('details');
    if (!yAxis) throw new Error('Y axis controls were not rendered');
    await user.click(within(yAxis).getByText('Y axis'));
    await user.click(within(yAxis).getByRole('button', { name: 'Manual' }));
    const bounds = within(yAxis).getAllByRole('spinbutton');
    fireEvent.change(bounds[0]!, { target: { value: '0.1' } });
    fireEvent.change(bounds[1]!, { target: { value: '1' } });
    await user.click(within(yAxis).getByRole('button', { name: 'Log10' }));
    expect(within(yAxis).getByRole('button', { name: 'Log10' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await user.selectOptions(
      within(panel).getByRole('combobox', { name: 'Compare with historical run' }),
      comparison.id,
    );

    await waitFor(() =>
      expect(within(yAxis).getByRole('button', { name: 'Linear' })).toHaveAttribute(
        'aria-pressed',
        'true',
      ),
    );
    expect(within(yAxis).getAllByRole('spinbutton')[0]).toHaveValue(0.1);
    expect(within(yAxis).getAllByRole('spinbutton')[1]).toHaveValue(1);
    const fallbackNotice = within(panel).getByText(/non-positive value: 0/);
    expect(fallbackNotice).toHaveTextContent('Y axis returned to Linear');
    expect(fallbackNotice).toHaveTextContent('Manual bounds were kept.');
  });
});
