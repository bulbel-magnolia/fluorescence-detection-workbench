import { describe, expect, it } from 'vitest';
import i18n from '../../../i18n';
import { loadReleaseCatalogPresentation } from '../../modeling/catalog/releaseCatalogPresentation';
import {
  bfnCatalogEvidenceText,
  hasBfnCatalogEvidencePresentation,
  type BfnCatalogEvidenceCategory,
} from './catalogEvidencePresentation';

const presentation = loadReleaseCatalogPresentation();

interface ReleaseEvidenceSet {
  category: BfnCatalogEvidenceCategory;
  values: readonly string[];
}

const releaseEvidenceSets: readonly ReleaseEvidenceSet[] = [
  {
    category: 'evidence-gap',
    values: unique(presentation.components.flatMap((component) => component.evidenceGaps)),
  },
  {
    category: 'response-class',
    values: unique(presentation.observedPairs.map((pair) => pair.responseClass)),
  },
  {
    category: 'observed-effect',
    values: unique(presentation.observedPairs.map((pair) => pair.observedEffect)),
  },
  {
    category: 'compatibility-relation',
    values: unique(presentation.compatibilityRelations.map((entry) => entry.relationType)),
  },
  {
    category: 'qualitative-outcome',
    values: unique(presentation.compatibilityRelations.map((entry) => entry.qualitativeOutcome)),
  },
  {
    category: 'source-model',
    values: unique(
      presentation.responseVariants.flatMap((response) =>
        response.response.sourceResponse ? [response.response.sourceResponse.modelType] : [],
      ),
    ),
  },
  {
    category: 'fit-status',
    values: unique(
      presentation.responseVariants.flatMap((response) =>
        response.response.sourceResponse ? [response.response.sourceResponse.fitStatus] : [],
      ),
    ),
  },
  {
    category: 'approximation-qualifier',
    values: unique(
      presentation.responseVariants.flatMap((response) => {
        const value = response.response.sourceResponse?.approximationQualifier;
        return value ? [value] : [];
      }),
    ),
  },
  {
    category: 'sequence-status',
    values: unique(presentation.components.map((component) => component.sequenceStatus)),
  },
  {
    category: 'sequence-source-type',
    values: unique(
      presentation.components.flatMap((component) => {
        const value = component.sequenceMetadata?.sequence_source_type;
        return value ? [value] : [];
      }),
    ),
  },
  {
    category: 'sequence-verification-status',
    values: unique(
      presentation.components.flatMap((component) => {
        const value = component.sequenceMetadata?.sequence_verification_status;
        return value ? [value] : [];
      }),
    ),
  },
  {
    category: 'missing-sequence-element',
    values: unique(
      presentation.components.flatMap(
        (component) => component.sequenceMetadata?.missing_sequence_elements ?? [],
      ),
    ),
  },
  {
    category: 'measurement-detail-key',
    values: unique(
      presentation.parameterContexts.flatMap((context) =>
        context.canonical.details?.measurementDetails
          ? Object.keys(context.canonical.details.measurementDetails)
          : [],
      ),
    ),
  },
];

describe('Catalog evidence presentation', () => {
  it.each(releaseEvidenceSets)(
    'covers every frozen-release $category value',
    ({ category, values }) => {
      expect(values.length).toBeGreaterThan(0);
      for (const value of values) {
        expect(hasBfnCatalogEvidencePresentation(category, value), value).toBe(true);
      }
    },
  );

  it('uses conservative user-facing Chinese and English semantics for representative records', () => {
    const zh = i18n.getFixedT('zh-CN');
    const en = i18n.getFixedT('en-US');

    expect(bfnCatalogEvidenceText('evidence-gap', 'direct_hsl_concentration_unavailable', zh)).toBe(
      '缺少发送端 AHL 浓度的直接测量',
    );
    expect(bfnCatalogEvidenceText('response-class', 'activation_strong', zh)).toBe('强激活');
    expect(bfnCatalogEvidenceText('compatibility-relation', 'constraint_hit', zh)).toBe(
      '拟合触及参数约束',
    );
    expect(
      bfnCatalogEvidenceText('qualitative-outcome', 'not admitted for numerical runtime', en),
    ).toBe('This record is not used for numerical simulation');
    expect(bfnCatalogEvidenceText('source-model', 'approximate_half_maximum', zh)).toBe(
      '近似半最大响应位置',
    );
  });

  it('fails closed to a generic user message for an unknown future code', () => {
    const zh = i18n.getFixedT('zh-CN');
    const en = i18n.getFixedT('en-US');

    expect(bfnCatalogEvidenceText('evidence-gap', 'some_new_internal_code', zh)).toBe(
      '存在尚未完整呈现的证据信息',
    );
    expect(bfnCatalogEvidenceText('evidence-gap', 'some_new_internal_code', en)).toBe(
      'Additional evidence information is recorded',
    );
    expect(hasBfnCatalogEvidencePresentation('evidence-gap', 'some_new_internal_code')).toBe(false);
  });
});

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}
