import {
  compareBfnOntologyStableText,
  type BfnOntologyManifest,
  type BfnOntologyRegistry,
  type BfnOntologyTerm,
  type BfnOntologyTermKind,
} from './ontologyTypes';
import { deepFreezeBfnOntologyValue, validateBfnOntologyRegistry } from './ontologyValidation';

const manifest: BfnOntologyManifest = {
  schema: 'BFN-ONTOLOGY',
  version: '1.0',
  id: 'bfn-semantic-ontology',
};

const terms: BfnOntologyTerm[] = [
  {
    id: 'functional.signal_response',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Signal response', zh: '信号响应' },
    description: {
      en: 'Receives an input signal and produces a regulated or responsive output.',
      zh: '接收输入信号并产生受调控的响应输出。',
    },
  },
  {
    id: 'functional.signal_production',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Signal production', zh: '信号产生' },
    description: {
      en: 'Produces or outputs a biological signal that can serve as another module input.',
      zh: '产生或输出可作为其他模块输入的生物信号。',
    },
  },
  {
    id: 'functional.expression_transfer',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Expression transfer', zh: '表达响应' },
    description: {
      en: 'Converts an upstream regulatory state or activity into an expression output.',
      zh: '将上游调控状态或活性转换为表达输出。',
    },
  },
  {
    id: 'functional.multi_input_integration',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Multi-input integration', zh: '多输入整合' },
    description: {
      en: 'Integrates multiple inputs into one output under an explicitly defined model.',
      zh: '按照明确模型将多个输入整合为一个输出。',
    },
  },
  {
    id: 'functional.molecular_conversion',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Molecular conversion', zh: '分子转化' },
    description: {
      en: 'Transforms one molecular entity into another molecular entity.',
      zh: '将一种分子实体转化为另一种分子实体。',
    },
  },
  {
    id: 'functional.transport',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Transport', zh: '运输与交换' },
    description: {
      en: 'Moves or exchanges molecular entities across locations or compartments.',
      zh: '在位置或区室之间运输或交换分子实体。',
    },
  },
  {
    id: 'functional.binding_interaction',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Binding interaction', zh: '结合与相互作用' },
    description: {
      en: 'Represents binding or another direct molecular interaction as the module function.',
      zh: '以结合或其他直接分子相互作用作为模块功能。',
    },
  },
  {
    id: 'functional.degradation_clearance',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Degradation / clearance', zh: '降解与清除' },
    description: {
      en: 'Reduces a molecular entity through degradation, removal, or clearance.',
      zh: '通过降解、移除或清除降低分子实体。',
    },
  },
  {
    id: 'functional.unclassified',
    kind: 'functional_family',
    parentId: null,
    names: { en: 'Unclassified', zh: '未分类' },
    description: {
      en: 'No functional family is assigned by the current ontology contract.',
      zh: '当前本体合同未为该对象分配功能类别。',
    },
  },
  {
    id: 'bio.ahl_receiver_regulator',
    kind: 'biological_component_family',
    parentId: null,
    names: { en: 'AHL receiver / regulatory system', zh: 'AHL 接收/调控系统' },
    description: {
      en: 'Broad AHL/HSL catalog class for receiver and regulatory systems, without a protein homology claim.',
      zh: 'AHL/HSL 目录中接收与调控系统的广义类别，不表示蛋白同源家族。',
    },
  },
  {
    id: 'bio.ahl_synthase',
    kind: 'biological_component_family',
    parentId: null,
    names: { en: 'AHL synthase system', zh: 'AHL 合成系统' },
    description: {
      en: 'Broad AHL/HSL catalog class for signal synthesis systems, without a phylogenetic family claim.',
      zh: 'AHL/HSL 目录中信号合成系统的广义类别，不表示系统发育家族。',
    },
  },
  {
    id: 'bio.reporter_system',
    kind: 'biological_component_family',
    parentId: null,
    names: { en: 'Reporter system', zh: '报告表达系统' },
    description: {
      en: 'A biological implementation that converts upstream regulation into a reporter expression output.',
      zh: '将上游调控转换为报告表达输出的生物实现类别。',
    },
  },
  {
    id: 'bio.unclassified',
    kind: 'biological_component_family',
    parentId: null,
    names: { en: 'Unclassified', zh: '未分类' },
    description: {
      en: 'No biological component family is assigned by the current ontology contract.',
      zh: '当前本体合同未为该对象分配生物元件类别。',
    },
  },
];

terms.sort((left, right) => compareBfnOntologyStableText(left.id, right.id));

export const BFN_ONTOLOGY_REGISTRY: BfnOntologyRegistry = deepFreezeBfnOntologyValue({
  manifest,
  terms,
});

validateBfnOntologyRegistry(BFN_ONTOLOGY_REGISTRY);

const termsById = new Map(BFN_ONTOLOGY_REGISTRY.terms.map((term) => [term.id, term]));

export function getBfnOntologyTerm(id: string): BfnOntologyTerm | undefined {
  return termsById.get(id);
}

export function listBfnOntologyTerms(kind: BfnOntologyTermKind): readonly BfnOntologyTerm[] {
  return Object.freeze(BFN_ONTOLOGY_REGISTRY.terms.filter((term) => term.kind === kind));
}
