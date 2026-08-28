import { describe, expect, it } from 'vitest';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import { BfnOntologyContractError } from '../../modeling/ontology/v1/ontologyTypes';
import { createCatalogModule } from '../fixtures';
import {
  DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
  presentBfnSemanticFamilyIdentity,
  resolveBfnModuleSemanticPresentation,
  resolveCatalogComponentSemanticPresentation,
  type BfnSemanticPresentationAdapter,
} from './semanticPresentation';

describe('BFN semantic presentation', () => {
  const presentation = loadReleaseCatalogPresentation();

  it('localizes exact Catalog families in Chinese and English', () => {
    const receiver = presentation.components.find((component) => component.role === 'receiver');
    if (!receiver) throw new Error('Receiver fixture is missing.');

    const chinese = resolveCatalogComponentSemanticPresentation(receiver.id, presentation, 'zh-CN');
    const english = resolveCatalogComponentSemanticPresentation(receiver.id, presentation, 'en-US');

    expect(chinese).toMatchObject({
      status: 'resolved',
      functionalFamilies: [{ id: 'functional.signal_response', label: '信号响应' }],
      biologicalFamilies: [{ id: 'bio.ahl_receiver_regulator', label: 'AHL 接收/调控系统' }],
    });
    expect(english).toMatchObject({
      status: 'resolved',
      functionalFamilies: [{ id: 'functional.signal_response', label: 'Signal response' }],
      biologicalFamilies: [
        {
          id: 'bio.ahl_receiver_regulator',
          label: 'AHL receiver / regulatory system',
        },
      ],
    });
  });

  it('presents curated built-ins and legitimate unclassified modules without guessing', () => {
    const reporter = resolveBfnModuleSemanticPresentation(
      createCatalogModule('reporter', 'semantic-test'),
      'zh-CN',
    );
    const unknownModule = createCatalogModule('reporter', 'unknown-semantic-test');
    unknownModule.labelKey = 'bfn.modules.unknown.name';
    unknownModule.displayName = { en: 'LuxR Sensor', zh: 'LuxR 传感器' };
    const unknown = resolveBfnModuleSemanticPresentation(unknownModule, 'zh-CN');

    expect(reporter.functionalFamilies[0]).toEqual({
      id: 'functional.expression_transfer',
      label: '表达响应',
    });
    expect(reporter.biologicalFamilies[0]).toEqual({
      id: 'bio.reporter_system',
      label: '报告表达系统',
    });
    expect(unknown).toMatchObject({
      status: 'resolved',
      functionalFamilies: [{ id: 'functional.unclassified', label: '未分类' }],
      biologicalFamilies: [{ id: 'bio.unclassified', label: '未分类' }],
    });
  });

  it('maps typed resolution failures to an unavailable presentation', () => {
    const receiver = presentation.components.find((component) => component.role === 'receiver');
    if (!receiver) throw new Error('Receiver fixture is missing.');
    const throwingAdapter: BfnSemanticPresentationAdapter = {
      ...DEFAULT_BFN_SEMANTIC_PRESENTATION_ADAPTER,
      resolveCatalogComponent: () => {
        throw new BfnOntologyContractError('catalog-presentation-untrusted');
      },
    };

    expect(
      resolveCatalogComponentSemanticPresentation(
        receiver.id,
        presentation,
        'zh-CN',
        throwingAdapter,
      ),
    ).toEqual({
      status: 'unavailable',
      functionalFamilies: [],
      biologicalFamilies: [],
    });
  });

  it('reads labels from the frozen registry and returns a deeply immutable value', () => {
    const result = presentBfnSemanticFamilyIdentity(
      {
        functionalFamilyIds: ['functional.signal_production'],
        biologicalFamilyIds: ['bio.ahl_synthase'],
      },
      'en-US',
    );

    expect(result.functionalFamilies[0]?.label).toBe('Signal production');
    expect(result.biologicalFamilies[0]?.label).toBe('AHL synthase system');
    expect(Object.isFrozen(result)).toBe(true);
    expect(Object.isFrozen(result.functionalFamilies)).toBe(true);
    expect(Object.isFrozen(result.functionalFamilies[0])).toBe(true);
    expect(Reflect.set(result.functionalFamilies[0]!, 'label', 'Changed')).toBe(false);
    expect(result.functionalFamilies[0]?.label).toBe('Signal production');
  });
});
