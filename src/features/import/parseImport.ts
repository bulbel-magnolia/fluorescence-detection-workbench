import Papa from 'papaparse';
import type {
  AnalysisChannelInput,
  AnalysisInput,
  AnalysisResult,
  ChannelId,
  FluorescenceSample,
} from '../../domain/types';
import { analyze } from '../analysis/analyze';

const requiredColumns = [
  'channelId',
  'sequence',
  'timestamp',
  'elapsedMs',
  'rawSignal',
  'background',
] as const;

export interface ImportPreview {
  fileName: string;
  format: 'json' | 'csv';
  rowCount: number;
  channelCount: number;
  result: AnalysisResult;
}

export class ImportFileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ImportFileError';
  }
}

function channelId(value: string): ChannelId {
  const normalized = value.trim();
  if (normalized !== 'channel1' && normalized !== 'channel2' && normalized !== 'channel3') {
    throw new ImportFileError(`Unsupported channelId: ${value}`);
  }
  return normalized;
}

function numeric(value: string, field: string, row: number): number {
  const result = Number(value);
  if (!Number.isFinite(result)) {
    throw new ImportFileError(`Row ${row}: ${field} must be a finite number.`);
  }
  return result;
}

function csvInput(text: string, fileName: string): AnalysisInput {
  const parsed = Papa.parse<Record<string, string>>(text, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (header) => header.trim(),
  });
  if (parsed.errors.length > 0) {
    const first = parsed.errors[0]!;
    throw new ImportFileError(`CSV row ${first.row ?? 0}: ${first.message}`);
  }
  const fields = parsed.meta.fields ?? [];
  const missing = requiredColumns.filter((column) => !fields.includes(column));
  if (missing.length > 0) {
    throw new ImportFileError(`Missing CSV columns: ${missing.join(', ')}`);
  }
  if (parsed.data.length === 0) {
    throw new ImportFileError('CSV contains no data rows.');
  }

  const grouped = new Map<ChannelId, FluorescenceSample[]>();
  parsed.data.forEach((row, index) => {
    const number = index + 2;
    const id = channelId(row.channelId ?? '');
    const sequence = numeric(row.sequence ?? '', 'sequence', number);
    if (!Number.isInteger(sequence) || sequence < 0) {
      throw new ImportFileError(`Row ${number}: sequence must be a non-negative integer.`);
    }
    const sample: FluorescenceSample = {
      sequence,
      timestamp: row.timestamp ?? '',
      elapsedMs: numeric(row.elapsedMs ?? '', 'elapsedMs', number),
      rawSignal: numeric(row.rawSignal ?? '', 'rawSignal', number),
      background: numeric(row.background ?? '', 'background', number),
      unit: 'a.u.',
    };
    grouped.set(id, [...(grouped.get(id) ?? []), sample]);
  });

  const ids = [...grouped.keys()].sort();
  if (ids.length !== 1 && ids.length !== 3) {
    throw new ImportFileError('CSV must contain either one channel or all three channels.');
  }
  const slopes: Record<ChannelId, number> = {
    channel1: 10,
    channel2: 20,
    channel3: 5,
  };
  const channels: AnalysisChannelInput[] = ids.map((id) => ({
    channelId: id,
    calibration: {
      model: 'linear',
      slope: slopes[id],
      intercept: 0,
      inputValidRange: [0, 1500],
      concentrationUnit: 'demo-unit',
      isDemo: true,
    },
    samples: grouped.get(id) ?? [],
  }));
  const stem = fileName.replace(/\.[^.]+$/, '').replace(/[^a-zA-Z0-9_-]/g, '-');
  return {
    schemaVersion: 1,
    sessionId: `import-${Date.now()}`,
    sampleId: parsed.data[0]?.sampleId?.trim() || stem || 'csv-import',
    mode: ids.length === 3 ? 'three_channel' : 'single_channel',
    requiredChannelIds: ids,
    protocolVersion: 'IMPORT-CSV-1',
    algorithmVersion: 'ANALYSIS-DEMO-0.1',
    calibrationVersion: 'CAL-DEMO-0.1',
    summaryWindow: 5,
    channels,
    qualityModel: null,
  };
}

export function parseCsvText(text: string, fileName = 'import.csv'): ImportPreview {
  const input = csvInput(text, fileName);
  const result = analyze(input);
  return {
    fileName,
    format: 'csv',
    rowCount: input.channels.reduce((sum, channel) => sum + channel.samples.length, 0),
    channelCount: input.channels.length,
    result,
  };
}

export function parseJsonText(text: string, fileName = 'import.json'): ImportPreview {
  let payload: unknown;
  try {
    payload = JSON.parse(text) as unknown;
  } catch (error) {
    throw new ImportFileError(
      error instanceof Error ? `Invalid JSON: ${error.message}` : 'Invalid JSON.',
    );
  }
  const result = analyze(payload);
  const channelCount = result.resultStatus === 'ERROR' ? 0 : Object.keys(result.channels).length;
  const rowCount =
    result.resultStatus === 'ERROR'
      ? 0
      : Object.values(result.channels).reduce(
          (sum, channel) => sum + (channel?.sampleCount ?? 0),
          0,
        );
  return { fileName, format: 'json', rowCount, channelCount, result };
}

export async function parseImportFile(file: File): Promise<ImportPreview> {
  if (file.size > 10 * 1024 * 1024) {
    throw new ImportFileError('File exceeds the 10 MB import limit.');
  }
  const text = await file.text();
  const extension = file.name.split('.').at(-1)?.toLowerCase();
  if (extension === 'json') {
    return parseJsonText(text, file.name);
  }
  if (extension === 'csv') {
    return parseCsvText(text, file.name);
  }
  throw new ImportFileError('Only JSON and CSV files are supported.');
}
