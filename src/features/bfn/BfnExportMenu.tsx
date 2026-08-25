import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  copyBfnPng,
  copyBfnText,
  getBfnClipboardCapabilities,
  type BfnClipboardEnvironment,
  type BfnClipboardResult,
} from './chartClipboard';
import {
  createBfnExportFilename,
  createBfnFigureCaption,
  renderBfnFigurePng,
  serializeBfnFigureSvg,
  serializeBfnResultTable,
  type BfnPngEnvironment,
} from './chartExport';
import type { BfnChartComparison, BfnChartModel } from './chartTypes';
import type { BfnProject, BfnSimulationResult } from './types';

export interface BfnDownloadEnvironment {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
  scheduleCleanup: (cleanup: () => void) => void;
}

export interface BfnExportMenuProps {
  project: BfnProject;
  result: BfnSimulationResult;
  model: BfnChartModel;
  comparison?: BfnChartComparison;
  clipboardEnvironment?: BfnClipboardEnvironment;
  downloadEnvironment?: BfnDownloadEnvironment;
  pngEnvironment?: BfnPngEnvironment;
}

type Operation = 'downloadPng' | 'copyFigure' | 'copyData' | 'copyCaption' | null;
type Feedback = { kind: 'status' | 'alert'; message: string } | null;

function browserDownloadEnvironment(): BfnDownloadEnvironment {
  return {
    createObjectURL: (blob) => URL.createObjectURL(blob),
    revokeObjectURL: (url) => URL.revokeObjectURL(url),
    createAnchor: () => document.createElement('a'),
    scheduleCleanup: (cleanup) => {
      setTimeout(cleanup, 0);
    },
  };
}

function downloadBlob(
  blob: Blob,
  filename: string,
  environment: BfnDownloadEnvironment,
): void {
  const url = environment.createObjectURL(blob);
  let anchor: HTMLAnchorElement | null = null;
  let revoked = false;
  const cleanup = (): void => {
    if (revoked) return;
    revoked = true;
    environment.revokeObjectURL(url);
  };
  try {
    anchor = environment.createAnchor();
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body?.appendChild(anchor);
    anchor.click();
    environment.scheduleCleanup(cleanup);
  } catch (error) {
    cleanup();
    throw error;
  } finally {
    anchor?.remove();
  }
}

export function BfnExportMenu({
  project,
  result,
  model,
  comparison,
  clipboardEnvironment,
  downloadEnvironment,
  pngEnvironment,
}: BfnExportMenuProps) {
  const { t, i18n } = useTranslation();
  const [operation, setOperation] = useState<Operation>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const requestTokenRef = useRef(0);
  const language = i18n.resolvedLanguage ?? i18n.language;
  const clipboardCapabilities = useMemo(
    () => getBfnClipboardCapabilities(clipboardEnvironment),
    [clipboardEnvironment],
  );
  const resolvedDownloadEnvironment = useMemo(
    () => downloadEnvironment ?? browserDownloadEnvironment(),
    [downloadEnvironment],
  );

  useEffect(() => {
    requestTokenRef.current += 1;
    setOperation(null);
    setFeedback(null);
    return () => {
      requestTokenRef.current += 1;
    };
  }, [
    project,
    result,
    model,
    comparison,
    clipboardEnvironment,
    downloadEnvironment,
    pngEnvironment,
    language,
  ]);

  const beginOperation = (nextOperation: Exclude<Operation, null>, message: string): number => {
    requestTokenRef.current += 1;
    setOperation(nextOperation);
    setFeedback({ kind: 'status', message });
    return requestTokenRef.current;
  };
  const requestIsCurrent = (token: number): boolean => requestTokenRef.current === token;
  const svg = (): string => serializeBfnFigureSvg({
    model,
    result,
    ...(comparison ? { comparison } : {}),
    title: result.mode === 'static' ? t('bfn.results.staticChart') : t('bfn.results.dynamicChart'),
    description: t('bfn.results.exportMenu.figureDescription', { runId: result.id }),
  });
  const filename = (artifact: string, extension: string): string => createBfnExportFilename({
    project,
    result,
    artifact,
    extension,
  });
  const announceDownload = (): void => setFeedback({
    kind: 'status',
    message: t('bfn.results.exportMenu.downloadReady'),
  });
  const handleSvgDownload = (): void => {
    setFeedback(null);
    try {
      downloadBlob(
        new Blob([svg()], { type: 'image/svg+xml;charset=utf-8' }),
        filename('response', 'svg'),
        resolvedDownloadEnvironment,
      );
      announceDownload();
    } catch {
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.exportFailed') });
    }
  };
  const handleCsvDownload = (): void => {
    setFeedback(null);
    try {
      const csv = serializeBfnResultTable({
        project,
        current: result,
        ...(comparison ? { comparison } : {}),
        delimiter: ',',
        bom: true,
      });
      downloadBlob(
        new Blob([csv], { type: 'text/csv;charset=utf-8' }),
        filename('data', 'csv'),
        resolvedDownloadEnvironment,
      );
      announceDownload();
    } catch {
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.exportFailed') });
    }
  };
  const createPng = (): Promise<Blob> => renderBfnFigurePng(
    svg(),
    pngEnvironment ? { environment: pngEnvironment } : {},
  );
  const handlePngDownload = async (): Promise<void> => {
    const token = beginOperation('downloadPng', t('bfn.results.exportMenu.preparing'));
    try {
      const blob = await createPng();
      if (!requestIsCurrent(token)) return;
      downloadBlob(blob, filename('response-3x', 'png'), resolvedDownloadEnvironment);
      announceDownload();
    } catch {
      if (!requestIsCurrent(token)) return;
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.exportFailed') });
    } finally {
      if (requestIsCurrent(token)) setOperation(null);
    }
  };
  const handleCopyResult = (
    copyResult: BfnClipboardResult,
    successKey: 'copyFigureSuccess' | 'copyDataSuccess' | 'copyCaptionSuccess',
  ): void => {
    if (copyResult.status === 'success') {
      setFeedback({ kind: 'status', message: t(`bfn.results.exportMenu.${successKey}`) });
      return;
    }
    if (copyResult.status === 'unsupported') {
      setFeedback({
        kind: 'alert',
        message: t(copyResult.operation === 'image'
          ? 'bfn.results.exportMenu.imageUnsupported'
          : 'bfn.results.exportMenu.textUnsupported'),
      });
      return;
    }
    setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.copyFailed') });
  };
  const copyText = async (
    nextOperation: 'copyData' | 'copyCaption',
    value: string,
    successKey: 'copyDataSuccess' | 'copyCaptionSuccess',
  ): Promise<void> => {
    const token = beginOperation(nextOperation, t('bfn.results.exportMenu.copying'));
    try {
      const copyResult = await copyBfnText(value, clipboardEnvironment);
      if (!requestIsCurrent(token)) return;
      handleCopyResult(copyResult, successKey);
    } finally {
      if (requestIsCurrent(token)) setOperation(null);
    }
  };
  const handleCopyFigure = async (): Promise<void> => {
    const token = beginOperation('copyFigure', t('bfn.results.exportMenu.copying'));
    try {
      const blob = await createPng();
      if (!requestIsCurrent(token)) return;
      const copyResult = await copyBfnPng(blob, clipboardEnvironment);
      if (!requestIsCurrent(token)) return;
      handleCopyResult(copyResult, 'copyFigureSuccess');
    } catch {
      if (!requestIsCurrent(token)) return;
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.copyFailed') });
    } finally {
      if (requestIsCurrent(token)) setOperation(null);
    }
  };
  const handleCopyData = (): Promise<void> => copyText(
    'copyData',
    serializeBfnResultTable({
      project,
      current: result,
      ...(comparison ? { comparison } : {}),
      delimiter: '\t',
      bom: false,
    }),
    'copyDataSuccess',
  );
  const handleCopyCaption = (): Promise<void> => copyText(
    'copyCaption',
    createBfnFigureCaption({
      project,
      result,
      model,
      ...(comparison ? { comparison } : {}),
      captionText: {
        lead: t('bfn.results.exportMenu.caption.lead', {
          demo: result.isDemo || project.isDemo ? t('bfn.results.exportMenu.caption.demo') : '',
          mode: t(`bfn.modes.${result.mode}`),
          yAxis: model.labels.y,
          xAxis: model.labels.x,
        }),
        uncertainty: t('bfn.results.exportMenu.caption.uncertainty'),
        annAccepted: t('bfn.results.exportMenu.caption.annAccepted'),
        annRejected: t('bfn.results.exportMenu.caption.annRejected'),
        comparison: t('bfn.results.exportMenu.caption.comparison'),
        separator: t('bfn.results.exportMenu.caption.separator'),
        terminator: t('bfn.results.exportMenu.caption.terminator'),
      },
    }),
    'copyCaptionSuccess',
  );
  const busy = operation !== null;

  return (
    <details className="bfn-export-menu">
      <summary>{t('bfn.results.exportMenu.summary')}</summary>
      <div className="bfn-export-menu__body">
        <div className="bfn-export-menu__group">
          <span>{t('bfn.results.exportMenu.downloadGroup')}</span>
          <button type="button" disabled={busy} onClick={handleSvgDownload}>{t('bfn.results.exportMenu.downloadSvg')}</button>
          <button type="button" disabled={busy} onClick={() => void handlePngDownload()}>{t('bfn.results.exportMenu.downloadPng')}</button>
          <button type="button" disabled={busy} onClick={handleCsvDownload}>{t('bfn.results.exportMenu.downloadCsv')}</button>
        </div>
        <div className="bfn-export-menu__group">
          <span>{t('bfn.results.exportMenu.copyGroup')}</span>
          <button type="button" disabled={busy || !clipboardCapabilities.imagePng} onClick={() => void handleCopyFigure()}>{t('bfn.results.exportMenu.copyFigure')}</button>
          <button type="button" disabled={busy} onClick={() => void handleCopyData()}>{t('bfn.results.exportMenu.copyData')}</button>
          <button type="button" disabled={busy} onClick={() => void handleCopyCaption()}>{t('bfn.results.exportMenu.copyCaption')}</button>
        </div>
        {!clipboardCapabilities.imagePng ? (
          <p className="bfn-export-menu__hint">{t('bfn.results.exportMenu.imageUnsupported')}</p>
        ) : null}
        {feedback ? (
          <p className="bfn-export-menu__feedback" role={feedback.kind}>{feedback.message}</p>
        ) : null}
      </div>
    </details>
  );
}
