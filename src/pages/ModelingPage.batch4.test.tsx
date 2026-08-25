import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../i18n';
import { ModelingPage } from './ModelingPage';
import { createBfnChartModel } from '../features/bfn/chartModel';
import { defaultBfnChartViewState, type BfnChartGeometry } from '../features/bfn/chartTypes';
import { BfnChartControls } from '../features/bfn/BfnChartControls';
import { createDemoBfnProject } from '../features/bfn/fixtures';
import { BFN_PROJECT_STORAGE_KEY, BFN_RUN_STORAGE_KEY } from '../features/bfn/repository';
import { runBfnSimulation } from '../features/bfn/simulation';

const geometry: BfnChartGeometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
};

describe('Batch 4 precise chart reading controls', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en-US');
  });

  it('keeps view controls ephemeral and preserves project history state', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const dock = document.querySelector('.bfn-result-panel');
    if (!dock) throw new Error('Result dock was not rendered');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();

    const xAxis = within(dock as HTMLElement).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    await waitFor(() => expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).not.toBeNull());
    const savedProject = localStorage.getItem(BFN_PROJECT_STORAGE_KEY);
    await user.click(within(xAxis as HTMLElement).getByRole('button', { name: /Log10/ }));
    expect(undo).toBeDisabled();
    expect(within(xAxis as HTMLElement).getByRole('button', { name: /Log10/ })).toHaveAttribute('aria-pressed', 'true');
    expect(localStorage.getItem(BFN_PROJECT_STORAGE_KEY)).toBe(savedProject);
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

  it('keeps result-dock history selectable and confirms clearing without changing the project', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const history = document.querySelector('.bfn-run-history');
    if (!history) throw new Error('Run history was not rendered');
    expect(localStorage.getItem(BFN_RUN_STORAGE_KEY)).toContain('bfn-run');
    const runButton = within(history as HTMLElement).getAllByRole('button').find((button) => button.textContent !== 'Clear history');
    if (!runButton) throw new Error('Saved run button was not rendered');
    await user.click(runButton);
    expect(within(document.querySelector('.bfn-result-panel') as HTMLElement).getByText('Previous result')).toBeInTheDocument();
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
  });
});
