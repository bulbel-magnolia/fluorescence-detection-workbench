import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';
import '../i18n';
import i18n from '../i18n';
import { TechnicalDetails } from './TechnicalDetails';

describe('TechnicalDetails', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('keeps raw diagnostics behind an explicit disclosure', async () => {
    const user = userEvent.setup();
    render(<TechnicalDetails code="ACK_TIMEOUT" message="Timed out after 900 ms." />);

    const summary = screen.getByText('查看详细信息');
    const details = summary.closest('details');
    expect(details).not.toHaveAttribute('open');

    await user.click(summary);
    expect(details).toHaveAttribute('open');
    expect(screen.getByText('ACK_TIMEOUT')).toBeInTheDocument();
    expect(screen.getByText('Timed out after 900 ms.')).toBeInTheDocument();
  });
});
