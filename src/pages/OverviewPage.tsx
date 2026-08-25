import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { TelemetryStrip } from '../components/TelemetryStrip';
import { useAppStore } from '../store/appStore';

const resultTranslationKeys = {
  OK: 'history.resultOk',
  PARTIAL: 'history.resultIncomplete',
  ERROR: 'history.resultError',
  RAW_ONLY: 'history.resultRawOnly',
} as const;

export function OverviewPage() {
  const { t, i18n } = useTranslation();
  const connection = useAppStore((state) => state.connection);
  const history = useAppStore((state) => state.history);
  const setSection = useAppStore((state) => state.setSection);
  const runDemo = useAppStore((state) => state.runDemo);
  const transportMode = useAppStore((state) => state.transportMode);
  const recent = history[0];
  const connected = connection.status === 'connected';

  return (
    <div className="page page--overview">
      <PageHeader
        title={t('overview.title')}
        subtitle={t(transportMode === 'hc08d' ? 'overview.hc08dSubtitle' : 'overview.subtitle')}
        actions={
          <>
            <button
              className="button button--ghost"
              type="button"
              onClick={() => setSection('import')}
            >
              <Icon name="import" size={17} />
              {t('overview.importAction')}
            </button>
            <button
              className="button button--secondary"
              type="button"
              onClick={() => void runDemo()}
            >
              <Icon name="play" size={17} />
              {t('overview.demoAction')}
            </button>
            <button
              className="button button--primary"
              type="button"
              onClick={() => setSection('detection')}
            >
              {t('overview.primaryAction')}
              <Icon name="arrow" size={17} />
            </button>
          </>
        }
      />

      <TelemetryStrip
        compact
        label={t('overview.systemTitle')}
        items={[
          {
            label: t('overview.deviceTitle'),
            value: connected ? t('overview.deviceReady') : t('overview.deviceEmpty'),
            tone: connected ? 'success' : 'neutral',
          },
          { label: t('common.archive'), value: t('history.count', { count: history.length }) },
          {
            label: t('common.transport'),
            value: t(transportMode === 'hc08d' ? 'settings.hc08dDevice' : 'settings.demoDevice'),
          },
          { label: t('overview.storage'), value: t('overview.storageLocal'), tone: 'accent' },
        ]}
      />

      <section className="overview-hero">
        <div className="overview-hero__signal" aria-hidden="true">
          <svg viewBox="0 0 680 180" preserveAspectRatio="none">
            <path d="M0 140 C70 141 92 135 130 128 S190 105 235 88 S310 63 350 48 S430 28 500 27 S600 25 680 25" />
            <path d="M0 150 C85 151 120 143 168 132 S245 102 300 78 S390 41 455 39 S570 38 680 38" />
            <circle cx="500" cy="27" r="5" />
          </svg>
        </div>
        <div className="overview-hero__readout">
          <span>{t('common.bleLocalFirst')}</span>
          <strong>{connected ? t('common.linkReady') : t('common.standby')}</strong>
        </div>
      </section>

      <section className="overview-grid">
        <article className="metric-card metric-card--device">
          <div className="metric-card__icon">
            <Icon name="bluetooth" />
          </div>
          <div>
            <span className="metric-card__label">{t('overview.deviceTitle')}</span>
            <strong>{connected ? t('overview.deviceReady') : t('overview.deviceEmpty')}</strong>
            <p>{connected ? connection.device.name : t('detection.noDevices')}</p>
          </div>
          <StatusPill
            label={connected ? t('states.connected') : t('topbar.noDevice')}
            tone={connected ? 'success' : 'neutral'}
          />
        </article>

        <article className="metric-card metric-card--records">
          <div className="metric-card__icon">
            <Icon name="history" />
          </div>
          <div>
            <span className="metric-card__label">{t('overview.queueTitle')}</span>
            <strong className="metric-card__number">
              {String(history.length).padStart(2, '0')}
            </strong>
            <p>{t('overview.queueDescription')}</p>
          </div>
          <StatusPill label={t('common.local')} tone="info" />
        </article>

        <article className="panel overview-recent">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">{t('common.archive')}</span>
              <h2>{t('overview.recentTitle')}</h2>
            </div>
            {recent ? (
              <button className="text-button" type="button" onClick={() => setSection('history')}>
                {t('common.details')} <Icon name="arrow" size={15} />
              </button>
            ) : null}
          </div>
          {recent ? (
            <div className="recent-row">
              <div className="recent-row__mark">
                <Icon name="flask" />
              </div>
              <div>
                <strong>{recent.sampleId}</strong>
                <span>
                  {new Intl.DateTimeFormat(i18n.language, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }).format(new Date(recent.createdAt))}
                </span>
              </div>
              <StatusPill
                label={t(resultTranslationKeys[recent.resultStatus])}
                tone={recent.resultStatus === 'OK' ? 'success' : 'warning'}
              />
            </div>
          ) : (
            <div className="empty-copy">
              <Icon name="history" />
              <p>{t('overview.noRecent')}</p>
            </div>
          )}
        </article>

        <article className="panel overview-system">
          <div className="panel-heading">
            <div>
              <h2>{t('overview.systemTitle')}</h2>
            </div>
            <StatusPill
              label={t(transportMode === 'hc08d' ? 'settings.hc08dDevice' : 'settings.demoDevice')}
              tone={transportMode === 'hc08d' ? 'success' : 'warning'}
            />
          </div>
          <dl className="version-list">
            <div>
              <dt>{t('overview.dataMode')}</dt>
              <dd>
                {t(transportMode === 'hc08d' ? 'overview.dataModeRaw' : 'overview.dataModeDemo')}
              </dd>
            </div>
            <div>
              <dt>{t('overview.output')}</dt>
              <dd>{t(transportMode === 'hc08d' ? 'overview.outputRaw' : 'overview.outputDemo')}</dd>
            </div>
            <div>
              <dt>{t('overview.storage')}</dt>
              <dd>{t('overview.storageLocal')}</dd>
            </div>
          </dl>
        </article>
      </section>
    </div>
  );
}
