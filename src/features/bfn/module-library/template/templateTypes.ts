import type {
  BfnContextDocumentationState,
  BfnEvidenceGrade,
  BfnImplementationMaturity,
  BfnLocalizedDisplayName,
  BfnModuleImplementationState,
  BfnParameterEstimate,
  BfnProvenanceKind,
  BfnQuantityType,
  BfnUnit,
  BfnUncertaintyMethod,
  BfnProject,
} from '../../types';

export const BFN_MODULE_TEMPLATE_SCHEMA = 'BFN-MODULE-TEMPLATE' as const;
export const BFN_MODULE_TEMPLATE_SCHEMA_VERSION = '1.0' as const;

export type BfnModuleTemplateClass = 'static' | 'first_order' | 'accumulator';
export type BfnTemplateEntityPolicy = 'embedded' | 'slot';

export interface BfnModuleTemplateMetadata {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly latestRevision: number;
}

export interface BfnTemplatePortV1 {
  readonly key: string;
  readonly entityKey: string;
  readonly quantityType: BfnQuantityType;
  readonly unit: BfnUnit;
  readonly direction: 'input' | 'output';
  readonly displayName?: BfnLocalizedDisplayName;
  readonly authoringName?: string;
}

export interface BfnTemplateCanonicalEntityV1 {
  readonly key: string;
  readonly mode: 'canonical';
  readonly authority: 'ahl_hsl_catalog';
  readonly catalogId: string;
  readonly entityId: string;
  readonly displayName: string;
}

export interface BfnTemplateEmbeddedEntityV1 {
  readonly key: string;
  readonly mode: 'embedded';
  readonly displayName: string;
  readonly description: string | null;
}

export interface BfnTemplateEntityRequirementV1 {
  readonly portKey: string;
  readonly direction: 'input' | 'output';
  readonly quantityType: BfnQuantityType;
  readonly unit: BfnUnit;
}

export interface BfnTemplateEntitySlotV1 {
  readonly key: string;
  readonly mode: 'slot';
  readonly sourceEntityId: string;
  readonly displayName: string;
  readonly description: string | null;
  readonly requirements: readonly BfnTemplateEntityRequirementV1[];
}

export type BfnTemplateEntityV1 =
  BfnTemplateCanonicalEntityV1 | BfnTemplateEmbeddedEntityV1 | BfnTemplateEntitySlotV1;

export interface BfnTemplateHillResponseV1 {
  readonly family: 'hill_activation' | 'hill_repression';
  readonly inputPortKey: string;
  readonly ymin: BfnParameterEstimate;
  readonly ymax: BfnParameterEstimate;
  readonly k: BfnParameterEstimate;
  readonly n: BfnParameterEstimate;
}

export interface BfnTemplateLinearResponseV1 {
  readonly family: 'linear_transfer';
  readonly inputPortKey: string;
  readonly scale: BfnParameterEstimate;
  readonly intercept: BfnParameterEstimate;
  readonly outputMinimum?: number;
  readonly outputMaximum?: number;
}

export interface BfnTemplateIdentityResponseV1 {
  readonly family: 'identity';
  readonly inputPortKey: string;
}

export interface BfnTemplateIndependentInputTermV1 {
  readonly inputPortKey: string;
  readonly direction: 'activation' | 'repression';
  readonly k: BfnParameterEstimate;
  readonly n: BfnParameterEstimate;
  readonly contribution: BfnParameterEstimate;
}

export interface BfnTemplateIndependentResponseV1 {
  readonly family: 'independent_inputs';
  readonly terms: readonly BfnTemplateIndependentInputTermV1[];
  readonly basal: BfnParameterEstimate;
  readonly outputMaximum: BfnParameterEstimate;
  readonly aggregation: 'bounded_sum' | 'multiplicative';
  readonly interactionAssumption: 'independent_unverified';
}

export type BfnTemplateStaticResponseV1 =
  | BfnTemplateHillResponseV1
  | BfnTemplateLinearResponseV1
  | BfnTemplateIdentityResponseV1
  | BfnTemplateIndependentResponseV1;

export interface BfnTemplateModelBaseV1 {
  readonly key: string;
  readonly version: string;
  readonly contextKey: string | null;
  readonly validityDomainKey: string;
  readonly provenanceKeys: readonly string[];
  readonly evidenceGrade: BfnEvidenceGrade;
  readonly uncertaintyMethod: BfnUncertaintyMethod;
}

export interface BfnTemplateStaticModelV1 extends BfnTemplateModelBaseV1 {
  readonly mode: 'static';
  readonly family: BfnTemplateStaticResponseV1['family'];
  readonly response: BfnTemplateStaticResponseV1;
}

export interface BfnTemplateFirstOrderModelV1 extends BfnTemplateModelBaseV1 {
  readonly mode: 'dynamic';
  readonly family: 'first_order';
  readonly steadyStateResponse: BfnTemplateStaticResponseV1;
  readonly tau: BfnParameterEstimate;
  readonly initialState: number;
}

export interface BfnTemplateAccumulatorModelV1 extends BfnTemplateModelBaseV1 {
  readonly mode: 'dynamic';
  readonly family: 'accumulator';
  readonly inputPortKey: string;
  readonly outputPortKey: string;
  readonly initialState: number;
}

export interface BfnTemplateContextV1 {
  readonly key: string;
  readonly labelKey: string;
  readonly documentationState: BfnContextDocumentationState;
  readonly host: string | null;
  readonly strain: string | null;
  readonly medium: string | null;
  readonly temperatureCelsius: number | null;
  readonly ph: number | null;
  readonly oxygenation: string | null;
  readonly growthPhase: string | null;
  readonly plasmidBackbone: string | null;
  readonly copyNumberRegime: string | null;
  readonly inductionProtocol: string | null;
  readonly measurementTimeHours: number | null;
  readonly batch: string | null;
  readonly isDemo: boolean;
}

export interface BfnTemplateValidityRangeV1 {
  readonly portKey: string;
  readonly minimum: number;
  readonly maximum: number;
  readonly unit: BfnUnit;
}

export interface BfnTemplateValidityDomainV1 {
  readonly key: string;
  readonly labelKey: string;
  readonly inputRanges: readonly BfnTemplateValidityRangeV1[];
  readonly timeRangeHours?: readonly [number, number];
  readonly contextKey: string | null;
}

export interface BfnTemplateProvenanceV1 {
  readonly key: string;
  readonly kind: BfnProvenanceKind;
  readonly reference: string;
}

export interface BfnTemplateImplementationV1 {
  readonly key: string;
  readonly labelKey: string;
  readonly promoter: string;
  readonly operator: string | null;
  readonly rbs: string;
  readonly codingSequence: string;
  readonly degradationTag: string;
  readonly plasmidBackbone: string;
  readonly host: string;
  readonly strainComposition: string | null;
  readonly evidenceGrade: BfnEvidenceGrade;
  readonly maturity: BfnImplementationMaturity;
  readonly provenanceKeys: readonly string[];
  readonly isDemo: boolean;
}

interface BfnReusableModulePayloadBaseV1 {
  readonly ports: readonly BfnTemplatePortV1[];
  readonly entities: readonly BfnTemplateEntityV1[];
  readonly contexts: readonly BfnTemplateContextV1[];
  readonly validityDomains: readonly BfnTemplateValidityDomainV1[];
  readonly provenance: readonly BfnTemplateProvenanceV1[];
  readonly implementations: readonly BfnTemplateImplementationV1[];
  readonly implementationKeys: readonly string[];
  readonly moduleEvidenceGrade: BfnEvidenceGrade;
  readonly implementationState: BfnModuleImplementationState;
}

export interface BfnReusableStaticModulePayloadV1 extends BfnReusableModulePayloadBaseV1 {
  readonly moduleClass: 'static';
  readonly activeModels: { readonly static: string };
  readonly models: { readonly static: BfnTemplateStaticModelV1 };
}

export interface BfnReusableFirstOrderModulePayloadV1 extends BfnReusableModulePayloadBaseV1 {
  readonly moduleClass: 'first_order';
  readonly activeModels: { readonly static: string; readonly dynamic: string };
  readonly models: {
    readonly static: BfnTemplateStaticModelV1;
    readonly dynamic: BfnTemplateFirstOrderModelV1;
  };
}

export interface BfnReusableAccumulatorModulePayloadV1 extends BfnReusableModulePayloadBaseV1 {
  readonly moduleClass: 'accumulator';
  readonly activeModels: { readonly dynamic: string };
  readonly models: { readonly dynamic: BfnTemplateAccumulatorModelV1 };
}

export type BfnReusableModulePayloadV1 =
  | BfnReusableStaticModulePayloadV1
  | BfnReusableFirstOrderModulePayloadV1
  | BfnReusableAccumulatorModulePayloadV1;

export interface BfnModuleTemplateVersionV1 {
  readonly schema: typeof BFN_MODULE_TEMPLATE_SCHEMA;
  readonly schemaVersion: typeof BFN_MODULE_TEMPLATE_SCHEMA_VERSION;
  readonly id: string;
  readonly templateId: string;
  readonly revision: number;
  readonly createdAt: string;
  readonly note: string | null;
  readonly payload: BfnReusableModulePayloadV1;
  readonly payloadSignature: string;
}

export type BfnTemplateCaptureIssueCode =
  | 'project_schema_invalid'
  | 'module_not_found'
  | 'module_not_user_defined'
  | 'demo_module_unsupported'
  | 'active_model_reference_invalid'
  | 'module_class_unsupported'
  | 'unsupported_model_family'
  | 'unsupported_dormant_model_variant'
  | 'dataset_dependency_unsupported'
  | 'calibration_map_unsupported'
  | 'catalog_reference_unsupported'
  | 'scientific_contract_invalid'
  | 'dependency_missing'
  | 'dependency_conflict'
  | 'entity_policy_missing'
  | 'entity_policy_invalid'
  | 'entity_definition_missing'
  | 'entity_definition_conflict'
  | 'embedded_entity_ineligible'
  | 'canonical_entity_conflict';

export interface BfnTemplateContractIssue {
  readonly code: BfnTemplateCaptureIssueCode | BfnTemplateInstantiationIssueCode;
  readonly path: string;
  readonly details?: readonly string[];
}

export interface BfnTemplateCaptureOptions {
  readonly entityPolicies: Readonly<Record<string, BfnTemplateEntityPolicy>>;
}

export type BfnTemplateCaptureResult =
  | { readonly ok: true; readonly payload: BfnReusableModulePayloadV1 }
  | { readonly ok: false; readonly issues: readonly BfnTemplateContractIssue[] };

export type BfnTemplateEntityBindingDecision =
  | {
      readonly mode: 'existing_same_entity';
      readonly targetEntityId: string;
      readonly identityConfirmation: 'same_scientific_entity';
    }
  | {
      readonly mode: 'create_same_entity';
      readonly identityConfirmation: 'same_scientific_entity';
    };

export type BfnTemplateEntityBindingDecisions = Readonly<
  Record<string, BfnTemplateEntityBindingDecision>
>;

export interface BfnTemplateInstantiationOptions {
  readonly instanceId: string;
  readonly instanceName: string;
  readonly instanceDescription: string | null;
}

export type BfnTemplateInstantiationIssueCode =
  | 'template_schema_invalid'
  | 'target_project_schema_invalid'
  | 'instantiation_options_invalid'
  | 'generated_id_collision'
  | 'entity_binding_missing'
  | 'entity_binding_invalid'
  | 'unexpected_entity_binding'
  | 'entity_target_missing'
  | 'entity_mapping_non_injective'
  | 'canonical_entity_invalid'
  | 'scientific_contract_invalid'
  | 'scientific_projection_mismatch';

export interface BfnTemplateInstantiationIdMap {
  readonly moduleId: string;
  readonly portIds: Readonly<Record<string, string>>;
  readonly modelIds: Readonly<Record<string, string>>;
  readonly entityIds: Readonly<Record<string, string>>;
  readonly contextIds: Readonly<Record<string, string>>;
  readonly validityDomainIds: Readonly<Record<string, string>>;
  readonly provenanceIds: Readonly<Record<string, string>>;
  readonly implementationIds: Readonly<Record<string, string>>;
}

export type BfnTemplateInstantiationResult =
  | {
      readonly ok: true;
      readonly nextProject: BfnProject;
      readonly addedModuleId: string;
      readonly idMap: BfnTemplateInstantiationIdMap;
    }
  | { readonly ok: false; readonly issues: readonly BfnTemplateContractIssue[] };

export type BfnReusableModuleScientificProjectionV1 = Readonly<Record<string, unknown>>;
