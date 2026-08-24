import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../../components/Icon';
import type { HistoryRecord } from '../../domain/types';
import type { DetectionModelingReference } from './detectionModeling';
import {
  firstUsableReference,
  networkValidationOptions,
  reverseTargetOptions,
} from './detectionMappingRegistry';

export interface DetectionModelingPickerProps {
  open: boolean;
  mode: DetectionModelingReference['mode'];
  records: HistoryRecord[];
  networkId?: string;
  initialRecordId?: string | null;
  onClose: () => void;
  onConfirm: (reference: DetectionModelingReference) => void;
}

const resultStatusKeys: Record<HistoryRecord['resultStatus'], string> = {
  OK: 'history.resultOk',
  PARTIAL: 'history.resultIncomplete',
  ERROR: 'history.resultError',
  RAW_ONLY: 'history.resultRawOnly',
};

function referenceFor(
  record: HistoryRecord | null,
  mode: DetectionModelingReference['mode'],
  networkId?: string,
): DetectionModelingReference | null {
  if (!record) return null;
  return firstUsableReference(
    mode === 'reverse-target'
      ? reverseTargetOptions(record)
      : networkValidationOptions(record, networkId ?? ''),
  );
}

export function DetectionModelingPicker({
  open,
  mode,
  records,
  networkId,
  initialRecordId,
  onClose,
  onConfirm,
}: DetectionModelingPickerProps) {
  const { t, i18n } = useTranslation();
  const [selectedId, setSelectedId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const preferred = records.find((record) => record.id === initialRecordId);
    const firstUsable = records.find((record) => referenceFor(record, mode, networkId));
    setSelectedId(preferred?.id ?? firstUsable?.id ?? records[0]?.id ?? null);
  }, [initialRecordId, mode, networkId, open, records]);

  const selectedRecord = useMemo(
    () => records.find((record) => record.id === selectedId) ?? null,
    [records, selectedId],
  );
  const selectedReference = useMemo(
    () => referenceFor(selectedRecord, mode, networkId),
    [mode, networkId, selectedRecord],
  );

  if (!open) return null;

  return (
    <div className="modeling-record-backdrop">
      <section
        className="modeling-record-dialog detection-modeling-picker"
        role="dialog"
        aria-modal="true"
        aria-labelledby="detection-modeling-picker-title"
      >
        <header>
          <div>
            <p className="panel-kicker">{t(`modeling.detectionPicker.${mode}.kicker`)}</p>
            <h2 id="detection-modeling-picker-title">
              {t(`modeling.detectionPicker.${mode}.title`)}
            </h2>
            <p>{t(`modeling.detectionPicker.${mode}.description`)}</p>
          </div>
          <button
            className="dialog-close"
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <span aria-hidden="true">×</span>
          </button>
        </header>

        <div className="modeling-record-dialog__body">
          <div className="modeling-record-list">
            {records.length ? (
              records.map((record) => {
                const usable = Boolean(referenceFor(record, mode, networkId));
                return (
                  <button
                    key={record.id}
                    className={selectedId === record.id ? 'is-selected' : ''}
                    type="button"
                    onClick={() => setSelectedId(record.id)}
                  >
                    <span
                      className="modeling-record-list__status"
                      data-status={record.resultStatus}
                    >
                      {t(resultStatusKeys[record.resultStatus])}
                    </span>
                    <strong>{record.sampleId}</strong>
                    <small>{new Date(record.createdAt).toLocaleString(i18n.language)}</small>
                    <small className={usable ? 'mapping-state is-usable' : 'mapping-state'}>
                      {t(
                        usable
                          ? 'modeling.detectionPicker.demoMappingAvailable'
                          : 'modeling.detectionPicker.mappingUnavailable',
                      )}
                    </small>
                  </button>
                );
              })
            ) : (
              <div className="modeling-record-empty">
                <Icon name="history" />
                <span>{t('modeling.detectionPicker.noRecords')}</span>
              </div>
            )}
          </div>

          <div className="modeling-record-preview">
            {selectedRecord ? (
              <>
                <p className="panel-kicker">{t('modeling.detectionPicker.mappingSummary')}</p>
                <h3>{selectedRecord.sampleId}</h3>
                {selectedReference ? (
                  <>
                    <dl>
                      <div>
                        <dt>{t('modeling.detectionPicker.metric')}</dt>
                        <dd>
                          {t(`modeling.detectionPicker.metrics.${selectedReference.metric.kind}`)}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('modeling.detectionPicker.measuredValue')}</dt>
                        <dd>
                          {selectedReference.measuredValue.toFixed(2)}{' '}
                          {selectedReference.measuredUnit}
                        </dd>
                      </div>
                      <div>
                        <dt>{t('modeling.detectionPicker.normalizedTarget')}</dt>
                        <dd>{selectedReference.normalizedValue.toFixed(3)}</dd>
                      </div>
                      <div>
                        <dt>{t('modeling.detectionPicker.mappingStatus')}</dt>
                        <dd>
                          {t(`modeling.detectionPicker.status.${selectedReference.mappingStatus}`)}
                        </dd>
                      </div>
                    </dl>
                    <div className="modeling-record-preview__boundary">
                      <Icon name="warning" size={16} />
                      <span>{t('modeling.detectionPicker.demoBoundary')}</span>
                    </div>
                  </>
                ) : (
                  <div className="modeling-record-preview__boundary is-blocked">
                    <Icon name="warning" size={16} />
                    <span>{t('modeling.detectionPicker.noMappingExplanation')}</span>
                  </div>
                )}
              </>
            ) : (
              <div className="modeling-record-empty">
                <span>{t('modeling.detectionPicker.selectRecord')}</span>
              </div>
            )}
          </div>
        </div>

        <footer>
          <span>{t('modeling.detectionPicker.footerBoundary')}</span>
          <div>
            <button className="button button--ghost" type="button" onClick={onClose}>
              {t('common.cancel')}
            </button>
            <button
              className="button button--primary"
              type="button"
              disabled={!selectedReference}
              onClick={() => selectedReference && onConfirm(selectedReference)}
            >
              <Icon name="link" size={16} />
              {t('modeling.detectionPicker.confirm')}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
