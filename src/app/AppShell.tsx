import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { NavigationSection } from '../domain/types';
import { NavigationRail } from './NavigationRail';
import { TopBar } from './TopBar';
import { DetectionPage } from '../pages/DetectionPage';
import { HistoryPage } from '../pages/HistoryPage';
import { ImportPage } from '../pages/ImportPage';
import { OverviewPage } from '../pages/OverviewPage';
import { SettingsPage } from '../pages/SettingsPage';
import { TeamPage } from '../pages/TeamPage';
import { useAppStore } from '../store/appStore';

export const pageTitleKeys: Record<NavigationSection, string> = {
  overview: 'overview.title',
  detection: 'detection.title',
  import: 'import.title',
  history: 'history.title',
  team: 'team.title',
  settings: 'settings.title',
};

export function AppShell() {
  const { t } = useTranslation();
  const section = useAppStore((state) => state.section);
  const detectionState = useAppStore((state) => state.detectionState);
  const mainRef = useRef<HTMLElement | null>(null);
  const previousSection = useRef(section);

  useEffect(() => {
    if (previousSection.current === section) return;
    previousSection.current = section;
    mainRef.current?.focus();
  }, [section]);

  const pageTitle = t(pageTitleKeys[section]);

  const page = (() => {
    switch (section) {
      case 'overview':
        return <OverviewPage />;
      case 'detection':
        return <DetectionPage />;
      case 'import':
        return <ImportPage />;
      case 'history':
        return <HistoryPage />;
      case 'team':
        return <TeamPage />;
      case 'settings':
        return <SettingsPage />;
    }
  })();

  return (
    <>
      <a className="skip-link" href="#main-content">
        {t('common.skipToContent')}
      </a>
      <div className="app-shell" data-detection-state={detectionState}>
        <NavigationRail />
        <div className="app-frame" data-section={section}>
          <TopBar />
          <main
            id="main-content"
            className="page-viewport"
            data-section={section}
            key={section}
            ref={mainRef}
            tabIndex={-1}
            aria-label={pageTitle}
          >
            {page}
          </main>
        </div>
      </div>
    </>
  );
}
