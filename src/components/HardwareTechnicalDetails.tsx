import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { Hc08dDiagnostics } from '../domain/types';
import type { CharacteristicSelectionRequest } from '../features/transport/SwitchableBleTransport';

interface HardwareTechnicalDetailsProps {
  diagnostics: Hc08dDiagnostics;
  onSelect?: (selection: CharacteristicSelectionRequest) => void;
}

export function HardwareTechnicalDetails({ diagnostics, onSelect }: HardwareTechnicalDetailsProps) {
  const { t } = useTranslation();
  const serviceUuids = useMemo(
    () => [...new Set(diagnostics.candidates.map((candidate) => candidate.serviceUuid))],
    [diagnostics.candidates],
  );
  const notifyCandidates = useMemo(
    () => diagnostics.candidates.filter((candidate) => candidate.notify || candidate.indicate),
    [diagnostics.candidates],
  );
  const writeCandidates = useMemo(
    () =>
      diagnostics.candidates.filter(
        (candidate) => candidate.write || candidate.writeWithoutResponse,
      ),
    [diagnostics.candidates],
  );
  const [serviceUuid, setServiceUuid] = useState(diagnostics.serviceUuid ?? serviceUuids[0] ?? '');
  const [notifyCharacteristicUuid, setNotifyCharacteristicUuid] = useState(
    diagnostics.notifyCharacteristicUuid ?? notifyCandidates[0]?.characteristicUuid ?? '',
  );
  const [writeCharacteristicUuid, setWriteCharacteristicUuid] = useState(
    diagnostics.writeCharacteristicUuid ?? writeCandidates[0]?.characteristicUuid ?? '',
  );
  const needsManualSelection =
    diagnostics.candidates.length > 1 &&
    (!diagnostics.notifyCharacteristicUuid || !diagnostics.writeCharacteristicUuid);

  useEffect(() => {
    setServiceUuid(diagnostics.serviceUuid ?? serviceUuids[0] ?? '');
    setNotifyCharacteristicUuid(
      diagnostics.notifyCharacteristicUuid ?? notifyCandidates[0]?.characteristicUuid ?? '',
    );
    setWriteCharacteristicUuid(
      diagnostics.writeCharacteristicUuid ?? writeCandidates[0]?.characteristicUuid ?? '',
    );
  }, [
    diagnostics.notifyCharacteristicUuid,
    diagnostics.serviceUuid,
    diagnostics.writeCharacteristicUuid,
    notifyCandidates,
    serviceUuids,
    writeCandidates,
  ]);

  return (
    <details className="hardware-details">
      <summary>{t('detection.hardwareDetails')}</summary>
      <div className="hardware-details__body">
        <dl>
          <div>
            <dt>{t('detection.serviceUuid')}</dt>
            <dd>
              <code>{diagnostics.serviceUuid ?? t('common.notAvailable')}</code>
            </dd>
          </div>
          <div>
            <dt>{t('detection.notifyUuid')}</dt>
            <dd>
              <code>{diagnostics.notifyCharacteristicUuid ?? t('common.notAvailable')}</code>
            </dd>
          </div>
          <div>
            <dt>{t('detection.writeUuid')}</dt>
            <dd>
              <code>{diagnostics.writeCharacteristicUuid ?? t('common.notAvailable')}</code>
            </dd>
          </div>
          <div>
            <dt>{t('detection.rssi')}</dt>
            <dd>
              {diagnostics.rssi === null ? t('common.notAvailable') : `${diagnostics.rssi} dBm`}
            </dd>
          </div>
          <div>
            <dt>{t('detection.latestFrame')}</dt>
            <dd>{diagnostics.latestFrameAt ?? t('common.notAvailable')}</dd>
          </div>
        </dl>

        {needsManualSelection && onSelect ? (
          <fieldset className="hardware-details__selector">
            <legend>{t('detection.manualGatt')}</legend>
            <label>
              <span>{t('detection.serviceUuid')}</span>
              <select value={serviceUuid} onChange={(event) => setServiceUuid(event.target.value)}>
                {serviceUuids.map((uuid) => (
                  <option key={uuid} value={uuid}>
                    {uuid}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('detection.notifyUuid')}</span>
              <select
                value={notifyCharacteristicUuid}
                onChange={(event) => setNotifyCharacteristicUuid(event.target.value)}
              >
                {notifyCandidates.map((candidate) => (
                  <option
                    key={`${candidate.serviceUuid}-${candidate.characteristicUuid}`}
                    value={candidate.characteristicUuid}
                  >
                    {candidate.characteristicUuid}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>{t('detection.writeUuid')}</span>
              <select
                value={writeCharacteristicUuid}
                onChange={(event) => setWriteCharacteristicUuid(event.target.value)}
              >
                {writeCandidates.map((candidate) => (
                  <option
                    key={`${candidate.serviceUuid}-${candidate.characteristicUuid}`}
                    value={candidate.characteristicUuid}
                  >
                    {candidate.characteristicUuid}
                  </option>
                ))}
              </select>
            </label>
            <button
              className="button button--secondary"
              type="button"
              disabled={!serviceUuid || !notifyCharacteristicUuid || !writeCharacteristicUuid}
              onClick={() =>
                onSelect({ serviceUuid, notifyCharacteristicUuid, writeCharacteristicUuid })
              }
            >
              {t('detection.applyGatt')}
            </button>
          </fieldset>
        ) : null}

        <div className="raw-monitor">
          <strong>{t('detection.rawMonitor')}</strong>
          {diagnostics.recentRawLines.length > 0 ? (
            <ol>
              {diagnostics.recentRawLines.map((line, index) => (
                <li key={`${index}-${line}`}>
                  <code>{line}</code>
                </li>
              ))}
            </ol>
          ) : (
            <p>{t('detection.noRawData')}</p>
          )}
        </div>
      </div>
    </details>
  );
}
