import type { BfnChartComparison, BfnChartModel, BfnChartSeries } from './chartTypes';
import type { BfnProject, BfnSimulationResult } from './types';

export interface SerializeBfnFigureSvgOptions {
  model: BfnChartModel;
  result: BfnSimulationResult;
  comparison?: BfnChartComparison;
  title?: string;
  description?: string;
}

export interface SerializeBfnResultTableOptions {
  project: BfnProject;
  current: BfnSimulationResult;
  comparison?: BfnChartComparison;
  delimiter?: string;
  bom?: boolean;
}

export interface BfnProvenanceRow {
  key: string;
  value: string;
}

export interface CreateBfnExportFilenameOptions {
  project: BfnProject;
  result: BfnSimulationResult;
  artifact: string;
  extension: string;
}

export interface CreateBfnFigureCaptionOptions {
  project: BfnProject;
  result: BfnSimulationResult;
  model: BfnChartModel;
  comparison?: BfnChartComparison;
  captionText?: BfnFigureCaptionText;
}

export interface BfnFigureCaptionText {
  lead: string;
  uncertainty: string;
  annAccepted: string;
  annRejected: string;
  comparison: string;
  separator?: string;
  terminator?: string;
}

export interface CreateBfnProvenanceRowsOptions {
  result: BfnSimulationResult;
}

/** The small canvas surface used by the PNG renderer and its tests. */
export interface BfnPngCanvasContext {
  fillStyle: string | CanvasGradient | CanvasPattern;
  fillRect(x: number, y: number, width: number, height: number): void;
  drawImage(image: unknown, dx: number, dy: number, dWidth: number, dHeight: number): void;
}

export interface BfnPngCanvas {
  width: number;
  height: number;
  getContext(contextId: '2d'): BfnPngCanvasContext | null;
  toBlob(callback: (blob: Blob | null) => void, type?: string, quality?: number): void;
}

export interface BfnPngImage {
  width?: number;
  height?: number;
}

export interface BfnPngEnvironment {
  createCanvas?: (width?: number, height?: number) => BfnPngCanvas;
  loadSvgImage?: (svg: string) => Promise<BfnPngImage>;
}

export interface RenderBfnFigurePngOptions {
  environment?: BfnPngEnvironment;
}

const SERIES_COLORS: Record<'full' | 'uncertainty' | 'ann' | 'comparison', string> = {
  full: '#0b4f71',
  uncertainty: '#65bfc7',
  ann: '#c23a89',
  comparison: '#64748b',
};

const SERIES_LABELS: Record<'full' | 'uncertainty' | 'ann' | 'comparison', string> = {
  full: 'Full model',
  uncertainty: 'Uncertainty',
  ann: 'ANN approximation',
  comparison: 'Comparison',
};

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function numberText(value: number): string {
  return Number.isFinite(value) ? String(value) : '';
}

function seriesPathData(
  series: BfnChartSeries,
  kind: 'full' | 'uncertainty' | 'ann' | 'comparison',
): string {
  if (kind !== 'uncertainty') return series.path;
  return (series.band ?? '').trim().length > 0 ? series.band! : series.path;
}

function seriesRenderable(
  series: BfnChartSeries,
  kind: 'full' | 'uncertainty' | 'ann' | 'comparison',
): boolean {
  return series.visible && seriesPathData(series, kind).trim().length > 0;
}

function pathElement(
  series: BfnChartSeries,
  color: string,
  kind: 'full' | 'uncertainty' | 'ann' | 'comparison',
): string {
  const path = seriesPathData(series, kind);
  if (!seriesRenderable(series, kind)) return '';
  if (kind === 'uncertainty') {
    return `<path data-series="uncertainty" d="${escapeXml(path)}" fill="${color}" fill-opacity="0.22" stroke="none" style="fill:${color};fill-opacity:0.22;stroke:none"/>`;
  }
  const dash = kind === 'comparison' ? ' stroke-dasharray="6 4"' : '';
  const dashStyle = kind === 'comparison' ? 'stroke-dasharray:6 4;' : '';
  return `<path data-series="${kind}" d="${escapeXml(path)}" fill="none" stroke="${color}" stroke-width="2.25"${dash} stroke-linecap="round" stroke-linejoin="round" style="fill:none;stroke:${color};stroke-width:2.25;${dashStyle}stroke-linecap:round;stroke-linejoin:round"/>`;
}

function seriesLegend(series: BfnChartSeries, color: string, kind: 'full' | 'uncertainty' | 'ann' | 'comparison', index: number): string {
  if (!seriesRenderable(series, kind)) return '';
  const label = series.label.trim().length > 0 ? series.label : SERIES_LABELS[kind];
  const y = 18 + index * 19;
  const swatch = kind === 'uncertainty'
    ? `<rect x="0" y="${y - 9}" width="20" height="10" fill="${color}" fill-opacity="0.22" stroke="${color}" style="fill:${color};fill-opacity:0.22;stroke:${color}"/>`
    : `<line x1="0" y1="${y - 4}" x2="20" y2="${y - 4}" stroke="${color}" stroke-width="2.25"${kind === 'comparison' ? ' stroke-dasharray="6 4"' : ''} style="stroke:${color};stroke-width:2.25;${kind === 'comparison' ? 'stroke-dasharray:6 4;' : ''}"/>`;
  return `<g data-role="legend-item" data-series="${kind}" transform="translate(0 0)">${swatch}<text x="28" y="${y}" fill="#203040" style="fill:#203040;font-size:11px">${escapeXml(label)}</text></g>`;
}

function tickMarkup(
  axis: 'x' | 'y',
  values: readonly { value: number; position: number; label: string }[],
  geometry: BfnChartModel['geometry'],
): string {
  return values
    .map((tick) => {
      if (!Number.isFinite(tick.position)) return '';
      if (axis === 'x') {
        const baseline = geometry.height - geometry.padding.bottom;
        return `<g data-axis="x" data-tick="${escapeXml(tick.label)}"><line x1="${numberText(tick.position)}" y1="${baseline}" x2="${numberText(tick.position)}" y2="${baseline + 5}" stroke="#637383" stroke-width="1" style="stroke:#637383;stroke-width:1"/><text x="${numberText(tick.position)}" y="${baseline + 19}" text-anchor="middle" fill="#203040" style="fill:#203040;font-size:11px">${escapeXml(tick.label)}</text></g>`;
      }
      const baseline = geometry.padding.left;
      return `<g data-axis="y" data-tick="${escapeXml(tick.label)}"><line x1="${baseline - 5}" y1="${numberText(tick.position)}" x2="${baseline}" y2="${numberText(tick.position)}" stroke="#637383" stroke-width="1" style="stroke:#637383;stroke-width:1"/><text x="${baseline - 9}" y="${numberText(tick.position + 4)}" text-anchor="end" fill="#203040" style="fill:#203040;font-size:11px">${escapeXml(tick.label)}</text></g>`;
    })
    .join('');
}

function defaultTitle(result: BfnSimulationResult): string {
  return `BFN ${result.mode} response`;
}

function defaultDescription(result: BfnSimulationResult): string {
  return `Vector response figure for run ${result.id}.`;
}

/**
 * Serialize the already-laid-out chart model as an independent SVG.
 * Screen-only interaction state is intentionally not represented here.
 */
export function serializeBfnFigureSvg({
  model,
  result,
  title,
  description,
}: SerializeBfnFigureSvgOptions): string {
  const { width, height, padding } = model.geometry;
  const xAxis = height - padding.bottom;
  const yAxis = padding.left;
  const full = model.series.full;
  const uncertainty = model.series.uncertainty;
  const ann = model.series.ann;
  const comparisonSeries = model.series.comparison;
  const seriesMarkup = [
    uncertainty ? pathElement(uncertainty, SERIES_COLORS.uncertainty, 'uncertainty') : '',
    comparisonSeries ? pathElement(comparisonSeries, SERIES_COLORS.comparison, 'comparison') : '',
    ann ? pathElement(ann, SERIES_COLORS.ann, 'ann') : '',
    full ? pathElement(full, SERIES_COLORS.full, 'full') : '',
  ].join('');
  const visibleSeries = [full, uncertainty, ann, comparisonSeries].filter(
    (series): series is BfnChartSeries => Boolean(series && seriesRenderable(series, series.kind)),
  );
  const legendMarkup = visibleSeries
    .map((series, index) => seriesLegend(series, SERIES_COLORS[series.kind], series.kind, index))
    .join('');
  const legendX = Math.max(padding.left + 12, width - padding.right - 170);
  const legendY = padding.top + 12;
  const xDomain = `${numberText(model.domains.x[0])} ${numberText(model.domains.x[1])}`;
  const yDomain = `${numberText(model.domains.y[0])} ${numberText(model.domains.y[1])}`;
  const titleText = title ?? defaultTitle(result);
  const descriptionText = description ?? defaultDescription(result);
  const axisMarkup = `${tickMarkup('x', model.ticks.x, model.geometry)}${tickMarkup('y', model.ticks.y, model.geometry)}`;
  const axisLabels = `<text x="${numberText(padding.left + (width - padding.left - padding.right) / 2)}" y="${numberText(height - 10)}" text-anchor="middle" fill="#203040" style="fill:#203040;font-size:12px;font-weight:600">${escapeXml(model.labels.x)}</text><text x="16" y="${numberText(padding.top + (height - padding.top - padding.bottom) / 2)}" transform="rotate(-90 16 ${numberText(padding.top + (height - padding.top - padding.bottom) / 2)})" text-anchor="middle" fill="#203040" style="fill:#203040;font-size:12px;font-weight:600">${escapeXml(model.labels.y)}</text>`;
  const metadata = `<metadata font-family="Arial, Helvetica, sans-serif" data-run-id="${escapeXml(result.id)}" data-engine-version="${escapeXml(result.engineVersion)}" data-mode="${escapeXml(result.mode)}" data-uncertainty-method="${escapeXml(result.uncertaintyMethod)}" data-model-versions="${escapeXml(result.modelVersions.join(','))}" data-context-ids="${escapeXml(result.contextIds.join(','))}"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${numberText(width)}" height="${numberText(height)}" viewBox="0 0 ${numberText(width)} ${numberText(height)}" role="img" aria-labelledby="bfn-figure-title bfn-figure-description" data-x-scale="${escapeXml(model.requestedScales.x)}" data-y-scale="${escapeXml(model.requestedScales.y)}" data-x-domain="${escapeXml(xDomain)}" data-y-domain="${escapeXml(yDomain)}" style="font-family:Arial, Helvetica, sans-serif;background:#ffffff"><title id="bfn-figure-title">${escapeXml(titleText)}</title><desc id="bfn-figure-description">${escapeXml(descriptionText)}</desc>${metadata}<rect x="0" y="0" width="${numberText(width)}" height="${numberText(height)}" fill="#ffffff" style="fill:#ffffff"/><g data-role="axes" fill="none" stroke="#637383" stroke-width="1" style="fill:none;stroke:#637383;stroke-width:1"><line x1="${numberText(yAxis)}" y1="${numberText(padding.top)}" x2="${numberText(yAxis)}" y2="${numberText(xAxis)}"/><line x1="${numberText(yAxis)}" y1="${numberText(xAxis)}" x2="${numberText(width - padding.right)}" y2="${numberText(xAxis)}"/></g>${axisMarkup}${seriesMarkup}${axisLabels}${legendMarkup ? `<g data-role="legend" transform="translate(${numberText(legendX)} ${numberText(legendY)})" style="font-family:Arial, Helvetica, sans-serif">${legendMarkup}</g>` : ''}</svg>`;
}

function stableUnique(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function sortedOrphans(all: ReadonlySet<string>, known: ReadonlySet<string>): string[] {
  return [...all].filter((id) => !known.has(id)).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
}

type TableCellValue = string | number | boolean | null | undefined;

function tableCell(value: TableCellValue, delimiter: string): string {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  if (raw.includes(delimiter) || raw.includes('"') || raw.includes('\r') || raw.includes('\n')) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

/** Export all raw point values in a stable, tidy CSV/TSV table. */
export function serializeBfnResultTable({
  project,
  current,
  comparison,
  delimiter = ',',
  bom = false,
}: SerializeBfnResultTableOptions): string {
  if (delimiter.length === 0 || delimiter.includes('\r') || delimiter.includes('\n') || delimiter.includes('"')) {
    throw new Error('Table delimiter must be a non-empty value without quotes or line breaks.');
  }
  const projectInputs = stableUnique(project.network.inputSources.map((source) => source.id));
  const projectModules = stableUnique(project.network.modules.map((module) => module.id));
  const allInputs = new Set<string>();
  const allModules = new Set<string>();
  for (const point of [
    ...current.points,
    ...(comparison?.result.points ?? []),
  ]) {
    Object.keys(point.inputs).forEach((id) => allInputs.add(id));
    Object.keys(point.moduleOutputs).forEach((id) => allModules.add(id));
  }
  const inputIds = [...projectInputs, ...sortedOrphans(allInputs, new Set(projectInputs))];
  const moduleIds = [...projectModules, ...sortedOrphans(allModules, new Set(projectModules))];
  const headers = [
    'run_id', 'run_role', 'completed_at', 'mode', 'coordinate', 'time_hours',
    ...inputIds.map((id) => `input:${id}`),
    ...moduleIds.map((id) => `module:${id}`),
    'output', 'lower', 'upper', 'extrapolated',
  ];
  const rows: TableCellValue[][] = [headers];
  const appendRows = (result: BfnSimulationResult, role: 'current' | 'comparison'): void => {
    for (const point of result.points) {
      rows.push([
        result.id,
        role,
        result.completedAt,
        result.mode,
        point.coordinate,
        point.timeHours,
        ...inputIds.map((id) => point.inputs[id]),
        ...moduleIds.map((id) => point.moduleOutputs[id]),
        point.output,
        point.lower,
        point.upper,
        point.extrapolated,
      ]);
    }
  };
  appendRows(current, 'current');
  if (comparison) appendRows(comparison.result, 'comparison');
  const body = rows.map((row) => row.map((value) => tableCell(value, delimiter)).join(delimiter)).join('\r\n');
  return `${bom ? '\ufeff' : ''}${body}\r\n`;
}

function sanitizeFilenamePart(value: string, fallback: string): string {
  const withoutControlCharacters = Array.from(
    value,
    (character) => character.charCodeAt(0) <= 0x1f ? '-' : character,
  ).join('');
  const replaced = withoutControlCharacters
    .trim()
    .replace(/[<>:"/\\|?*]+/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/[. ]+$/g, '')
    .replace(/^-+|-+$/g, '');
  if (replaced.length === 0) return fallback;
  if (/^(con|prn|aux|nul|clock\$|com[1-9]|lpt[1-9])(?:\.|$)/i.test(replaced)) return `bfn-${replaced}`;
  return replaced;
}

function compactTimestamp(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return sanitizeFilenamePart(value, 'unknown-time');
  return parsed.toISOString().replace(/\.\d{3}Z$/, 'Z').replace(/:/g, '');
}

export function createBfnExportFilename({
  project,
  result,
  artifact,
  extension,
}: CreateBfnExportFilenameOptions): string {
  const projectId = sanitizeFilenamePart(project.id, 'bfn-project');
  const networkId = sanitizeFilenamePart(project.network.id, 'network');
  const mode = sanitizeFilenamePart(result.mode, 'simulation');
  const time = compactTimestamp(result.completedAt);
  const artifactPart = sanitizeFilenamePart(artifact, 'export');
  const extensionPart = sanitizeFilenamePart(extension.replace(/^\.+/, ''), 'dat');
  return `${projectId}_${networkId}_${mode}_${time}_${artifactPart}.${extensionPart}`;
}

function seriesIsShown(series: BfnChartSeries | undefined): boolean {
  return Boolean(series && seriesRenderable(series, series.kind));
}

export function createBfnFigureCaption({
  project,
  result,
  model,
  comparison,
  captionText,
}: CreateBfnFigureCaptionOptions): string {
  const context = result.isDemo || project.isDemo ? 'demo ' : '';
  const axes = `${model.labels.y} versus ${model.labels.x}`;
  const parts = [captionText?.lead ?? `BFN ${context}${result.mode} response (${axes})`];
  if (result.uncertaintyMethod === 'parameter_interval_envelope' && seriesIsShown(model.series.uncertainty)) {
    parts.push(captionText?.uncertainty ?? 'uncertainty is shown as a parameter-interval envelope');
  }
  if (seriesIsShown(model.series.ann) && result.annApproximation?.status === 'accepted') {
    parts.push(captionText?.annAccepted ?? 'the ANN approximation passed the current approximation-quality threshold');
  } else if (seriesIsShown(model.series.ann) && result.annApproximation?.status === 'rejected') {
    parts.push(captionText?.annRejected ?? 'the ANN approximation did not pass the current approximation-quality threshold');
  }
  if (comparison && seriesIsShown(model.series.comparison)) {
    parts.push(captionText?.comparison ?? 'the historical result is shown for comparison');
  }
  return `${parts.join(captionText?.separator ?? '; ')}${captionText?.terminator ?? '.'}`;
}

function provenanceValue(value: string | number | boolean | readonly string[]): string {
  if (Array.isArray(value)) return value.join(', ');
  return String(value);
}

function finiteRange(values: readonly (number | undefined)[]): string {
  const finite = values.filter(
    (value): value is number => typeof value === 'number' && Number.isFinite(value),
  );
  if (finite.length === 0) return 'Not available';
  const minimum = Math.min(...finite);
  const maximum = Math.max(...finite);
  return minimum === maximum ? String(minimum) : `${String(minimum)}–${String(maximum)}`;
}

export function createBfnProvenanceRows({ result }: CreateBfnProvenanceRowsOptions): BfnProvenanceRow[] {
  const primaryInputRange = finiteRange(
    result.points.map((point) => point.inputs[result.primaryInputSourceId]),
  );
  const timeRangeHours = finiteRange(result.points.map((point) => point.timeHours));
  const rows: BfnProvenanceRow[] = [
    { key: 'run_id', value: result.id },
    { key: 'completed_at', value: result.completedAt },
    { key: 'engine_version', value: result.engineVersion },
    { key: 'mode', value: result.mode },
    { key: 'network_id', value: result.networkId },
    { key: 'primary_input_source_id', value: result.primaryInputSourceId },
    { key: 'output_monitor_id', value: result.outputMonitorId },
    { key: 'primary_input_range', value: primaryInputRange },
    { key: 'time_range_hours', value: timeRangeHours },
    {
      key: 'uncertainty_method',
      value: result.uncertaintyMethod === 'parameter_interval_envelope'
        ? 'parameter-interval envelope'
        : result.uncertaintyMethod,
    },
    { key: 'experimental_validity', value: result.experimentalValidity },
    { key: 'extrapolated', value: provenanceValue(result.extrapolated) },
    { key: 'is_demo', value: provenanceValue(result.isDemo) },
    { key: 'model_versions', value: provenanceValue(result.modelVersions) },
    { key: 'context_ids', value: provenanceValue(result.contextIds) },
    {
      key: 'ann_approximation',
      value: result.annApproximation
        ? result.annApproximation.status === 'accepted'
          ? 'Passed the current approximation-quality threshold'
          : 'Did not pass the current approximation-quality threshold'
        : 'Not available',
    },
  ];
  return rows;
}

function parseViewBox(svg: string): { width: number; height: number } {
  const viewBox = svg.match(/\bviewBox\s*=\s*["']\s*([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s+([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)\s*["']/i);
  if (!viewBox) throw new Error('SVG viewBox is required for PNG export.');
  const width = Number(viewBox[3]);
  const height = Number(viewBox[4]);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error('SVG viewBox must contain positive finite dimensions.');
  }
  return { width, height };
}

function defaultCreateCanvas(width: number, height: number): BfnPngCanvas {
  if (typeof document === 'undefined') throw new Error('Canvas export is unavailable outside a browser document.');
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function defaultLoadSvgImage(svg: string): Promise<BfnPngImage> {
  if (typeof document === 'undefined' || typeof Image === 'undefined') {
    return Promise.reject(new Error('SVG image loading is unavailable in this environment.'));
  }
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const urlApi = typeof URL !== 'undefined' ? URL : undefined;
  if (!urlApi?.createObjectURL) return Promise.reject(new Error('Object URL support is unavailable.'));
  const url = urlApi.createObjectURL(blob);
  return new Promise<BfnPngImage>((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      urlApi.revokeObjectURL?.(url);
      resolve(image);
    };
    image.onerror = () => {
      urlApi.revokeObjectURL?.(url);
      reject(new Error('SVG image could not be loaded.'));
    };
    image.src = url;
  });
}

/** Rasterize the standalone SVG at 3x viewBox dimensions onto an opaque white canvas. */
export async function renderBfnFigurePng(
  svg: string,
  { environment = {} }: RenderBfnFigurePngOptions = {},
): Promise<Blob> {
  const viewBox = parseViewBox(svg);
  const width = Math.round(viewBox.width * 3);
  const height = Math.round(viewBox.height * 3);
  const createCanvas = environment.createCanvas ?? ((canvasWidth?: number, canvasHeight?: number) => defaultCreateCanvas(canvasWidth ?? width, canvasHeight ?? height));
  const canvas = createCanvas(width, height);
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('A 2D canvas context is required for PNG export.');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, width, height);
  const loadSvgImage = environment.loadSvgImage ?? defaultLoadSvgImage;
  const image = await loadSvgImage(svg);
  context.drawImage(image, 0, 0, width, height);
  return new Promise<Blob>((resolve, reject) => {
    try {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Canvas could not produce a PNG blob.'));
      }, 'image/png');
    } catch (error) {
      reject(error instanceof Error ? error : new Error(String(error)));
    }
  });
}
