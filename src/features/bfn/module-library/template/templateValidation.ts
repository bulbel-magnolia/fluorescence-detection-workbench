import type {
  BfnReusableModulePayloadV1,
  BfnTemplateAccumulatorModelV1,
  BfnTemplateContextV1,
  BfnTemplateEntityV1,
  BfnTemplateFirstOrderModelV1,
  BfnTemplateImplementationV1,
  BfnTemplatePortV1,
  BfnTemplateStaticModelV1,
  BfnTemplateStaticResponseV1,
  BfnTemplateValidityDomainV1,
} from './templateTypes';
import {
  bfnTemplateContextDocumentationStates,
  bfnTemplateEvidenceGrades,
  bfnTemplateImplementationMaturities,
  bfnTemplateImplementationStates,
  bfnTemplateParameterUnits,
  bfnTemplateProvenanceKinds,
  bfnTemplateQuantityTypes,
  bfnTemplateStaticFamilies,
  bfnTemplateUncertaintyMethods,
  bfnTemplateUnits,
  canonicalDeepEqual,
  isFiniteNumber,
  isNonEmptyString,
  uniqueStrings,
} from './templateInternals';

export interface BfnTemplateValidationIssue {
  readonly path: string;
  readonly reason: string;
}

interface ValidationIndex {
  readonly portByKey: ReadonlyMap<string, BfnTemplatePortV1>;
  readonly entityByKey: ReadonlyMap<string, BfnTemplateEntityV1>;
  readonly contextKeys: ReadonlySet<string>;
  readonly domainByKey: ReadonlyMap<string, BfnTemplateValidityDomainV1>;
  readonly provenanceKeys: ReadonlySet<string>;
  readonly implementationByKey: ReadonlyMap<string, BfnTemplateImplementationV1>;
}

export function validateReusableModulePayload(
  payload: BfnReusableModulePayloadV1,
): readonly BfnTemplateValidationIssue[] {
  const issues: BfnTemplateValidationIssue[] = [];
  const allKeys = [
    ...payload.ports.map((item) => item.key),
    ...payload.entities.map((item) => item.key),
    ...payload.contexts.map((item) => item.key),
    ...payload.validityDomains.map((item) => item.key),
    ...payload.provenance.map((item) => item.key),
    ...payload.implementations.map((item) => item.key),
    ...payloadModels(payload).map((item) => item.key),
  ];
  if (allKeys.some((key) => !isNonEmptyString(key)) || !uniqueStrings(allKeys)) {
    issues.push(issue('payload', 'local_keys_invalid'));
  }

  const index: ValidationIndex = {
    portByKey: new Map(payload.ports.map((item) => [item.key, item])),
    entityByKey: new Map(payload.entities.map((item) => [item.key, item])),
    contextKeys: new Set(payload.contexts.map((item) => item.key)),
    domainByKey: new Map(payload.validityDomains.map((item) => [item.key, item])),
    provenanceKeys: new Set(payload.provenance.map((item) => item.key)),
    implementationByKey: new Map(payload.implementations.map((item) => [item.key, item])),
  };

  validatePorts(payload.ports, index, issues);
  validateEntities(payload.entities, index, issues);
  validateContexts(payload.contexts, issues);
  validateDomains(payload.validityDomains, index, issues);
  validateProvenance(payload, issues);
  validateImplementations(payload.implementations, index, issues);
  validateImplementationSelection(payload, index, issues);
  validateModels(payload, index, issues);
  validateMinimalClosure(payload, issues);
  return issues;
}

function validatePorts(
  ports: readonly BfnTemplatePortV1[],
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  if (ports.length === 0) issues.push(issue('payload.ports', 'empty'));
  let encounteredOutput = false;
  let inputOrdinal = 0;
  let outputOrdinal = 0;
  for (const [position, port] of ports.entries()) {
    const path = `payload.ports[${position}]`;
    if (port.direction === 'output') {
      encounteredOutput = true;
      outputOrdinal += 1;
      if (port.key !== `port.output.${outputOrdinal}`) {
        issues.push(issue(`${path}.key`, 'non_normalized'));
      }
    } else {
      inputOrdinal += 1;
      if (encounteredOutput) issues.push(issue(`${path}.direction`, 'order_invalid'));
      if (port.key !== `port.input.${inputOrdinal}`) {
        issues.push(issue(`${path}.key`, 'non_normalized'));
      }
    }
    if (!index.entityByKey.has(port.entityKey)) {
      issues.push(issue(`${path}.entityKey`, 'unresolved'));
    }
    if (!bfnTemplateQuantityTypes.has(port.quantityType)) {
      issues.push(issue(`${path}.quantityType`, 'unsupported'));
    }
    if (!bfnTemplateUnits.has(port.unit)) issues.push(issue(`${path}.unit`, 'unsupported'));
  }
  if (inputOrdinal === 0) issues.push(issue('payload.ports', 'input_missing'));
  if (outputOrdinal === 0) issues.push(issue('payload.ports', 'output_missing'));
}

function validateEntities(
  entities: readonly BfnTemplateEntityV1[],
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  const usedEntityKeys = new Set([...index.portByKey.values()].map((port) => port.entityKey));
  for (const [position, entity] of entities.entries()) {
    const path = `payload.entities[${position}]`;
    if (entity.key !== `entity.${position + 1}`) {
      issues.push(issue(`${path}.key`, 'non_normalized'));
    }
    if (!usedEntityKeys.has(entity.key)) issues.push(issue(path, 'unused'));
    if (entity.mode === 'canonical') {
      if (
        entity.authority !== 'ahl_hsl_catalog' ||
        !isNonEmptyString(entity.catalogId) ||
        !isNonEmptyString(entity.entityId) ||
        !isNonEmptyString(entity.displayName)
      ) {
        issues.push(issue(path, 'canonical_invalid'));
      }
      continue;
    }
    if (!isNonEmptyString(entity.displayName)) issues.push(issue(`${path}.displayName`, 'blank'));
    if (entity.mode === 'embedded') continue;
    if (!isNonEmptyString(entity.sourceEntityId)) {
      issues.push(issue(`${path}.sourceEntityId`, 'blank'));
    }
    const expectedRequirements = [...index.portByKey.values()]
      .filter((port) => port.entityKey === entity.key)
      .map((port) => ({
        portKey: port.key,
        direction: port.direction,
        quantityType: port.quantityType,
        unit: port.unit,
      }));
    if (!canonicalDeepEqual(entity.requirements, expectedRequirements)) {
      issues.push(issue(`${path}.requirements`, 'requirements_mismatch'));
    }
  }
}

function validateContexts(
  contexts: readonly BfnTemplateContextV1[],
  issues: BfnTemplateValidationIssue[],
): void {
  for (const [position, context] of contexts.entries()) {
    const path = `payload.contexts[${position}]`;
    if (context.key !== `context.${position + 1}`) {
      issues.push(issue(`${path}.key`, 'non_normalized'));
    }
    if (
      !bfnTemplateContextDocumentationStates.has(context.documentationState) ||
      !isNonEmptyString(context.labelKey) ||
      !nullableFinite(context.temperatureCelsius) ||
      !nullableFinite(context.ph) ||
      !nullableFinite(context.measurementTimeHours)
    ) {
      issues.push(issue(path, 'context_invalid'));
    }
    const facts = [
      context.host,
      context.strain,
      context.medium,
      context.temperatureCelsius,
      context.ph,
      context.oxygenation,
      context.growthPhase,
      context.plasmidBackbone,
      context.copyNumberRegime,
      context.inductionProtocol,
      context.measurementTimeHours,
      context.batch,
    ];
    if (context.documentationState === 'not_recorded' && facts.some((fact) => fact !== null)) {
      issues.push(issue(path, 'not_recorded_context_has_facts'));
    }
    if (context.documentationState === 'partial') {
      const comparableFacts = [
        context.host,
        context.strain,
        context.medium,
        context.temperatureCelsius,
      ];
      const scientificStrings = [
        context.host,
        context.strain,
        context.medium,
        context.oxygenation,
        context.growthPhase,
        context.plasmidBackbone,
        context.copyNumberRegime,
        context.inductionProtocol,
        context.batch,
      ];
      if (
        facts.every((fact) => fact === null) ||
        comparableFacts.every((fact) => fact !== null) ||
        scientificStrings.some(
          (fact) =>
            fact !== null &&
            (!isNonEmptyString(fact) ||
              ['unknown', 'n/a', 'not recorded', 'unspecified'].includes(
                fact.trim().toLowerCase(),
              )),
        )
      ) {
        issues.push(issue(path, 'partial_context_invalid'));
      }
    }
    if (
      context.documentationState === 'recorded' &&
      [context.host, context.strain, context.medium, context.temperatureCelsius].some(
        (fact) => fact === null,
      )
    ) {
      issues.push(issue(path, 'recorded_context_incomplete'));
    }
    if (context.ph !== null && (context.ph < 0 || context.ph > 14)) {
      issues.push(issue(`${path}.ph`, 'range_invalid'));
    }
  }
}

function validateDomains(
  domains: readonly BfnTemplateValidityDomainV1[],
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  for (const [position, domain] of domains.entries()) {
    const path = `payload.validityDomains[${position}]`;
    if (domain.key !== `domain.${position + 1}`) {
      issues.push(issue(`${path}.key`, 'non_normalized'));
    }
    if (!isNonEmptyString(domain.labelKey)) issues.push(issue(`${path}.labelKey`, 'blank'));
    if (domain.contextKey !== null && !index.contextKeys.has(domain.contextKey)) {
      issues.push(issue(`${path}.contextKey`, 'unresolved'));
    }
    const seenPorts = new Set<string>();
    for (const [rangeIndex, range] of domain.inputRanges.entries()) {
      const rangePath = `${path}.inputRanges[${rangeIndex}]`;
      const port = index.portByKey.get(range.portKey);
      if (!port || port.direction !== 'input')
        issues.push(issue(`${rangePath}.portKey`, 'unresolved'));
      if (seenPorts.has(range.portKey)) issues.push(issue(`${rangePath}.portKey`, 'duplicate'));
      seenPorts.add(range.portKey);
      if (
        !isFiniteNumber(range.minimum) ||
        !isFiniteNumber(range.maximum) ||
        range.minimum >= range.maximum
      ) {
        issues.push(issue(rangePath, 'range_invalid'));
      }
      if (!bfnTemplateUnits.has(range.unit) || (port && range.unit !== port.unit)) {
        issues.push(issue(`${rangePath}.unit`, 'unit_invalid'));
      }
    }
    if (domain.timeRangeHours !== undefined) {
      const [start, end] = domain.timeRangeHours;
      if (!isFiniteNumber(start) || !isFiniteNumber(end) || start < 0 || end <= start) {
        issues.push(issue(`${path}.timeRangeHours`, 'range_invalid'));
      }
    }
  }
}

function validateProvenance(
  payload: BfnReusableModulePayloadV1,
  issues: BfnTemplateValidationIssue[],
): void {
  for (const [position, record] of payload.provenance.entries()) {
    const path = `payload.provenance[${position}]`;
    if (record.key !== `provenance.${position + 1}`) {
      issues.push(issue(`${path}.key`, 'non_normalized'));
    }
    if (!bfnTemplateProvenanceKinds.has(record.kind) || !isNonEmptyString(record.reference)) {
      issues.push(issue(path, 'provenance_invalid'));
    }
  }
}

function validateImplementations(
  implementations: readonly BfnTemplateImplementationV1[],
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  for (const [position, implementation] of implementations.entries()) {
    const path = `payload.implementations[${position}]`;
    if (implementation.key !== `implementation.${position + 1}`) {
      issues.push(issue(`${path}.key`, 'non_normalized'));
    }
    if (
      !isNonEmptyString(implementation.labelKey) ||
      !isNonEmptyString(implementation.promoter) ||
      !isNonEmptyString(implementation.rbs) ||
      !isNonEmptyString(implementation.codingSequence) ||
      !isNonEmptyString(implementation.degradationTag) ||
      !isNonEmptyString(implementation.plasmidBackbone) ||
      !isNonEmptyString(implementation.host) ||
      !bfnTemplateEvidenceGrades.has(implementation.evidenceGrade) ||
      !bfnTemplateImplementationMaturities.has(implementation.maturity)
    ) {
      issues.push(issue(path, 'implementation_invalid'));
    }
    for (const key of implementation.provenanceKeys) {
      if (!index.provenanceKeys.has(key)) {
        issues.push(issue(`${path}.provenanceKeys`, 'unresolved'));
      }
    }
    if (!uniqueStrings(implementation.provenanceKeys)) {
      issues.push(issue(`${path}.provenanceKeys`, 'duplicate'));
    }
  }
}

function validateImplementationSelection(
  payload: BfnReusableModulePayloadV1,
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  if (!bfnTemplateImplementationStates.has(payload.implementationState)) {
    issues.push(issue('payload.implementationState', 'unsupported'));
  }
  if (
    (payload.implementationState === 'unspecified') !==
    (payload.implementationKeys.length === 0)
  ) {
    issues.push(issue('payload.implementationKeys', 'state_mismatch'));
  }
  if (!uniqueStrings(payload.implementationKeys)) {
    issues.push(issue('payload.implementationKeys', 'duplicate'));
  }
  for (const key of payload.implementationKeys) {
    if (!index.implementationByKey.has(key)) {
      issues.push(issue('payload.implementationKeys', 'unresolved'));
    }
  }
  if (!bfnTemplateEvidenceGrades.has(payload.moduleEvidenceGrade)) {
    issues.push(issue('payload.moduleEvidenceGrade', 'unsupported'));
  }
}

function validateModels(
  payload: BfnReusableModulePayloadV1,
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
): void {
  if (payload.moduleClass === 'static') {
    if (
      payload.models.static.key !== 'model.static' ||
      payload.activeModels.static !== payload.models.static.key
    ) {
      issues.push(issue('payload.activeModels', 'static_relation_invalid'));
    }
    validateStaticModel(payload.models.static, index, issues, 'payload.models.static');
    return;
  }
  if (payload.moduleClass === 'first_order') {
    if (
      payload.models.static.key !== 'model.static' ||
      payload.models.dynamic.key !== 'model.dynamic' ||
      payload.activeModels.static !== payload.models.static.key ||
      payload.activeModels.dynamic !== payload.models.dynamic.key
    ) {
      issues.push(issue('payload.activeModels', 'first_order_relation_invalid'));
    }
    validateStaticModel(payload.models.static, index, issues, 'payload.models.static');
    validateModelBase(payload.models.dynamic, index, issues, 'payload.models.dynamic');
    validateStaticResponse(
      payload.models.dynamic.steadyStateResponse,
      index,
      issues,
      'payload.models.dynamic.steadyStateResponse',
    );
    if (
      !canonicalDeepEqual(
        payload.models.static.response,
        payload.models.dynamic.steadyStateResponse,
      )
    ) {
      issues.push(issue('payload.models.dynamic.steadyStateResponse', 'paired_response_mismatch'));
    }
    if (
      !validParameter(payload.models.dynamic.tau) ||
      payload.models.dynamic.tau.unit !== 'h' ||
      payload.models.dynamic.tau.value <= 0 ||
      (payload.models.dynamic.tau.interval95?.[0] ?? 1) <= 0
    ) {
      issues.push(issue('payload.models.dynamic.tau', 'tau_invalid'));
    }
    if (!isFiniteNumber(payload.models.dynamic.initialState)) {
      issues.push(issue('payload.models.dynamic.initialState', 'initial_state_invalid'));
    }
    return;
  }

  if (
    payload.models.dynamic.key !== 'model.accumulator' ||
    payload.activeModels.dynamic !== payload.models.dynamic.key
  ) {
    issues.push(issue('payload.activeModels', 'accumulator_relation_invalid'));
  }
  validateModelBase(payload.models.dynamic, index, issues, 'payload.models.dynamic');
  const input = index.portByKey.get(payload.models.dynamic.inputPortKey);
  const output = index.portByKey.get(payload.models.dynamic.outputPortKey);
  if (
    payload.ports.length !== 2 ||
    !input ||
    input.direction !== 'input' ||
    !output ||
    output.direction !== 'output' ||
    input.entityKey !== output.entityKey ||
    input.quantityType !== 'production_rate' ||
    output.quantityType !== 'concentration' ||
    !(
      (input.unit === 'nM/h' && output.unit === 'nM') ||
      (input.unit === 'uM/h' && output.unit === 'uM')
    ) ||
    !isFiniteNumber(payload.models.dynamic.initialState) ||
    payload.models.dynamic.initialState < 0 ||
    !['none', 'not_recorded'].includes(payload.models.dynamic.uncertaintyMethod)
  ) {
    issues.push(issue('payload.models.dynamic', 'accumulator_contract_invalid'));
  }
}

function validateStaticModel(
  model: BfnTemplateStaticModelV1,
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
  path: string,
): void {
  validateModelBase(model, index, issues, path);
  if (model.family !== model.response.family || !bfnTemplateStaticFamilies.has(model.family)) {
    issues.push(issue(`${path}.family`, 'family_invalid'));
  }
  validateStaticResponse(model.response, index, issues, `${path}.response`);

  const inputs = [...index.portByKey.values()].filter((port) => port.direction === 'input');
  const outputs = [...index.portByKey.values()].filter((port) => port.direction === 'output');
  const domainRangeKeys = index.domainByKey
    .get(model.validityDomainKey)
    ?.inputRanges.map((range) => range.portKey);
  if (
    model.response.family !== 'identity' &&
    (!domainRangeKeys ||
      domainRangeKeys.length !== inputs.length ||
      !inputs.every((port) => domainRangeKeys.includes(port.key)))
  ) {
    issues.push(issue(`${path}.validityDomainKey`, 'input_range_coverage_invalid'));
  }
  if (outputs.length !== 1) issues.push(issue(path, 'output_arity_invalid'));
  const output = outputs[0];
  const response = model.response;
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    const input = index.portByKey.get(response.inputPortKey);
    if (inputs.length !== 1 || !input || !output) issues.push(issue(path, 'hill_arity_invalid'));
    if (
      response.k.value <= 0 ||
      response.n.value <= 0 ||
      (input && response.k.unit !== input.unit) ||
      response.n.unit !== 'dimensionless' ||
      (output && (response.ymin.unit !== output.unit || response.ymax.unit !== output.unit)) ||
      response.ymax.value < response.ymin.value
    ) {
      issues.push(issue(`${path}.response`, 'hill_contract_invalid'));
    }
  } else if (response.family === 'linear_transfer') {
    const input = index.portByKey.get(response.inputPortKey);
    if (
      inputs.length !== 1 ||
      !input ||
      !output ||
      input.unit !== output.unit ||
      response.scale.unit !== 'dimensionless' ||
      response.intercept.unit !== output.unit ||
      (response.outputMinimum !== undefined &&
        response.outputMaximum !== undefined &&
        response.outputMinimum > response.outputMaximum)
    ) {
      issues.push(issue(`${path}.response`, 'linear_contract_invalid'));
    }
  } else if (response.family === 'identity') {
    const input = index.portByKey.get(response.inputPortKey);
    if (
      inputs.length !== 1 ||
      !input ||
      !output ||
      input.entityKey !== output.entityKey ||
      input.quantityType !== output.quantityType ||
      input.unit !== output.unit
    ) {
      issues.push(issue(`${path}.response`, 'identity_contract_invalid'));
    }
  } else if (response.family === 'independent_inputs') {
    const termKeys = response.terms.map((term) => term.inputPortKey);
    const inputKeys = inputs.map((port) => port.key);
    if (
      inputs.length < 2 ||
      termKeys.length !== inputKeys.length ||
      !inputKeys.every((key) => termKeys.includes(key)) ||
      response.outputMaximum.value < response.basal.value ||
      !output ||
      response.basal.unit !== output.unit ||
      response.outputMaximum.unit !== output.unit
    ) {
      issues.push(issue(`${path}.response`, 'independent_contract_invalid'));
    }
    for (const term of response.terms) {
      const input = index.portByKey.get(term.inputPortKey);
      if (
        !input ||
        term.k.value <= 0 ||
        term.n.value <= 0 ||
        term.contribution.value <= 0 ||
        term.k.unit !== input.unit ||
        term.n.unit !== 'dimensionless' ||
        term.contribution.unit !== 'dimensionless'
      ) {
        issues.push(issue(`${path}.response.terms`, 'independent_term_invalid'));
      }
    }
  }
}

function validateStaticResponse(
  response: BfnTemplateStaticResponseV1,
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
  path: string,
): void {
  const parameters =
    response.family === 'hill_activation' || response.family === 'hill_repression'
      ? [response.ymin, response.ymax, response.k, response.n]
      : response.family === 'linear_transfer'
        ? [response.scale, response.intercept]
        : response.family === 'independent_inputs'
          ? [
              response.basal,
              response.outputMaximum,
              ...response.terms.flatMap((term) => [term.k, term.n, term.contribution]),
            ]
          : [];
  if (parameters.some((parameter) => !validParameter(parameter))) {
    issues.push(issue(path, 'parameter_invalid'));
  }
  const referencedPortKeys =
    response.family === 'independent_inputs'
      ? response.terms.map((term) => term.inputPortKey)
      : [response.inputPortKey];
  if (
    referencedPortKeys.some((key) => index.portByKey.get(key)?.direction !== 'input') ||
    !uniqueStrings(referencedPortKeys)
  ) {
    issues.push(issue(path, 'input_reference_invalid'));
  }
  if (
    response.family === 'linear_transfer' &&
    [response.outputMinimum, response.outputMaximum].some(
      (value) => value !== undefined && !isFiniteNumber(value),
    )
  ) {
    issues.push(issue(path, 'output_bound_invalid'));
  }
}

function validateModelBase(
  model: BfnTemplateStaticModelV1 | BfnTemplateFirstOrderModelV1 | BfnTemplateAccumulatorModelV1,
  index: ValidationIndex,
  issues: BfnTemplateValidationIssue[],
  path: string,
): void {
  if (!isNonEmptyString(model.version)) issues.push(issue(`${path}.version`, 'blank'));
  if (model.contextKey !== null && !index.contextKeys.has(model.contextKey)) {
    issues.push(issue(`${path}.contextKey`, 'unresolved'));
  }
  if (!index.domainByKey.has(model.validityDomainKey)) {
    issues.push(issue(`${path}.validityDomainKey`, 'unresolved'));
  }
  if (!uniqueStrings(model.provenanceKeys)) {
    issues.push(issue(`${path}.provenanceKeys`, 'duplicate'));
  }
  for (const key of model.provenanceKeys) {
    if (!index.provenanceKeys.has(key)) issues.push(issue(`${path}.provenanceKeys`, 'unresolved'));
  }
  if (!bfnTemplateEvidenceGrades.has(model.evidenceGrade)) {
    issues.push(issue(`${path}.evidenceGrade`, 'unsupported'));
  }
  if (!bfnTemplateUncertaintyMethods.has(model.uncertaintyMethod)) {
    issues.push(issue(`${path}.uncertaintyMethod`, 'unsupported'));
  }
  if (model.uncertaintyMethod === 'parameter_interval_envelope') {
    const parameters = modelParameters(model);
    if (parameters.some((parameter) => parameter.interval95 === undefined)) {
      issues.push(issue(`${path}.uncertaintyMethod`, 'interval_incomplete'));
    }
  }
}

function modelParameters(
  model: BfnTemplateStaticModelV1 | BfnTemplateFirstOrderModelV1 | BfnTemplateAccumulatorModelV1,
): readonly { interval95?: readonly number[] }[] {
  if (model.mode === 'static') return responseParameters(model.response);
  if (model.family === 'first_order') {
    return [...responseParameters(model.steadyStateResponse), model.tau];
  }
  return [];
}

function responseParameters(
  response: BfnTemplateStaticResponseV1,
): readonly { interval95?: readonly number[] }[] {
  if (response.family === 'hill_activation' || response.family === 'hill_repression') {
    return [response.ymin, response.ymax, response.k, response.n];
  }
  if (response.family === 'linear_transfer') return [response.scale, response.intercept];
  if (response.family === 'identity') return [];
  if (response.family !== 'independent_inputs') return [];
  return [
    response.basal,
    response.outputMaximum,
    ...response.terms.flatMap((term) => [term.k, term.n, term.contribution]),
  ];
}

function validateMinimalClosure(
  payload: BfnReusableModulePayloadV1,
  issues: BfnTemplateValidationIssue[],
): void {
  const models = payloadModels(payload);
  const usedDomains = new Set(models.map((model) => model.validityDomainKey));
  const usedContexts = new Set(
    [
      ...models.map((model) => model.contextKey),
      ...payload.validityDomains
        .filter((domain) => usedDomains.has(domain.key))
        .map((domain) => domain.contextKey),
    ].filter((key): key is string => key !== null),
  );
  const usedImplementations = new Set(payload.implementationKeys);
  const usedProvenance = new Set([
    ...models.flatMap((model) => model.provenanceKeys),
    ...payload.implementations
      .filter((implementation) => usedImplementations.has(implementation.key))
      .flatMap((implementation) => implementation.provenanceKeys),
  ]);
  if (payload.validityDomains.some((domain) => !usedDomains.has(domain.key))) {
    issues.push(issue('payload.validityDomains', 'non_minimal'));
  }
  if (payload.contexts.some((context) => !usedContexts.has(context.key))) {
    issues.push(issue('payload.contexts', 'non_minimal'));
  }
  if (
    payload.implementations.some((implementation) => !usedImplementations.has(implementation.key))
  ) {
    issues.push(issue('payload.implementations', 'non_minimal'));
  }
  if (payload.provenance.some((record) => !usedProvenance.has(record.key))) {
    issues.push(issue('payload.provenance', 'non_minimal'));
  }
}

function validParameter(parameter: {
  readonly value: number;
  readonly unit: string;
  readonly interval95?: readonly [number, number];
}): boolean {
  if (!isFiniteNumber(parameter.value) || !bfnTemplateParameterUnits.has(parameter.unit)) {
    return false;
  }
  if (parameter.interval95 === undefined) return true;
  const [lower, upper] = parameter.interval95;
  return (
    isFiniteNumber(lower) &&
    isFiniteNumber(upper) &&
    lower <= parameter.value &&
    parameter.value <= upper
  );
}

function nullableFinite(value: number | null): boolean {
  return value === null || isFiniteNumber(value);
}

function issue(path: string, reason: string): BfnTemplateValidationIssue {
  return { path, reason };
}

function payloadModels(
  payload: BfnReusableModulePayloadV1,
): readonly (
  BfnTemplateStaticModelV1 | BfnTemplateFirstOrderModelV1 | BfnTemplateAccumulatorModelV1
)[] {
  if (payload.moduleClass === 'static') return [payload.models.static];
  if (payload.moduleClass === 'first_order') {
    return [payload.models.static, payload.models.dynamic];
  }
  return [payload.models.dynamic];
}
