import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';
import type { BfnClipboardEnvironment } from './chartClipboard';
import { createBfnChartModel } from './chartModel';
import type { BfnPngCanvas, BfnPngCanvasContext, BfnPngEnvironment } from './chartExport';
import {
  createBfnExportFilename,
  createBfnFigureCaption,
  createBfnProvenanceRows,
  serializeBfnResultTable,
} from './chartExport';
import { defaultBfnChartViewState } from './chartTypes';
import { createDemoBfnProject } from './fixtures';
import { runBfnSimulation } from './simulation';
import { BfnExportMenu, type BfnDownloadEnvironment } from './BfnExportMenu';
import { BfnRunProvenance } from './BfnRunProvenance';

const geometry = {
  width: 760,
  height: 300,
  padding: { left: 62, right: 24, top: 24, bottom: 48 },
} as const;

function exportFixture() {
  const project = createDemoBfnProject();
  const result = runBfnSimulation(project, '2026-08-26T08:30:00.000Z');
  const model = createBfnChartModel({
    project,
    result,
    viewState: defaultBfnChartViewState(result),
    geometry,
    translate: (key) => key,
  });
  return { project, result, model };
}

function pngFixture() {
  const png = new Blob(['png'], { type: 'image/png' });
  const context: BfnPngCanvasContext = {
    fillStyle: '',
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  const canvas: BfnPngCanvas = {
    width: 0,
    height: 0,
    getContext: () => context,
    toBlob: (callback) => callback(png),
  };
  const environment: BfnPngEnvironment = {
    createCanvas: () => canvas,
    loadSvgImage: () => Promise.resolve({}),
  };
  return { png, environment };
}

function downloadFixture() {
  const blobs: Blob[] = [];
  const downloads: Array<{ href: string; filename: string }> = [];
  let urlSequence = 0;
  const createObjectURL = vi.fn((blob: Blob) => {
    blobs.push(blob);
    urlSequence += 1;
    return `blob:bfn-${urlSequence}`;
  });
  const revokeObjectURL = vi.fn();
  const createAnchor = vi.fn(() => {
    const anchor = document.createElement('a');
    anchor.click = () => downloads.push({ href: anchor.href, filename: anchor.download });
    return anchor;
  });
  const environment: BfnDownloadEnvironment = { createObjectURL, revokeObjectURL, createAnchor };
  return { blobs, downloads, createObjectURL, revokeObjectURL, environment };
}

function deferredPromise() {
  let resolve!: () => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

async function readBlobText(blob: Blob): Promise<string> {
  if (typeof blob.text === 'function') return blob.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') resolve(reader.result);
      else reject(new Error('Blob text reader returned a non-text result'));
    };
    reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
    reader.readAsText(blob);
  });
}

async function readBlobBytes(blob: Blob): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(new Uint8Array(reader.result as ArrayBuffer));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read blob'));
    reader.readAsArrayBuffer(blob);
  });
}

describe('BFN result export menu', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens a native details menu with every download and copy action', async () => {
    const user = userEvent.setup();
    render(<BfnExportMenu {...exportFixture()} />);

    await user.click(screen.getByText('Export'));

    expect(screen.getByRole('button', { name: 'Download SVG' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download PNG (3×)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Download CSV' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy figure' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy data' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy caption' })).toBeInTheDocument();
  });

  it('downloads the current chart model as SVG, 3× PNG, and UTF-8 BOM CSV with deterministic filenames and URL cleanup', async () => {
    const user = userEvent.setup();
    const { project, result } = exportFixture();
    const model = createBfnChartModel({
      project,
      result,
      viewState: {
        ...defaultBfnChartViewState(result),
        xScale: 'log',
        xDomainMode: 'manual',
        xMinimum: 5,
        xMaximum: 20,
        showUncertainty: false,
        showAnn: false,
        cursorIndex: 2,
      },
      geometry,
      translate: (key) => key,
    });
    const downloads = downloadFixture();
    const png = pngFixture();
    render(
      <BfnExportMenu
        project={project}
        result={result}
        model={model}
        downloadEnvironment={downloads.environment}
        pngEnvironment={png.environment}
      />,
    );
    await user.click(screen.getByText('Export'));

    await user.click(screen.getByRole('button', { name: 'Download SVG' }));
    await user.click(screen.getByRole('button', { name: 'Download PNG (3×)' }));
    await user.click(screen.getByRole('button', { name: 'Download CSV' }));

    expect(downloads.downloads.map(({ filename }) => filename)).toEqual([
      createBfnExportFilename({ project, result, artifact: 'response', extension: 'svg' }),
      createBfnExportFilename({ project, result, artifact: 'response-3x', extension: 'png' }),
      createBfnExportFilename({ project, result, artifact: 'data', extension: 'csv' }),
    ]);
    expect(downloads.blobs.map((blob) => blob.type)).toEqual([
      'image/svg+xml;charset=utf-8',
      'image/png',
      'text/csv;charset=utf-8',
    ]);
    expect(downloads.revokeObjectURL.mock.calls).toEqual([
      ['blob:bfn-1'],
      ['blob:bfn-2'],
      ['blob:bfn-3'],
    ]);
    const svg = await readBlobText(downloads.blobs[0]!);
    expect(svg).toContain('data-x-scale="log"');
    expect(svg).toContain('data-x-domain="5 20"');
    expect(svg).not.toMatch(/cursor|tooltip|crosshair/i);
    expect(svg).not.toContain('data-series="uncertainty"');
    expect(svg).not.toContain('data-series="ann"');
    const csvBlob = downloads.blobs[2]!;
    const csv = await readBlobText(csvBlob);
    expect([...await readBlobBytes(csvBlob).then((bytes) => bytes.slice(0, 3))]).toEqual([0xef, 0xbb, 0xbf]);
    expect(csv).toContain(result.id);
  });

  it('announces text-copy success only after the clipboard promise resolves and copies TSV plus the current caption', async () => {
    const user = userEvent.setup();
    const fixture = exportFixture();
    const deferred = deferredPromise();
    const writeText = vi.fn()
      .mockImplementationOnce(() => deferred.promise)
      .mockResolvedValueOnce(undefined);
    const clipboardEnvironment: BfnClipboardEnvironment = { writeText };
    render(<BfnExportMenu {...fixture} clipboardEnvironment={clipboardEnvironment} />);
    await user.click(screen.getByText('Export'));

    await user.click(screen.getByRole('button', { name: 'Copy data' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copying…');
    expect(screen.getByRole('status')).not.toHaveTextContent('Data copied.');
    act(() => deferred.resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Data copied.'));
    expect(writeText).toHaveBeenNthCalledWith(1, serializeBfnResultTable({
      project: fixture.project,
      current: fixture.result,
      delimiter: '\t',
      bom: false,
    }));

    await user.click(screen.getByRole('button', { name: 'Copy caption' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Caption copied.'));
    expect(writeText).toHaveBeenNthCalledWith(2, createBfnFigureCaption(fixture));
  });

  it('copies a publication PNG only after supported image clipboard APIs resolve', async () => {
    const user = userEvent.setup();
    const fixture = exportFixture();
    const png = pngFixture();
    const deferred = deferredPromise();
    const clipboardItem = { kind: 'png-item' };
    const write = vi.fn(() => deferred.promise);
    const createClipboardItem = vi.fn(() => clipboardItem);
    const clipboardEnvironment: BfnClipboardEnvironment = {
      write,
      createClipboardItem,
      supportsMimeType: (mimeType) => mimeType === 'image/png',
    };
    render(
      <BfnExportMenu
        {...fixture}
        clipboardEnvironment={clipboardEnvironment}
        pngEnvironment={png.environment}
      />,
    );
    await user.click(screen.getByText('Export'));

    await user.click(screen.getByRole('button', { name: 'Copy figure' }));
    expect(screen.getByRole('status')).toHaveTextContent('Copying…');
    expect(screen.getByRole('status')).not.toHaveTextContent('Figure copied.');
    act(() => deferred.resolve());
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Figure copied.'));
    expect(createClipboardItem).toHaveBeenCalledWith({ 'image/png': png.png });
    expect(write).toHaveBeenCalledWith([clipboardItem]);
  });

  it('disables unsupported image copy with a PNG-export hint and reports rejected text copy without false success', async () => {
    const user = userEvent.setup();
    const fixture = exportFixture();
    const writeText = vi.fn(() => Promise.reject(new Error('permission denied')));
    render(<BfnExportMenu {...fixture} clipboardEnvironment={{ writeText }} />);
    await user.click(screen.getByText('Export'));

    expect(screen.getByRole('button', { name: 'Copy figure' })).toBeDisabled();
    expect(screen.getByText('Image copy is unavailable. Use PNG export instead.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copy data' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Copy failed. Check clipboard permission and try again.'));
    expect(screen.queryByText('Data copied.')).not.toBeInTheDocument();
  });
});

describe('BFN run provenance', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('en-US');
  });

  it('is folded by default and exposes every requested value from the result contract', async () => {
    const user = userEvent.setup();
    const { result } = exportFixture();
    const { container } = render(<BfnRunProvenance result={result} />);
    const details = container.querySelector('details');
    expect(details).not.toHaveAttribute('open');

    await user.click(screen.getByText('Run information'));

    expect(details).toHaveAttribute('open');
    expect(screen.getByText(result.id)).toBeInTheDocument();
    expect(screen.getByText(result.completedAt)).toBeInTheDocument();
    expect(screen.getByText(result.engineVersion)).toBeInTheDocument();
    expect(screen.getByText(result.mode)).toBeInTheDocument();
    expect(screen.getByText(result.networkId)).toBeInTheDocument();
    expect(screen.getByText(result.primaryInputSourceId)).toBeInTheDocument();
    expect(screen.getByText(result.outputMonitorId)).toBeInTheDocument();
    expect(screen.getByText(result.modelVersions.join(' · '))).toBeInTheDocument();
    expect(screen.getByText(result.contextIds.join(' · '))).toBeInTheDocument();
    expect(screen.getByText('Parameter-interval envelope')).toBeInTheDocument();
    expect(screen.getByText(result.extrapolated ? 'Yes' : 'No')).toBeInTheDocument();
    expect(screen.getByText(result.isDemo ? 'Yes' : 'No')).toBeInTheDocument();
    expect(screen.getByText('Not experimentally validated')).toBeInTheDocument();
    expect(screen.getByText(/current approximation-quality threshold/)).toBeInTheDocument();
    expect(details).not.toHaveTextContent(/confidence|caused/i);
    const provenance = Object.fromEntries(
      createBfnProvenanceRows({ result }).map((row) => [row.key, row.value]),
    );
    expect(screen.getByText(provenance.primary_input_range!)).toBeInTheDocument();
    expect(screen.getByText(provenance.time_range_hours!)).toBeInTheDocument();
  });
});
