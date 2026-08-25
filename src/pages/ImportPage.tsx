import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { TechnicalDetails } from '../components/TechnicalDetails';
import { TelemetryStrip } from '../components/TelemetryStrip';
import {
  ImportFileError,
  parseImportFile,
  type ImportPreview,
} from '../features/import/parseImport';
import { useAppStore } from '../store/appStore';

export function ImportPage() {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const addImportedResult = useAppStore((state) => state.addImportedResult);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<{ code: string; message: string } | null>(null);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const chooseFile = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    setLoading(true);
    setError(null);
    setSaved(false);
    try {
      setPreview(await parseImportFile(file));
    } catch (caught) {
      setPreview(null);
      setError({
        code: caught instanceof ImportFileError ? 'IMPORT_FILE_INVALID' : 'IMPORT_FAILED',
        message:
          caught instanceof ImportFileError || caught instanceof Error
            ? caught.message
            : t('import.invalid'),
      });
    } finally {
      setLoading(false);
    }
  };

  const saveResult = async (): Promise<void> => {
    if (!preview || preview.result.resultStatus === 'ERROR') return;
    setSaving(true);
    try {
      const persisted = await addImportedResult(
        preview.result,
        preview.format === 'json' ? 'json-import' : 'csv-import',
      );
      if (persisted) {
        setSaved(true);
      } else {
        setError({ code: 'PERSISTENCE_FAILED', message: t('errors.deviceOperation') });
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="page page--import">
      <PageHeader title={t('import.title')} subtitle={t('import.subtitle')} />
      <TelemetryStrip
        compact
        label={t('import.validationLabel')}
        items={[
          {
            label: t('import.fileName'),
            value: preview?.fileName ?? t('import.noFile'),
          },
          {
            label: t('import.format'),
            value: preview?.format.toUpperCase() ?? t('common.notAvailable'),
          },
          {
            label: t('import.rows'),
            value: preview ? String(preview.rowCount) : t('common.notAvailable'),
          },
          {
            label: t('import.validationLabel'),
            value: loading
              ? t('import.reading')
              : saved
                ? t('import.imported')
                : error
                  ? t('import.invalid')
                  : preview
                    ? t('import.valid')
                    : t('import.noFile'),
            tone: error ? 'danger' : saved || preview ? 'success' : 'neutral',
          },
        ]}
      />
      <div className="import-layout import-surface desktop-surface">
        <div className="import-main">
          <input
            ref={inputRef}
            className="visually-hidden"
            type="file"
            accept=".json,.csv,application/json,text/csv"
            onChange={(event) => void chooseFile(event.target.files?.[0])}
          />
          <button type="button" className="drop-zone" onClick={() => inputRef.current?.click()}>
            <span className="drop-zone__icon">
              <Icon name="import" size={30} />
            </span>
            <strong>{loading ? t('import.reading') : t('import.chooseFile')}</strong>
            <span>{t('import.dropHint')}</span>
            <i>JSON</i>
            <i>CSV</i>
          </button>

          <section className="panel import-preview">
            <div className="panel-heading">
              <div>
                <h2>{t('import.preview')}</h2>
              </div>
              {preview ? (
                <StatusPill
                  label={
                    preview.result.resultStatus === 'ERROR'
                      ? t('import.invalid')
                      : t('import.valid')
                  }
                  tone={preview.result.resultStatus === 'ERROR' ? 'danger' : 'success'}
                  icon={preview.result.resultStatus === 'ERROR' ? 'warning' : 'check'}
                />
              ) : null}
            </div>

            {error ? (
              <div className="validation-message validation-message--error" role="alert">
                <Icon name="warning" />
                <div>
                  <strong>
                    {error.code === 'PERSISTENCE_FAILED'
                      ? t('errors.deviceOperationTitle')
                      : t('import.invalid')}
                  </strong>
                  <span>
                    {error.code === 'PERSISTENCE_FAILED'
                      ? t('errors.deviceOperation')
                      : t('import.errorHelp')}
                  </span>
                  <TechnicalDetails code={error.code} message={error.message} />
                </div>
              </div>
            ) : preview ? (
              <>
                <dl className="import-facts">
                  <div>
                    <dt>{t('import.fileName')}</dt>
                    <dd>{preview.fileName}</dd>
                  </div>
                  <div>
                    <dt>{t('import.format')}</dt>
                    <dd>{preview.format.toUpperCase()}</dd>
                  </div>
                  <div>
                    <dt>{t('import.rows')}</dt>
                    <dd>{preview.rowCount}</dd>
                  </div>
                  <div>
                    <dt>{t('import.channels')}</dt>
                    <dd>{preview.channelCount}</dd>
                  </div>
                </dl>
                {preview.result.resultStatus === 'ERROR' ? (
                  <div className="validation-message validation-message--error">
                    <Icon name="warning" />
                    <div>
                      <strong>{t('errors.analysisInvalidTitle')}</strong>
                      <span>{t('errors.analysisInvalid')}</span>
                      <TechnicalDetails
                        code={preview.result.error.code}
                        message={preview.result.error.message}
                      />
                    </div>
                  </div>
                ) : (
                  <div className="validation-message">
                    <Icon name="check" />
                    <div>
                      <strong>{t('import.valid')}</strong>
                      <span>
                        {t('import.successSummary', {
                          sampleId: preview.result.sampleId,
                          rows: preview.rowCount,
                          channels: preview.channelCount,
                        })}
                      </span>
                    </div>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-copy">
                <Icon name="file" />
                <p>{t('import.noFile')}</p>
              </div>
            )}
          </section>
        </div>

        <aside className="panel import-guide">
          <div className="panel-heading">
            <div>
              <h2>{t('import.formatTitle')}</h2>
            </div>
          </div>
          <div className="format-card">
            <span>01</span>
            <div>
              <strong>JSON</strong>
              <p>{t('import.jsonHint')}</p>
              <details className="format-details">
                <summary>{t('import.fieldDetails')}</summary>
                <code>{t('import.jsonDetails')}</code>
              </details>
            </div>
          </div>
          <div className="format-card">
            <span>02</span>
            <div>
              <strong>CSV</strong>
              <p>{t('import.csvHint')}</p>
              <details className="format-details">
                <summary>{t('import.fieldDetails')}</summary>
                <code>{t('import.csvDetails')}</code>
              </details>
            </div>
          </div>
          <button
            className="button button--primary button--wide"
            type="button"
            disabled={!preview || preview.result.resultStatus === 'ERROR' || saved || saving}
            onClick={() => void saveResult()}
          >
            <Icon name={saved ? 'check' : 'flask'} size={17} />
            {saved ? t('import.imported') : t('import.validate')}
          </button>
        </aside>
      </div>
    </div>
  );
}
