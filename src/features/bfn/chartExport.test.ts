import { describe, expect, it, vi } from 'vitest';
import { createBfnChartModel } from './chartModel';
import { defaultBfnChartViewState } from './chartTypes';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import {
  createBfnExportFilename,
  createBfnFigureCaption,
  createBfnProvenanceRows,
  renderBfnFigurePng,
  serializeBfnFigureSvg,
  serializeBfnResultTable,
  type BfnPngCanvas,
  type BfnPngCanvasContext,
} from './chartExport';

const geometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
} as const;

function chartFixture() {
  const project = createDemoBfnProject();
  const result = runBfnSimulation(project, '2026-08-25T12:05:00.000Z');
  const comparisonResult = runBfnSimulation(project, '2026-08-24T08:30:00.000Z');
  const comparison = { result: comparisonResult, label: 'Previous <run>' };
  const viewState = defaultBfnChartViewState(result);
  const model = createBfnChartModel({
    project,
    result,
    comparison,
    viewState,
    geometry,
    translate: (key) => key,
  });
  return { project, result, comparison, viewState, model };
}

describe('publication figure export', () => {
  it('serializes a self-contained accessible vector figure from the shared chart model', () => {
    const { result, comparison, model } = chartFixture();
    const svg = serializeBfnFigureSvg({
      model,
      result,
      comparison,
      title: 'Response <A&B>',
      description: 'A "publication" figure',
    });

    expect(svg).toContain('<svg');
    expect(svg).toContain('viewBox="0 0 760 300"');
    expect(svg).toContain('<title id="bfn-figure-title">Response &lt;A&amp;B&gt;</title>');
    expect(svg).toContain('<desc id="bfn-figure-description">A &quot;publication&quot; figure</desc>');
    expect(svg).toMatch(/<rect[^>]+fill="#ffffff"/);
    expect(svg).toContain('font-family="Arial, Helvetica, sans-serif"');
    expect(svg).toContain('data-series="full"');
    expect(svg).toContain('data-series="uncertainty"');
    expect(svg).toContain('data-series="ann"');
    expect(svg).toContain('data-series="comparison"');
    expect(svg).toContain('stroke="#64748b"');
    expect(svg).toContain('stroke-dasharray="6 4"');
    expect(svg.match(/stroke-dasharray="6 4"/g)).toHaveLength(2);
    expect(svg).toContain('data-role="legend"');
    expect(svg.split(String.fromCharCode(60) + 'title').length - 1).toBe(1);
    expect(svg.split(String.fromCharCode(60) + 'desc').length - 1).toBe(1);
    expect(svg).toContain('Previous &lt;run&gt;');
    expect(svg).toMatch(/<path[^>]+d="M [^"]+"/);
    expect(svg).toMatch(/<text[^>]*>[^<]+<\/text>/);
    expect(svg).not.toContain('<image');
    expect(svg).not.toMatch(/crosshair|tooltip|cursor|focus-ring/i);
  });

  it('exports the current manual/log axes and only currently visible model series', () => {
    const { project, result } = chartFixture();
    const model = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xScale: 'log',
        xDomainMode: 'manual',
        xMinimum: 5,
        xMaximum: 20,
        showUncertainty: false,
        showAnn: false,
      },
      geometry,
      translate: (key) => key,
    });

    const svg = serializeBfnFigureSvg({ model, result });

    expect(svg).toContain('data-x-scale="log"');
    expect(svg).toContain('data-x-domain="5 20"');
    expect(svg).toContain('data-series="full"');
    expect(svg).not.toContain('data-series="uncertainty"');
    expect(svg).not.toContain('data-series="ann"');
  });

  it('renders an uncertainty band when the shared model provides band geometry without a line path', () => {
    const { result, model } = chartFixture();
    const uncertainty = model.series.uncertainty;
    if (!uncertainty) throw new Error('Expected uncertainty geometry');
    const bandOnlyModel = {
      ...model,
      series: {
        ...model.series,
        uncertainty: { ...uncertainty, path: '', band: uncertainty.path },
      },
    };

    const svg = serializeBfnFigureSvg({ model: bandOnlyModel, result });

    expect(svg).toMatch(/<path data-series="uncertainty"[^>]+d="M [^"]+"/);
    expect(svg).toContain('<g data-role="legend-item" data-series="uncertainty"');
  });
});

describe('raw table export', () => {
  it('keeps project columns stable, appends orphan ids in sorted order, and preserves raw precision', () => {
    const { project, result, comparison } = chartFixture();
    project.network.inputSources.push({
      ...project.network.inputSources[0]!,
      id: 'source,secondary',
      outputPort: { ...project.network.inputSources[0]!.outputPort, id: 'secondary-output' },
    });
    const precise = 0.12345678901234566;
    result.points = [{
      ...result.points[0]!,
      inputs: { 'source-ahl': 5, 'orphan-z': 9, 'orphan-a': 7 },
      moduleOutputs: { 'module-ahl-sensor': precise, 'orphan-module-z': 3, 'orphan-module-a': 2 },
      output: precise,
    }];
    comparison.result.points = [{
      ...comparison.result.points[0]!,
      inputs: { 'source-ahl': 6, 'orphan-b': 8 },
      moduleOutputs: { reporter: 0.5 },
    }];

    const csv = serializeBfnResultTable({
      project,
      current: result,
      comparison,
      delimiter: ',',
      bom: true,
    });
    const [header, currentRow, comparisonRow] = csv.slice(1).trimEnd().split('\r\n');
    if (!header || !currentRow || !comparisonRow) throw new Error('Expected header, current, and comparison rows');

    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(header).toBe([
      'run_id', 'run_role', 'completed_at', 'mode', 'coordinate', 'time_hours',
      'input:source-ahl', '"input:source,secondary"', 'input:orphan-a', 'input:orphan-b', 'input:orphan-z',
      'module:module-ahl-sensor', 'module:module-reporter', 'module:orphan-module-a', 'module:orphan-module-z', 'module:reporter',
      'output', 'lower', 'upper', 'extrapolated',
    ].join(','));
    expect(currentRow).toContain(`,current,`);
    expect(comparisonRow).toContain(`,comparison,`);
    expect(currentRow).toContain(String(precise));
    expect(currentRow).toContain(',7,,9,');
    expect(comparisonRow.split(',').at(-5)).toBe('0.5');
    expect(comparisonRow.split(',').at(-6)).toBe('');
  });

  it('emits tab-separated tidy rows without a BOM and without removing hidden raw columns', () => {
    const { project, result, comparison } = chartFixture();
    const tsv = serializeBfnResultTable({
      project,
      current: result,
      comparison,
      delimiter: '\t',
      bom: false,
    });

    expect(tsv.startsWith('\ufeff')).toBe(false);
    expect(tsv.split('\r\n')[0]).toContain('\tinput:source-ahl\tmodule:module-ahl-sensor');
    expect(tsv).toContain('\tcurrent\t');
    expect(tsv).toContain('\tcomparison\t');
    expect(tsv.split('\r\n')).toHaveLength(result.points.length + comparison.result.points.length + 2);
  });
});

describe('export metadata helpers', () => {
  it('creates deterministic Windows-safe filenames', () => {
    const { project, result } = chartFixture();
    project.id = 'CON: project / alpha?';
    project.network.id = 'network*one|two';

    expect(createBfnExportFilename({ project, result, artifact: 'response', extension: 'svg' })).toBe(
      'CON-project-alpha_network-one-two_static_2026-08-25T120500Z_response.svg',
    );
    expect(createBfnExportFilename({ project, result, artifact: 'response', extension: 'svg' }))
      .not.toMatch(/[\\/:*?"<>|]/);

    project.id = 'CON.txt';
    expect(createBfnExportFilename({ project, result, artifact: 'response', extension: 'svg' }))
      .toMatch(/^bfn-CON\.txt_/);
    project.id = `alpha${String.fromCharCode(1)}beta`;
    const controlSafeFilename = createBfnExportFilename({ project, result, artifact: 'response', extension: 'svg' });
    expect(Array.from(controlSafeFilename).some((character) => character.charCodeAt(0) <= 0x1f)).toBe(false);
  });

  it('describes only known figure semantics and provenance fields', () => {
    const { project, result, comparison, model } = chartFixture();
    const caption = createBfnFigureCaption({ project, result, model, comparison });
    const rows = createBfnProvenanceRows({ result });
    const values = Object.fromEntries(rows.map((row) => [row.key, row.value]));

    expect(caption).toContain('parameter-interval envelope');
    expect(caption).toContain('passed the current approximation-quality threshold');
    expect(caption).toContain('historical result is shown for comparison');
    expect(caption).toContain('demo');
    expect(caption).not.toMatch(/confidence|experimentally validated|caused/i);
    expect(values).toMatchObject({
      run_id: result.id,
      completed_at: result.completedAt,
      engine_version: result.engineVersion,
      mode: result.mode,
      network_id: result.networkId,
      uncertainty_method: 'parameter-interval envelope',
      experimental_validity: result.experimentalValidity,
    });
    expect(values.ann_approximation).toBe('Passed the current approximation-quality threshold');

    const hiddenModel = createBfnChartModel({
      project,
      result,
      comparison,
      viewState: {
        ...defaultBfnChartViewState(result),
        showUncertainty: false,
        showAnn: false,
      },
      geometry,
      translate: (key) => key,
    });
    const hiddenCaption = createBfnFigureCaption({ project, result, model: hiddenModel, comparison });
    expect(hiddenCaption).not.toContain('uncertainty is shown');
    expect(hiddenCaption).not.toContain('ANN approximation passed');
    expect(hiddenCaption).toContain('historical result is shown for comparison');

    const noComparisonModel = createBfnChartModel({
      project,
      result,
      viewState: defaultBfnChartViewState(result),
      geometry,
      translate: (key) => key,
    });
    const noComparisonCaption = createBfnFigureCaption({ project, result, model: noComparisonModel, comparison });
    expect(noComparisonCaption).not.toContain('historical result is shown for comparison');

    result.points = [
      { ...result.points[0]!, coordinate: 2, inputs: { 'source-ahl': 2 }, timeHours: 0 },
      { ...result.points[0]!, coordinate: 4, inputs: { 'source-ahl': 4 }, timeHours: 3.5 },
    ];
    const rangeValues = Object.fromEntries(createBfnProvenanceRows({ result }).map((row) => [row.key, row.value]));
    expect(rangeValues.primary_input_range).toBe('2–4');
    expect(rangeValues.time_range_hours).toBe('0–3.5');
  });
  it('applies custom localized caption segments while preserving scientific visibility and status logic', () => {
    const { project, result, comparison, model } = chartFixture();
    const captionText = {
      lead: '本地化主句',
      uncertainty: '本地化不确定性',
      annAccepted: '本地化 ANN 通过',
      annRejected: '本地化 ANN 未通过',
      comparison: '本地化历史对照',
      separator: '；',
      terminator: '。',
    };

    expect(createBfnFigureCaption({ project, result, model, comparison, captionText })).toBe(
      '本地化主句；本地化不确定性；本地化 ANN 通过；本地化历史对照。',
    );

    const rejectedResult = {
      ...result,
      annApproximation: result.annApproximation
        ? { ...result.annApproximation, status: 'rejected' as const }
        : null,
    };
    const rejectedModel = createBfnChartModel({
      project,
      result: rejectedResult,
      comparison,
      viewState: defaultBfnChartViewState(rejectedResult),
      geometry,
      translate: (key) => key,
    });
    const rejectedCaption = createBfnFigureCaption({
      project,
      result: rejectedResult,
      model: rejectedModel,
      comparison,
      captionText,
    });
    expect(rejectedCaption).toContain('本地化 ANN 未通过');
    expect(rejectedCaption).not.toContain('本地化 ANN 通过');
  });
});

describe('PNG export', () => {
  it('renders the standalone SVG to an exactly 3x canvas with a white background', async () => {
    const { result, model } = chartFixture();
    const svg = serializeBfnFigureSvg({ model, result });
    const fillRect = vi.fn();
    const drawImage = vi.fn();
    const context: BfnPngCanvasContext = { fillStyle: '', fillRect, drawImage };
    const png = new Blob(['png'], { type: 'image/png' });
    const canvas: BfnPngCanvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toBlob: (callback, type) => callback(type === 'image/png' ? png : null),
    };
    const createCanvas = vi.fn(() => canvas);
    const image = document.createElement('img');

    const blob = await renderBfnFigurePng(svg, {
      environment: {
        createCanvas,
        loadSvgImage: vi.fn(() => Promise.resolve(image)),
      },
    });

    expect(createCanvas).toHaveBeenCalledOnce();
    expect(canvas.width).toBe(2280);
    expect(canvas.height).toBe(900);
    expect(context.fillStyle).toBe('#ffffff');
    expect(fillRect).toHaveBeenCalledWith(0, 0, 2280, 900);
    expect(drawImage).toHaveBeenCalledWith(image, 0, 0, 2280, 900);
    expect(blob).toBe(png);
  });
});
