import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { AppShell, pageTitleKeys } from './AppShell';
import { disposeAppRuntime, useAppStore } from '../store/appStore';
import { useThemeStore } from '../theme/themeStore';

export function App() {
  const { t } = useTranslation();
  const section = useAppStore((state) => state.section);
  const hydrateHistory = useAppStore((state) => state.hydrateHistory);
  const theme = useThemeStore((state) => state.theme);

  useEffect(() => {
    document.title = `${t(pageTitleKeys[section])} · ${t('app.name')}`;
  }, [section, t]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.documentElement.style.colorScheme = theme;
  }, [theme]);

  useEffect(() => {
    const dispose = (): void => disposeAppRuntime();
    window.addEventListener('beforeunload', dispose);
    return () => window.removeEventListener('beforeunload', dispose);
  }, []);

  useEffect(() => {
    void hydrateHistory();
  }, [hydrateHistory]);

  return <AppShell />;
}
