import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from '../components/Icon';
import { PageHeader } from '../components/PageHeader';
import { StatusPill } from '../components/StatusPill';
import { signInWithEmail, supabaseConfigured } from '../features/cloud/supabaseClient';

export function TeamPage() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (!supabaseConfigured) return;
    setSubmitting(true);
    const result = await signInWithEmail(email, password);
    setPassword('');
    setMessage(
      'error' in result ? t('team.signInFailed') : t('team.signedIn', { email: result.email }),
    );
    setSubmitting(false);
  };

  return (
    <div className="page page--team">
      <PageHeader
        eyebrow={t('team.eyebrow')}
        title={t('team.title')}
        subtitle={t('team.subtitle')}
        actions={
          <StatusPill
            label={supabaseConfigured ? t('common.online') : t('common.offline')}
            tone={supabaseConfigured ? 'success' : 'neutral'}
            icon="cloud"
          />
        }
      />
      <div className="team-layout">
        <section className="panel auth-panel">
          <div className="auth-panel__header">
            <span className="auth-panel__mark">
              <Icon name="team" size={26} />
            </span>
            <div>
              <span className="panel-kicker">{t('team.authLabel')}</span>
              <h2>{t('team.signIn')}</h2>
            </div>
          </div>
          {!supabaseConfigured ? (
            <div className="validation-message">
              <Icon name="cloud" />
              <div>
                <strong>{t('common.offline')}</strong>
                <span>{t('team.cloudUnavailable')}</span>
              </div>
            </div>
          ) : null}
          <form onSubmit={(event) => void submit(event)}>
            <label className="field">
              <span>{t('team.email')}</span>
              <input
                type="email"
                autoComplete="username"
                value={email}
                disabled={!supabaseConfigured}
                placeholder={t('team.emailPlaceholder')}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>{t('team.password')}</span>
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                disabled={!supabaseConfigured}
                placeholder={t('team.passwordPlaceholder')}
                onChange={(event) => setPassword(event.target.value)}
              />
            </label>
            <button
              className="button button--primary button--wide"
              type="submit"
              disabled={!supabaseConfigured || submitting || !email || !password}
            >
              <Icon name="user" size={17} />
              {submitting ? t('team.signingIn') : t('team.submit')}
            </button>
            {message ? (
              <p className="form-message" role="status">
                {message}
              </p>
            ) : null}
          </form>
          <p className="security-note">
            <Icon name="check" size={15} />
            {t('team.security')}
          </p>
        </section>

        <section className="panel role-panel">
          <div className="panel-heading">
            <div>
              <span className="panel-kicker">{t('team.permissionLabel')}</span>
              <h2>{t('team.roles')}</h2>
            </div>
          </div>
          <article className="role-card">
            <span>01</span>
            <div>
              <strong>{t('team.admin')}</strong>
              <p>{t('team.adminDescription')}</p>
            </div>
            <Icon name="settings" />
          </article>
          <article className="role-card">
            <span>02</span>
            <div>
              <strong>{t('team.member')}</strong>
              <p>{t('team.memberDescription')}</p>
            </div>
            <Icon name="user" />
          </article>
          <div className="cloud-boundary">
            <Icon name="cloud" />
            <span>{t('team.roleBoundary')}</span>
            <i />
            <span>{t('team.cloudService')}</span>
            <i />
            <span>{t('team.teamData')}</span>
          </div>
        </section>
      </div>
    </div>
  );
}
