import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { useAppStore } from '../store/appStore';
import { useThemeStore } from '../theme/themeStore';
import { DetectionPage } from './DetectionPage';
import { HistoryPage } from './HistoryPage';
import { ImportPage } from './ImportPage';
import { OverviewPage } from './OverviewPage';
import { SettingsPage } from './SettingsPage';

describe('shared scientific desktop surfaces', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    useThemeStore.getState().setTheme('light');
    useAppStore.setState({
      connection: { status: 'disconnected' },
      detectionState: 'idle',
      devices: [],
      hasScanned: false,
      history: [],
      lastError: null,
      sampleId: '',
      transportMode: 'demo',
    });
  });

  it('consolidates overview content while preserving quick actions', () => {
    const { container } = render(<OverviewPage />);

    expect(container.querySelector('.overview-surface.desktop-surface')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '导入文件' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '体验演示流程' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '连接设备' })).toBeInTheDocument();
  });

  it('consolidates acquisition panes while preserving controls', () => {
    const { container } = render(<DetectionPage />);

    const surface = container.querySelector('.detection-surface.desktop-surface');
    expect(surface).toBeInTheDocument();
    expect(surface?.querySelector('.device-strip')).toBeInTheDocument();
    expect(surface?.querySelector('.signal-chart')).toBeInTheDocument();
    expect(surface?.querySelector('.control-panel')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '扫描设备' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '开始采集' })).toBeInTheDocument();
  });

  it('consolidates import panes without changing the file action', () => {
    const { container } = render(<ImportPage />);

    expect(container.querySelector('.import-surface.desktop-surface')).toBeInTheDocument();
    expect(container.querySelector('input[type="file"]')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /选择文件/ })).toBeInTheDocument();
  });

  it('keeps history as a continuous list and detail workspace', () => {
    const { container } = render(<HistoryPage />);

    const surface = container.querySelector('.history-surface.desktop-surface');
    expect(surface).toBeInTheDocument();
    expect(surface?.querySelector('.history-browser')).toBeInTheDocument();
    expect(surface?.querySelector('.history-detail')).toBeInTheDocument();
    expect(screen.getByRole('searchbox')).toBeInTheDocument();
  });

  it('presents settings as divided rows and keeps dark mode available', async () => {
    const user = userEvent.setup();
    const { container } = render(<SettingsPage />);

    expect(container.querySelector('.settings-surface.desktop-surface')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '深色主题' }));
    expect(useThemeStore.getState().theme).toBe('dark');
  });
});
