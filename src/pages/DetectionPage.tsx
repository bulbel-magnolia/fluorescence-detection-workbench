import { useTranslation } from 'react-i18next';
import { HardwareTechnicalDetails } from '../components/HardwareTechnicalDetails';
import { Icon } from '../components/Icon';
import { MetadataLabel } from '../components/MetadataLabel';
import { PageHeader } from '../components/PageHeader';
import { SignalChart } from '../components/SignalChart';
import { StatusPill } from '../components/StatusPill';
import { TechnicalDetails } from '../components/TechnicalDetails';
import { TelemetryStrip } from '../components/TelemetryStrip';
import type { ChannelId } from '../domain/types';
import type { MockFault } from '../features/transport/MockBleTransport';
import { useAppStore } from '../store/appStore';

const channelIds: readonly ChannelId[] = ['channel1', 'channel2', 'channel3'];
const wavelengths = [480, 515, 555] as const;
const faultValues: readonly MockFault[] = [
  'none',
  'low-battery',
  'sensor-error',
  'sudden-disconnection',
  'command-timeout',
];

function isMockFault(value: string): value is MockFault {
  return faultValues.some((item) => item === value);
}

export function DetectionPage() {
  const { t } = useTranslation();
  const state = useAppStore();
  const isHardware = state.transportMode === 'hc08d';
  const connectedDevice = state.connection.status === 'connected' ? state.connection.device : null;
  const connected = connectedDevice !== null;
  const running = state.detectionState === 'running';
  const ready = state.detectionState === 'ready';
  const focusChannel: ChannelId =
    state.selectedChannel === 'all' ? 'channel1' : state.selectedChannel;
  const current = state.samples[focusChannel].at(-1);
  const corrected = current ? Math.max(0, current.rawSignal - current.background) : null;
  const latestHardwareFrame = state.hardwareFrames.at(-1);
  const elapsedMs = Math.max(
    0,
    ...channelIds.map((channel) => state.samples[channel].at(-1)?.elapsedMs ?? 0),
  );
  const commandBusy =
    state.lastCommand?.status === 'sent' || state.lastCommand?.status === 'accepted';
  const saturatedSequences = {
    channel1: state.hardwareFrames
      .filter((frame) => frame.saturatedFields.includes('480'))
      .map((frame) => frame.sequence),
    channel2: state.hardwareFrames
      .filter((frame) => frame.saturatedFields.includes('515'))
      .map((frame) => frame.sequence),
    channel3: state.hardwareFrames
      .filter((frame) => frame.saturatedFields.includes('555'))
      .map((frame) => frame.sequence),
  };
  const isSaturated = (field: '480' | '515' | '555' | 'CLR'): boolean =>
    latestHardwareFrame?.saturatedFields.includes(field) ?? false;
  const dataStatusKey =
    state.connection.status === 'reconnecting'
      ? 'detection.reconnecting'
      : state.lastError?.code === 'DATA_STALE'
        ? 'detection.dataStaleShort'
        : state.latestFrameAt
          ? 'detection.dataReceiving'
          : 'detection.dataReady';
  const deviceSelectionStatusKey =
    state.lastError?.code === 'SCAN_FAILED'
      ? 'states.error'
      : state.detectionState === 'connecting' || state.connection.status === 'discovering'
        ? 'states.connecting'
        : state.hasScanned && state.devices.length === 0
          ? 'common.notAvailable'
          : state.hasScanned
            ? 'detection.noDevices'
            : 'states.idle';
  const retryDeviceOperation = async (): Promise<void> => {
    state.clearError();
    if (state.connection.status !== 'disconnected') await state.disconnect();
    await state.scan();
  };

  return (
    <div className="page page--detection">
      <PageHeader
        title={t('detection.title')}
        subtitle={t(isHardware ? 'detection.hc08dSubtitle' : 'detection.subtitle')}
        actions={
          <MetadataLabel
            label={t(isHardware ? 'settings.hc08dDevice' : 'common.demoMode')}
            tone={isHardware ? 'accent' : 'warning'}
          />
        }
      />

      <TelemetryStrip
        compact
        label={t('detection.controls')}
        items={[
          {
            label: t('detection.connection'),
            value: t(`states.${state.detectionState}`),
            tone: connected ? 'success' : state.lastError ? 'danger' : 'neutral',
          },
          { label: t('detection.sampleId'), value: state.sampleId || t('common.notAvailable') },
          {
            label: t('detection.points'),
            value: String(
              channelIds.reduce((sum, channel) => sum + state.samples[channel].length, 0),
            ),
          },
          {
            label: t('detection.latestFrame'),
            value: t(dataStatusKey),
            tone: state.latestFrameAt ? 'success' : 'neutral',
          },
        ]}
      />

      <div className="detection-surface desktop-surface">
      {state.lastError ? (
        <div className="error-banner" role="alert">
          <Icon name="warning" />
          <div>
            <strong>{t('errors.deviceOperationTitle')}</strong>
            <span>
              {state.lastError.code === 'DATA_STALE'
                ? t('detection.dataStale')
                : t('errors.deviceOperation')}
            </span>
            <TechnicalDetails code={state.lastError.code} message={state.lastError.message} />
          </div>
          <button type="button" onClick={state.clearError}>
            {t('common.close')}
          </button>
          {state.lastError.code !== 'SAMPLE_ID_REQUIRED' ? (
            <button type="button" onClick={() => void retryDeviceOperation()}>
              {t('common.retry')}
            </button>
          ) : null}
        </div>
      ) : null}

      <section className="device-strip panel">
        <div className="device-strip__intro">
          <span className="metric-card__icon">
            <Icon name="bluetooth" />
          </span>
          <div>
            <span className="panel-kicker">{t('detection.deviceDrawer')}</span>
            <strong>{connectedDevice ? connectedDevice.name : t(deviceSelectionStatusKey)}</strong>
          </div>
        </div>
        <div className="device-strip__list">
          {state.devices.map((device) => (
            <button
              type="button"
              key={device.id}
              className="device-chip"
              disabled={connected || state.detectionState === 'connecting'}
              onClick={() => void state.connect(device.id)}
            >
              <span className={device.isDemo ? 'demo-beacon' : 'hardware-beacon'} />
              <span>
                <strong>{device.name}</strong>
                <small>
                  {t('detection.rssi')} {device.rssi ?? t('common.notAvailable')} dBm
                </small>
              </span>
              <Icon name="arrow" size={16} />
            </button>
          ))}
        </div>
        {isHardware ? (
          <StatusPill
            label={t(dataStatusKey)}
            tone={
              state.latestFrameAt && state.lastError?.code !== 'DATA_STALE' ? 'success' : 'neutral'
            }
          />
        ) : null}
        {connected ? (
          <button
            className="button button--ghost"
            type="button"
            onClick={() => void state.disconnect()}
          >
            {t('common.disconnect')}
          </button>
        ) : (
          <button
            className="button button--secondary"
            type="button"
            disabled={state.detectionState === 'scanning' || state.detectionState === 'connecting'}
            onClick={() => void state.scan()}
          >
            <Icon name="scan" size={17} />
            {state.detectionState === 'scanning' ? t('states.scanning') : t('common.scan')}
          </button>
        )}
      </section>

      <div className="detection-workspace">
        <div className="detection-main">
          <SignalChart
            samples={state.samples}
            selected={state.selectedChannel}
            valueMode={isHardware ? 'raw' : 'corrected'}
            saturatedSequences={isHardware ? saturatedSequences : undefined}
          />
          {isHardware ? (
            <section className="reading-grid reading-grid--raw" aria-label={t('common.rawSignal')}>
              {(latestHardwareFrame?.saturatedFields.length ?? 0) > 0 ? (
                <StatusPill label={t('common.saturated')} tone="warning" icon="warning" />
              ) : null}
              {(
                [
                  [
                    '480',
                    t('detection.signal480'),
                    latestHardwareFrame?.signal480 ?? state.samples.channel1.at(-1)?.rawSignal,
                  ],
                  [
                    '515',
                    t('detection.signal515'),
                    latestHardwareFrame?.signal515 ?? state.samples.channel2.at(-1)?.rawSignal,
                  ],
                  [
                    '555',
                    t('detection.signal555'),
                    latestHardwareFrame?.signal555 ?? state.samples.channel3.at(-1)?.rawSignal,
                  ],
                  [
                    'CLR',
                    t('detection.clearSignal'),
                    latestHardwareFrame?.clearSignal ?? state.clearSignal,
                  ],
                ] as const
              ).map(([field, label, value]) => (
                <article
                  className={isSaturated(field) ? 'reading-card is-saturated' : 'reading-card'}
                  key={field}
                >
                  <span>{label}</span>
                  <strong>{value ?? t('common.notAvailable')}</strong>
                  <small>a.u.</small>
                </article>
              ))}
            </section>
          ) : (
            <section className="reading-grid">
              <article className="reading-card">
                <span>{t('detection.rawSignal')}</span>
                <strong>{current ? current.rawSignal.toFixed(1) : t('common.notAvailable')}</strong>
                <small>a.u.</small>
              </article>
              <article className="reading-card">
                <span>{t('detection.background')}</span>
                <strong>
                  {current ? current.background.toFixed(1) : t('common.notAvailable')}
                </strong>
                <small>a.u.</small>
              </article>
              <article className="reading-card reading-card--signal">
                <span>{t('detection.corrected')}</span>
                <strong>{corrected?.toFixed(1) ?? t('common.notAvailable')}</strong>
                <small>a.u.</small>
              </article>
              <article className="reading-card">
                <span>{t('detection.temperature')}</span>
                <strong>
                  {state.deviceStatus?.temperatureCelsius.toFixed(1) ?? t('common.notAvailable')}
                </strong>
                <small>°C</small>
              </article>
            </section>
          )}
        </div>

        <aside className="control-panel panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">{t('common.control')}</span>
              <h2>{t('detection.controls')}</h2>
            </div>
            <StatusPill
              label={t(`states.${state.detectionState}`)}
              tone={running ? 'signal' : ready ? 'success' : 'neutral'}
            />
          </div>

          <label className="field">
            <span>{t('detection.sampleId')}</span>
            <input
              value={state.sampleId}
              required
              aria-invalid={state.sampleId.trim().length === 0}
              disabled={running}
              placeholder={t('detection.sampleIdPlaceholder')}
              onChange={(event) => {
                state.setSampleId(event.target.value);
                if (state.lastError?.code === 'SAMPLE_ID_REQUIRED') state.clearError();
              }}
            />
          </label>

          <fieldset className="channel-switch">
            <legend>{t('detection.channel')}</legend>
            <button
              type="button"
              className={state.selectedChannel === 'all' ? 'is-active' : ''}
              onClick={() => state.setSelectedChannel('all')}
            >
              {t('common.all')}
            </button>
            {channelIds.map((channel, index) => (
              <button
                key={channel}
                type="button"
                className={state.selectedChannel === channel ? 'is-active' : ''}
                onClick={() => state.setSelectedChannel(channel)}
              >
                {isHardware ? `${wavelengths[index]} nm` : t(`channels.channel${index + 1}`)}
              </button>
            ))}
          </fieldset>

          <div className="session-readout">
            <div>
              <span>{t('detection.elapsed')}</span>
              <strong>{(elapsedMs / 1000).toFixed(1)} s</strong>
            </div>
            <div>
              <span>{t(isHardware ? 'detection.frameCount' : 'detection.points')}</span>
              <strong>
                {isHardware ? state.hardwareFrames.length : state.samples[focusChannel].length}
              </strong>
            </div>
          </div>

          {state.lastCommand ? (
            <div className="command-progress" aria-live="polite">
              <span>
                {t('detection.commandStatus', {
                  command: t(`commands.${state.lastCommand.name}`),
                })}
              </span>
              <StatusPill
                label={t(`commandStates.${state.lastCommand.status}`)}
                tone={
                  state.lastCommand.status === 'failed'
                    ? 'danger'
                    : state.lastCommand.status === 'completed'
                      ? 'success'
                      : 'neutral'
                }
              />
            </div>
          ) : null}

          {isHardware ? (
            <>
              <div className="led-actions">
                <button
                  type="button"
                  disabled={!connected || commandBusy}
                  onClick={() => void state.setLed(true)}
                >
                  {t('detection.ledOn')}
                </button>
                <button
                  type="button"
                  disabled={!connected || commandBusy}
                  onClick={() => void state.setLed(false)}
                >
                  {t('detection.ledOff')}
                </button>
              </div>
              <p className="firmware-note">{t('detection.firmwareUnsupported')}</p>
            </>
          ) : (
            <div className="control-actions">
              <button type="button" disabled={!ready} onClick={() => void state.zero()}>
                <Icon name="pulse" size={17} />
                {t('detection.zero')}
              </button>
              <button type="button" disabled={!ready} onClick={() => void state.calibrate()}>
                <Icon name="flask" size={17} />
                {t('detection.calibrate')}
              </button>
            </div>
          )}

          {running ? (
            <button
              className="button button--stop button--wide"
              type="button"
              onClick={() => void state.stopDetection()}
            >
              <Icon name="stop" size={17} />
              {t(isHardware ? 'detection.stopRecording' : 'detection.stop')}
            </button>
          ) : (
            <button
              className="button button--primary button--wide"
              type="button"
              disabled={!ready || state.sampleId.trim().length === 0}
              onClick={() => void state.startDetection()}
            >
              <Icon name="play" size={17} />
              {t(isHardware ? 'detection.startRecording' : 'detection.start')}
            </button>
          )}

          {!isHardware ? (
            <details className="demo-scenarios">
              <summary>{t('detection.demoScenarios')}</summary>
              <label className="field field--compact">
                <span>{t('detection.injectFault')}</span>
                <select
                  value={state.mockFault}
                  onChange={(event) => {
                    if (isMockFault(event.target.value)) state.setMockFault(event.target.value);
                  }}
                >
                  <option value="none">{t('detection.faultNone')}</option>
                  <option value="low-battery">{t('detection.faultBattery')}</option>
                  <option value="sensor-error">{t('detection.faultSensor')}</option>
                  <option value="sudden-disconnection">{t('detection.faultDisconnect')}</option>
                  <option value="command-timeout">{t('detection.faultTimeout')}</option>
                </select>
              </label>
            </details>
          ) : null}

          {isHardware ? (
            <HardwareTechnicalDetails
              diagnostics={state.hardwareDiagnostics}
              onSelect={(selection) => void state.selectHardwareCharacteristics(selection)}
            />
          ) : null}

          {isHardware && state.latestRecord?.result.resultStatus === 'RAW_ONLY' ? (
            <div className="result-summary result-summary--raw">
              <span>
                <Icon name="check" size={16} />
                {t('detection.rawRecordSaved')}
              </span>
              <strong>{state.latestRecord.result.frames.length}</strong>
              <small>{t('detection.framesSaved')}</small>
            </div>
          ) : state.latestResult?.resultStatus !== 'ERROR' && state.latestResult ? (
            <div className="result-summary">
              <span>
                <Icon name="check" size={16} />
                {t('detection.resultReady')}
              </span>
              <strong>
                {t(
                  state.latestResult.resultStatus === 'OK'
                    ? 'history.resultOk'
                    : 'history.resultIncomplete',
                )}
              </strong>
              <small>{t('detection.resultRecord')}</small>
            </div>
          ) : null}
        </aside>
      </div>
      </div>
    </div>
  );
}
