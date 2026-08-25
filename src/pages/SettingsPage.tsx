import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { MetadataLabel } from '../components/MetadataLabel';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { TelemetryStrip } from '../components/TelemetryStrip';
import { supabaseConfigured } from '../features/cloud/supabaseClient';
import type { AppLanguage } from '../i18n';
import { useAppStore } from '../store/appStore';
import { useThemeStore } from '../theme/themeStore';

export function SettingsPage() {
  const { t, i18n } = useTranslation();
  const language: AppLanguage = i18n.resolvedLanguage === 'en-US' ? 'en-US' : 'zh-CN';
  const setSection = useAppStore((state) => state.setSection);
  const transportMode = useAppStore((state) => state.transportMode);
  const setTransportMode = useAppStore((state) => state.setTransportMode);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <div className="page page--settings">
      <PageHeader title={t('settings.title')} subtitle={t('settings.subtitle')} />
      <TelemetryStrip
        compact
        label={t('settings.title')}
        items={[
          { label: t('settings.language'), value: language === 'zh-CN' ? '简体中文' : 'English' },
          {
            label: t('settings.appearance'),
            value: t(theme === 'dark' ? 'settings.darkTheme' : 'settings.lightTheme'),
            tone: 'accent',
          },
          {
            label: t('settings.simulation'),
            value: t(transportMode === 'hc08d' ? 'settings.hc08dDevice' : 'settings.demoDevice'),
          },
          { label: t('settings.applicationVersion'), value: '0.1.1' },
        ]}
      />
      <div className="settings-grid settings-surface desktop-surface">
        <section className="panel settings-card">
          <div className="settings-card__icon">
            <Icon name="overview" />
          </div>
          <div className="settings-card__content">
            <div className="panel-heading">
              <div>
                <h2>{t('settings.language')}</h2>
              </div>
            </div>
            <div className="segmented-control" role="group" aria-label={t('settings.language')}>
              <button
                type="button"
                className={language === 'zh-CN' ? 'is-active' : ''}
                aria-pressed={language === 'zh-CN'}
                onClick={() => void i18n.changeLanguage('zh-CN')}
              >
                {t('settings.chinese')}
              </button>
              <button
                type="button"
                className={language === 'en-US' ? 'is-active' : ''}
                aria-pressed={language === 'en-US'}
                onClick={() => void i18n.changeLanguage('en-US')}
              >
                {t('settings.english')}
              </button>
            </div>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card__icon">
            <Icon name="settings" />
          </div>
          <div className="settings-card__content">
            <div className="panel-heading">
              <div>
                <h2>{t('settings.appearance')}</h2>
              </div>
            </div>
            <div className="segmented-control" role="group" aria-label={t('settings.appearance')}>
              <button
                type="button"
                className={theme === 'dark' ? 'is-active' : ''}
                aria-pressed={theme === 'dark'}
                onClick={() => setTheme('dark')}
              >
                {t('settings.darkTheme')}
              </button>
              <button
                type="button"
                className={theme === 'light' ? 'is-active' : ''}
                aria-pressed={theme === 'light'}
                onClick={() => setTheme('light')}
              >
                {t('settings.lightTheme')}
              </button>
            </div>
            <p className="settings-card__description">{t('settings.appearanceDescription')}</p>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card__icon">
            <Icon name="bluetooth" />
          </div>
          <div className="settings-card__content">
            <div className="panel-heading">
              <div>
                <h2>{t('settings.simulation')}</h2>
              </div>
              <MetadataLabel
                label={t(
                  transportMode === 'hc08d' ? 'settings.hc08dDevice' : 'settings.demoDevice',
                )}
                tone={transportMode === 'hc08d' ? 'accent' : 'warning'}
              />
            </div>
            <div
              className="segmented-control segmented-control--device"
              role="group"
              aria-label={t('settings.simulation')}
            >
              <button
                type="button"
                className={transportMode === 'demo' ? 'is-active' : ''}
                aria-pressed={transportMode === 'demo'}
                onClick={() => void setTransportMode('demo')}
              >
                {t('settings.demoDevice')}
              </button>
              <button
                type="button"
                className={transportMode === 'hc08d' ? 'is-active' : ''}
                aria-pressed={transportMode === 'hc08d'}
                onClick={() => void setTransportMode('hc08d')}
              >
                {t('settings.hc08dDevice')}
              </button>
            </div>
            <p className="settings-card__description">
              {t(
                transportMode === 'hc08d'
                  ? 'settings.hc08dDescription'
                  : 'settings.demoDescription',
              )}
            </p>
            <button
              className="button button--secondary button--wide settings-card__action"
              type="button"
              onClick={() => setSection('detection')}
            >
              <Icon name="pulse" size={17} />
              {t('settings.openAcquisition')}
            </button>
          </div>
        </section>

        <section className="panel settings-card">
          <div className="settings-card__icon">
            <Icon name="history" />
          </div>
          <div className="settings-card__content">
            <div className="panel-heading">
              <div>
                <h2>{t('settings.versions')}</h2>
              </div>
            </div>
            <dl className="version-list">
              <div>
                <dt>{t('settings.applicationVersion')}</dt>
                <dd>0.1.1</dd>
              </div>
            </dl>
            <details className="settings-technical-details">
              <summary>{t('settings.technicalInfo')}</summary>
              <p>{t('settings.technicalInfoDescription')}</p>
              <dl className="version-list">
                <div>
                  <dt>{t('overview.algorithm')}</dt>
                  <dd>
                    {transportMode === 'hc08d'
                      ? t('settings.analysisInactive')
                      : t('settings.demonstrationAnalysis')}
                  </dd>
                </div>
                <div>
                  <dt>{t('overview.protocol')}</dt>
                  <dd>
                    {transportMode === 'hc08d'
                      ? t('settings.hc08dCommunication')
                      : t('settings.demonstrationCommunication')}
                  </dd>
                </div>
                <div>
                  <dt>{t('overview.calibration')}</dt>
                  <dd>
                    {transportMode === 'hc08d'
                      ? t('common.notAvailable')
                      : t('settings.demonstrationCalibration')}
                  </dd>
                </div>
              </dl>
            </details>
          </div>
        </section>

        <section className="panel settings-card settings-card--privacy">
          <div className="settings-card__icon">
            <Icon name="check" />
          </div>
          <div className="settings-card__content">
            <div className="panel-heading">
              <div>
                <h2>{t('settings.privacy')}</h2>
              </div>
            </div>
            <p>{t(supabaseConfigured ? 'settings.privacyText' : 'settings.privacyLocalText')}</p>
            <StatusPill label={t('topbar.syncIdle')} tone="success" icon="check" />
          </div>
        </section>

        {supabaseConfigured ? (
          <section className="panel settings-card">
            <div className="settings-card__icon">
              <Icon name="team" />
            </div>
            <div className="settings-card__content">
              <div className="panel-heading">
                <div>
                  <span className="panel-kicker">{t('team.eyebrow')}</span>
                  <h2>{t('settings.teamWorkspace')}</h2>
                </div>
                <StatusPill
                  label={supabaseConfigured ? t('common.online') : t('common.offline')}
                  tone={supabaseConfigured ? 'success' : 'neutral'}
                  icon="cloud"
                />
              </div>
              <p className="settings-card__description">{t('settings.teamWorkspaceDescription')}</p>
              <button
                className="button button--ghost settings-card__action"
                type="button"
                onClick={() => setSection('team')}
              >
                <Icon name="team" size={17} />
                {t('settings.openTeamWorkspace')}
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}
