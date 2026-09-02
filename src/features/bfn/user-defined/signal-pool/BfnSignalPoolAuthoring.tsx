import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button';
import { Icon } from '../../../../components/Icon';
import { bfnEntityLabel, bfnUnitLabel } from '../../presentation';
import type { BfnPort, BfnProject } from '../../types';
import { getDesignedSenderSignalCatalog } from '../designed-sender/designedSenderSignalCatalog';
import {
  SIGNAL_POOL_CONCENTRATION_UNITS,
  createInitialSignalPoolAuthoringState,
  isSignalPoolConcentrationUnit,
  signalPoolUnitPair,
  type SignalPoolAuthoringState,
  type SignalPoolDraft,
} from './signalPoolContract';
import { buildSignalPoolDraft } from './signalPoolDraft';
import { collectSignalPoolEligibleEntityIds } from './signalPoolEntityEligibility';
import type { SignalPoolMaterializationResult } from './signalPoolMaterialization';

interface BfnSignalPoolAuthoringProps {
  project: BfnProject;
  onBack: () => void;
  onAdd: (draft: SignalPoolDraft) => SignalPoolMaterializationResult;
}

export function BfnSignalPoolAuthoring({ project, onBack, onAdd }: BfnSignalPoolAuthoringProps) {
  const { t, i18n } = useTranslation();
  const language = i18n.resolvedLanguage ?? i18n.language;
  const nameRef = useRef<HTMLInputElement>(null);
  const signals = useMemo(() => getDesignedSenderSignalCatalog(), []);
  const [state, setState] = useState<SignalPoolAuthoringState>(
    createInitialSignalPoolAuthoringState,
  );
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const draftResult = useMemo(
    () => buildSignalPoolDraft(state, project, signals),
    [project, signals, state],
  );
  const existingEntities = useMemo(
    () =>
      collectSignalPoolEligibleEntityIds(project).map((id) => ({
        id,
        label: existingEntityDisplayName(project, id, language, bfnEntityLabel(id, t)),
      })),
    [language, project, t],
  );
  const concentrationUnit = isSignalPoolConcentrationUnit(state.concentrationUnit)
    ? state.concentrationUnit
    : 'nM';
  const unitPair = signalPoolUnitPair(concentrationUnit);

  useEffect(() => nameRef.current?.focus(), []);

  const updateState = (
    updater: (current: SignalPoolAuthoringState) => SignalPoolAuthoringState,
  ): void => {
    setSubmissionError(null);
    setState(updater);
  };
  const submit = (): void => {
    if (!draftResult.ok) return;
    const outcome = onAdd(draftResult.draft);
    if (!outcome.ok) setSubmissionError(t('bfn.signalPool.validation.materialization'));
  };

  return (
    <form
      className="bfn-user-authoring bfn-signal-pool"
      aria-label={t('bfn.signalPool.title')}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="bfn-user-authoring__toolbar">
        <button type="button" onClick={onBack}>
          <span aria-hidden="true">←</span>
          {t('bfn.signalPool.back')}
        </button>
        <span>{t('bfn.signalPool.dynamicOnly')}</span>
      </div>

      <section className="bfn-user-authoring__section">
        <header>
          <h3>{t('bfn.signalPool.sections.definition')}</h3>
        </header>
        <div className="bfn-user-authoring__section-body">
          <p>{t('bfn.signalPool.description')}</p>
          <output className="bfn-designed-sender__fixed-value">dC/dt = r(t)</output>
          <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
            <Field id="bfn-signal-pool-name" label={t('bfn.signalPool.fields.name')}>
              <input
                ref={nameRef}
                id="bfn-signal-pool-name"
                value={state.name}
                onChange={(event) =>
                  updateState((current) => ({ ...current, name: event.target.value }))
                }
              />
            </Field>
            <Field id="bfn-signal-pool-description" label={t('bfn.signalPool.fields.description')}>
              <textarea
                id="bfn-signal-pool-description"
                value={state.description}
                onChange={(event) =>
                  updateState((current) => ({ ...current, description: event.target.value }))
                }
              />
            </Field>
          </div>
        </div>
      </section>

      <section className="bfn-user-authoring__section">
        <header>
          <h3>{t('bfn.signalPool.sections.signal')}</h3>
        </header>
        <div className="bfn-user-authoring__section-body">
          <fieldset className="bfn-designed-sender__choice-group">
            <legend>{t('bfn.signalPool.fields.signalSource')}</legend>
            <label>
              <input
                type="radio"
                name="bfn-signal-pool-signal-mode"
                value="known"
                checked={state.signalMode === 'known'}
                onChange={() => updateState((current) => ({ ...current, signalMode: 'known' }))}
              />
              <span>{t('bfn.signalPool.signal.known')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="bfn-signal-pool-signal-mode"
                value="existing"
                checked={state.signalMode === 'existing'}
                onChange={() => updateState((current) => ({ ...current, signalMode: 'existing' }))}
              />
              <span>{t('bfn.signalPool.signal.existing')}</span>
            </label>
            <label>
              <input
                type="radio"
                name="bfn-signal-pool-signal-mode"
                value="custom"
                checked={state.signalMode === 'custom'}
                onChange={() => updateState((current) => ({ ...current, signalMode: 'custom' }))}
              />
              <span>{t('bfn.signalPool.signal.custom')}</span>
            </label>
          </fieldset>

          {state.signalMode === 'known' ? (
            <Field id="bfn-signal-pool-known-signal" label={t('bfn.signalPool.signal.known')}>
              <select
                id="bfn-signal-pool-known-signal"
                value={state.knownCatalogSignalId}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    knownCatalogSignalId: event.target.value,
                  }))
                }
              >
                <option value="">{t('bfn.signalPool.signal.chooseKnown')}</option>
                {signals.map((signal) => (
                  <option key={signal.catalogSignalId} value={signal.catalogSignalId}>
                    {signal.displayName}
                  </option>
                ))}
              </select>
            </Field>
          ) : state.signalMode === 'existing' ? (
            <Field id="bfn-signal-pool-existing-entity" label={t('bfn.signalPool.signal.existing')}>
              <select
                id="bfn-signal-pool-existing-entity"
                value={state.existingEntityId}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    existingEntityId: event.target.value,
                  }))
                }
              >
                <option value="">{t('bfn.signalPool.signal.chooseExisting')}</option>
                {existingEntities.map((entity) => (
                  <option key={entity.id} value={entity.id}>
                    {entity.label}
                  </option>
                ))}
              </select>
            </Field>
          ) : state.signalMode === 'custom' ? (
            <Field id="bfn-signal-pool-custom-signal" label={t('bfn.signalPool.signal.custom')}>
              <input
                id="bfn-signal-pool-custom-signal"
                value={state.customSignalName}
                onChange={(event) =>
                  updateState((current) => ({
                    ...current,
                    customSignalName: event.target.value,
                  }))
                }
              />
            </Field>
          ) : null}
        </div>
      </section>

      <section className="bfn-user-authoring__section">
        <header>
          <h3>{t('bfn.signalPool.sections.state')}</h3>
        </header>
        <div className="bfn-user-authoring__section-body">
          <div className="bfn-user-authoring__grid bfn-user-authoring__grid--two">
            <Field id="bfn-signal-pool-unit" label={t('bfn.signalPool.fields.unit')}>
              <select
                id="bfn-signal-pool-unit"
                value={state.concentrationUnit}
                onChange={(event) => {
                  const unit = SIGNAL_POOL_CONCENTRATION_UNITS.find(
                    (candidate) => candidate === event.target.value,
                  );
                  if (unit) {
                    updateState((current) => ({ ...current, concentrationUnit: unit }));
                  }
                }}
              >
                {SIGNAL_POOL_CONCENTRATION_UNITS.map((unit) => (
                  <option key={unit} value={unit}>
                    {bfnUnitLabel(unit, t)}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              id="bfn-signal-pool-initial-concentration"
              label={t('bfn.signalPool.fields.initialConcentration')}
            >
              <div className="bfn-user-authoring__number-with-unit">
                <input
                  id="bfn-signal-pool-initial-concentration"
                  type="number"
                  min="0"
                  step="any"
                  value={state.initialConcentration}
                  onChange={(event) =>
                    updateState((current) => ({
                      ...current,
                      initialConcentration: event.target.value,
                    }))
                  }
                />
                <span>{bfnUnitLabel(concentrationUnit, t)}</span>
              </div>
            </Field>
          </div>
          <p className="bfn-designed-sender__fixed-value">
            {unitPair.productionRate} → {unitPair.concentration}
          </p>
          <p>{t('bfn.signalPool.dynamicHint')}</p>
        </div>
      </section>

      {submissionError ? (
        <p className="bfn-user-authoring__submission-error" role="alert">
          {submissionError}
        </p>
      ) : null}
      <footer className="bfn-user-authoring__actions">
        <Button variant="secondary" onClick={onBack}>
          {t('bfn.signalPool.actions.cancel')}
        </Button>
        <Button
          type="submit"
          variant="primary"
          leadingIcon={<Icon name="plus" size={15} />}
          disabled={!draftResult.ok}
        >
          {t('bfn.signalPool.actions.addToNetwork')}
        </Button>
      </footer>
    </form>
  );
}

function Field({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="bfn-user-authoring__field">
      <label htmlFor={id}>{label}</label>
      {children}
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
  const displayName = allPorts(project).find((port) => port.entity === entityId)?.displayName;
  if (!displayName) return fallback;
  return language.toLowerCase().startsWith('zh') ? displayName.zh : displayName.en;
}

function allPorts(project: BfnProject): BfnPort[] {
  return [
    ...project.network.inputSources.map((source) => source.outputPort),
    ...project.network.modules.flatMap((module) => [...module.inputPorts, ...module.outputPorts]),
    ...project.network.outputMonitors.map((monitor) => monitor.inputPort),
  ];
}
