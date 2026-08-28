import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../../components/Button';
import type {
  BfnCatalogInverseSearchSpace,
  BfnCatalogInverseValidationIssue,
} from '../catalogInverseDesignTypes';
import {
  computeCommonTrustedRange,
  countCandidatesCoveringTargetRange,
  listCatalogInverseContextOptions,
} from '../catalogInverseDesignSpace';
import type {
  ReleaseCatalogLanguage,
  ReleaseCatalogPresentation,
} from '../../../modeling/catalog/releaseCatalogPresentation';
import { catalogInverseSignalDisplayName } from './catalogInverseDesignPresentation';
import type { BfnCatalogInverseTargetDraft } from './catalogInverseDesignTargetDraft';
import {
  formatConcentration,
  formatConcentrationValue,
  toM,
  type BfnCatalogInverseConcentrationUnit,
} from './catalogInverseDesignUnits';

interface BfnInverseTargetPanelProps {
  draft: BfnCatalogInverseTargetDraft;
  searchSpace: BfnCatalogInverseSearchSpace;
  presentation: ReleaseCatalogPresentation;
  language: ReleaseCatalogLanguage;
  issues: readonly BfnCatalogInverseValidationIssue[];
  searchEnabled: boolean;
  onDraftChange: (draft: BfnCatalogInverseTargetDraft) => void;
  onSignalChange: (signalId: string | null) => void;
  onUnitChange: (unit: BfnCatalogInverseConcentrationUnit) => void;
  onSearch: () => void;
}

const CONCENTRATION_UNITS: readonly BfnCatalogInverseConcentrationUnit[] = [
  'pM',
  'nM',
  'µM',
  'mM',
  'M',
];

export function BfnInverseTargetPanel({
  draft,
  searchSpace,
  presentation,
  language,
  issues,
  searchEnabled,
  onDraftChange,
  onSignalChange,
  onUnitChange,
  onSearch,
}: BfnInverseTargetPanelProps) {
  const { t } = useTranslation();
  const signalId = draft.inputSignalId;
  const commonRange =
    signalId === null ? null : computeCommonTrustedRange(searchSpace, signalId);
  const contextOptions =
    signalId === null ? [] : listCatalogInverseContextOptions(searchSpace, signalId);
  const hostOptions = useMemo(
    () => [
      ...new Set(
        contextOptions
          .map((option) => option.hostSpecies)
          .filter((host): host is string => host !== null),
      ),
    ],
    [contextOptions],
  );
  const strainOptions = useMemo(
    () => [
      ...new Set(
        contextOptions
          .filter(
            (option) =>
              draft.hostSpecies === null || option.hostSpecies === draft.hostSpecies,
          )
          .map((option) => option.hostStrain)
          .filter((strain): strain is string => strain !== null),
      ),
    ],
    [contextOptions, draft.hostSpecies],
  );
  const selectedSignal = searchSpace.searchableSignals.find(
    (option) => option.signalId === signalId,
  );
  const low = parseInput(draft.lowConcentration);
  const high = parseInput(draft.highConcentration);
  const coverage =
    signalId !== null && low !== null && high !== null && low > 0 && high > low
      ? countCandidatesCoveringTargetRange(searchSpace, signalId, {
          minimum: toM(low, draft.concentrationUnit),
          maximum: toM(high, draft.concentrationUnit),
        })
      : null;

  const update = (values: Partial<BfnCatalogInverseTargetDraft>) =>
    onDraftChange({ ...draft, ...values });

  return (
    <aside className='bfn-catalog-inverse__target' aria-labelledby='bfn-inverse-target-title'>
      <header className='bfn-catalog-inverse__pane-header'>
        <h2 id='bfn-inverse-target-title'>{t('bfn.inverseDesign.target.title')}</h2>
      </header>

      <section className='bfn-inverse-form-section'>
        <h2>{t('bfn.inverseDesign.target.signalSection')}</h2>
        <label className='bfn-inverse-field'>
          <span>{t('bfn.inverseDesign.target.inputSignal')}</span>
          <select
            value={signalId ?? ''}
            onChange={(event) => onSignalChange(event.target.value || null)}
          >
            <option value=''>{t('bfn.inverseDesign.target.selectSignal')}</option>
            {searchSpace.searchableSignals.map((signal) => (
              <option key={signal.signalId} value={signal.signalId}>
                {catalogInverseSignalDisplayName(presentation, signal.signalId, language)} ·{' '}
                {t('bfn.inverseDesign.target.responseCount', { count: signal.responseCount })}
              </option>
            ))}
          </select>
        </label>
      </section>

      <section className='bfn-inverse-form-section'>
        <div className='bfn-inverse-form-section__heading'>
          <h2>{t('bfn.inverseDesign.target.responseWindow')}</h2>
          <label className='bfn-inverse-unit-select'>
            <span>{t('bfn.inverseDesign.target.concentrationUnit')}</span>
            <select
              value={draft.concentrationUnit}
              onChange={(event) =>
                onUnitChange(event.target.value as BfnCatalogInverseConcentrationUnit)
              }
            >
              {CONCENTRATION_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className='bfn-inverse-paired-fields'>
          <NumberField
            label={t('bfn.inverseDesign.target.lowConcentration')}
            value={draft.lowConcentration}
            unit={draft.concentrationUnit}
            onChange={(value) => update({ lowConcentration: value })}
          />
          <NumberField
            label={t('bfn.inverseDesign.target.highConcentration')}
            value={draft.highConcentration}
            unit={draft.concentrationUnit}
            onChange={(value) => update({ highConcentration: value })}
          />
          <NumberField
            label={t('bfn.inverseDesign.target.lowResponseMaximum')}
            value={draft.lowResponseMaximum}
            onChange={(value) => update({ lowResponseMaximum: value })}
          />
          <NumberField
            label={t('bfn.inverseDesign.target.highResponseMinimum')}
            value={draft.highResponseMinimum}
            onChange={(value) => update({ highResponseMinimum: value })}
          />
        </div>

        {commonRange ? (
          <div className='bfn-inverse-trusted-range'>
            <div>
              <span>{t('bfn.inverseDesign.target.commonTrustedRange')}</span>
              <strong>
                {formatConcentration(commonRange.minimum, draft.concentrationUnit, language)} –{' '}
                {formatConcentration(commonRange.maximum, draft.concentrationUnit, language)}
              </strong>
            </div>
            <Button
              size='sm'
              variant='secondary'
              onClick={() =>
                update({
                  lowConcentration: formatConcentrationValue(
                    commonRange.minimum,
                    draft.concentrationUnit,
                  ),
                  highConcentration: formatConcentrationValue(
                    commonRange.maximum,
                    draft.concentrationUnit,
                  ),
                })
              }
            >
              {t('bfn.inverseDesign.target.useRange')}
            </Button>
          </div>
        ) : signalId === null ? null : (
          <p className='bfn-inverse-field-note'>{t('bfn.inverseDesign.target.noCommonRange')}</p>
        )}
        {coverage !== null && selectedSignal ? (
          <p className='bfn-inverse-coverage' role='status'>
            {t('bfn.inverseDesign.target.coverage', {
              covered: coverage,
              total: selectedSignal.responseCount,
            })}
          </p>
        ) : null}
      </section>

      <details className='bfn-inverse-advanced'>
        <summary>{t('bfn.inverseDesign.target.advanced')}</summary>
        <div className='bfn-inverse-advanced__content'>
          <OptionalRange
            enabled={draft.ec50Enabled}
            label={t('bfn.inverseDesign.target.ec50Range')}
            minimumLabel={t('bfn.inverseDesign.target.ec50Minimum')}
            maximumLabel={t('bfn.inverseDesign.target.ec50Maximum')}
            minimum={draft.ec50Minimum}
            maximum={draft.ec50Maximum}
            unit={draft.concentrationUnit}
            onEnabledChange={(enabled) => update({ ec50Enabled: enabled })}
            onMinimumChange={(value) => update({ ec50Minimum: value })}
            onMaximumChange={(value) => update({ ec50Maximum: value })}
          />
          <OptionalRange
            enabled={draft.hillEnabled}
            label={t('bfn.inverseDesign.target.hillRange')}
            minimumLabel={t('bfn.inverseDesign.target.hillMinimum')}
            maximumLabel={t('bfn.inverseDesign.target.hillMaximum')}
            minimum={draft.hillMinimum}
            maximum={draft.hillMaximum}
            onEnabledChange={(enabled) => update({ hillEnabled: enabled })}
            onMinimumChange={(value) => update({ hillMinimum: value })}
            onMaximumChange={(value) => update({ hillMaximum: value })}
          />
          <label className='bfn-inverse-field'>
            <span>{t('bfn.inverseDesign.target.mechanism')}</span>
            <select
              value={draft.biologicalDirection}
              onChange={(event) =>
                update({
                  biologicalDirection: event.target
                    .value as BfnCatalogInverseTargetDraft['biologicalDirection'],
                })
              }
            >
              {(['any', 'activation', 'derepression'] as const).map((direction) => (
                <option key={direction} value={direction}>
                  {t(`bfn.inverseDesign.direction.${direction}`)}
                </option>
              ))}
            </select>
          </label>
          <div className='bfn-inverse-paired-fields'>
            <label className='bfn-inverse-field'>
              <span>{t('bfn.inverseDesign.target.host')}</span>
              <select
                value={draft.hostSpecies ?? ''}
                disabled={signalId === null}
                onChange={(event) => {
                  const hostSpecies = event.target.value || null;
                  const hostStrain =
                    draft.hostStrain !== null &&
                    contextOptions.some(
                      (option) =>
                        option.hostStrain === draft.hostStrain &&
                        (hostSpecies === null || option.hostSpecies === hostSpecies),
                    )
                      ? draft.hostStrain
                      : null;
                  update({ hostSpecies, hostStrain });
                }}
              >
                <option value=''>{t('bfn.inverseDesign.target.anyHost')}</option>
                {hostOptions.map((host) => (
                  <option key={host} value={host}>
                    {host}
                  </option>
                ))}
              </select>
            </label>
            <label className='bfn-inverse-field'>
              <span>{t('bfn.inverseDesign.target.strain')}</span>
              <select
                value={draft.hostStrain ?? ''}
                disabled={signalId === null}
                onChange={(event) => update({ hostStrain: event.target.value || null })}
              >
                <option value=''>{t('bfn.inverseDesign.target.anyStrain')}</option>
                {strainOptions.map((strain) => (
                  <option key={strain} value={strain}>
                    {strain}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      </details>

      {issues.map((issue) => (
        <p
          className={`bfn-inverse-validation bfn-inverse-validation--${issue.severity}`}
          key={`${issue.code}-${issue.severity}`}
          role={issue.severity === 'error' ? 'alert' : 'status'}
        >
          {t(`bfn.inverseDesign.validation.${issue.code}`)}
        </p>
      ))}
      <Button variant='primary' fullWidth disabled={!searchEnabled} onClick={onSearch}>
        {t('bfn.inverseDesign.actions.search')}
      </Button>
    </aside>
  );
}

interface NumberFieldProps {
  label: string;
  value: string;
  unit?: string;
  onChange: (value: string) => void;
}

function NumberField({ label, value, unit, onChange }: NumberFieldProps) {
  return (
    <label className='bfn-inverse-field'>
      <span>{label}</span>
      <span className='bfn-inverse-number-input'>
        <input
          type='number'
          min='0'
          step='any'
          value={value}
          aria-label={label}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <i>{unit}</i> : null}
      </span>
    </label>
  );
}

interface OptionalRangeProps {
  enabled: boolean;
  label: string;
  minimumLabel: string;
  maximumLabel: string;
  minimum: string;
  maximum: string;
  unit?: string;
  onEnabledChange: (enabled: boolean) => void;
  onMinimumChange: (value: string) => void;
  onMaximumChange: (value: string) => void;
}

function OptionalRange({
  enabled,
  label,
  minimumLabel,
  maximumLabel,
  minimum,
  maximum,
  unit,
  onEnabledChange,
  onMinimumChange,
  onMaximumChange,
}: OptionalRangeProps) {
  return (
    <fieldset className='bfn-inverse-optional-range'>
      <legend>
        <label>
          <input
            type='checkbox'
            checked={enabled}
            onChange={(event) => onEnabledChange(event.target.checked)}
          />
          {label}
        </label>
      </legend>
      {enabled ? (
        <div className='bfn-inverse-paired-fields'>
          <NumberField
            label={minimumLabel}
            value={minimum}
            {...(unit === undefined ? {} : { unit })}
            onChange={onMinimumChange}
          />
          <NumberField
            label={maximumLabel}
            value={maximum}
            {...(unit === undefined ? {} : { unit })}
            onChange={onMaximumChange}
          />
        </div>
      ) : null}
    </fieldset>
  );
}

function parseInput(value: string): number | null {
  if (value.trim().length === 0) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
