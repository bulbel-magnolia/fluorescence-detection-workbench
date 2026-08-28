import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../../../i18n';
import type { BfnCatalogInverseTarget } from '../catalogInverseDesignTypes';
import { BfnInverseResponseChart } from './BfnInverseResponseChart';

const target: BfnCatalogInverseTarget = {
  inputSignalId: 'ahl.3oc6.l',
  responseWindow: {
    lowConcentrationM: 1e-9,
    lowResponseMaximum: 0.2,
    highConcentrationM: 1e-6,
    highResponseMinimum: 0.8,
  },
  biologicalDirection: 'any',
};

const points = [
  { concentrationM: 1e-9, response: 0.1 },
  { concentrationM: 1e-8, response: 0.3 },
  { concentrationM: 1e-7, response: 0.7 },
  { concentrationM: 1e-6, response: 0.9 },
];

describe('inverse response chart', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('renders scientific axes and non-degenerate target-constraint segments', () => {
    render(
      <BfnInverseResponseChart
        curves={[{ id: 'response-1', label: 'LuxR', points }]}
        target={target}
        concentrationUnit='nM'
        locale='zh-CN'
        ariaLabel='测试响应曲线'
      />,
    );

    expect(screen.getByText('浓度（nM，log）')).toBeInTheDocument();
    expect(screen.getByText('归一化响应')).toBeInTheDocument();
    expect(screen.getByText('≤ 0.20')).toBeInTheDocument();
    expect(screen.getByText('≥ 0.80')).toBeInTheDocument();
    const low = screen.getByTestId('bfn-inverse-low-constraint');
    const high = screen.getByTestId('bfn-inverse-high-constraint');
    expect(low.getAttribute('x1')).not.toBe(low.getAttribute('x2'));
    expect(high.getAttribute('x1')).not.toBe(high.getAttribute('x2'));
  });

  it('draws multiple supplied curves against one shared target constraint set', () => {
    render(
      <BfnInverseResponseChart
        curves={[
          { id: 'response-1', label: 'LuxR', points },
          {
            id: 'response-2',
            label: 'TraR',
            points: points.map((point) => ({ ...point, response: point.response * 0.9 })),
          },
        ]}
        target={target}
        concentrationUnit='nM'
        locale='zh-CN'
        ariaLabel='测试比较曲线'
      />,
    );

    const chart = screen.getByRole('img', { name: '测试比较曲线' });
    expect(chart.querySelectorAll('.bfn-inverse-chart__curve')).toHaveLength(2);
    expect(chart.querySelectorAll('[data-constraint]')).toHaveLength(2);
  });

  it('samples wide log ranges at readable integer decades', () => {
    const wideTarget: BfnCatalogInverseTarget = {
      ...target,
      responseWindow: {
        ...target.responseWindow,
        lowConcentrationM: 1e-15,
        highConcentrationM: 1e-5,
      },
    };
    render(
      <BfnInverseResponseChart
        curves={[
          {
            id: 'response-1',
            label: 'LuxR',
            points: [
              { concentrationM: 1e-15, response: 0.1 },
              { concentrationM: 1e-5, response: 0.9 },
            ],
          },
        ]}
        target={wideTarget}
        concentrationUnit='nM'
        locale='zh-CN'
        ariaLabel='宽范围响应曲线'
      />,
    );

    const chart = screen.getByRole('img', { name: '宽范围响应曲线' });
    expect(chart).toHaveTextContent('0.000001');
    expect(chart).toHaveTextContent('0.001');
    expect(chart).toHaveTextContent('0.1');
    expect(chart).toHaveTextContent('100');
    expect(chart).toHaveTextContent('10000');
    expect(chart).not.toHaveTextContent('316227');
  });

  it('localizes axis titles in English', async () => {
    await i18n.changeLanguage('en-US');
    render(
      <BfnInverseResponseChart
        curves={[{ id: 'response-1', label: 'LuxR', points }]}
        target={target}
        concentrationUnit='nM'
        locale='en-US'
        ariaLabel='Response curve test'
      />,
    );

    expect(screen.getByText('Concentration (nM, log)')).toBeInTheDocument();
    expect(screen.getByText('Normalized response')).toBeInTheDocument();
  });
});
