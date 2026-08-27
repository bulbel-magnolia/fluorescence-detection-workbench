import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { useAppStore } from '../store/appStore';
import { App } from './App';

const originalSetTransportMode = useAppStore.getState().setTransportMode;

describe('desktop application shell', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
    useAppStore.setState({
      section: 'overview',
      detectionState: 'idle',
      connection: { status: 'disconnected' },
      devices: [],
      transportMode: 'demo',
      hardwareFrames: [],
      clearSignal: null,
      latestFrameAt: null,
      hardwareDiagnostics: {
        serviceUuid: null,
        notifyCharacteristicUuid: null,
        writeCharacteristicUuid: null,
        rssi: null,
        latestFrameAt: null,
        recentRawLines: [],
        candidates: [],
      },
      lastError: null,
      lastCommand: null,
      setTransportMode: originalSetTransportMode,
    });
  });

  it('keeps six primary work areas and exposes the Demo entry', () => {
    render(<App />);
    const navigation = screen.getByRole('navigation');
    expect(within(navigation).getAllByRole('button')).toHaveLength(6);
    expect(within(navigation).queryByRole('group', { name: '概览' })).not.toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: '概览' })).toBeInTheDocument();
    expect(within(navigation).getByRole('group', { name: '检测' })).toBeInTheDocument();
    expect(within(navigation).getByRole('group', { name: '建模' })).toBeInTheDocument();
    expect(within(navigation).getByRole('group', { name: '系统' })).toBeInTheDocument();
    expect(within(navigation).getByRole('button', { name: '网络设计' })).toBeInTheDocument();
    expect(within(navigation).queryByRole('button', { name: '团队' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '体验演示流程' })).toBeInTheDocument();
    expect(screen.getByRole('main', { name: '荧光检测概览' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '跳到主要内容' })).toHaveAttribute(
      'href',
      '#main-content',
    );
    expect(document.title).toBe('荧光检测概览 · 荧光检测工作台');
  });

  it('moves focus to the new page and keeps the Team route discoverable', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ section: 'team' });
    render(<App />);

    const navigation = screen.getByRole('navigation');
    const teamButton = within(navigation).getByRole('button', { name: '团队' });
    expect(teamButton).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('main', { name: '团队工作区' })).toBeInTheDocument();

    await user.click(within(navigation).getByRole('button', { name: '设置' }));
    expect(screen.getByRole('main', { name: '设置' })).toHaveFocus();
    expect(document.title).toBe('设置 · 荧光检测工作台');
  });

  it('separates connection and acquisition status while exposing running controls', async () => {
    const user = userEvent.setup();
    const stopDetection = vi.fn(() => Promise.resolve());
    useAppStore.setState({
      section: 'overview',
      detectionState: 'running',
      connection: {
        status: 'connected',
        generation: 1,
        device: {
          id: 'demo-running',
          name: 'FluoroSense · Demo',
          rssi: -42,
          batteryLevel: 94,
          firmwareVersion: null,
          isDemo: true,
        },
      },
      stopDetection,
    });

    render(<App />);

    expect(screen.getByText('连接状态')).toBeInTheDocument();
    expect(screen.getByText('采集状态')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '返回采集' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '返回采集' }));
    expect(useAppStore.getState().section).toBe('detection');
    await user.click(screen.getByRole('button', { name: '停止采集' }));
    expect(stopDetection).toHaveBeenCalledTimes(1);
  });

  it('opens and connects the Demo device from overview', async () => {
    const user = userEvent.setup();
    render(<App />);

    await user.click(screen.getByRole('button', { name: '体验演示流程' }));
    expect(screen.getByRole('heading', { name: '采集荧光信号' })).toBeInTheDocument();
    await waitFor(() => expect(useAppStore.getState().connection.status).toBe('connected'), {
      timeout: 2_000,
    });
    expect(useAppStore.getState().connection).toMatchObject({
      status: 'connected',
      device: { name: 'FluoroSense · Demo', isDemo: true },
    });
    await useAppStore.getState().disconnect();
  });

  it('navigates between primary work areas', async () => {
    const user = userEvent.setup();
    render(<App />);
    expect(
      screen.getByRole('heading', {
        name: '荧光检测概览',
      }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^采集$/ }));
    expect(screen.getByRole('heading', { name: '采集荧光信号' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '网络设计' }));
    expect(await screen.findByRole('heading', { name: '未命名项目' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导入分析' }));
    expect(screen.getByRole('heading', { name: '导入并分析' })).toBeInTheDocument();
  });

  it('keeps the modeling boundary concise and task-oriented', async () => {
    useAppStore.setState({
      section: 'modeling',
      detectionState: 'ready',
      connection: {
        status: 'connected',
        generation: 1,
        device: {
          id: 'hc08d-modeling',
          name: 'HC-08D',
          rssi: -50,
          batteryLevel: null,
          firmwareVersion: null,
          isDemo: false,
        },
      },
    });
    render(<App />);

    expect(await screen.findByRole('heading', { name: '未命名项目' })).toBeInTheDocument();
    expect(screen.queryByText('演示项目')).not.toBeInTheDocument();
    expect(document.querySelector('.top-bar')).not.toBeInTheDocument();
    expect(screen.queryByText('建模工作台')).not.toBeInTheDocument();
    expect(screen.queryByText('HC-08D')).not.toBeInTheDocument();
    expect(screen.queryByText('未连接设备')).not.toBeInTheDocument();
    expect(screen.queryByText('连接状态')).not.toBeInTheDocument();
    expect(screen.queryByText('采集状态')).not.toBeInTheDocument();
    expect(screen.queryByText('电量')).not.toBeInTheDocument();
    expect(screen.queryByText('模型说明')).not.toBeInTheDocument();
    expect(screen.queryByText(/BFN-IR|规范内核|完整模型优先/)).not.toBeInTheDocument();
  });

  it('switches the complete interface to English', async () => {
    const user = userEvent.setup();
    useAppStore.setState({ section: 'settings' });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.getByRole('heading', { name: 'Settings' })).toBeInTheDocument();
    expect(document.documentElement.lang).toBe('en-US');
    expect(document.title).toBe('Settings · Fluorescence Workbench');
    expect(screen.getByRole('button', { name: '简体中文' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );
    expect(screen.getByRole('button', { name: 'English' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('group', { name: 'Interface language' })).toBeInTheDocument();
  });

  it('hides the team workspace when cloud service is not configured', () => {
    useAppStore.setState({ section: 'settings' });
    render(<App />);

    expect(screen.queryByRole('button', { name: '打开团队工作区' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '团队工作区' })).not.toBeInTheDocument();
  });

  it('shows real HC-08D values and supported controls without Demo fault tools', () => {
    useAppStore.setState({
      section: 'detection',
      transportMode: 'hc08d',
      detectionState: 'ready',
      connection: {
        status: 'connected',
        generation: 1,
        device: {
          id: 'hc08d-1',
          name: 'HC-08D',
          rssi: -52,
          batteryLevel: null,
          firmwareVersion: null,
          isDemo: false,
        },
      },
      devices: [],
      clearSignal: 65535,
      latestFrameAt: '2026-07-24T10:00:00.500Z',
      hardwareFrames: [
        {
          sequence: 0,
          receivedAt: '2026-07-24T10:00:00.500Z',
          elapsedMs: 0,
          signal480: 4428,
          signal515: 13390,
          signal555: 65535,
          clearSignal: 65535,
          saturatedFields: ['555', 'CLR'],
          rawLine: '480:4428,515:13390,555:65535,CLR:65535',
        },
      ],
    });

    render(<App />);

    expect(screen.getAllByText('HC-08D').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '开启检测光源' })).toBeEnabled();
    expect(screen.getByRole('button', { name: '关闭检测光源' })).toBeEnabled();
    expect(screen.queryByText('Demo 故障模拟')).not.toBeInTheDocument();
    expect(screen.queryByText('Demo 数据 · 未经实验验证')).not.toBeInTheDocument();
    expect(screen.getByText('CLR 总体亮度')).toBeInTheDocument();
    expect(screen.getByText('数字饱和')).toBeInTheDocument();
  });

  it('lets the user choose the HC-08D transport from settings', async () => {
    const user = userEvent.setup();
    const setTransportMode = vi.fn(() => Promise.resolve());
    useAppStore.setState({ section: 'settings', transportMode: 'demo', setTransportMode });
    render(<App />);

    await user.click(screen.getByRole('button', { name: 'HC-08D' }));

    expect(setTransportMode).toHaveBeenCalledWith('hc08d');
  });
});
