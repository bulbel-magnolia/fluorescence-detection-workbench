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
import { BFN_PROJECT_STORAGE_KEY, BFN_RUN_STORAGE_KEY, saveBfnRun } from '../features/bfn/repository';
import { runBfnSimulation } from '../features/bfn/simulation';
import type { BfnProject, BfnSimulationResult } from '../features/bfn/types';

const geometry: BfnChartGeometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
};

function StatefulChartControls({ project, result }: { project: BfnProject; result: BfnSimulationResult }) {
  const [viewState, setViewState] = useState(() => defaultBfnChartViewState(result));
  const model = createBfnChartModel({ project, result, viewState, geometry, translate: (key) => key });
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
    expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY).length).toBeGreaterThan(0);
    setItemSpy.mockClear();
    fireEvent.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const dock = document.querySelector('.bfn-result-panel');
    if (!dock) throw new Error('Result dock was not rendered');
    const undo = screen.getByRole('button', { name: 'Undo' });
    const redo = screen.getByRole('button', { name: 'Redo' });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    const freshnessBefore = dock.querySelector('.inline-status')?.textContent;

    const xAxis = within(dock as HTMLElement).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    fireEvent.click(within(xAxis as HTMLElement).getByRole('button', { name: /Log10/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Reset view' }));
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(undo).toBeDisabled();
    expect(redo).toBeDisabled();
    expect(dock.querySelector('.inline-status')?.textContent).toBe(freshnessBefore);
    expect(setItemSpy.mock.calls.filter(([key]) => key === BFN_PROJECT_STORAGE_KEY)).toHaveLength(0);
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
    expect(within(document.querySelector('.bfn-chart-controls') as HTMLElement).getByText('Keep at least one actual Y series visible.')).toBeInTheDocument();
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
    const model = createBfnChartModel({ project, result: withoutAnn, viewState, geometry, translate: (key) => key });
    const onViewStateChange = vi.fn();
    const onReset = vi.fn();
    render(<BfnChartControls result={withoutAnn} model={model} viewState={viewState} onViewStateChange={onViewStateChange} onReset={onReset} />);
    expect(screen.queryByRole('button', { name: 'ANN approximation' })).not.toBeInTheDocument();
    const controls = document.querySelector('.bfn-chart-controls') as HTMLElement;
    const uncertainty = within(controls).getByRole('button', { name: 'Parameter interval' });
    fireEvent.click(uncertainty);
    expect(onViewStateChange).toHaveBeenCalledWith(expect.objectContaining({ showUncertainty: false }));
    const xAxis = within(controls).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    fireEvent.click(within(xAxis).getByRole('button', { name: 'Manual' }));
    expect(onViewStateChange).toHaveBeenCalledWith(expect.objectContaining({ xDomainMode: 'manual' }));
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
    let applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<string, unknown>;
    expect(applied).toMatchObject({ xDomainMode: 'manual' });
    expect(applied.xMinimum).toBeLessThan(applied.xMaximum as number);
    const bounds = within(xAxis).getAllByRole('spinbutton');
    fireEvent.change(bounds[0]!, { target: { value: '6' } });
    fireEvent.change(bounds[1]!, { target: { value: '18' } });
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<string, unknown>;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.change(bounds[0]!, { target: { value: '20' } });
    expect(within(xAxis).getByRole('status')).toHaveTextContent('Enter finite values with minimum less than maximum.');
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<string, unknown>;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.change(bounds[0]!, { target: { value: '' } });
    expect(within(xAxis).getByRole('status')).toHaveTextContent('Enter finite values with minimum less than maximum.');
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<string, unknown>;
    expect(applied).toMatchObject({ xDomainMode: 'manual', xMinimum: 6, xMaximum: 18 });
    fireEvent.click(within(controls).getByRole('button', { name: 'Reset view' }));
    applied = JSON.parse(screen.getByTestId('applied-chart-state').textContent ?? '{}') as Record<string, unknown>;
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
    const model = createBfnChartModel({ project, result: invalid, viewState, geometry, translate: (key) => key });
    const onViewStateChange = vi.fn();
    render(<BfnChartControls result={invalid} model={model} viewState={viewState} onViewStateChange={onViewStateChange} onReset={vi.fn()} />);
    const xAxis = document.querySelector('[data-axis="x"]');
    const yAxis = document.querySelector('[data-axis="y"]');
    if (!xAxis || !yAxis) throw new Error('Axis controls were not rendered');
    fireEvent.click(within(xAxis as HTMLElement).getByText('X axis'));
    fireEvent.click(within(xAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(xAxis as HTMLElement).getByRole('status')).toHaveTextContent('non-positive value');
    expect(within(yAxis as HTMLElement).queryByRole('status')).not.toBeInTheDocument();
    fireEvent.click(within(yAxis as HTMLElement).getByText('Y axis'));
    fireEvent.click(within(yAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(yAxis as HTMLElement).getByRole('status')).toHaveTextContent('non-positive value');
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
    const model = createBfnChartModel({ project, result, viewState, geometry, translate: (key) => key });
    const onViewStateChange = vi.fn();
    render(<BfnChartControls result={result} model={model} viewState={viewState} onViewStateChange={onViewStateChange} onReset={vi.fn()} />);
    const yAxis = document.querySelector('[data-axis="y"]');
    if (!yAxis) throw new Error('Y axis controls were not rendered');
    fireEvent.click(within(yAxis as HTMLElement).getByText('Y axis'));
    fireEvent.click(within(yAxis as HTMLElement).getByRole('button', { name: 'Log10' }));
    expect(within(yAxis as HTMLElement).getByRole('button', { name: 'Linear' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(document.querySelector('.bfn-chart-controls') as HTMLElement).getByRole('status')).toHaveTextContent('positive');
    expect(onViewStateChange).not.toHaveBeenCalled();
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
    const getRunButtons = (): HTMLElement[] => within(history as HTMLElement)
      .getAllByRole('button')
      .filter((button) => !button.classList.contains('danger-text-button'));
    const initialRunButtons = getRunButtons();
    expect(initialRunButtons).toHaveLength(2);
    expect(new Set(initialRunButtons.map((button) => button.textContent)).size).toBe(2);
    expect(initialRunButtons[0]).toHaveTextContent(second.points.at(-1)?.output.toFixed(3) ?? '');
    expect(initialRunButtons[1]).toHaveTextContent(first.points.at(-1)?.output.toFixed(3) ?? '');
    const resultPanel = document.querySelector('.bfn-result-panel') as HTMLElement;
    const assertSelectedRun = (run: BfnSimulationResult): void => {
      const outputArticle = Array.from(resultPanel.querySelectorAll('.bfn-result-facts article'))
        .find((article) => article.textContent?.includes('Current output'));
      expect(outputArticle).toHaveTextContent(run.points.at(-1)?.output.toFixed(3) ?? '');
      expect(resultPanel).toHaveTextContent(`Last run: ${new Date(run.completedAt).toLocaleString('en-US')}`);
      expect(resultPanel).toHaveTextContent('Previous result');
    };
    await user.click(initialRunButtons[0]!);
    assertSelectedRun(second);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
    await user.click(getRunButtons()[1]!);
    assertSelectedRun(first);
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
    const clearButton = within(history as HTMLElement).getByRole('button', { name: 'Clear history' });
    await user.click(clearButton);
    const dialog = screen.getByRole('alertdialog');
    expect(dialog).toHaveTextContent('Clear run history?');
    await user.click(within(dialog).getByRole('button', { name: 'Keep history' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await user.click(clearButton);
    await user.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Clear history' }));
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toBeNull();
    expect(within(document.querySelector('.bfn-run-history') as HTMLElement).getByText(/After an analysis/)).toBeInTheDocument();
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(projectBeforeHistoryActions);
  });
});
