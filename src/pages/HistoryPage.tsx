import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { HistorySignalChart } from '../components/HistorySignalChart';
import { Icon } from '../components/Icon';
import { MetadataLabel } from '../components/MetadataLabel';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { TechnicalDetails } from '../components/TechnicalDetails';
import { TelemetryStrip } from '../components/TelemetryStrip';
import type { DataOrigin, HistoryRecord, SyncState } from '../domain/types';
import { exportRecord, type ExportFormat } from '../features/export/exportRecord';
import {
  buildHistoryPresentation,
  type HistorySeriesId,
  type HistorySignalMode,
} from '../features/history/historyPresentation';
import { useAppStore } from '../store/appStore';

const originTranslationKeys: Record<DataOrigin, string> = {
  'demo-live': 'history.originDemoLive',
  'real-live': 'history.originRealLive',
  'json-import': 'history.originJsonImport',
  'csv-import': 'history.originCsvImport',
};

const syncTranslationKeys: Record<SyncState, string> = {
  'local-only': 'history.localOnly',
  pending: 'history.pending',
  retrying: 'history.syncRetrying',
  synced: 'history.synced',
  'sync-error': 'history.syncError',
  'pending-delete': 'history.pendingDelete',
};

const resultTranslationKeys: Record<HistoryRecord['resultStatus'], string> = {
  OK: 'history.resultOk',
  PARTIAL: 'history.resultIncomplete',
  ERROR: 'history.resultError',
  RAW_ONLY: 'history.resultRawOnly',
};

const modeTranslationKeys: Record<HistorySignalMode, string> = {
  corrected: 'history.modeCorrected',
  raw: 'history.modeRaw',
  background: 'history.modeBackground',
};

function statusTone(status: HistoryRecord['resultStatus']): 'success' | 'warning' | 'danger' {
  if (status === 'OK') return 'success';
  if (status === 'ERROR') return 'danger';
  return 'warning';
}

function formatValue(value: number | null, notAvailable: string): string {
  return value === null ? notAvailable : `${value.toFixed(1)} a.u.`;
}

export function HistoryPage() {
  const { t, i18n } = useTranslation();
  const records = useAppStore((state) => state.history);
  const loadDemoHistoryRecord = useAppStore((state) => state.loadDemoHistoryRecord);
  const setSection = useAppStore((state) => state.setSection);
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id ?? null);
  const [signalMode, setSignalMode] = useState<HistorySignalMode>('corrected');
  const [visibleSeriesIds, setVisibleSeriesIds] = useState<Set<HistorySeriesId>>(new Set());
  const filtered = useMemo(
    () =>
      records.filter((record) =>
        record.sampleId.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
      ),
    [query, records],
  );
  const selected = filtered.find((record) => record.id === selectedId) ?? filtered[0];
  const presentation = useMemo(
    () => (selected ? buildHistoryPresentation(selected, signalMode) : null),
    [selected, signalMode],
  );
  const recordSummaries = useMemo(
    () =>
      new Map(
        records.map((record) => [record.id, buildHistoryPresentation(record, 'corrected').summary]),
      ),
    [records],
  );

  useEffect(() => {
    if (selectedId !== (selected?.id ?? null)) setSelectedId(selected?.id ?? null);
    if (!selected) {
      setSignalMode('corrected');
      setVisibleSeriesIds(new Set());
      return;
    }
    const next = buildHistoryPresentation(selected, 'corrected');
    setSignalMode(next.activeMode);
    setVisibleSeriesIds(new Set(next.series.map((item) => item.id)));
  }, [selected, selectedId]);

  const doExport = async (format: ExportFormat): Promise<void> => {
    if (selected) await exportRecord(selected, format);
  };

  const toggleSeries = (id: HistorySeriesId): void => {
    setVisibleSeriesIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        if (next.size === 1) return current;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectedDate = selected
    ? new Intl.DateTimeFormat(i18n.language, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(selected.createdAt))
    : null;

  return (
    <div className="page page--history">
      <PageHeader title={t('history.title')} subtitle={t('history.subtitle')} />
      <TelemetryStrip
        compact
        label={t('history.title')}
        items={[
          { label: t('common.archive'), value: t('history.count', { count: records.length }) },
          { label: t('history.search'), value: t('history.count', { count: filtered.length }) },
          {
            label: t('history.result'),
            value: selected ? t(resultTranslationKeys[selected.resultStatus]) : t('history.empty'),
            tone: selected?.resultStatus === 'ERROR' ? 'danger' : selected ? 'success' : 'neutral',
          },
          { label: t('overview.storage'), value: t('overview.storageLocal'), tone: 'accent' },
        ]}
      />

      <div className="history-workspace history-surface desktop-surface">
        <aside className="panel history-browser">
          <div className="history-toolbar">
            <label>
              <Icon name="scan" size={17} />
              <input
                type="search"
                value={query}
                placeholder={t('history.search')}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <MetadataLabel label={t('history.count', { count: filtered.length })} />
          </div>

          <div className="history-record-list" role="listbox" aria-label={t('history.title')}>
            {filtered.map((record) => {
              const summary = recordSummaries.get(record.id);
              return (
                <button
                  key={record.id}
                  type="button"
                  role="option"
                  aria-selected={selected?.id === record.id}
                  className={
                    selected?.id === record.id
                      ? 'history-record-row is-selected'
                      : 'history-record-row'
                  }
                  onClick={() => setSelectedId(record.id)}
                >
                  <span className="history-record-row__accent" data-status={record.resultStatus} />
                  <span className="history-record-row__content">
                    <strong className="history-record-row__sample" title={record.sampleId}>
                      {record.sampleId}
                    </strong>
                    <small>
                      {new Intl.DateTimeFormat(i18n.language, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(record.createdAt))}
                    </small>
                  </span>
                  <span className="history-record-row__reading">
                    <b>{formatValue(summary?.peakValue ?? null, t('common.notAvailable'))}</b>
                    <small>{t(originTranslationKeys[record.origin])}</small>
                  </span>
                  <StatusPill
                    label={t(resultTranslationKeys[record.resultStatus])}
                    tone={statusTone(record.resultStatus)}
                  />
                </button>
              );
            })}
          </div>

          {filtered.length === 0 ? (
            <div className="history-empty history-empty--browser">
              <Icon name="history" size={26} />
              <strong>
                {records.length === 0 ? t('history.empty') : t('history.noMatchingRecords')}
              </strong>
            </div>
          ) : null}
        </aside>

        <div className="history-detail">
          {selected && presentation ? (
            <>
              <section className="panel history-detail__header">
                <div>
                  <h2 title={selected.sampleId}>{selected.sampleId}</h2>
                  <p>{selectedDate}</p>
                </div>
                <div className="history-detail__status">
                  <StatusPill
                    label={t(resultTranslationKeys[selected.resultStatus])}
                    tone={statusTone(selected.resultStatus)}
                  />
                  <MetadataLabel
                    label={
                      selected.isDemo ? t('common.demo') : t(originTranslationKeys[selected.origin])
                    }
                    tone={selected.isDemo ? 'warning' : 'neutral'}
                  />
                </div>
              </section>

              <section className="history-metrics" aria-label={t('history.metadata')}>
                <div>
                  <span>{t('history.duration')}</span>
                  <b>{(presentation.summary.durationMs / 1000).toFixed(1)} s</b>
                </div>
                <div>
                  <span>{t('history.sampleCount')}</span>
                  <b>{presentation.summary.sampleCount}</b>
                </div>
                <div>
                  <span>{t('history.peakValue')}</span>
                  <b>{formatValue(presentation.summary.peakValue, t('common.notAvailable'))}</b>
                </div>
                <div>
                  <span>{t('history.latestValue')}</span>
                  <b>{formatValue(presentation.summary.latestValue, t('common.notAvailable'))}</b>
                </div>
                <div>
                  <span>{t('history.recordType')}</span>
                  <b>
                    {t(
                      selected.resultStatus === 'RAW_ONLY'
                        ? 'history.recordTypeRaw'
                        : 'history.recordTypeAnalyzed',
                    )}
                  </b>
                </div>
                <div>
                  <span>{t('history.correctionState')}</span>
                  <b>
                    {t(
                      presentation.correctionConfigured
                        ? 'history.correctionConfigured'
                        : 'history.correctionNotConfigured',
                    )}
                  </b>
                </div>
              </section>

              {presentation.availableModes.length > 0 ? (
                <div className="history-signal-controls" aria-label={t('history.signalMode')}>
                  <span>{t('history.signalMode')}</span>
                  <div>
                    {presentation.availableModes.map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        aria-pressed={presentation.activeMode === mode}
                        className={presentation.activeMode === mode ? 'is-active' : undefined}
                        onClick={() => setSignalMode(mode)}
                      >
                        {t(modeTranslationKeys[mode])}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <HistorySignalChart
                series={presentation.series}
                visibleIds={visibleSeriesIds}
                onToggle={toggleSeries}
              />

              {selected.result.resultStatus === 'ERROR' ? (
                <div className="validation-message validation-message--error">
                  <Icon name="warning" />
                  <div>
                    <strong>{t('errors.analysisInvalidTitle')}</strong>
                    <span>{t('errors.analysisInvalid')}</span>
                    <TechnicalDetails
                      code={selected.result.error.code}
                      message={selected.result.error.message}
                    />
                  </div>
                </div>
              ) : null}

              <section className="history-channel-summary" aria-label={t('history.channelSummary')}>
                {presentation.series.map((series) => {
                  const latest = series.points.at(-1)?.value ?? null;
                  const peak = series.points.length
                    ? Math.max(...series.points.map((point) => point.value))
                    : null;
                  return (
                    <article
                      key={series.id}
                      style={{ '--series-color': series.color } as CSSProperties}
                    >
                      <span>{t(series.labelKey)}</span>
                      <b>{formatValue(latest, t('common.notAvailable'))}</b>
                      <small>
                        {peak === null
                          ? t('common.notAvailable')
                          : t('history.peakSummary', { value: peak.toFixed(1) })}
                      </small>
                    </article>
                  );
                })}
              </section>

              <details className="panel history-metadata">
                <summary>{t('history.metadata')}</summary>
                <dl>
                  <div>
                    <dt>{t('history.origin')}</dt>
                    <dd>{t(originTranslationKeys[selected.origin])}</dd>
                  </div>
                  <div>
                    <dt>{t('history.sync')}</dt>
                    <dd>{t(syncTranslationKeys[selected.syncState])}</dd>
                  </div>
                  <div>
                    <dt>{t('history.protocolVersion')}</dt>
                    <dd>{selected.result.protocolVersion ?? t('common.notAvailable')}</dd>
                  </div>
                  <div>
                    <dt>{t('history.algorithmVersion')}</dt>
                    <dd>{selected.result.algorithmVersion ?? t('common.notAvailable')}</dd>
                  </div>
                  <div>
                    <dt>{t('history.calibrationVersion')}</dt>
                    <dd>{selected.result.calibrationVersion ?? t('common.notAvailable')}</dd>
                  </div>
                </dl>
              </details>

              <footer className="history-detail__footer">
                <p className="disclaimer">
                  {selected.result.resultStatus === 'RAW_ONLY'
                    ? t('history.rawRecordDisclaimer')
                    : t('app.analysisDisclaimer')}
                </p>
                <div className="export-actions">
                  <button
                    className="button button--ghost"
                    type="button"
                    onClick={() => void doExport('json')}
                  >
                    <Icon name="file" size={16} />
                    {t('history.exportJson')}
                  </button>
                  <button
                    className="button button--secondary"
                    type="button"
                    onClick={() => void doExport('csv')}
                  >
                    <Icon name="export" size={16} />
                    {t('history.exportCsv')}
                  </button>
                </div>
              </footer>
            </>
          ) : (
            <section className="panel history-empty history-empty--detail">
              <Icon name="flask" size={30} />
              <h2>{t('history.empty')}</h2>
              <p>{t('history.subtitle')}</p>
              <div className="history-empty__actions">
                <button
                  className="button button--secondary"
                  type="button"
                  onClick={() => void loadDemoHistoryRecord()}
                >
                  <Icon name="play" size={16} />
                  {t('history.loadDemoRecord')}
                </button>
                <button
                  className="button button--ghost"
                  type="button"
                  onClick={() => setSection('import')}
                >
                  <Icon name="import" size={16} />
                  {t('history.importDetectionFile')}
                </button>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
