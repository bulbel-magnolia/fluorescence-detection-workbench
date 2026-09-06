import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { BfnPlatformPage } from '../BfnPlatformPage';
import { createDemoBfnProject } from '../fixtures';

async function selectMonitor(user: ReturnType<typeof userEvent.setup>, name: RegExp) {
  await user.click(screen.getByRole('button', { name }));
}

async function openDynamicAnalysis() {
  const user = userEvent.setup();
  await selectMonitor(user, /报告信号, 输出/);
  await user.click(screen.getByRole('button', { name: '动态响应分析…' }));
  return {
    user,
    dialog: screen.getByRole('dialog', { name: '动态响应分析' }),
  };
}

describe('BFN Dynamic Response Analysis workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('zh-CN');
  });

  it('is disabled in static mode with a natural reason', async () => {
    render(<BfnPlatformPage project={createDemoBfnProject()} />);
    const user = userEvent.setup();
    await selectMonitor(user, /报告信号, 输出/);

    expect(screen.getByRole('button', { name: '动态响应分析…' })).toBeDisabled();
    expect(
      screen.getByText('动态响应分析仅适用于动态网络模式。', {
        selector: 'p',
        exact: true,
      }),
    ).toBeInTheDocument();
    expect(screen.queryByText(/dynamic_mode_required/)).not.toBeInTheDocument();
  });

  it('calculates baseline output, dynamic gain magnitude, and phase without a direction column', async () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openDynamicAnalysis();

    expect(dialog).toHaveTextContent(
      '在指定工作点和周期下，计算所选输出对网络输入的周期小信号响应。',
    );
    expect(within(dialog).getByRole('spinbutton', { name: /周期/ })).toHaveValue(null);
    expect(within(dialog).getByRole('spinbutton', { name: /分析值/ })).toHaveValue(10);
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();

    await user.type(within(dialog).getByRole('spinbutton', { name: /周期/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));

    const result = within(dialog).getByRole('region', { name: '结果' });
    expect(result).toHaveTextContent('基线输出');
    expect(result).toHaveTextContent('动态增益');
    expect(result).toHaveTextContent('相位');
    expect(result).toHaveTextContent('deg');
    expect(result).toHaveTextContent('分析依据');
    expect(result).not.toHaveTextContent('作用方向');
    expect(result).not.toHaveTextContent(
      /network_dynamic_periodic_gain|first_order|complex_non_finite/,
    );
  });

  it('requires a positive period and clears stale results on edit and close', async () => {
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const { user, dialog } = await openDynamicAnalysis();
    const period = within(dialog).getByRole('spinbutton', { name: /周期/ });

    await user.type(period, '0');
    expect(within(dialog).getByRole('button', { name: '分析' })).toBeDisabled();
    await user.clear(period);
    await user.type(period, '2');
    await user.click(within(dialog).getByRole('button', { name: '分析' }));
    expect(within(dialog).getByRole('region', { name: '结果' })).toBeInTheDocument();

    await user.clear(period);
    expect(within(dialog).queryByRole('region', { name: '结果' })).not.toBeInTheDocument();
    await user.click(within(dialog).getByRole('button', { name: '关闭动态响应分析' }));
    expect(screen.queryByRole('dialog', { name: '动态响应分析' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '动态响应分析…' }));
    expect(
      within(screen.getByRole('dialog', { name: '动态响应分析' })).getByRole('spinbutton', {
        name: /周期/,
      }),
    ).toHaveValue(null);
  });

  it('provides equivalent English labels', async () => {
    await i18n.changeLanguage('en-US');
    const project = createDemoBfnProject();
    project.network.mode = 'dynamic';
    project.network.inputSources[0]!.dynamicSpecification = {
      type: 'constant',
      value: 10,
      unit: 'nM',
    };
    render(<BfnPlatformPage project={project} />);
    const user = userEvent.setup();
    await selectMonitor(user, /Reporter signal, Output/);
    await user.click(screen.getByRole('button', { name: 'Dynamic Response Analysis…' }));
    const dialog = screen.getByRole('dialog', { name: 'Dynamic Response Analysis' });
    expect(dialog).toHaveTextContent('periodic small-signal response');
    await user.type(within(dialog).getByRole('spinbutton', { name: /Period/ }), '2');
    await user.click(within(dialog).getByRole('button', { name: 'Analyze' }));
    expect(within(dialog).getByRole('region', { name: 'Results' })).toHaveTextContent(
      'Dynamic gain',
    );
  });
});
