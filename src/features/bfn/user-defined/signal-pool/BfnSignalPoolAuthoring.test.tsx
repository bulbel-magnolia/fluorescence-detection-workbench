import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../../i18n';
import { createDemoBfnProject } from '../../fixtures';
import type { SignalPoolDraft } from './signalPoolContract';
import { materializeSignalPool } from './signalPoolMaterialization';
import { BfnSignalPoolAuthoring } from './BfnSignalPoolAuthoring';

describe('Signal Pool authoring form', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('shows only the narrow explicit-accumulation fields and blocks an incomplete Add', () => {
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onAdd = vi.fn(() => ({ ok: false as const, issues: [] }));
    render(<BfnSignalPoolAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '信号池' });

    expect(form).toHaveTextContent('将信号产生速率随时间累积为信号浓度。');
    expect(form).toHaveTextContent('dC/dt = r(t)');
    expect(within(form).getByLabelText('名称')).toBeInTheDocument();
    expect(within(form).getByLabelText('可选说明')).toBeInTheDocument();
    expect(within(form).getByRole('group', { name: '信号来源' })).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: '浓度单位' })).toHaveValue('nM');
    expect(within(form).getByLabelText('初始浓度')).toHaveValue(0);
    expect(within(form).getByText('nM/h → nM')).toBeInTheDocument();
    expect(within(form).getByRole('button', { name: '添加到网络' })).toBeDisabled();
    expect(form).not.toHaveTextContent(/降解|稀释|清除|半衰期|体积|时间常数|稳态/u);
    expect(project).toEqual(snapshot);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('offers known, exact existing, and explicit custom signal paths', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    render(
      <BfnSignalPoolAuthoring
        project={project}
        onBack={vi.fn()}
        onAdd={vi.fn(() => ({ ok: false as const, issues: [] }))}
      />,
    );
    const form = screen.getByRole('form', { name: '信号池' });

    await user.click(within(form).getByRole('radio', { name: '已知 AHL/HSL 信号' }));
    const known = within(form).getByRole('combobox', { name: '已知 AHL/HSL 信号' });
    expect(within(known).getAllByRole('option')).toHaveLength(27);
    expect(within(known).getAllByRole('option')[0]).toHaveValue('');
    expect(within(known).getAllByRole('option')[1]?.getAttribute('value')).toMatch(/^ahl\./u);

    await user.click(within(form).getByRole('radio', { name: '项目已有实体' }));
    const existing = within(form).getByRole('combobox', { name: '项目已有实体' });
    expect(within(existing).getAllByRole('option').length).toBeGreaterThan(1);
    expect(within(existing).getAllByRole('option')[1]?.getAttribute('value')).toBeTruthy();

    await user.click(within(form).getByRole('radio', { name: '自定义信号' }));
    expect(within(form).getByRole('textbox', { name: '自定义信号' })).toBeInTheDocument();
    expect(within(form).queryByRole('combobox', { name: '项目已有实体' })).not.toBeInTheDocument();
  });

  it('enables Add only for a finite non-negative C0 and submits one production draft', async () => {
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const outcomes: ReturnType<typeof materializeSignalPool>[] = [];
    const onAdd = vi.fn((draft: SignalPoolDraft) => {
      const outcome = materializeSignalPool(draft, project);
      outcomes.push(outcome);
      return outcome;
    });
    render(<BfnSignalPoolAuthoring project={project} onBack={vi.fn()} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: '信号池' });
    const add = within(form).getByRole('button', { name: '添加到网络' });

    await user.type(within(form).getByLabelText('名称'), '用户信号池');
    await user.click(within(form).getByRole('radio', { name: '自定义信号' }));
    await user.type(within(form).getByRole('textbox', { name: '自定义信号' }), 'Signal X');
    await user.clear(within(form).getByLabelText('初始浓度'));
    await user.type(within(form).getByLabelText('初始浓度'), '-1');
    expect(add).toBeDisabled();

    await user.clear(within(form).getByLabelText('初始浓度'));
    await user.type(within(form).getByLabelText('初始浓度'), '0');
    await user.selectOptions(within(form).getByRole('combobox', { name: '浓度单位' }), 'uM');
    expect(within(form).getByText('uM/h → uM')).toBeInTheDocument();
    expect(add).toBeEnabled();
    await user.click(add);

    expect(onAdd).toHaveBeenCalledTimes(1);
    expect(outcomes[0]).toMatchObject({ ok: true });
    if (!outcomes[0]?.ok) throw new Error('Expected a materialized Signal Pool.');
    const module = outcomes[0].nextProject.network.modules.at(-1);
    if (!module) throw new Error('Expected the Signal Pool module.');
    expect(module).toMatchObject({
      authoring: { name: '用户信号池' },
      inputPorts: [{ quantityType: 'production_rate', unit: 'uM/h' }],
      outputPorts: [{ quantityType: 'concentration', unit: 'uM' }],
    });
    expect(typeof module.inputPorts[0]?.entity).toBe('string');
    expect(typeof module.outputPorts[0]?.entity).toBe('string');
    expect(typeof module.activeModelIds.dynamic).toBe('string');
  });

  it('renders the key fields in English and cancels without mutation', async () => {
    await i18n.changeLanguage('en-US');
    const user = userEvent.setup();
    const project = createDemoBfnProject();
    const snapshot = structuredClone(project);
    const onBack = vi.fn();
    const onAdd = vi.fn(() => ({ ok: false as const, issues: [] }));
    render(<BfnSignalPoolAuthoring project={project} onBack={onBack} onAdd={onAdd} />);
    const form = screen.getByRole('form', { name: 'Signal Pool' });

    expect(within(form).getByLabelText('Name')).toBeInTheDocument();
    expect(within(form).getByLabelText('Description (optional)')).toBeInTheDocument();
    expect(within(form).getByRole('group', { name: 'Signal source' })).toBeInTheDocument();
    expect(within(form).getByRole('combobox', { name: 'Concentration unit' })).toBeInTheDocument();
    expect(within(form).getByLabelText('Initial concentration')).toBeInTheDocument();
    await user.click(within(form).getByRole('button', { name: 'Cancel' }));

    expect(onBack).toHaveBeenCalledTimes(1);
    expect(onAdd).not.toHaveBeenCalled();
    expect(project).toEqual(snapshot);
  });
});
