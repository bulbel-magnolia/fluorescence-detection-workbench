import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import { createBfnChartModel } from './chartModel';
import { defaultBfnChartViewState } from './chartTypes';
import {
  createBfnFigureCaption,
  serializeBfnFigureSvg,
  serializeBfnResultTable,
} from './chartExport';
import { createDemoBfnProject } from './fixtures';
import { BfnResultWorkspace } from './BfnResultWorkspace';
import { runBfnSimulation } from './simulation';

const geometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
} as const;

describe('BFN-SIM 2.1 uncertainty presentation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('shows a point-only result with a concise reason and unavailable ANN coverage', () => {
    const project = createDemoBfnProject();
    const model = project.network.modules[0]!.modelVariants[0]!;
    model.uncertaintyMethod = 'not_recorded';
    const result = runBfnSimulation(project);

    render(
      <BfnResultWorkspace
        project={project}
        result={result}
        runs={[result]}
        resultFreshness="current"
        resultPanelOpen
        onTogglePanel={vi.fn()}
        onRunSimulation={vi.fn()}
        onRequestClearRuns={vi.fn()}
        onSelectRun={vi.fn()}
      />,
    );

    expect(document.querySelector('.bfn-chart__band')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Parameter interval' })).toBeNull();
    expect(screen.getByText('Parameter interval unavailable')).toBeInTheDocument();
    expect(
      screen.getAllByText('Uncertainty was not recorded for one or more active models.'),
    ).toHaveLength(2);
    expect(
      screen.getByText('Unavailable without an executable parameter interval'),
    ).toBeInTheDocument();
    expect(screen.queryByText('0.0%', { exact: true })).toBeNull();
  });

  it('exports blank interval cells and no uncertainty ribbon or claim when unavailable', () => {
    const project = createDemoBfnProject();
    project.network.modules[0]!.modelVariants[0]!.uncertaintyMethod = 'none';
    const result = runBfnSimulation(project);
    const model = createBfnChartModel({
      project,
      result,
      viewState: defaultBfnChartViewState(result),
      geometry,
      translate: (key) => i18n.getFixedT('en-US')(key),
    });

    const svg = serializeBfnFigureSvg({ model, result });
    const caption = createBfnFigureCaption({ project, result, model });
    const csv = serializeBfnResultTable({ project, current: result });
    const headers = csv.split('\r\n')[0]!.split(',');
    const firstRow = csv.split('\r\n')[1]!.split(',');

    expect(model.series.uncertainty).toBeUndefined();
    expect(svg).not.toContain('data-series="uncertainty"');
    expect(caption).not.toContain('parameter-interval envelope');
    expect(firstRow[headers.indexOf('lower')]).toBe('');
    expect(firstRow[headers.indexOf('upper')]).toBe('');
  });
});
