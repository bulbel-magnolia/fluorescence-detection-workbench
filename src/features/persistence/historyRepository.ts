import { isTauri } from '@tauri-apps/api/core';
import Database from '@tauri-apps/plugin-sql';
import type {
  AnalysisResult,
  DataOrigin,
  Hc08dSampleFrame,
  Hc08dSignalField,
  HistoryRecord,
  RecordResult,
  SyncState,
} from '../../domain/types';

export interface HistoryRepository {
  load(): Promise<HistoryRecord[]>;
  upsert(record: HistoryRecord): Promise<void>;
  remove(recordId: string): Promise<void>;
  pendingCount(): Promise<number>;
}

const localKey = 'fluorescence-desktop.history.v1';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAnalysisResult(value: unknown): value is AnalysisResult {
  if (!isRecord(value) || value.schemaVersion !== 1) return false;
  if (value.resultStatus === 'ERROR') {
    return isRecord(value.error) && value.error.code === 'INVALID_INPUT';
  }
  return (
    (value.resultStatus === 'OK' || value.resultStatus === 'PARTIAL') &&
    isRecord(value.channels) &&
    isRecord(value.quality)
  );
}

const signalFields: readonly Hc08dSignalField[] = ['480', '515', '555', 'CLR'];

function isUint16(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 65_535;
}

function isHc08dFrame(value: unknown): value is Hc08dSampleFrame {
  return (
    isRecord(value) &&
    typeof value.sequence === 'number' &&
    Number.isInteger(value.sequence) &&
    value.sequence >= 0 &&
    typeof value.receivedAt === 'string' &&
    typeof value.elapsedMs === 'number' &&
    Number.isFinite(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    isUint16(value.signal480) &&
    isUint16(value.signal515) &&
    isUint16(value.signal555) &&
    isUint16(value.clearSignal) &&
    Array.isArray(value.saturatedFields) &&
    value.saturatedFields.every(
      (field) => typeof field === 'string' && signalFields.some((candidate) => candidate === field),
    ) &&
    new Set(value.saturatedFields).size === value.saturatedFields.length &&
    typeof value.rawLine === 'string'
  );
}

function isRecordResult(value: unknown): value is RecordResult {
  if (isAnalysisResult(value)) return true;
  return (
    isRecord(value) &&
    value.schemaVersion === 1 &&
    typeof value.sessionId === 'string' &&
    typeof value.sampleId === 'string' &&
    value.resultStatus === 'RAW_ONLY' &&
    Array.isArray(value.frames) &&
    value.frames.every(isHc08dFrame) &&
    value.protocolVersion === 'HC08D-ASCII-DRAFT-0.2' &&
    value.algorithmVersion === null &&
    value.calibrationVersion === null &&
    value.isDemo === false &&
    typeof value.disclaimer === 'string'
  );
}

const origins: readonly DataOrigin[] = ['demo-live', 'real-live', 'json-import', 'csv-import'];
const syncStates: readonly SyncState[] = [
  'local-only',
  'pending',
  'retrying',
  'synced',
  'sync-error',
  'pending-delete',
];

function isHistoryRecord(value: unknown): value is HistoryRecord {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.sampleId === 'string' &&
    typeof value.createdAt === 'string' &&
    typeof value.origin === 'string' &&
    origins.some((origin) => origin === value.origin) &&
    typeof value.isDemo === 'boolean' &&
    typeof value.resultStatus === 'string' &&
    (typeof value.qualityGrade === 'string' || value.qualityGrade === null) &&
    typeof value.syncState === 'string' &&
    syncStates.some((state) => state === value.syncState) &&
    isRecordResult(value.result) &&
    value.resultStatus === value.result.resultStatus &&
    value.isDemo === value.result.isDemo
  );
}

export class LocalHistoryRepository implements HistoryRepository {
  load(): Promise<HistoryRecord[]> {
    const raw = localStorage.getItem(localKey);
    if (!raw) return Promise.resolve([]);
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      return Promise.resolve([]);
    }
    if (!Array.isArray(parsed)) return Promise.resolve([]);
    return Promise.resolve(
      parsed.filter(isHistoryRecord).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    );
  }

  async upsert(record: HistoryRecord): Promise<void> {
    const current = await this.load();
    const next = [record, ...current.filter((item) => item.id !== record.id)];
    localStorage.setItem(localKey, JSON.stringify(next));
  }

  async remove(recordId: string): Promise<void> {
    const current = await this.load();
    localStorage.setItem(localKey, JSON.stringify(current.filter((item) => item.id !== recordId)));
  }

  async pendingCount(): Promise<number> {
    return (await this.load()).filter((record) => record.syncState !== 'synced').length;
  }
}

interface HistoryRow {
  id: string;
  sample_id: string;
  created_at: string;
  origin: DataOrigin;
  is_demo: number;
  result_status: RecordResult['resultStatus'];
  quality_grade: string | null;
  sync_state: SyncState;
  result_json: string;
}

interface CountRow {
  count: number;
}

class SqliteHistoryRepository implements HistoryRepository {
  private database: Promise<Database> | null = null;

  async load(): Promise<HistoryRecord[]> {
    const database = await this.db();
    const rows = await database.select<HistoryRow[]>(
      `SELECT id, sample_id, created_at, origin, is_demo, result_status,
              quality_grade, sync_state, result_json
       FROM detection_records
       ORDER BY created_at DESC`,
    );
    const records: HistoryRecord[] = [];
    for (const row of rows) {
      let result: unknown;
      try {
        result = JSON.parse(row.result_json) as unknown;
      } catch {
        continue;
      }
      if (!isRecordResult(result)) continue;
      records.push({
        id: row.id,
        sampleId: row.sample_id,
        createdAt: row.created_at,
        origin: row.origin,
        isDemo: row.is_demo === 1,
        resultStatus: row.result_status,
        qualityGrade: row.quality_grade,
        syncState: row.sync_state,
        result,
      });
    }
    return records;
  }

  async upsert(record: HistoryRecord): Promise<void> {
    const database = await this.db();
    const result = record.result;
    const algorithmVersion = result.algorithmVersion;
    const protocolVersion = result.protocolVersion;
    const calibrationVersion = result.calibrationVersion;
    const now = new Date().toISOString();
    const resultJson = JSON.stringify(result);
    await database.execute('BEGIN IMMEDIATE');
    try {
      await database.execute(
        `INSERT INTO detection_records (
           id, sample_id, created_at, origin, is_demo, result_status, quality_grade,
           sync_state, algorithm_version, protocol_version, calibration_version,
           result_json, revision, updated_at
         ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
         ON CONFLICT(id) DO UPDATE SET
           sample_id = excluded.sample_id,
           origin = excluded.origin,
           is_demo = excluded.is_demo,
           result_status = excluded.result_status,
           quality_grade = excluded.quality_grade,
           sync_state = excluded.sync_state,
           algorithm_version = excluded.algorithm_version,
           protocol_version = excluded.protocol_version,
           calibration_version = excluded.calibration_version,
           result_json = excluded.result_json,
           revision = detection_records.revision + 1,
           updated_at = excluded.updated_at`,
        [
          record.id,
          record.sampleId,
          record.createdAt,
          record.origin,
          record.isDemo ? 1 : 0,
          record.resultStatus,
          record.qualityGrade,
          record.syncState,
          algorithmVersion,
          protocolVersion,
          calibrationVersion,
          resultJson,
          now,
        ],
      );
      await database.execute('DELETE FROM channel_samples WHERE record_id = ?', [record.id]);
      await database.execute('DELETE FROM hc08d_frames WHERE record_id = ?', [record.id]);
      if (result.resultStatus === 'OK' || result.resultStatus === 'PARTIAL') {
        for (const [channelId, channel] of Object.entries(result.channels)) {
          for (const sample of channel?.curve ?? []) {
            await database.execute(
              `INSERT INTO channel_samples (
                 record_id, channel_id, sequence, timestamp, elapsed_ms,
                 raw_signal, background, corrected_signal, unit
               ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                record.id,
                channelId,
                sample.sequence,
                sample.timestamp,
                sample.elapsedMs,
                sample.rawSignal,
                sample.background,
                sample.correctedSignal,
                sample.unit,
              ],
            );
          }
        }
      } else if (result.resultStatus === 'RAW_ONLY') {
        for (const frame of result.frames) {
          const saturationMask = frame.saturatedFields.reduce((mask, field) => {
            const bit = signalFields.indexOf(field);
            return bit < 0 ? mask : mask | (1 << bit);
          }, 0);
          await database.execute(
            `INSERT INTO hc08d_frames (
               record_id, sequence, received_at, elapsed_ms,
               signal_480, signal_515, signal_555, clear_signal,
               saturation_mask, raw_line
             ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              record.id,
              frame.sequence,
              frame.receivedAt,
              frame.elapsedMs,
              frame.signal480,
              frame.signal515,
              frame.signal555,
              frame.clearSignal,
              saturationMask,
              frame.rawLine,
            ],
          );
        }
      }
      await database.execute(
        `INSERT INTO sync_queue (
           id, record_id, operation, state, attempt_count, payload_json,
           created_at, updated_at
         ) VALUES (?, ?, 'upsert', 'pending', 0, ?, ?, ?)
         ON CONFLICT(record_id, operation) DO UPDATE SET
           state = 'pending',
           payload_json = excluded.payload_json,
           updated_at = excluded.updated_at`,
        [`sync-${record.id}-upsert`, record.id, resultJson, now, now],
      );
      await database.execute('COMMIT');
    } catch (error) {
      await database.execute('ROLLBACK');
      throw error;
    }
  }

  async remove(recordId: string): Promise<void> {
    const database = await this.db();
    await database.execute('DELETE FROM detection_records WHERE id = ?', [recordId]);
  }

  async pendingCount(): Promise<number> {
    const database = await this.db();
    const rows = await database.select<CountRow[]>(
      `SELECT COUNT(*) AS count FROM sync_queue
       WHERE state IN ('pending', 'retrying', 'sync-error', 'pending-delete')`,
    );
    return rows[0]?.count ?? 0;
  }

  private db(): Promise<Database> {
    this.database ??= Database.load('sqlite:fluorescence.db');
    return this.database;
  }
}

let repository: HistoryRepository | null = null;

export function getHistoryRepository(): HistoryRepository {
  repository ??= isTauri() ? new SqliteHistoryRepository() : new LocalHistoryRepository();
  return repository;
}
