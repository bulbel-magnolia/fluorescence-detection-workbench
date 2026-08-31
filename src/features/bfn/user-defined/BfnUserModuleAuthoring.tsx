import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { bfnEntityLabel, bfnUnitLabel } from '../presentation';
import type { BfnEvidenceGrade, BfnProject, BfnQuantityType, BfnUnit } from '../types';
import type { UserDefinedFunctionalModuleDraft } from './userModuleContract';
import type { UserModuleMaterializationResult } from './userModuleMaterialization';
import {
  buildUserDefinedModuleDraft,
  collectExistingEntityIds,
  createInitialUserModuleAuthoringState,
  createUserModuleAuthoringInput,
  type UserModuleAuthoringInput,
  type UserModuleAuthoringIssue,
  type UserModuleAuthoringOutput,
  type UserModuleAuthoringParameter,
  type UserModuleAuthoringState,
} from './userModuleAuthoringDraft';

interface BfnUserModuleAuthoringProps {
  project: BfnProject;
  onBack: () => void;
  onAdd: (draft: UserDefinedFunctionalModuleDraft) => UserModuleMaterializationResult;
}

const quantityTypes: readonly BfnQuantityType[] = [
  'concentration',
  'amount',
  'production_rate',
  'expression_level',
  'activity',
  'flux',
  'fraction',
  'cell_density',
];

const units: readonly BfnUnit[] = [
  'M',
  'mM',
  'uM',
  'nM',
  'pM',
  'nM/h',
  'uM/h',
  'molecules/cell',
  'RPU',
  'dimensionless',
  'OD600',
];

const evidenceGrades: readonly BfnEvidenceGrade[] = [
  'proposed_unbuilt_design',
  'mechanistic_model_only',
  'independent_assumption',
  'data_driven_prediction',
  'fitted_from_published_data',
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
];

const evidenceRequiringProvenance = new Set<BfnEvidenceGrade>([
  'measured_single_context',
  'measured_multiple_contexts',
  'externally_validated',
  'fitted_from_published_data',
]);

export function BfnUserModuleAuthoring({ project, onBack, onAdd }: BfnUserModuleAuthoringProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<UserModuleAuthoringState>(() =>
    createInitialUserModuleAuthoringState(project),
  );
  const [issues, setIssues] = useState<readonly UserModuleAuthoringIssue[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const existingEntities = useMemo(
    () =>
      collectExistingEntityIds(project).map((id) => ({
        id,
        label: existingEntityDisplayName(project, id, language, bfnEntityLabel(id, t)),
      })),
    [language, project, t],
  );

  useEffect(() => nameRef.current?.focus(), []);

  const clearValidation = (): void => {
    if (issues.length > 0) setIssues([]);
    if (submissionError) setSubmissionError(null);
  };
  const updateState = (
    updater: (current: UserModuleAuthoringState) => UserModuleAuthoringState,
  ) => {
    clearValidation();
    setState(updater);
  };
  const issueFor = (field: string): UserModuleAuthoringIssue | undefined =>
    issues.find((item) => item.field === field);
  const validationText = (field: string): string | null => {
    const current = issueFor(field);
    return current ? t(`bfn.userAuthoring.validation.${current.code}`) : null;
  };
  const setFamily = (family: UserModuleAuthoringState['family']): void => {
    updateState((current) => {
      if (family !== 'independent_inputs' || current.inputs.length >= 2) {
        return { ...current, family };
      }
      const firstEntity = existingEntities[0]?.id ?? '';
      return {
        ...current,
        family,
        inputs: [
          ...current.inputs,
          createUserModuleAuthoringInput(current.inputs.length + 1, firstEntity),
        ],
      };
    });
  };
  const updateInput = (
    key: number,
    updater: (input: UserModuleAuthoringInput) => UserModuleAuthoringInput,
  ): void =>
    updateState((current) => ({
      ...current,
      inputs: current.inputs.map((input) => (input.key === key ? updater(input) : input)),
    }));
  const updateOutput = (
    updater: (output: UserModuleAuthoringOutput) => UserModuleAuthoringOutput,
  ): void => updateState((current) => ({ ...current, output: updater(current.output) }));
  const updateParameter = (
    key: keyof Pick<
      UserModuleAuthoringState,
      | 'hillK'
      | 'hillN'
      | 'minimumOutput'
      | 'maximumOutput'
      | 'linearScale'
      | 'linearIntercept'
      | 'independentBasal'
      | 'independentMaximum'
    >,
    updater: (parameter: UserModuleAuthoringParameter) => UserModuleAuthoringParameter,
  ): void => updateState((current) => ({ ...current, [key]: updater(current[key]) }));
  const addInput = (): void => {
    const nextKey = Math.max(0, ...state.inputs.map((input) => input.key)) + 1;
    const firstEntity = existingEntities[0]?.id ?? '';
    updateState((current) => ({
      ...current,
      inputs: [...current.inputs, createUserModuleAuthoringInput(nextKey, firstEntity)],
    }));
  };
  const removeInput = (key: number): void => {
    if (state.inputs.length <= 2) return;
    updateState((current) => ({
      ...current,
      inputs: current.inputs.filter((input) => input.key !== key),
    }));
  };
  const submit = (): void => {
    const built = buildUserDefinedModuleDraft(state, project);
    if (!built.ok) {
      setIssues(built.issues);
      setSubmissionError(null);
      return;
    }
    const outcome = onAdd(built.draft);
    if (!outcome.ok) {
      setSubmissionError(t('bfn.userAuthoring.validation.materialization'));
    }
  };

  const activeInputs =
    state.family === 'independent_inputs' ? state.inputs : state.inputs.slice(0, 1);
  const showIntervals = state.uncertainty === 'parameter_interval_envelope';

  return (
    <form
      className="bfn-user-authoring"
      aria-label={t('bfn.userAuthoring.title')}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="bfn-user-authoring__toolbar">
        <button type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          {t('bfn.userAuthoring.back')}
        </button>
        <span>{t('bfn.userAuthoring.staticOnly')}</span>
      </div>

      <AuthoringSection title={t('bfn.userAuthoring.sections.definition')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          <Field
            id="bfn-user-module-name"
            label={t('bfn.userAuthoring.fields.name')}
            error={validationText('name')}
          >
            <input
              ref={nameRef}
              id="bfn-user-module-name"
              value={state.name}
              aria-invalid={Boolean(issueFor('name'))}
              onChange={(event) =>
                updateState((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field id="bfn-user-module-family" label={t('bfn.userAuthoring.fields.modelFamily')}>
            <select
              id="bfn-user-module-family"
              value={state.family}
              onChange={(event) => {
                const family = event.target.value;
                if (
                  family === 'hill_activation' ||
                  family === 'hill_repression' ||
                  family === 'linear_transfer' ||
                  family === 'independent_inputs'
                ) {
                  setFamily(family);
                }
              }}
            >
              <option value="hill_activation">
                {t('bfn.userAuthoring.modelFamilies.hill_activation')}
              </option>
              <option value="hill_repression">
                {t('bfn.userAuthoring.modelFamilies.hill_repression')}
              </option>
              <option value="linear_transfer">
                {t('bfn.userAuthoring.modelFamilies.linear_transfer')}
              </option>
              <option value="independent_inputs">
                {t('bfn.userAuthoring.modelFamilies.independent_inputs')}
              </option>
            </select>
          </Field>
        </div>
        <Field id="bfn-user-module-description" label={t('bfn.userAuthoring.fields.description')}>
          <textarea
            id="bfn-user-module-description"
            rows={2}
            value={state.description}
            onChange={(event) =>
              updateState((current) => ({ ...current, description: event.target.value }))
            }
          />
        </Field>
      </AuthoringSection>

      <AuthoringSection
        title={t('bfn.userAuthoring.sections.inputs')}
        action={
          state.family === 'independent_inputs' ? (
            <button type="button" onClick={addInput}>
              <Icon name="plus" size={13} />
              {t('bfn.userAuthoring.actions.addInput')}
            </button>
          ) : null
        }
      >
        <div className="bfn-user-authoring__port-list">
          {activeInputs.map((input, index) => (
            <InputEditor
              key={input.key}
              input={input}
              index={index}
              indexed={state.family === 'independent_inputs'}
              removable={state.family === 'independent_inputs' && state.inputs.length > 2}
              existingEntities={existingEntities}
              issueFor={issueFor}
              validationText={validationText}
              onChange={(updater) => updateInput(input.key, updater)}
              onRemove={() => removeInput(input.key)}
            />
          ))}
        </div>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.userAuthoring.sections.output')}>
        <OutputEditor
          output={state.output}
          existingEntities={existingEntities}
          issueFor={issueFor}
          validationText={validationText}
          onChange={updateOutput}
        />
      </AuthoringSection>

      <AuthoringSection title={t('bfn.userAuthoring.sections.parameters')}>
        {state.family === 'hill_activation' || state.family === 'hill_repression' ? (
          <div className="bfn-user-authoring__parameter-grid">
            <ParameterEditor
              id="hill-k"
              label="K"
              unit={activeInputs[0]?.unit ?? 'dimensionless'}
              value={state.hillK}
              showIntervals={showIntervals}
              error={validationText('model.k')}
              onChange={(updater) => updateParameter('hillK', updater)}
            />
            <ParameterEditor
              id="hill-n"
              label="n"
              unit="dimensionless"
              value={state.hillN}
              showIntervals={showIntervals}
              error={validationText('model.n')}
              onChange={(updater) => updateParameter('hillN', updater)}
            />
            <ParameterEditor
              id="hill-minimum-output"
              label={t('bfn.userAuthoring.fields.minimumOutput')}
              unit={state.output.unit}
              value={state.minimumOutput}
              showIntervals={showIntervals}
              error={validationText('model.minimumOutput')}
              onChange={(updater) => updateParameter('minimumOutput', updater)}
            />
            <ParameterEditor
              id="hill-maximum-output"
              label={t('bfn.userAuthoring.fields.maximumOutput')}
              unit={state.output.unit}
              value={state.maximumOutput}
              showIntervals={showIntervals}
              error={validationText('model.maximumOutput') ?? validationText('model.outputBounds')}
              onChange={(updater) => updateParameter('maximumOutput', updater)}
            />
          </div>
        ) : null}
        {state.family === 'linear_transfer' ? (
          <>
            <div className="bfn-user-authoring__parameter-grid">
              <ParameterEditor
                id="linear-scale"
                label={t('bfn.userAuthoring.fields.responseScale')}
                unit="dimensionless"
                value={state.linearScale}
                showIntervals={showIntervals}
                error={validationText('model.linearScale')}
                onChange={(updater) => updateParameter('linearScale', updater)}
              />
              <ParameterEditor
                id="linear-intercept"
                label={t('bfn.userAuthoring.fields.baseOutput')}
                unit={state.output.unit}
                value={state.linearIntercept}
                showIntervals={showIntervals}
                error={validationText('model.linearIntercept')}
                onChange={(updater) => updateParameter('linearIntercept', updater)}
              />
            </div>
            {validationText('model.linear.units') ? (
              <p className="bfn-user-authoring__section-error" role="alert">
                {validationText('model.linear.units')}
              </p>
            ) : null}
          </>
        ) : null}
        {state.family === 'independent_inputs' ? (
          <>
            <p className="bfn-user-authoring__assumption">
              {t('bfn.userAuthoring.independentAssumption')}
            </p>
            <div className="bfn-user-authoring__independent-terms">
              {activeInputs.map((input, index) => (
                <IndependentTermEditor
                  key={input.key}
                  input={input}
                  index={index}
                  showIntervals={showIntervals}
                  validationText={validationText}
                  onChange={(updater) => updateInput(input.key, updater)}
                />
              ))}
            </div>
            <div className="bfn-user-authoring__parameter-grid">
              <ParameterEditor
                id="independent-basal"
                label={t('bfn.userAuthoring.fields.baseOutput')}
                unit={state.output.unit}
                value={state.independentBasal}
                showIntervals={showIntervals}
                error={validationText('model.independentBasal')}
                onChange={(updater) => updateParameter('independentBasal', updater)}
              />
              <ParameterEditor
                id="independent-maximum"
                label={t('bfn.userAuthoring.fields.maximumOutput')}
                unit={state.output.unit}
                value={state.independentMaximum}
                showIntervals={showIntervals}
                error={validationText('model.outputBounds')}
                onChange={(updater) => updateParameter('independentMaximum', updater)}
              />
              <Field id="bfn-user-aggregation" label={t('bfn.userAuthoring.fields.aggregation')}>
                <select
                  id="bfn-user-aggregation"
                  value={state.aggregation}
                  onChange={(event) => {
                    const aggregation = event.target.value;
                    if (aggregation === 'bounded_sum' || aggregation === 'multiplicative') {
                      updateState((current) => ({ ...current, aggregation }));
                    }
                  }}
                >
                  <option value="bounded_sum">
                    {t('bfn.userAuthoring.aggregation.bounded_sum')}
                  </option>
                  <option value="multiplicative">
                    {t('bfn.userAuthoring.aggregation.multiplicative')}
                  </option>
                </select>
              </Field>
            </div>
          </>
        ) : null}
      </AuthoringSection>

      <AuthoringSection title={t('bfn.userAuthoring.sections.context')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--context">
          {(
            [
              ['hostSpecies', 'host'],
              ['hostStrain', 'strain'],
              ['medium', 'medium'],
              ['temperatureCelsius', 'temperature'],
              ['ph', 'ph'],
            ] as const
          ).map(([field, label]) => (
            <Field
              key={field}
              id={`bfn-user-context-${field}`}
              label={t(`bfn.userAuthoring.fields.${label}`)}
              error={validationText(`context.${field}`)}
            >
              <input
                id={`bfn-user-context-${field}`}
                type={field === 'temperatureCelsius' || field === 'ph' ? 'number' : 'text'}
                step={field === 'temperatureCelsius' || field === 'ph' ? 'any' : undefined}
                value={state.context[field]}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    context: { ...current.context, [field]: event.target.value },
                  }))
                }
              />
            </Field>
          ))}
        </div>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.userAuthoring.sections.evidence')}>
        <Field id="bfn-user-evidence" label={t('bfn.userAuthoring.fields.evidenceBasis')}>
          <select
            id="bfn-user-evidence"
            value={state.evidenceBasis}
            onChange={(event) => {
              const basis = evidenceGrades.find((grade) => grade === event.target.value);
              if (basis) updateState((current) => ({ ...current, evidenceBasis: basis }));
            }}
          >
            {evidenceGrades.map((grade) => (
              <option key={grade} value={grade}>
                {t(`bfn.evidence.${grade}`)}
              </option>
            ))}
          </select>
        </Field>
        {evidenceRequiringProvenance.has(state.evidenceBasis) ? (
          <div className="bfn-user-authoring__grid bfn-user-authoring__grid--source">
            <Field
              id="bfn-user-provenance-kind"
              label={t('bfn.userAuthoring.fields.provenanceKind')}
            >
              <select
                id="bfn-user-provenance-kind"
                value={state.provenanceKind}
                onChange={(event) => {
                  const kind = event.target.value;
                  if (
                    kind === 'dataset' ||
                    kind === 'publication' ||
                    kind === 'repository_record' ||
                    kind === 'user_note'
                  ) {
                    updateState((current) => ({ ...current, provenanceKind: kind }));
                  }
                }}
              >
                {(['publication', 'dataset', 'repository_record', 'user_note'] as const).map(
                  (kind) => (
                    <option key={kind} value={kind}>
                      {t(`bfn.userAuthoring.provenanceKinds.${kind}`)}
                    </option>
                  ),
                )}
              </select>
            </Field>
            <Field
              id="bfn-user-provenance-reference"
              label={t('bfn.userAuthoring.fields.provenanceReference')}
              error={validationText('evidence.provenance')}
            >
              <input
                id="bfn-user-provenance-reference"
                value={state.provenanceReference}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    provenanceReference: event.target.value,
                  }))
                }
              />
            </Field>
          </div>
        ) : null}
      </AuthoringSection>

      <AuthoringSection title={t('bfn.userAuthoring.sections.uncertainty')}>
        <Field
          id="bfn-user-uncertainty"
          label={t('bfn.userAuthoring.fields.uncertainty')}
          error={validationText('uncertainty')}
        >
          <select
            id="bfn-user-uncertainty"
            value={state.uncertainty}
            onChange={(event) => {
              const uncertainty = event.target.value;
              if (
                uncertainty === 'not_recorded' ||
                uncertainty === 'none' ||
                uncertainty === 'parameter_interval_envelope'
              ) {
                updateState((current) => ({ ...current, uncertainty }));
              }
            }}
          >
            <option value="not_recorded">{t('bfn.userAuthoring.uncertainty.not_recorded')}</option>
            <option value="none">{t('bfn.userAuthoring.uncertainty.none')}</option>
            <option value="parameter_interval_envelope">
              {t('bfn.userAuthoring.uncertainty.parameter_interval_envelope')}
            </option>
          </select>
        </Field>
      </AuthoringSection>

      {submissionError ? (
        <p className="bfn-user-authoring__submission-error" role="alert">
          {submissionError}
        </p>
      ) : null}
      <footer className="bfn-user-authoring__actions">
        <Button variant="secondary" onClick={onBack}>
          {t('bfn.userAuthoring.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" leadingIcon={<Icon name="plus" size={15} />}>
          {t('bfn.userAuthoring.actions.addToNetwork')}
        </Button>
      </footer>
    </form>
  );
}

function AuthoringSection({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="bfn-user-authoring__section">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      <div className="bfn-user-authoring__section-body">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="bfn-user-authoring__field" data-invalid={Boolean(error)}>
      <label htmlFor={id}>{label}</label>
      {children}
      {hint ? <small>{hint}</small> : null}
      {error ? <small className="bfn-user-authoring__field-error">{error}</small> : null}
    </div>
  );
}

interface EntityOption {
  readonly id: string;
  readonly label: string;
}

function InputEditor({
  input,
  index,
  indexed,
  removable,
  existingEntities,
  issueFor,
  validationText,
  onChange,
  onRemove,
}: {
  input: UserModuleAuthoringInput;
  index: number;
  indexed: boolean;
  removable: boolean;
  existingEntities: readonly EntityOption[];
  issueFor: (field: string) => UserModuleAuthoringIssue | undefined;
  validationText: (field: string) => string | null;
  onChange: (updater: (input: UserModuleAuthoringInput) => UserModuleAuthoringInput) => void;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const prefix = `inputs.${input.key}`;
  const labelPrefix = indexed
    ? t('bfn.userAuthoring.inputIndex', { index: index + 1 })
    : t('bfn.userAuthoring.input');
  const idPrefix = `bfn-user-input-${input.key}`;
  return (
    <fieldset className="bfn-user-authoring__port" data-direction="input">
      <legend>
        <span>{labelPrefix}</span>
        {removable ? (
          <button
            type="button"
            onClick={onRemove}
            aria-label={t('bfn.userAuthoring.actions.removeInput')}
          >
            ×
          </button>
        ) : null}
      </legend>
      <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
        <Field
          id={`${idPrefix}-name`}
          label={
            indexed
              ? t('bfn.userAuthoring.fields.inputNameIndexed', { index: index + 1 })
              : t('bfn.userAuthoring.fields.inputName')
          }
          error={validationText(`${prefix}.name`)}
        >
          <input
            id={`${idPrefix}-name`}
            value={input.name}
            aria-invalid={Boolean(issueFor(`${prefix}.name`))}
            onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field id={`${idPrefix}-entity-mode`} label={t('bfn.userAuthoring.fields.inputEntityMode')}>
          <select
            id={`${idPrefix}-entity-mode`}
            value={input.entityMode}
            onChange={(event) => {
              const entityMode = event.target.value;
              if (entityMode === 'existing' || entityMode === 'new') {
                onChange((current) => ({ ...current, entityMode }));
              }
            }}
          >
            <option value="existing">{t('bfn.userAuthoring.entity.existing')}</option>
            <option value="new">{t('bfn.userAuthoring.entity.new')}</option>
          </select>
        </Field>
        {input.entityMode === 'existing' ? (
          <Field
            id={`${idPrefix}-entity-existing`}
            label={t('bfn.userAuthoring.fields.inputEntity')}
            error={validationText(`${prefix}.entity`)}
          >
            <select
              id={`${idPrefix}-entity-existing`}
              value={input.existingEntityId}
              onChange={(event) =>
                onChange((current) => ({ ...current, existingEntityId: event.target.value }))
              }
            >
              <option value="">{t('bfn.userAuthoring.entity.choose')}</option>
              {existingEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field
            id={`${idPrefix}-entity-new`}
            label={t('bfn.userAuthoring.fields.inputEntityName')}
            error={validationText(`${prefix}.entity`)}
          >
            <input
              id={`${idPrefix}-entity-new`}
              value={input.newEntityName}
              onChange={(event) =>
                onChange((current) => ({ ...current, newEntityName: event.target.value }))
              }
            />
          </Field>
        )}
        <QuantityAndUnitFields
          idPrefix={idPrefix}
          quantityLabel={t('bfn.userAuthoring.fields.inputQuantity')}
          unitLabel={t('bfn.userAuthoring.fields.inputUnit')}
          quantityType={input.quantityType}
          unit={input.unit}
          onQuantityChange={(quantityType) => onChange((current) => ({ ...current, quantityType }))}
          onUnitChange={(unit) => onChange((current) => ({ ...current, unit }))}
        />
        <Field
          id={`${idPrefix}-minimum`}
          label={t('bfn.userAuthoring.fields.rangeMinimum')}
          error={validationText(`${prefix}.minimum`)}
        >
          <input
            id={`${idPrefix}-minimum`}
            type="number"
            step="any"
            value={input.minimum}
            onChange={(event) =>
              onChange((current) => ({ ...current, minimum: event.target.value }))
            }
          />
        </Field>
        <Field
          id={`${idPrefix}-maximum`}
          label={t('bfn.userAuthoring.fields.rangeMaximum')}
          error={validationText(`${prefix}.maximum`) ?? validationText(`${prefix}.range`)}
        >
          <input
            id={`${idPrefix}-maximum`}
            type="number"
            step="any"
            value={input.maximum}
            onChange={(event) =>
              onChange((current) => ({ ...current, maximum: event.target.value }))
            }
          />
        </Field>
      </div>
    </fieldset>
  );
}

function OutputEditor({
  output,
  existingEntities,
  issueFor,
  validationText,
  onChange,
}: {
  output: UserModuleAuthoringOutput;
  existingEntities: readonly EntityOption[];
  issueFor: (field: string) => UserModuleAuthoringIssue | undefined;
  validationText: (field: string) => string | null;
  onChange: (updater: (output: UserModuleAuthoringOutput) => UserModuleAuthoringOutput) => void;
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="bfn-user-authoring__port" data-direction="output">
      <legend>{t('bfn.userAuthoring.output')}</legend>
      <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
        <Field
          id="bfn-user-output-name"
          label={t('bfn.userAuthoring.fields.outputName')}
          error={validationText('output.name')}
        >
          <input
            id="bfn-user-output-name"
            value={output.name}
            aria-invalid={Boolean(issueFor('output.name'))}
            onChange={(event) => onChange((current) => ({ ...current, name: event.target.value }))}
          />
        </Field>
        <Field
          id="bfn-user-output-entity-mode"
          label={t('bfn.userAuthoring.fields.outputEntityMode')}
        >
          <select
            id="bfn-user-output-entity-mode"
            value={output.entityMode}
            onChange={(event) => {
              const entityMode = event.target.value;
              if (entityMode === 'existing' || entityMode === 'new') {
                onChange((current) => ({ ...current, entityMode }));
              }
            }}
          >
            <option value="existing">{t('bfn.userAuthoring.entity.existing')}</option>
            <option value="new">{t('bfn.userAuthoring.entity.new')}</option>
          </select>
        </Field>
        {output.entityMode === 'existing' ? (
          <Field
            id="bfn-user-output-entity-existing"
            label={t('bfn.userAuthoring.fields.outputEntity')}
            error={validationText('output.entity')}
          >
            <select
              id="bfn-user-output-entity-existing"
              value={output.existingEntityId}
              onChange={(event) =>
                onChange((current) => ({ ...current, existingEntityId: event.target.value }))
              }
            >
              <option value="">{t('bfn.userAuthoring.entity.choose')}</option>
              {existingEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>
                  {entity.label}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field
            id="bfn-user-output-entity-new"
            label={t('bfn.userAuthoring.fields.outputEntityName')}
            error={validationText('output.entity')}
          >
            <input
              id="bfn-user-output-entity-new"
              value={output.newEntityName}
              onChange={(event) =>
                onChange((current) => ({ ...current, newEntityName: event.target.value }))
              }
            />
          </Field>
        )}
        <QuantityAndUnitFields
          idPrefix="bfn-user-output"
          quantityLabel={t('bfn.userAuthoring.fields.outputQuantity')}
          unitLabel={t('bfn.userAuthoring.fields.outputUnit')}
          quantityType={output.quantityType}
          unit={output.unit}
          onQuantityChange={(quantityType) => onChange((current) => ({ ...current, quantityType }))}
          onUnitChange={(unit) => onChange((current) => ({ ...current, unit }))}
        />
      </div>
    </fieldset>
  );
}

function QuantityAndUnitFields({
  idPrefix,
  quantityLabel,
  unitLabel,
  quantityType,
  unit,
  onQuantityChange,
  onUnitChange,
}: {
  idPrefix: string;
  quantityLabel: string;
  unitLabel: string;
  quantityType: BfnQuantityType;
  unit: BfnUnit;
  onQuantityChange: (value: BfnQuantityType) => void;
  onUnitChange: (value: BfnUnit) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <Field id={`${idPrefix}-quantity`} label={quantityLabel}>
        <select
          id={`${idPrefix}-quantity`}
          value={quantityType}
          onChange={(event) => {
            const next = quantityTypes.find((candidate) => candidate === event.target.value);
            if (next) onQuantityChange(next);
          }}
        >
          {quantityTypes.map((option) => (
            <option key={option} value={option}>
              {t(`bfn.userAuthoring.quantities.${option}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field id={`${idPrefix}-unit`} label={unitLabel}>
        <select
          id={`${idPrefix}-unit`}
          value={unit}
          onChange={(event) => {
            const next = units.find((candidate) => candidate === event.target.value);
            if (next) onUnitChange(next);
          }}
        >
          {units.map((option) => (
            <option key={option} value={option}>
              {bfnUnitLabel(option, t)}
            </option>
          ))}
        </select>
      </Field>
    </>
  );
}

function ParameterEditor({
  id,
  label,
  unit,
  value,
  showIntervals,
  error,
  onChange,
}: {
  id: string;
  label: string;
  unit: BfnUnit;
  value: UserModuleAuthoringParameter;
  showIntervals: boolean;
  error: string | null;
  onChange: (
    updater: (parameter: UserModuleAuthoringParameter) => UserModuleAuthoringParameter,
  ) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bfn-user-authoring__parameter" data-invalid={Boolean(error)}>
      <Field id={`bfn-user-parameter-${id}`} label={label} error={error}>
        <div className="bfn-user-authoring__number-with-unit">
          <input
            id={`bfn-user-parameter-${id}`}
            type="number"
            step="any"
            value={value.value}
            onChange={(event) => onChange((current) => ({ ...current, value: event.target.value }))}
          />
          <span>{bfnUnitLabel(unit, t)}</span>
        </div>
      </Field>
      {showIntervals ? (
        <div className="bfn-user-authoring__interval">
          <Field
            id={`bfn-user-parameter-${id}-lower`}
            label={t('bfn.userAuthoring.fields.intervalLower')}
          >
            <input
              id={`bfn-user-parameter-${id}-lower`}
              type="number"
              step="any"
              value={value.lower}
              onChange={(event) =>
                onChange((current) => ({ ...current, lower: event.target.value }))
              }
            />
          </Field>
          <Field
            id={`bfn-user-parameter-${id}-upper`}
            label={t('bfn.userAuthoring.fields.intervalUpper')}
          >
            <input
              id={`bfn-user-parameter-${id}-upper`}
              type="number"
              step="any"
              value={value.upper}
              onChange={(event) =>
                onChange((current) => ({ ...current, upper: event.target.value }))
              }
            />
          </Field>
        </div>
      ) : null}
    </div>
  );
}

function IndependentTermEditor({
  input,
  index,
  showIntervals,
  validationText,
  onChange,
}: {
  input: UserModuleAuthoringInput;
  index: number;
  showIntervals: boolean;
  validationText: (field: string) => string | null;
  onChange: (updater: (input: UserModuleAuthoringInput) => UserModuleAuthoringInput) => void;
}) {
  const { t } = useTranslation();
  const prefix = `inputs.${input.key}`;
  return (
    <fieldset className="bfn-user-authoring__term">
      <legend>{t('bfn.userAuthoring.inputIndex', { index: index + 1 })}</legend>
      <Field id={`bfn-user-term-${input.key}-effect`} label={t('bfn.userAuthoring.fields.effect')}>
        <select
          id={`bfn-user-term-${input.key}-effect`}
          value={input.effect}
          onChange={(event) => {
            const effect = event.target.value;
            if (effect === 'activation' || effect === 'repression') {
              onChange((current) => ({ ...current, effect }));
            }
          }}
        >
          <option value="activation">{t('bfn.userAuthoring.effects.activation')}</option>
          <option value="repression">{t('bfn.userAuthoring.effects.repression')}</option>
        </select>
      </Field>
      <div className="bfn-user-authoring__parameter-grid">
        <ParameterEditor
          id={`term-${input.key}-k`}
          label="K"
          unit={input.unit}
          value={input.k}
          showIntervals={showIntervals}
          error={validationText(`${prefix}.k`)}
          onChange={(updater) => onChange((current) => ({ ...current, k: updater(current.k) }))}
        />
        <ParameterEditor
          id={`term-${input.key}-n`}
          label="n"
          unit="dimensionless"
          value={input.n}
          showIntervals={showIntervals}
          error={validationText(`${prefix}.n`)}
          onChange={(updater) => onChange((current) => ({ ...current, n: updater(current.n) }))}
        />
        <ParameterEditor
          id={`term-${input.key}-weight`}
          label={t('bfn.userAuthoring.fields.weight')}
          unit="dimensionless"
          value={input.weight}
          showIntervals={showIntervals}
          error={validationText(`${prefix}.weight`)}
          onChange={(updater) =>
            onChange((current) => ({ ...current, weight: updater(current.weight) }))
          }
        />
      </div>
    </fieldset>
  );
}

function existingEntityDisplayName(
  project: BfnProject,
  entityId: string,
  language: string,
  fallback: string,
): string {
  const registered = project.registry.entities.find((entity) => entity.id === entityId);
  if (registered) return registered.displayName;
  const ports = [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
  const displayName = ports.find((port) => port.entity === entityId)?.displayName;
  if (!displayName) return fallback;
  return language.toLowerCase().startsWith('zh') ? displayName.zh : displayName.en;
}
