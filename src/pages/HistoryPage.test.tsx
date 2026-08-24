import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { HistoryRecord } from '../domain/types';
import i18n from '../i18n';
import { createDemoHistoryRecord } from '../features/history/demoHistoryRecord';
import { useAppStore } from '../store/appStore';
import { HistoryPage } from './HistoryPage';

const analyzedRecord = createDemoHistoryRecord({
  now: '2026-08-01T10:00:00.000Z',
  recordId: 'history-analyzed',
  sessionId: 'session-analyzed',
  sampleId: 'DEMO-HISTORY-001',
});

const rawRecord: HistoryRecord = {
  id: 'history-raw',
  sampleId: 'HC08D-RAW-001',
  createdAt: '2026-08-01T11:00:00.000Z',
  origin: 'real-live',
  isDemo: false,
  resultStatus: 'RAW_ONLY',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: 'session-raw',
    sampleId: 'HC08D-RAW-001',
    resultStatus: 'RAW_ONLY',
    frames: [
      {
        sequence: 0,
        receivedAt: '2026-08-01T11:00:00.000Z',
        elapsedMs: 0,
        signal480: 140,
        signal515: 220,
        signal555: 310,
        clearSignal: 390,
        saturatedFields: [],
        rawLine: '480:140,515:220,555:310,CLR:390',
      },
      {
        sequence: 1,
        receivedAt: '2026-08-01T11:00:01.000Z',
        elapsedMs: 1000,
        signal480: 155,
        signal515: 235,
        signal555: 325,
        clearSignal: 410,
        saturatedFields: [],
        rawLine: '480:155,515:235,555:325,CLR:410',
      },
    ],
    protocolVersion: 'HC08D-ASCII-DRAFT-0.2',
    algorithmVersion: null,
    calibrationVersion: null,
    isDemo: false,
    disclaimer: 'Raw hardware data',
  },
};

const errorRecord: HistoryRecord = {
  id: 'history-error',
  sampleId: 'ERROR-001',
  createdAt: '2026-08-01T12:00:00.000Z',
  origin: 'json-import',
  isDemo: true,
  resultStatus: 'ERROR',
  qualityGrade: null,
  syncState: 'local-only',
  result: {
    schemaVersion: 1,
    sessionId: null,
    sampleId: 'ERROR-001',
    resultStatus: 'ERROR',
    error: { code: 'INVALID_INPUT', message: 'No curve data.' },
    protocolVersion: null,
    algorithmVersion: null,
    calibrationVersion: null,
    isDemo: true,
    disclaimer: 'Invalid input',
  },
};

describe('HistoryPage', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    useAppStore.setState({ history: [], latestRecord: null, latestResult: null });
  });

  it('shows analyzed curves, signal modes, metrics, and saved channels', () => {
    useAppStore.setState({ history: [analyzedRecord] });
    render(<HistoryPage />);

    expect(screen.getByRole('img', { name: '检测信号曲线' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '校正信号' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '原始信号' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '背景值' })).toBeInTheDocument();
    expect(screen.getByText('数据点数')).toBeInTheDocument();
    expect(screen.getByText('最高峰值')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通道 1' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通道 2' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '通道 3' })).toBeInTheDocument();
  });

  it('shows only truthful HC-08D raw channels and correction state', () => {
    useAppStore.setState({ history: [rawRecord] });
    render(<HistoryPage />);

    expect(screen.getByRole('button', { name: '480 nm 光强' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '515 nm 光强' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '555 nm 光强' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'CLR 总体亮度' })).toBeInTheDocument();
    expect(screen.getByText('未配置背景校正')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '校正信号' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '背景值' })).not.toBeInTheDocument();
  });

  it('offers useful empty-state actions', async () => {
    const user = userEvent.setup();
    const loadDemoHistoryRecord = vi.fn().mockResolvedValue(undefined);
    const setSection = vi.fn();
    useAppStore.setState({ history: [], loadDemoHistoryRecord, setSection });
    render(<HistoryPage />);

    await user.click(screen.getByRole('button', { name: '载入演示记录' }));
    expect(loadDemoHistoryRecord).toHaveBeenCalledOnce();
    await user.click(screen.getByRole('button', { name: '导入检测文件' }));
    expect(setSection).toHaveBeenCalledWith('import');
  });

  it('keeps a long sample ID on one line while exposing its full value', () => {
    const sampleId = 'DEMO-HISTORY-WITH-A-VERY-LONG-SAMPLE-IDENTIFIER-001';
    useAppStore.setState({ history: [{ ...analyzedRecord, id: 'history-long', sampleId }] });
    render(<HistoryPage />);

    const labels = screen.getAllByTitle(sampleId);
    expect(labels.length).toBeGreaterThan(0);
    expect(labels[0]).toHaveClass('history-record-row__sample');
  });

  it('renders the complete empty state in English', async () => {
    await i18n.changeLanguage('en-US');
    render(<HistoryPage />);

    expect(screen.getByRole('heading', { name: 'Detection records' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Load demonstration record' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Import detection file' })).toBeInTheDocument();
  });

  it('does not keep a filtered-out record in the detail pane', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ history: [analyzedRecord, rawRecord] });
    render(<HistoryPage />);

    expect(screen.getByRole('heading', { name: 'DEMO-HISTORY-001' })).toBeInTheDocument();
    await user.type(screen.getByRole('searchbox'), 'no-such-sample');

    expect(screen.getByText('没有符合当前搜索条件的记录')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'DEMO-HISTORY-001' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'HC08D-RAW-001' })).not.toBeInTheDocument();
  });

  it('shows not-available values instead of zero for records without curve data', () => {
    useAppStore.setState({ history: [errorRecord] });
    render(<HistoryPage />);

    expect(screen.getAllByText('暂无').length).toBeGreaterThan(0);
    expect(screen.queryByText('0.0 a.u.')).not.toBeInTheDocument();
  });
});
