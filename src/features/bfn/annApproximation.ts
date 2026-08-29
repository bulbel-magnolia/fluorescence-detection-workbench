import type {
  BfnAnnApproximation,
  BfnProject,
  BfnSimulationPoint,
  BfnWorkingRangeSpecification,
} from './types';

function solveLinearSystem(matrix: number[][], vector: number[]): number[] | null {
  const size = vector.length;
  const augmented = matrix.map((row, index) => [...row, vector[index] ?? 0]);
  for (let pivot = 0; pivot < size; pivot += 1) {
    let bestRow = pivot;
    for (let row = pivot + 1; row < size; row += 1) {
      if (Math.abs(augmented[row]?.[pivot] ?? 0) > Math.abs(augmented[bestRow]?.[pivot] ?? 0)) {
        bestRow = row;
      }
    }
    if (Math.abs(augmented[bestRow]?.[pivot] ?? 0) < 1e-12) return null;
    [augmented[pivot], augmented[bestRow]] = [augmented[bestRow]!, augmented[pivot]!];
    const pivotValue = augmented[pivot]![pivot]!;
    for (let column = pivot; column <= size; column += 1) {
      augmented[pivot]![column] = augmented[pivot]![column]! / pivotValue;
    }
    for (let row = 0; row < size; row += 1) {
      if (row === pivot) continue;
      const factor = augmented[row]![pivot]!;
      for (let column = pivot; column <= size; column += 1) {
        augmented[row]![column] = augmented[row]![column]! - factor * augmented[pivot]![column]!;
      }
    }
  }
  return augmented.map((row) => row[size] ?? 0);
}

function fitAffine(rows: number[][], outputs: number[]): number[] | null {
  const columns = rows[0]?.length ?? 0;
  if (columns === 0 || rows.length < columns) return null;
  const xtx = Array.from({ length: columns }, () => Array(columns).fill(0) as number[]);
  const xty = Array(columns).fill(0) as number[];
  for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
    const row = rows[rowIndex]!;
    const output = outputs[rowIndex] ?? 0;
    for (let left = 0; left < columns; left += 1) {
      xty[left] = (xty[left] ?? 0) + (row[left] ?? 0) * output;
      for (let right = 0; right < columns; right += 1) {
        xtx[left]![right] = (xtx[left]![right] ?? 0) + (row[left] ?? 0) * (row[right] ?? 0);
      }
    }
  }
  return solveLinearSystem(xtx, xty);
}

export function buildAnnApproximation(
  project: BfnProject,
  points: readonly BfnSimulationPoint[],
): BfnAnnApproximation | null {
  if (project.network.mode !== 'static') return null;
  const rangeSources = project.network.inputSources.filter(
    (source): source is typeof source & { staticSpecification: BfnWorkingRangeSpecification } =>
      source.staticSpecification.type === 'working_range',
  );
  if (rangeSources.length === 0 || points.length < rangeSources.length + 2) return null;
  const rows = points.map((point) => [
    ...rangeSources.map((source) => point.inputs[source.id] ?? 0),
    1,
  ]);
  const outputs = points.map((point) => point.output);
  const coefficients = fitAffine(rows, outputs);
  if (!coefficients) return null;
  const weights = coefficients.slice(0, rangeSources.length);
  const effectiveIntercept = coefficients.at(-1) ?? 0;
  const predictions = rows.map((row) =>
    row.reduce((sum, value, index) => sum + value * (coefficients[index] ?? 0), 0),
  );
  const mean = outputs.reduce((sum, value) => sum + value, 0) / outputs.length;
  const residualSum = outputs.reduce(
    (sum, value, index) => sum + (value - (predictions[index] ?? 0)) ** 2,
    0,
  );
  const totalSum = outputs.reduce((sum, value) => sum + (value - mean) ** 2, 0);
  const r2 =
    totalSum <= Number.EPSILON
      ? residualSum <= Number.EPSILON
        ? 1
        : 0
      : 1 - residualSum / totalSum;
  const rmse = Math.sqrt(residualSum / outputs.length);
  const outputRange = Math.max(...outputs) - Math.min(...outputs);
  const nrmse =
    outputRange <= Number.EPSILON ? (rmse <= Number.EPSILON ? 0 : Infinity) : rmse / outputRange;
  const maximumAbsoluteError = Math.max(
    ...outputs.map((value, index) => Math.abs(value - (predictions[index] ?? 0))),
  );
  const hasPredictionIntervals = points.every(
    (point) =>
      point.lower !== null &&
      point.upper !== null &&
      Number.isFinite(point.lower) &&
      Number.isFinite(point.upper),
  );
  const predictionIntervalCoverage = hasPredictionIntervals
    ? points.filter((point, index) => {
        const prediction = predictions[index] ?? 0;
        return (
          point.lower !== null &&
          point.upper !== null &&
          prediction >= point.lower &&
          prediction <= point.upper
        );
      }).length / points.length
    : null;
  const status =
    r2 >= project.analysis.annThresholds.minimumR2 &&
    nrmse <= project.analysis.annThresholds.maximumNrmse
      ? 'accepted'
      : 'rejected';
  return {
    id: `ann-${project.network.id}-${Date.now()}`,
    sourceNetworkId: project.network.id,
    workingDomain: Object.fromEntries(
      rangeSources.map((source) => [
        source.id,
        [source.staticSpecification.minimum, source.staticSpecification.maximum] as const,
      ]),
    ),
    inputSourceIds: rangeSources.map((source) => source.id),
    weights,
    effectiveIntercept,
    metrics: { r2, nrmse, maximumAbsoluteError, predictionIntervalCoverage },
    thresholds: { ...project.analysis.annThresholds },
    status,
    representation: status === 'accepted' ? 'ann_affine_approximation' : 'full_nonlinear_model',
  };
}
