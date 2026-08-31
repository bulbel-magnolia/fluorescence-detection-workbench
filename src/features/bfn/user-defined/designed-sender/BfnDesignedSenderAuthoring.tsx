import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button';
import { Icon } from '../../../../components/Icon';
import { bfnEntityLabel, bfnUnitLabel } from '../../presentation';
import type { BfnEvidenceGrade, BfnProject, BfnUnit } from '../../types';
import type { UserDefinedFunctionalModuleDraft } from '../userModuleContract';
import type { UserModuleAuthoringParameter } from '../userModuleAuthoringDraft';
import { collectExistingEntityIds } from '../userModuleAuthoringDraft';
import type { UserModuleMaterializationResult } from '../userModuleMaterialization';
import {
  DESIGNED_SENDER_CONTROL_UNITS,
  DESIGNED_SENDER_MODEL_FAMILIES,
  DESIGNED_SENDER_OUTPUT_UNITS,
  DESIGNED_SENDER_UNCERTAINTY_OPTIONS,
  isDesignedSenderControlUnit,
  isDesignedSenderOutputUnit,
  type DesignedSenderAuthoringState,
} from './designedSenderContract';
import {
  buildDesignedSenderDraft,
  createInitialDesignedSenderAuthoringState,
  type DesignedSenderAuthoringIssue,
} from './designedSenderDraft';
import {
  getDesignedSenderSignalCatalog,
  type DesignedSenderSignalIdentity,
} from './designedSenderSignalCatalog';

interface BfnDesignedSenderAuthoringProps {
  project: BfnProject;
  onBack: () => void;
  onAdd: (
    draft: UserDefinedFunctionalModuleDraft,
    authoritativeSignal: DesignedSenderSignalIdentity | null,
  ) => UserModuleMaterializationResult;
}

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

type ParameterKey = 'hillK' | 'hillN' | 'minimumOutput' | 'maximumOutput';

export function BfnDesignedSenderAuthoring({
  project,
  onBack,
  onAdd,
}: BfnDesignedSenderAuthoringProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameRef = useRef<HTMLInputElement>(null);
  const signals = useMemo(() => getDesignedSenderSignalCatalog(), []);
  const [state, setState] = useState<DesignedSenderAuthoringState>(() =>
    createInitialDesignedSenderAuthoringState(project, signals),
  );
  const [issues, setIssues] = useState<readonly DesignedSenderAuthoringIssue[]>([]);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const controlUnit: BfnUnit = isDesignedSenderControlUnit(state.controlInput.unit)
    ? state.controlInput.unit
    : 'nM';
  const outputUnit: BfnUnit = isDesignedSenderOutputUnit(state.output.unit)
    ? state.output.unit
    : 'nM/h';
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
    updater: (current: DesignedSenderAuthoringState) => DesignedSenderAuthoringState,
  ): void => {
    clearValidation();
    setState(updater);
  };
  const issueFor = (...fields: readonly string[]): DesignedSenderAuthoringIssue | undefined =>
    issues.find((item) => fields.includes(item.field));
  const validationText = (...fields: readonly string[]): string | null => {
    const current = issueFor(...fields);
    return current ? t(`bfn.designedSender.validation.${current.code}`) : null;
  };
  const updateParameter = (
    key: ParameterKey,
    updater: (parameter: UserModuleAuthoringParameter) => UserModuleAuthoringParameter,
  ): void => updateState((current) => ({ ...current, [key]: updater(current[key]) }));
  const submit = (): void => {
    const built = buildDesignedSenderDraft(state, project, signals);
    if (!built.ok) {
      setIssues(built.issues);
      setSubmissionError(null);
      return;
    }
    const outcome = onAdd(built.draft, built.authoritativeSignal);
    if (!outcome.ok) {
      setSubmissionError(t('bfn.designedSender.validation.materialization'));
    }
  };
  const showIntervals = state.uncertainty === 'parameter_interval_envelope';

  return (
    <form
      className="bfn-user-authoring bfn-designed-sender"
      aria-label={t('bfn.designedSender.title')}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="bfn-user-authoring__toolbar">
        <button type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          {t('bfn.designedSender.back')}
        </button>
        <span>{t('bfn.designedSender.staticOnly')}</span>
      </div>

      <AuthoringSection title={t('bfn.designedSender.sections.basic')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          <Field
            id="bfn-designed-sender-name"
            label={t('bfn.designedSender.fields.name')}
            error={validationText('name')}
          >
            <input
              ref={nameRef}
              id="bfn-designed-sender-name"
              value={state.name}
              aria-invalid={Boolean(issueFor('name'))}
              onChange={(event) =>
                updateState((current) => ({ ...current, name: event.target.value }))
              }
            />
          </Field>
          <Field
            id="bfn-designed-sender-description"
            label={t('bfn.designedSender.fields.description')}
          >
            <textarea
              id="bfn-designed-sender-description"
              value={state.description}
              onChange={(event) =>
                updateState((current) => ({ ...current, description: event.target.value }))
              }
            />
          </Field>
        </div>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.designedSender.sections.controlInput')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          <Field
            id="bfn-designed-sender-input-name"
            label={t('bfn.designedSender.fields.inputName')}
            error={validationText('inputs.1.name')}
          >
            <input
              id="bfn-designed-sender-input-name"
              value={state.controlInput.name}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  controlInput: { ...current.controlInput, name: event.target.value },
                }))
              }
            />
          </Field>
          <Field
            id="bfn-designed-sender-input-quantity"
            label={t('bfn.designedSender.fields.inputQuantity')}
          >
            <output
              id="bfn-designed-sender-input-quantity"
              className="bfn-designed-sender__fixed-value"
            >
              {t('bfn.designedSender.quantities.concentration')}
            </output>
          </Field>
          <Field
            id="bfn-designed-sender-input-entity-mode"
            label={t('bfn.designedSender.fields.inputEntityMode')}
          >
            <select
              id="bfn-designed-sender-input-entity-mode"
              value={state.controlInput.entityMode}
              onChange={(event) => {
                const mode = event.target.value;
                if (mode === 'existing' || mode === 'new') {
                  updateState((current) => ({
                    ...current,
                    controlInput: { ...current.controlInput, entityMode: mode },
                  }));
                }
              }}
            >
              <option value="existing">{t('bfn.userAuthoring.entity.existing')}</option>
              <option value="new">{t('bfn.userAuthoring.entity.new')}</option>
            </select>
          </Field>
          {state.controlInput.entityMode === 'existing' ? (
            <Field
              id="bfn-designed-sender-input-entity"
              label={t('bfn.designedSender.fields.inputEntity')}
              error={validationText('inputs.1.entity')}
            >
              <select
                id="bfn-designed-sender-input-entity"
                value={state.controlInput.existingEntityId}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    controlInput: {
                      ...current.controlInput,
                      existingEntityId: event.target.value,
                    },
                  }))
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
              id="bfn-designed-sender-input-entity-name"
              label={t('bfn.designedSender.fields.inputEntityName')}
              error={validationText('inputs.1.entity')}
            >
              <input
                id="bfn-designed-sender-input-entity-name"
                value={state.controlInput.newEntityName}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    controlInput: {
                      ...current.controlInput,
                      newEntityName: event.target.value,
                    },
                  }))
                }
              />
            </Field>
          )}
          <Field
            id="bfn-designed-sender-input-unit"
            label={t('bfn.designedSender.fields.inputUnit')}
            error={validationText('controlInput.unit')}
          >
            <select
              id="bfn-designed-sender-input-unit"
              value={state.controlInput.unit}
              onChange={(event) => {
                const unit = DESIGNED_SENDER_CONTROL_UNITS.find(
                  (candidate) => candidate === event.target.value,
                );
                if (unit) {
                  updateState((current) => ({
                    ...current,
                    controlInput: { ...current.controlInput, unit },
                  }));
                }
              }}
            >
              {DESIGNED_SENDER_CONTROL_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {bfnUnitLabel(unit, t)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.designedSender.sections.outputSignal')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          <Field
            id="bfn-designed-sender-output-name"
            label={t('bfn.designedSender.fields.outputName')}
            error={validationText('output.name')}
          >
            <input
              id="bfn-designed-sender-output-name"
              value={state.output.name}
              onChange={(event) =>
                updateState((current) => ({
                  ...current,
                  output: { ...current.output, name: event.target.value },
                }))
              }
            />
          </Field>
          <Field
            id="bfn-designed-sender-output-quantity"
            label={t('bfn.designedSender.fields.outputQuantity')}
          >
            <output
              id="bfn-designed-sender-output-quantity"
              className="bfn-designed-sender__fixed-value"
            >
              {t('bfn.designedSender.quantities.productionRate')}
            </output>
          </Field>
        </div>
        <fieldset className="bfn-designed-sender__choice-group">
          <legend>{t('bfn.designedSender.fields.signalMode')}</legend>
          <label>
            <input
              type="radio"
              name="bfn-designed-sender-signal-mode"
              value="known"
              checked={state.output.signalMode === 'known'}
              onChange={() =>
                updateState((current) => ({
                  ...current,
                  output: { ...current.output, signalMode: 'known' },
                }))
              }
            />
            <span>{t('bfn.designedSender.signal.known')}</span>
          </label>
          <label>
            <input
              type="radio"
              name="bfn-designed-sender-signal-mode"
              value="custom"
              checked={state.output.signalMode === 'custom'}
              onChange={() =>
                updateState((current) => ({
                  ...current,
                  output: { ...current.output, signalMode: 'custom' },
                }))
              }
            />
            <span>{t('bfn.designedSender.signal.custom')}</span>
          </label>
        </fieldset>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          {state.output.signalMode === 'known' ? (
            <Field
              id="bfn-designed-sender-catalog-signal"
              label={t('bfn.designedSender.fields.knownSignal')}
              error={validationText('output.catalogSignalId')}
            >
              <select
                id="bfn-designed-sender-catalog-signal"
                value={state.output.catalogSignalId}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    output: { ...current.output, catalogSignalId: event.target.value },
                  }))
                }
              >
                {signals.map((signal) => (
                  <option key={signal.catalogSignalId} value={signal.catalogSignalId}>
                    {signal.displayName}
                  </option>
                ))}
              </select>
            </Field>
          ) : (
            <Field
              id="bfn-designed-sender-custom-signal"
              label={t('bfn.designedSender.fields.customSignal')}
              error={validationText('output.customSignalName')}
            >
              <input
                id="bfn-designed-sender-custom-signal"
                value={state.output.customSignalName}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    output: { ...current.output, customSignalName: event.target.value },
                  }))
                }
              />
            </Field>
          )}
          <Field
            id="bfn-designed-sender-output-unit"
            label={t('bfn.designedSender.fields.outputUnit')}
            error={validationText('output.unit')}
          >
            <select
              id="bfn-designed-sender-output-unit"
              value={state.output.unit}
              onChange={(event) => {
                const unit = DESIGNED_SENDER_OUTPUT_UNITS.find(
                  (candidate) => candidate === event.target.value,
                );
                if (unit) {
                  updateState((current) => ({
                    ...current,
                    output: { ...current.output, unit },
                  }));
                }
              }}
            >
              {DESIGNED_SENDER_OUTPUT_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {bfnUnitLabel(unit, t)}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <p className="bfn-designed-sender__boundary-note">
          {t('bfn.designedSender.signalBoundary')}
        </p>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.designedSender.sections.response')}>
        <fieldset className="bfn-designed-sender__choice-group">
          <legend>{t('bfn.designedSender.fields.modelFamily')}</legend>
          {DESIGNED_SENDER_MODEL_FAMILIES.map((family) => (
            <label key={family}>
              <input
                type="radio"
                name="bfn-designed-sender-family"
                value={family}
                checked={state.family === family}
                onChange={() => updateState((current) => ({ ...current, family }))}
              />
              <span>{t(`bfn.designedSender.modelFamilies.${family}`)}</span>
            </label>
          ))}
        </fieldset>
        <div className="bfn-user-authoring__parameter-grid">
          <ParameterEditor
            id="k"
            label="K"
            unit={controlUnit}
            value={state.hillK}
            showIntervals={showIntervals}
            error={validationText('model.k')}
            onChange={(updater) => updateParameter('hillK', updater)}
          />
          <ParameterEditor
            id="n"
            label="n"
            unit="dimensionless"
            value={state.hillN}
            showIntervals={showIntervals}
            error={validationText('model.n')}
            onChange={(updater) => updateParameter('hillN', updater)}
          />
          <ParameterEditor
            id="ymin"
            label={t('bfn.designedSender.fields.minimumOutput')}
            unit={outputUnit}
            value={state.minimumOutput}
            showIntervals={showIntervals}
            error={validationText('model.minimumOutput', 'model.outputBounds')}
            onChange={(updater) => updateParameter('minimumOutput', updater)}
          />
          <ParameterEditor
            id="ymax"
            label={t('bfn.designedSender.fields.maximumOutput')}
            unit={outputUnit}
            value={state.maximumOutput}
            showIntervals={showIntervals}
            error={validationText('model.maximumOutput', 'model.outputBounds')}
            onChange={(updater) => updateParameter('maximumOutput', updater)}
          />
        </div>
        {validationText('uncertainty') ? (
          <p className="bfn-user-authoring__section-error" role="alert">
            {validationText('uncertainty')}
          </p>
        ) : null}
      </AuthoringSection>

      <AuthoringSection title={t('bfn.designedSender.sections.validity')}>
        <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
          <Field
            id="bfn-designed-sender-range-minimum"
            label={t('bfn.designedSender.fields.rangeMinimum')}
            error={validationText('inputs.1.minimum', 'inputs.1.range')}
          >
            <NumberWithUnit
              id="bfn-designed-sender-range-minimum"
              value={state.controlInput.minimum}
              unit={controlUnit}
              onChange={(value) =>
                updateState((current) => ({
                  ...current,
                  controlInput: { ...current.controlInput, minimum: value },
                }))
              }
            />
          </Field>
          <Field
            id="bfn-designed-sender-range-maximum"
            label={t('bfn.designedSender.fields.rangeMaximum')}
            error={validationText('inputs.1.maximum', 'inputs.1.range')}
          >
            <NumberWithUnit
              id="bfn-designed-sender-range-maximum"
              value={state.controlInput.maximum}
              unit={controlUnit}
              onChange={(value) =>
                updateState((current) => ({
                  ...current,
                  controlInput: { ...current.controlInput, maximum: value },
                }))
              }
            />
          </Field>
        </div>
      </AuthoringSection>

      <AuthoringSection title={t('bfn.designedSender.sections.context')}>
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
              id={`bfn-designed-sender-context-${field}`}
              label={t(`bfn.designedSender.fields.${label}`)}
              error={validationText(`context.${field}`)}
            >
              <input
                id={`bfn-designed-sender-context-${field}`}
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

      <AuthoringSection title={t('bfn.designedSender.sections.evidence')}>
        <Field
          id="bfn-designed-sender-evidence"
          label={t('bfn.designedSender.fields.evidenceBasis')}
        >
          <select
            id="bfn-designed-sender-evidence"
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
              id="bfn-designed-sender-provenance-kind"
              label={t('bfn.designedSender.fields.provenanceKind')}
            >
              <select
                id="bfn-designed-sender-provenance-kind"
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
              id="bfn-designed-sender-provenance-reference"
              label={t('bfn.designedSender.fields.provenanceReference')}
              error={validationText('evidence.provenance')}
            >
              <input
                id="bfn-designed-sender-provenance-reference"
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

      <AuthoringSection title={t('bfn.designedSender.sections.uncertainty')}>
        <Field
          id="bfn-designed-sender-uncertainty"
          label={t('bfn.designedSender.fields.uncertainty')}
          error={validationText('uncertainty')}
        >
          <select
            id="bfn-designed-sender-uncertainty"
            value={state.uncertainty}
            onChange={(event) => {
              const uncertainty = DESIGNED_SENDER_UNCERTAINTY_OPTIONS.find(
                (candidate) => candidate === event.target.value,
              );
              if (uncertainty) updateState((current) => ({ ...current, uncertainty }));
            }}
          >
            {DESIGNED_SENDER_UNCERTAINTY_OPTIONS.map((uncertainty) => (
              <option key={uncertainty} value={uncertainty}>
                {t(`bfn.userAuthoring.uncertainty.${uncertainty}`)}
              </option>
            ))}
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
          {t('bfn.designedSender.actions.cancel')}
        </Button>
        <Button type="submit" variant="primary" leadingIcon={<Icon name="plus" size={15} />}>
          {t('bfn.designedSender.actions.addToNetwork')}
        </Button>
      </footer>
    </form>
  );
}

function AuthoringSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="bfn-user-authoring__section">
      <header>
        <h3>{title}</h3>
      </header>
      <div className="bfn-user-authoring__section-body">{children}</div>
    </section>
  );
}

function Field({
  id,
  label,
  error,
  children,
}: {
  id: string;
  label: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="bfn-user-authoring__field" data-invalid={Boolean(error)}>
      <label htmlFor={id}>{label}</label>
      {children}
      {error ? <small className="bfn-user-authoring__field-error">{error}</small> : null}
    </div>
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
      <Field id={`bfn-designed-sender-parameter-${id}`} label={label} error={error}>
        <NumberWithUnit
          id={`bfn-designed-sender-parameter-${id}`}
          value={value.value}
          unit={unit}
          onChange={(nextValue) => onChange((current) => ({ ...current, value: nextValue }))}
        />
      </Field>
      {showIntervals ? (
        <div className="bfn-user-authoring__interval">
          <Field
            id={`bfn-designed-sender-parameter-${id}-lower`}
            label={t('bfn.userAuthoring.fields.intervalLower')}
          >
            <input
              id={`bfn-designed-sender-parameter-${id}-lower`}
              type="number"
              step="any"
              value={value.lower}
              onChange={(event) =>
                onChange((current) => ({ ...current, lower: event.target.value }))
              }
            />
          </Field>
          <Field
            id={`bfn-designed-sender-parameter-${id}-upper`}
            label={t('bfn.userAuthoring.fields.intervalUpper')}
          >
            <input
              id={`bfn-designed-sender-parameter-${id}-upper`}
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

function NumberWithUnit({
  id,
  value,
  unit,
  onChange,
}: {
  id: string;
  value: string;
  unit: BfnUnit;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="bfn-user-authoring__number-with-unit">
      <input
        id={id}
        type="number"
        step="any"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      <span>{bfnUnitLabel(unit, t)}</span>
    </div>
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
