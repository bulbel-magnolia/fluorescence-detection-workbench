import { useTranslation } from 'react-i18next';
import type { ModelingActivity } from './activity';

export function ModelingActivityPanel({ events }: { events: ModelingActivity[] }) {
  const { t, i18n } = useTranslation();
  if (events.length === 0) {
    return <div className="provenance-empty">{t('modeling.provenanceEmpty')}</div>;
  }

  return (
    <div className="provenance-list">
      {[...events].reverse().map((event) => (
        <article className="provenance-event" key={event.id}>
          <span className="provenance-event__dot" aria-hidden="true" />
          <div>
            <strong>{t(`modeling.activity.${event.type}`)}</strong>
            <span>{event.detail.label ?? event.detail.key ?? event.detail.subjectId}</span>
          </div>
          <time dateTime={new Date(event.timestamp).toISOString()}>
            {new Date(event.timestamp).toLocaleTimeString(i18n.language, {
              hour: '2-digit',
              minute: '2-digit',
            })}
          </time>
        </article>
      ))}
    </div>
  );
}
