import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '../../../components/Button';
import { Icon } from '../../../components/Icon';
import { bfnNodeDisplayName, bfnPortPrimaryLabel } from '../presentation';
import type { BfnProject } from '../types';
import type { BfnCatalogResponseDetail } from './catalogDetail';
import { resolveBfnCatalogCandidateInput } from './catalogInstantiation';

interface BfnCatalogInstantiationPanelProps {
  detail: BfnCatalogResponseDetail;
  project: BfnProject;
  language: string;
  onInstantiate: (responseId: string, createInputSource: boolean) => void;
}

export function BfnCatalogInstantiationPanel({
  detail,
  project,
  language,
  onInstantiate,
}: BfnCatalogInstantiationPanelProps) {
  const { t } = useTranslation();
  const resolution = useMemo(
    () =>
      detail.runtimeCandidate
        ? resolveBfnCatalogCandidateInput(project, detail.runtimeCandidate)
        : null,
    [detail.runtimeCandidate, project],
  );
  const recommendedCreateInputSource = resolution?.recommendedAction === 'module_plus_input_source';
  const [createInputSource, setCreateInputSource] = useState(recommendedCreateInputSource);
  useEffect(() => {
    setCreateInputSource(recommendedCreateInputSource);
  }, [detail.responseId, recommendedCreateInputSource]);
  if (!detail.canAddToNetwork || !resolution) return null;

  const signal = language.toLocaleLowerCase().startsWith('zh')
    ? detail.inputSignalNames.zh
    : detail.inputSignalNames.en;
  const radioName = `catalog-add-${detail.responseId.replace(/[^a-z0-9]/giu, '-')}`;
  return (
    <section className="bfn-catalog-instantiation" aria-label={t('bfn.catalogInstantiation.title')}>
      <header>
        <span>{t('bfn.catalogInstantiation.kicker')}</span>
        <h3>{t('bfn.catalogInstantiation.title')}</h3>
      </header>
      <div className="bfn-catalog-instantiation__resolution">
        <strong>{t('bfn.catalogInstantiation.inputSources')}</strong>
        <p>
          {t(
            resolution.status === 'missing'
              ? 'bfn.catalogInstantiation.missing'
              : 'bfn.catalogInstantiation.available',
            { signal, count: resolution.compatibleSources.length },
          )}
        </p>
        {resolution.status === 'available' ? (
          <>
            <ul>
              {resolution.compatibleSources.map((source) => {
                const node =
                  project.network.inputSources.find((entry) => entry.id === source.nodeId) ??
                  project.network.modules.find((entry) => entry.id === source.nodeId);
                return (
                  <li key={`${source.nodeId}:${source.port.id}`}>
                    <strong>{node ? bfnNodeDisplayName(node, language, t) : source.nodeId}</strong>
                    <span>
                      {bfnPortPrimaryLabel(source.port, t, language)} · {source.port.unit}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="bfn-catalog-instantiation__hint">
              {t('bfn.catalogInstantiation.availableHint')}
            </p>
          </>
        ) : null}
      </div>
      <fieldset>
        <legend>{t('bfn.catalogInstantiation.addMethod')}</legend>
        <CatalogAddOption
          name={radioName}
          checked={createInputSource}
          recommended={recommendedCreateInputSource}
          label={t('bfn.catalogInstantiation.moduleAndSource')}
          description={t('bfn.catalogInstantiation.moduleAndSourceHint', { signal })}
          onChange={() => setCreateInputSource(true)}
        />
        <CatalogAddOption
          name={radioName}
          checked={!createInputSource}
          recommended={!recommendedCreateInputSource}
          label={t('bfn.catalogInstantiation.moduleOnly')}
          description={t('bfn.catalogInstantiation.moduleOnlyHint')}
          onChange={() => setCreateInputSource(false)}
        />
      </fieldset>
      <p className="bfn-catalog-instantiation__boundary">
        <Icon name="info" size={13} />
        <span>{t('bfn.catalogInstantiation.connectionBoundary')}</span>
      </p>
      <Button
        variant="primary"
        fullWidth
        leadingIcon={<Icon name="plus" size={15} />}
        onClick={() => onInstantiate(detail.responseId, createInputSource)}
      >
        {t('bfn.catalogInstantiation.add')}
      </Button>
    </section>
  );
}

function CatalogAddOption({
  name,
  checked,
  recommended,
  label,
  description,
  onChange,
}: {
  name: string;
  checked: boolean;
  recommended: boolean;
  label: string;
  description: string;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  return (
    <label className="bfn-catalog-instantiation__option" data-checked={checked}>
      <input type="radio" name={name} checked={checked} onChange={onChange} />
      <span>
        <strong>
          {label}
          {recommended ? <em>{t('bfn.catalogInstantiation.recommended')}</em> : null}
        </strong>
        <small>{description}</small>
      </span>
    </label>
  );
}
