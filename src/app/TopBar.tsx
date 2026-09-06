import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { StatusPill } from '../components/StatusPill';
import { supabaseConfigured } from '../features/cloud/supabaseClient';
import { useAppStore } from '../store/appStore';

export function TopBar() {
  const { t } = useTranslation();
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const stopDetection = useAppStore((state) => state.stopDetection);
  const connection = useAppStore((state) => state.connection);
  const deviceStatus = useAppStore((state) => state.deviceStatus);
  const detectionState = useAppStore((state) => state.detectionState);
  const lastError = useAppStore((state) => state.lastError);
  const pending = useAppStore((state) => state.syncPendingCount);

  const connected = connection.status === 'connected';
  const deviceName = connected ? connection.device.name : t('topbar.noDevice');

  const connectionStateKey =
    connection.status === 'connected'
      ? 'connected'
      : connection.status === 'connecting' || connection.status === 'discovering'
        ? 'connecting'
        : connection.status === 'reconnecting'
          ? 'reconnecting'
          : connection.status === 'scanning'
            ? 'scanning'
            : 'disconnected';
  const connectionTone = connected
    ? 'success'
    : connectionStateKey === 'connecting' ||
        connectionStateKey === 'reconnecting' ||
        connectionStateKey === 'scanning'
      ? 'warning'
      : 'neutral';
  const acquisitionHasError = Boolean(lastError) || detectionState === 'error';
  const acquisitionStateKey = acquisitionHasError ? 'error' : detectionState;
  const acquisitionTone = acquisitionHasError
    ? 'danger'
    : detectionState === 'running'
      ? 'signal'
      : detectionState === 'finished' || detectionState === 'ready'
        ? 'success'
        : detectionState === 'stopping' || detectionState === 'preparing'
          ? 'warning'
          : 'neutral';
  const acquisitionActive = detectionState === 'running' || detectionState === 'stopping';

  return (
    <header className="top-bar">
      <div className="top-bar__device">
        <span className="top-bar__icon">
          <Icon name="bluetooth" size={18} />
        </span>
        <div>
          <span>{t('topbar.device')}</span>
          <strong>{deviceName}</strong>
        </div>
        <div
          className="top-bar__status-block"
          aria-label={`${t('topbar.connection')}: ${t(`states.${connectionStateKey}`)}`}
        >
          <span className="top-bar__status-label">{t('topbar.connection')}</span>
          <StatusPill label={t(`states.${connectionStateKey}`)} tone={connectionTone} />
        </div>
        <div
          className="top-bar__status-block"
          aria-label={`${t('topbar.acquisition')}: ${t(`states.${acquisitionStateKey}`)}`}
        >
          <span className="top-bar__status-label">{t('topbar.acquisition')}</span>
          <StatusPill label={t(`states.${acquisitionStateKey}`)} tone={acquisitionTone} />
        </div>
      </div>
      <div className="top-bar__cluster">
        {acquisitionActive ? (
          <div className="top-bar__actions">
            {section !== 'detection' ? (
              <button
                className="top-bar__action"
                type="button"
                onClick={() => setSection('detection')}
              >
                <Icon name="pulse" size={15} />
                {t('topbar.returnAcquisition')}
              </button>
            ) : null}
            <button
              className="button button--stop top-bar__stop"
              type="button"
              onClick={() => void stopDetection()}
              disabled={detectionState === 'stopping'}
            >
              <Icon name="stop" size={15} />
              {t('topbar.stopAcquisition')}
            </button>
          </div>
        ) : null}
        <div className="top-bar__item top-bar__item--battery">
          <Icon name="battery" size={17} />
          <span>
            {t('topbar.battery')}{' '}
            <strong>
              {deviceStatus ? `${deviceStatus.batteryLevel}%` : t('common.notAvailable')}
            </strong>
          </span>
        </div>
        <div className="top-bar__item">
          <Icon name={supabaseConfigured ? 'cloud' : 'history'} size={17} />
          <span>
            {t('topbar.localWorkspace')} ·{' '}
            <strong>
              {supabaseConfigured && pending > 0
                ? t('topbar.syncPending', { count: pending })
                : t('topbar.syncIdle')}
            </strong>
          </span>
        </div>
        {supabaseConfigured ? (
          <button
            className="top-bar__account top-bar__account--button"
            type="button"
            onClick={() => setSection('team')}
            aria-label={t('topbar.workspace')}
          >
            <Icon name="user" size={17} />
            <span>{t('topbar.account')}</span>
          </button>
        ) : null}
      </div>
    </header>
  );
}
