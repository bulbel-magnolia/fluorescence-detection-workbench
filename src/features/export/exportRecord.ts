import { isTauri } from '@tauri-apps/api/core';
import { save } from '@tauri-apps/plugin-dialog';
import { writeTextFile } from '@tauri-apps/plugin-fs';
import type { HistoryRecord } from '../../domain/types';

export type ExportFormat = 'json' | 'csv';

function csvCell(value: string | number | boolean | null): string {
  if (value === null) return '';
  const text = String(value);
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function recordToCsv(record: HistoryRecord): string {
  if (record.result.resultStatus === 'RAW_ONLY') {
    const header = [
      'recordId',
      'sampleId',
      'sequence',
      'receivedAt',
      'elapsedMs',
      'signal480',
      'signal515',
      'signal555',
      'clearSignal',
      'saturatedFields',
      'protocolVersion',
      'isDemo',
    ];
    const rows = record.result.frames.map((frame) => [
      record.id,
      record.sampleId,
      frame.sequence,
      frame.receivedAt,
      frame.elapsedMs,
      frame.signal480,
      frame.signal515,
      frame.signal555,
      frame.clearSignal,
      frame.saturatedFields.join('|'),
      record.result.protocolVersion,
      record.isDemo,
    ]);
    return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
  }

  const header = [
    'recordId',
    'sampleId',
    'channelId',
    'sequence',
    'timestamp',
    'elapsedMs',
    'rawSignal',
    'background',
    'correctedSignal',
    'unit',
    'algorithmVersion',
    'protocolVersion',
    'calibrationVersion',
    'isDemo',
  ];
  const result = record.result;
  if (result.resultStatus === 'ERROR') {
    return `${header.join(',')}\n`;
  }
  const rows = Object.entries(result.channels).flatMap(([channelId, channel]) =>
    (channel?.curve ?? []).map((sample) => [
      record.id,
      record.sampleId,
      channelId,
      sample.sequence,
      sample.timestamp,
      sample.elapsedMs,
      sample.rawSignal,
      sample.background,
      sample.correctedSignal,
      sample.unit,
      result.algorithmVersion,
      result.protocolVersion,
      result.calibrationVersion,
      record.isDemo,
    ]),
  );
  return [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

function content(record: HistoryRecord, format: ExportFormat): string {
  return format === 'json' ? `${JSON.stringify(record, null, 2)}\n` : recordToCsv(record);
}

function safeName(value: string): string {
  return value.replace(/[^a-zA-Z0-9_-]/g, '-').replace(/-+/g, '-');
}

export async function exportRecord(record: HistoryRecord, format: ExportFormat): Promise<boolean> {
  const fileName = `${safeName(record.sampleId)}-${record.id.slice(-8)}.${format}`;
  const text = content(record, format);
  if (isTauri()) {
    const path = await save({
      defaultPath: fileName,
      filters: [
        {
          name: format === 'json' ? 'JSON' : 'CSV',
          extensions: [format],
        },
      ],
    });
    if (!path) return false;
    await writeTextFile(path, text);
    return true;
  }
  const url = URL.createObjectURL(
    new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv' }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
  return true;
}
