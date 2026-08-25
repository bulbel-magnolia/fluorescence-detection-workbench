import { useTranslation } from 'react-i18next';
import type { NavigationSection } from '../domain/types';
import { Icon, type IconName } from '../components/Icon';
import { useAppStore } from '../store/appStore';
import { supabaseConfigured } from '../features/cloud/supabaseClient';

interface NavigationItem {
  section: NavigationSection;
  icon: IconName;
}

type NavigationGroupKey = 'detection' | 'modeling' | 'system';

const overviewItem: NavigationItem = { section: 'overview', icon: 'overview' };
const detectionItems: NavigationItem[] = [
  { section: 'detection', icon: 'pulse' },
  { section: 'import', icon: 'import' },
  { section: 'history', icon: 'history' },
];
const modelingItem: NavigationItem = { section: 'modeling', icon: 'network' };

const teamItem: NavigationItem = {
  section: 'team',
  icon: 'team',
};

const settingsItem: NavigationItem = { section: 'settings', icon: 'settings' };

export function NavigationRail() {
  const { t } = useTranslation();
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const transportMode = useAppStore((state) => state.transportMode);
  const groups: Array<{ key: NavigationGroupKey; items: NavigationItem[] }> = [
    { key: 'detection', items: detectionItems },
    { key: 'modeling', items: [modelingItem] },
    {
      key: 'system',
      items: supabaseConfigured || section === 'team' ? [teamItem, settingsItem] : [settingsItem],
    },
  ];

  return (
    <aside className="nav-rail">
      <div className="brand">
        <span className="brand__mark" aria-hidden="true">
          <i />
          <i />
          <i />
        </span>
        <div>
          <strong>{t('app.name')}</strong>
          <span>{t('app.team')}</span>
        </div>
      </div>
      <nav aria-label={t('common.primaryNavigation')}>
        <button
          type="button"
          className={`nav-rail__overview${section === overviewItem.section ? ' is-active' : ''}`}
          onClick={() => setSection(overviewItem.section)}
          aria-current={section === overviewItem.section ? 'page' : undefined}
          aria-label={t(`nav.${overviewItem.section}`)}
          title={t(`nav.${overviewItem.section}`)}
        >
          <Icon name={overviewItem.icon} />
          <span>{t(`nav.${overviewItem.section}`)}</span>
        </button>
        {groups.map((group) => (
          <div
            className="nav-rail__group"
            key={group.key}
            role="group"
            aria-label={t(`navGroups.${group.key}`)}
          >
            <span className="nav-rail__group-label">{t(`navGroups.${group.key}`)}</span>
            {group.items.map((item) => (
              <button
                key={item.section}
                type="button"
                className={section === item.section ? 'is-active' : ''}
                onClick={() => setSection(item.section)}
                aria-current={section === item.section ? 'page' : undefined}
                aria-label={t(`nav.${item.section}`)}
                title={t(`nav.${item.section}`)}
              >
                <Icon name={item.icon} />
                <span>{t(`nav.${item.section}`)}</span>
              </button>
            ))}
          </div>
        ))}
      </nav>
      {section !== 'modeling' ? (
        <div className="nav-rail__footer">
          <span className={transportMode === 'hc08d' ? 'hardware-beacon' : 'demo-beacon'} />
          <div>
            <strong>{transportMode === 'hc08d' ? 'HC-08D' : t('common.demoMode')}</strong>
          </div>
        </div>
      ) : null}
    </aside>
  );
}
