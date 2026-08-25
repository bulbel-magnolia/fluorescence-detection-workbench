import type { BfnProject, BfnSimulationPoint, BfnSimulationResult } from './types';

export type BfnChartScale = 'linear' | 'log';

export type BfnChartDomainMode = 'auto' | 'manual';

export type BfnChartAxis = 'x' | 'y';

export type BfnChartDomain = readonly [number, number];

export interface BfnChartDomainObject {
  minimum: number;
  maximum: number;
}

export interface BfnChartViewState {
  xScale: BfnChartScale;
  yScale: BfnChartScale;
  xDomainMode: BfnChartDomainMode;
  yDomainMode: BfnChartDomainMode;
  xMinimum?: number;
  xMaximum?: number;
  yMinimum?: number;
  yMaximum?: number;
  showFullModel: boolean;
  showUncertainty: boolean;
  showAnn: boolean;
  cursorIndex: number | null;
}

export interface BfnChartComparison {
  result: BfnSimulationResult;
  label: string;
}

/** A shape accepted by the pure series-selection helpers. */
export interface BfnChartVisibility {
  full?: boolean;
  uncertainty?: boolean;
  ann?: boolean;
  showFullModel?: boolean;
  showUncertainty?: boolean;
  showAnn?: boolean;
}

export interface BfnChartScaleFunctions {
  readonly domain: BfnChartDomain;
  readonly range: BfnChartDomain;
  readonly scale: BfnChartScale;
  map(value: number): number;
  invert(value: number): number;
}

export interface BfnChartTick {
  value: number;
  position: number;
  label: string;
  major: boolean;
}

export interface BfnChartPadding {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface BfnChartGeometry {
  width: number;
  height: number;
  padding: BfnChartPadding;
}

export type BfnChartSeriesKind = 'full' | 'uncertainty' | 'ann' | 'comparison';

export interface BfnChartSeriesPoint {
  index: number;
  coordinate: number;
  value: number;
  x: number;
  y: number;
}

export interface BfnChartSeries {
  kind: BfnChartSeriesKind;
  label: string;
  visible: boolean;
  path: string;
  band?: string;
  points: readonly BfnChartSeriesPoint[];
  resultId?: string;
}

export interface BfnChartLabels {
  x: string;
  y: string;
  xEntity?: string;
  xUnit?: string;
  yEntity?: string;
  yUnit?: string;
}

export type BfnChartValidationReason =
  | 'minimum_not_less_than_maximum'
  | 'log_domain_requires_positive_values'
  | 'domain_values_must_be_finite'
  | 'no_visible_values'
  | 'non_positive_visible_value'
  | 'no_positive_values'
  | 'invalid_domain';

export type BfnChartValidationResult =
  | { valid: true }
  | { valid: false; reason: BfnChartValidationReason; axis?: BfnChartAxis; value?: number };

export type BfnChartCoordinateValidation =
  | { valid: true }
  | { valid: false; reason: 'coordinates_must_be_finite_and_ascending' };

export type BfnChartDomainResolution =
  | { valid: true; domain: BfnChartDomain }
  | { valid: false; reason: BfnChartValidationReason; value?: number };

export interface BfnChartCursor {
  index: number;
  coordinate: number;
  x: number;
  y: number;
  point: BfnSimulationPoint;
  value: number;
  lower?: number;
  upper?: number;
}

export interface BfnChartModel {
  geometry: BfnChartGeometry;
  labels: BfnChartLabels;
  domains: {
    x: BfnChartDomain;
    y: BfnChartDomain;
  };
  /** Scale functions applied to geometry; requestedScales preserves the user request when a fallback is used. */
  scales: {
    x: BfnChartScaleFunctions;
    y: BfnChartScaleFunctions;
  };
  requestedScales: {
    x: BfnChartScale;
    y: BfnChartScale;
  };
  coordinateValidation: {
    result: BfnChartCoordinateValidation;
    comparison?: BfnChartCoordinateValidation;
  };
  ticks: {
    x: readonly BfnChartTick[];
    y: readonly BfnChartTick[];
  };
  series: {
    full?: BfnChartSeries;
    uncertainty?: BfnChartSeries;
    ann?: BfnChartSeries;
    comparison?: BfnChartSeries;
  };
  cursor?: BfnChartCursor;
  validation: {
    xLog: BfnChartValidationResult;
    yLog: BfnChartValidationResult;
    xDomain: BfnChartValidationResult;
    yDomain: BfnChartValidationResult;
  };
}

export type BfnChartTranslate = (key: string) => string;

export interface CreateBfnChartModelInput {
  project: BfnProject;
  result: BfnSimulationResult;
  comparison?: BfnChartComparison;
  viewState: BfnChartViewState;
  geometry: BfnChartGeometry;
  translate: BfnChartTranslate;
}

export function defaultBfnChartViewState(result: BfnSimulationResult): BfnChartViewState {
  return {
    xScale: 'linear',
    yScale: 'linear',
    xDomainMode: 'auto',
    yDomainMode: 'auto',
    showFullModel: true,
    showUncertainty: true,
    showAnn: result.annApproximation !== null,
    cursorIndex: null,
  };
}
