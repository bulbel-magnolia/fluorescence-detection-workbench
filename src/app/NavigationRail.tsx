import { useTranslation } from 'react-i18next';
import type { NavigationSection } from '../domain/types';
import { Icon, type IconName } from '../components/Icon';
import { useAppStore } from '../store/appStore';
import { supabaseConfigured } from '../features/cloud/supabaseClient';

const items: Array<{ section: NavigationSection; icon: IconName }> = [
  { section: 'overview', icon: 'overview' },
  { section: 'detection', icon: 'pulse' },
  { section: 'modeling', icon: 'network' },
  { section: 'import', icon: 'import' },
  { section: 'history', icon: 'history' },
  { section: 'settings', icon: 'settings' },
];

const teamItem: { section: NavigationSection; icon: IconName } = {
  section: 'team',
  icon: 'team',
};

const settingsItem = items[items.length - 1]!;

export function NavigationRail() {
  const { t } = useTranslation();
  const section = useAppStore((state) => state.section);
  const setSection = useAppStore((state) => state.setSection);
  const transportMode = useAppStore((state) => state.transportMode);
  const navItems =
    supabaseConfigured || section === 'team'
      ? [...items.slice(0, -1), teamItem, settingsItem]
      : items;

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
        {navItems.map((item) => (
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
      </nav>
      <div className="nav-rail__footer">
        <span className={transportMode === 'hc08d' ? 'hardware-beacon' : 'demo-beacon'} />
        <div>
          <strong>{transportMode === 'hc08d' ? 'HC-08D' : t('common.demoMode')}</strong>
        </div>
      </div>
    </aside>
  );
}
