import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../i18n';
import { ModelingPage } from './ModelingPage';

describe('Batch 4 precise chart reading controls', () => {
  beforeEach(async () => {
    localStorage.clear();
    await i18n.changeLanguage('en-US');
  });

  it('keeps view controls ephemeral and preserves project history state', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const dock = document.querySelector('.bfn-result-panel');
    if (!dock) throw new Error('Result dock was not rendered');
    const undo = screen.getByRole('button', { name: 'Undo' });
    expect(undo).toBeDisabled();

    const xAxis = within(dock as HTMLElement).getByText('X axis').closest('details');
    if (!xAxis) throw new Error('X axis controls were not rendered');
    await user.click(within(xAxis as HTMLElement).getByRole('button', { name: /Log10/ }));
    expect(undo).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reset view' })).toBeInTheDocument();
  });

  it('prevents hiding every actual Y line and allows uncertainty/ANN toggles', async () => {
    const user = userEvent.setup();
    render(<ModelingPage />);
    await user.click(screen.getByRole('button', { name: 'Run steady-state analysis' }));
    const full = screen.getByRole('button', { name: /Network response/ });
    const ann = screen.getByRole('button', { name: /ANN approximation/ });
    await user.click(full);
    expect(within(document.querySelector('.bfn-chart-controls') as HTMLElement).getByText('Keep at least one actual Y series visible.')).toBeInTheDocument();
    expect(full).toHaveAttribute('aria-pressed', 'true');
    await user.click(ann);
    expect(ann).toHaveAttribute('aria-pressed', 'false');
  });
});
