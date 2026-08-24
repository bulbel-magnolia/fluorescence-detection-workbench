import { useTranslation } from 'react-i18next';

interface TechnicalDetailsProps {
  code: string;
  message?: string | null;
}

export function TechnicalDetails({ code, message }: TechnicalDetailsProps) {
  const { t } = useTranslation();

  return (
    <details className="technical-details">
      <summary>{t('errors.technicalDetails')}</summary>
      <dl>
        <div>
          <dt>{t('errors.errorCode')}</dt>
          <dd>
            <code>{code}</code>
          </dd>
        </div>
        {message ? (
          <div>
            <dt>{t('errors.errorMessage')}</dt>
            <dd>{message}</dd>
          </div>
        ) : null}
      </dl>
    </details>
  );
}
