import { useTranslation } from 'react-i18next';
import type { BfnReusableModulePayloadV1 } from './template';
import { createModuleLibraryScientificPresentation } from './moduleLibraryPresentation';

interface BfnModuleScientificSummaryProps {
  payload: BfnReusableModulePayloadV1;
}

export function BfnModuleScientificSummary({ payload }: BfnModuleScientificSummaryProps) {
  const { t, i18n } = useTranslation();
  const presentation = createModuleLibraryScientificPresentation(
    payload,
    t,
    i18n.resolvedLanguage ?? i18n.language,
  );
  const numberFormatter = new Intl.NumberFormat(i18n.resolvedLanguage ?? i18n.language, {
    maximumSignificantDigits: 6,
  });

  return (
    <div className="bfn-module-science">
      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.inputsOutputs')}</h3>
        <div className="bfn-module-library__table-scroll">
          <table className="bfn-module-library__table">
            <thead>
              <tr>
                <th>{t('bfn.moduleLibrary.columns.direction')}</th>
                <th>{t('bfn.moduleLibrary.columns.entity')}</th>
                <th>{t('bfn.moduleLibrary.columns.measurement')}</th>
              </tr>
            </thead>
            <tbody>
              {presentation.ports.map((port) => (
                <tr key={port.key}>
                  <th scope="row">
                    {t(`bfn.moduleLibrary.portDirections.${port.direction}`)}
                    <small>{port.role}</small>
                  </th>
                  <td>{port.entity}</td>
                  <td>{port.measurement}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.model')}</h3>
        <dl className="bfn-module-library__properties">
          <div>
            <dt>{t('bfn.moduleLibrary.fields.type')}</dt>
            <dd>{presentation.moduleType}</dd>
          </div>
          <div>
            <dt>{t('bfn.moduleLibrary.fields.model')}</dt>
            <dd>
              {presentation.modelName}
              {presentation.modelDetail ? <small>{presentation.modelDetail}</small> : null}
            </dd>
          </div>
          <div>
            <dt>{t('bfn.moduleLibrary.fields.modelVersion')}</dt>
            <dd>{presentation.modelVersion}</dd>
          </div>
        </dl>
      </section>

      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.parameters')}</h3>
        {presentation.parameters.length ? (
          <div className="bfn-module-library__table-scroll">
            <table className="bfn-module-library__table bfn-module-library__parameter-table">
              <thead>
                <tr>
                  <th>{t('bfn.moduleLibrary.columns.parameter')}</th>
                  <th>{t('bfn.moduleLibrary.columns.value')}</th>
                  <th>{t('bfn.moduleLibrary.columns.interval')}</th>
                  <th>{t('bfn.moduleLibrary.columns.unit')}</th>
                </tr>
              </thead>
              <tbody>
                {presentation.parameters.map((parameter) => (
                  <tr key={parameter.key}>
                    <th scope="row">{parameter.label}</th>
                    <td className="bfn-module-library__numeric">
                      {numberFormatter.format(parameter.value)}
                    </td>
                    <td className="bfn-module-library__numeric">
                      {parameter.interval95
                        ? `${numberFormatter.format(parameter.interval95[0])}–${numberFormatter.format(
                            parameter.interval95[1],
                          )}`
                        : t('bfn.moduleLibrary.notRecorded')}
                    </td>
                    <td>{parameter.unit}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="bfn-module-library__muted">{t('bfn.moduleLibrary.parameters.none')}</p>
        )}
      </section>

      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.applicability')}</h3>
        <dl className="bfn-module-library__properties">
          {presentation.applicability.map((property) => (
            <div key={property.key}>
              <dt>{property.label}</dt>
              <dd>{property.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.evidence')}</h3>
        <dl className="bfn-module-library__properties">
          <div>
            <dt>{t('bfn.moduleLibrary.fields.basis')}</dt>
            <dd>{presentation.evidenceBasis}</dd>
          </div>
          <div>
            <dt>{t('bfn.moduleLibrary.fields.sources')}</dt>
            <dd>
              {presentation.evidenceSources.length
                ? presentation.evidenceSources.join(' · ')
                : t('bfn.moduleLibrary.userDefinedSource')}
            </dd>
          </div>
        </dl>
      </section>

      <section className="bfn-module-science__section">
        <h3>{t('bfn.moduleLibrary.sections.uncertainty')}</h3>
        <p>{presentation.uncertainty}</p>
      </section>
    </div>
  );
}
