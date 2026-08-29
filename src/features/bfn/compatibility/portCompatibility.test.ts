import { describe, expect, it } from 'vitest';
import type { BfnPort } from '../types';
import { assessBfnPortCompatibility } from './portCompatibility';

function outputPort(overrides: Partial<BfnPort> = {}): BfnPort {
  return {
    id: 'source-output',
    entity: '3OC6-HSL',
    quantityType: 'concentration',
    unit: 'nM',
    direction: 'output',
    ...overrides,
  };
}

function inputPort(overrides: Partial<BfnPort> = {}): BfnPort {
  return {
    id: 'target-input',
    entity: '3OC6-HSL',
    quantityType: 'concentration',
    unit: 'nM',
    direction: 'input',
    ...overrides,
  };
}

describe('BFN port compatibility', () => {
  it('accepts concentration nM to M and records representation normalization', () => {
    const assessment = assessBfnPortCompatibility(outputPort(), inputPort({ unit: 'M' }));

    expect(assessment.state).toBe('compatible');
    expect(assessment.requiresUnitNormalization).toBe(true);
    expect(assessment.checks).toHaveLength(4);
    expect(assessment.checks.find((check) => check.kind === 'unit_dimension')?.state).toBe(
      'compatible',
    );
    expect(Object.isFrozen(assessment)).toBe(true);
    expect(Object.isFrozen(assessment.checks)).toBe(true);
    expect(assessment.checks.every(Object.isFrozen)).toBe(true);
  });

  it('does not request normalization when the unit representation is identical', () => {
    const assessment = assessBfnPortCompatibility(outputPort(), inputPort());

    expect(assessment.state).toBe('compatible');
    expect(assessment.requiresUnitNormalization).toBe(false);
  });

  it('produces identical compatibility with or without descriptive Port metadata', () => {
    const baseline = assessBfnPortCompatibility(outputPort(), inputPort());
    const described = assessBfnPortCompatibility(
      outputPort({
        displayName: { en: 'Catalog signal', zh: '目录信号' },
        authoring: { origin: 'user_defined', name: 'Secreted signal role' },
      }),
      inputPort({
        displayName: { en: 'Input signal', zh: '输入信号' },
        authoring: { origin: 'user_defined', name: 'Inducer input' },
      }),
    );

    expect(described).toEqual(baseline);
  });

  it('hard-rejects production rate to concentration even for the same AHL entity', () => {
    const assessment = assessBfnPortCompatibility(
      outputPort({ entity: 'AHL', quantityType: 'production_rate', unit: 'nM/h' }),
      inputPort({ entity: 'AHL', quantityType: 'concentration', unit: 'nM' }),
    );

    expect(assessment.state).toBe('incompatible');
    expect(assessment.checks.find((check) => check.kind === 'quantity_type')?.state).toBe(
      'incompatible',
    );
    expect(assessment.checks.find((check) => check.kind === 'unit_dimension')?.state).toBe(
      'incompatible',
    );
  });

  it('hard-rejects different entities without fuzzy or ontology mapping', () => {
    for (const entity of ['GFP', 'AHL']) {
      const assessment = assessBfnPortCompatibility(outputPort(), inputPort({ entity }));
      expect(assessment.state).toBe('incompatible');
      expect(assessment.checks.find((check) => check.kind === 'entity')?.state).toBe(
        'incompatible',
      );
    }
  });

  it('treats a missing core entity as incompatible instead of uncertain', () => {
    const assessment = assessBfnPortCompatibility(
      outputPort({ entity: '' }),
      inputPort({ entity: '' }),
    );

    expect(assessment.state).toBe('incompatible');
    expect(assessment.checks.find((check) => check.kind === 'entity')?.state).toBe('incompatible');
  });

  it('hard-rejects molecules per cell to molar concentration', () => {
    const assessment = assessBfnPortCompatibility(
      outputPort({ quantityType: 'amount', unit: 'molecules/cell' }),
      inputPort({ quantityType: 'amount', unit: 'nM' }),
    );

    expect(assessment.state).toBe('incompatible');
    expect(assessment.checks.find((check) => check.kind === 'unit_dimension')?.state).toBe(
      'incompatible',
    );
  });

  it.each([
    ['input', 'input'],
    ['output', 'output'],
    ['input', 'output'],
  ] as const)('hard-rejects direction %s to %s', (sourceDirection, targetDirection) => {
    const assessment = assessBfnPortCompatibility(
      outputPort({ direction: sourceDirection }),
      inputPort({ direction: targetDirection }),
    );

    expect(assessment.state).toBe('incompatible');
    expect(assessment.checks.find((check) => check.kind === 'direction')?.state).toBe(
      'incompatible',
    );
  });

  it('keeps a signal-production to signal-response topology behind the quantity hard boundary', () => {
    const assessment = assessBfnPortCompatibility(
      outputPort({ entity: '3OC6-HSL', quantityType: 'production_rate', unit: 'uM/h' }),
      inputPort({ entity: '3OC6-HSL', quantityType: 'concentration', unit: 'uM' }),
    );

    expect(assessment.state).toBe('incompatible');
    expect(assessment).not.toHaveProperty('score');
  });

  it('is deterministic and does not mutate either port', () => {
    const source = outputPort();
    const target = inputPort({ unit: 'uM' });
    const sourceBefore = structuredClone(source);
    const targetBefore = structuredClone(target);

    const first = assessBfnPortCompatibility(source, target);
    const second = assessBfnPortCompatibility(source, target);

    expect(second).toEqual(first);
    expect(source).toEqual(sourceBefore);
    expect(target).toEqual(targetBefore);
  });
});
