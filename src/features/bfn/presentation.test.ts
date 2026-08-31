import { beforeEach, describe, expect, it } from 'vitest';
import i18n from '../../i18n';
import { createCatalogModule, createDemoBfnProject } from './fixtures';
import {
  bfnContextSectionTitle,
  bfnEntityLabel,
  bfnEvidenceTone,
  bfnModuleFlowLabel,
  bfnNodeDisplayName,
  bfnParameterPresentations,
  bfnPortMetaLabel,
  bfnPortPrimaryLabel,
  bfnQuantityLabel,
  bfnUnitLabel,
} from './presentation';

describe('BFN object presentation', () => {
  beforeEach(async () => {
    await i18n.changeLanguage('zh-CN');
  });

  it('presents the 3OC6-HSL input as a biological quantity with its unit', () => {
    const project = createDemoBfnProject();
    const source = project.network.inputSources[0]!;
    const t = i18n.getFixedT('zh-CN');

    expect(bfnPortPrimaryLabel(source.outputPort, t)).toBe('3OC6-HSL 浓度');
    expect(bfnPortMetaLabel(source.outputPort, t)).toBe('浓度 · nM');
  });

  it('uses one consistent flow label for the AHL and reporter modules', () => {
    const project = createDemoBfnProject();
    const t = i18n.getFixedT('zh-CN');

    expect(bfnModuleFlowLabel(project.network.modules[0]!, t)).toBe('3OC6-HSL 浓度 → 启动子活性');
    expect(bfnModuleFlowLabel(project.network.modules[1]!, t)).toBe('启动子活性 → 报告信号');
  });

  it('turns dimensionless units into a user-facing relative value', () => {
    expect(bfnUnitLabel('dimensionless', i18n.getFixedT('zh-CN'))).toBe('相对值');
  });

  it('localizes every scientific quantity exposed by user authoring', () => {
    const zh = i18n.getFixedT('zh-CN');
    const en = i18n.getFixedT('en-US');

    expect(
      [
        'concentration',
        'amount',
        'production_rate',
        'expression_level',
        'activity',
        'flux',
        'fraction',
        'cell_density',
      ].map((quantity) => bfnQuantityLabel(quantity, zh)),
    ).toEqual(['浓度', '物质量', '生成速率', '表达水平', '活性', '通量', '比例', '细胞密度']);
    expect(bfnQuantityLabel('production_rate', en)).toBe('Production rate');
  });

  it('uses one localized project display name with a label-key fallback', () => {
    const module = createDemoBfnProject().network.modules[0]!;
    const zh = i18n.getFixedT('zh-CN');
    const en = i18n.getFixedT('en-US');

    expect(bfnNodeDisplayName(module, 'zh-CN', zh)).toBe(zh(module.labelKey));
    module.displayName = { en: 'RhlR / pRhl', zh: 'RhlR / pRhl' };
    expect(bfnNodeDisplayName(module, 'zh-CN', zh)).toBe('RhlR / pRhl');
    expect(bfnNodeDisplayName(module, 'en-US', en)).toBe('RhlR / pRhl');
  });

  it('prioritizes verbatim user-authored module and Port role names', () => {
    const module = createDemoBfnProject().network.modules[0]!;
    const port = module.inputPorts[0]!;
    const t = i18n.getFixedT('zh-CN');
    module.displayName = { en: 'Localized module', zh: '本地化模块' };
    module.authoring = {
      origin: 'user_defined',
      name: '  User module verbatim  ',
      description: null,
    };
    port.displayName = { en: 'Localized port', zh: '本地化端口' };
    port.authoring = { origin: 'user_defined', name: '  Input role verbatim  ' };

    expect(bfnNodeDisplayName(module, 'zh-CN', t)).toBe('  User module verbatim  ');
    expect(bfnPortPrimaryLabel(port, t, 'zh-CN')).toBe('  Input role verbatim  ');
    expect(bfnEntityLabel(port.entity, t)).toBe('3OC6-HSL');
  });

  it('explains Hill response parameters in biological terms', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[0]!;
    const model = module.modelVariants.find((entry) => entry.mode === 'static') ?? null;
    const rows = bfnParameterPresentations(module, model, i18n.getFixedT('zh-CN'));

    expect(rows.find((row) => row.id === 'minimum-response')?.description).toBe(
      '3OC6-HSL 浓度很低时的基础启动子活性。',
    );
    expect(rows.find((row) => row.id === 'half-response')).toMatchObject({
      label: '半响应浓度',
      symbol: 'K',
      description: '达到约一半最大响应时所需的3OC6-HSL 浓度。',
    });
    expect(rows.find((row) => row.id === 'hill-coefficient')?.description).toBe(
      '反映响应曲线由低到高变化的陡峭程度。',
    );
  });

  it('explains linear and dynamic reporter parameters', () => {
    const project = createDemoBfnProject();
    const module = project.network.modules[1]!;
    const staticModel = module.modelVariants.find((entry) => entry.mode === 'static') ?? null;
    const dynamicModel = module.modelVariants.find((entry) => entry.mode === 'dynamic') ?? null;
    const t = i18n.getFixedT('zh-CN');
    const staticRows = bfnParameterPresentations(module, staticModel, t);
    const dynamicRows = bfnParameterPresentations(module, dynamicModel, t);

    expect(staticRows.find((row) => row.id === 'response-coefficient')).toMatchObject({
      label: '响应系数',
      description: '决定输入变化对报告信号变化幅度的影响。',
    });
    expect(staticRows.find((row) => row.id === 'base-output')).toMatchObject({
      label: '基础输出',
      description: '输入为零或很低时仍保留的报告信号。',
    });
    expect(dynamicRows.find((row) => row.id === 'response-time')).toMatchObject({
      label: '响应时间',
      symbol: 'τ',
      description: '决定报告信号接近新的稳定水平的快慢。',
    });
  });

  it('names dual-input parameters without exposing K1, n1, or alpha1 first', () => {
    const module = createCatalogModule('dual-input-gate', 'presentation-test');
    const model = module.modelVariants[0] ?? null;
    const t = i18n.getFixedT('zh-CN');
    const rows = bfnParameterPresentations(module, model, t);

    expect(bfnModuleFlowLabel(module, t)).toBe('输入信号 A + 输入信号 B → 综合响应');
    expect(rows.map((row) => row.label)).toEqual(
      expect.arrayContaining(['输入 1 半响应点', '输入 1 Hill 系数', '输入 1 贡献系数']),
    );
    expect(rows.map((row) => row.label)).not.toEqual(expect.arrayContaining(['K1', 'n1', 'α1']));
    expect(rows.find((row) => row.id === 'input-1-contribution')?.description).toBe(
      '表示该输入对总输出的相对贡献。',
    );
    expect(rows.find((row) => row.id === 'base-output')?.description).toBe(
      '输入为零或很低时仍保留的综合响应。',
    );
  });

  it('labels demo contexts as example experimental conditions', () => {
    const context = createDemoBfnProject().registry.contexts[0]!;
    expect(bfnContextSectionTitle(context, i18n.getFixedT('zh-CN'))).toBe('示例实验条件');
  });

  it('separates evidence classification, validation, and assumption tones', () => {
    expect(bfnEvidenceTone('data_driven_prediction')).toBe('evidence');
    expect(bfnEvidenceTone('mechanistic_model_only')).toBe('evidence');
    expect(bfnEvidenceTone('fitted_from_published_data')).toBe('evidence');
    expect(bfnEvidenceTone('externally_validated')).toBe('validated');
    expect(bfnEvidenceTone('independent_assumption')).toBe('warning');
    expect(bfnEvidenceTone('proposed_unbuilt_design')).toBe('warning');
  });
});
