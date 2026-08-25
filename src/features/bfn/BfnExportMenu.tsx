import { useMemo, useState } from 'react';
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
import type { BfnChartModel } from './chartTypes';
import type { BfnProject, BfnSimulationResult } from './types';

export interface BfnDownloadEnvironment {
  createObjectURL: (blob: Blob) => string;
  revokeObjectURL: (url: string) => void;
  createAnchor: () => HTMLAnchorElement;
}

export interface BfnExportMenuProps {
  project: BfnProject;
  result: BfnSimulationResult;
  model: BfnChartModel;
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
  };
}

function downloadBlob(
  blob: Blob,
  filename: string,
  environment: BfnDownloadEnvironment,
): void {
  const url = environment.createObjectURL(blob);
  const anchor = environment.createAnchor();
  try {
    anchor.href = url;
    anchor.download = filename;
    anchor.hidden = true;
    document.body?.appendChild(anchor);
    anchor.click();
  } finally {
    anchor.remove();
    environment.revokeObjectURL(url);
  }
}

export function BfnExportMenu({
  project,
  result,
  model,
  clipboardEnvironment,
  downloadEnvironment,
  pngEnvironment,
}: BfnExportMenuProps) {
  const { t } = useTranslation();
  const [operation, setOperation] = useState<Operation>(null);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const clipboardCapabilities = useMemo(
    () => getBfnClipboardCapabilities(clipboardEnvironment),
    [clipboardEnvironment],
  );
  const resolvedDownloadEnvironment = downloadEnvironment ?? browserDownloadEnvironment();
  const svg = (): string => serializeBfnFigureSvg({
    model,
    result,
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
      const csv = serializeBfnResultTable({ project, current: result, delimiter: ',', bom: true });
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
    setOperation('downloadPng');
    setFeedback({ kind: 'status', message: t('bfn.results.exportMenu.preparing') });
    try {
      const blob = await createPng();
      downloadBlob(blob, filename('response-3x', 'png'), resolvedDownloadEnvironment);
      announceDownload();
    } catch {
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.exportFailed') });
    } finally {
      setOperation(null);
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
    setOperation(nextOperation);
    setFeedback({ kind: 'status', message: t('bfn.results.exportMenu.copying') });
    try {
      handleCopyResult(await copyBfnText(value, clipboardEnvironment), successKey);
    } finally {
      setOperation(null);
    }
  };
  const handleCopyFigure = async (): Promise<void> => {
    setOperation('copyFigure');
    setFeedback({ kind: 'status', message: t('bfn.results.exportMenu.copying') });
    try {
      const blob = await createPng();
      handleCopyResult(await copyBfnPng(blob, clipboardEnvironment), 'copyFigureSuccess');
    } catch {
      setFeedback({ kind: 'alert', message: t('bfn.results.exportMenu.copyFailed') });
    } finally {
      setOperation(null);
    }
  };
  const handleCopyData = (): Promise<void> => copyText(
    'copyData',
    serializeBfnResultTable({ project, current: result, delimiter: '\t', bom: false }),
    'copyDataSuccess',
  );
  const handleCopyCaption = (): Promise<void> => copyText(
    'copyCaption',
    createBfnFigureCaption({ project, result, model }),
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
