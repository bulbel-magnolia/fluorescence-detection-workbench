import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { enUS } from './locales/en-US';
import { zhCN } from './locales/zh-CN';

export type AppLanguage = 'zh-CN' | 'en-US';
const languageKey = 'fluorescence-desktop.language';

function savedLanguage(): AppLanguage {
  const value = localStorage.getItem(languageKey);
  return value === 'en-US' ? 'en-US' : 'zh-CN';
}

void i18n.use(initReactI18next).init({
  resources: {
    'zh-CN': { translation: zhCN },
    'en-US': { translation: enUS },
  },
  lng: savedLanguage(),
  fallbackLng: 'zh-CN',
  supportedLngs: ['zh-CN', 'en-US'],
  interpolation: { escapeValue: false },
  returnNull: false,
});

i18n.on('languageChanged', (language) => {
  const next: AppLanguage = language === 'en-US' ? 'en-US' : 'zh-CN';
  localStorage.setItem(languageKey, next);
  document.documentElement.lang = next;
});

document.documentElement.lang = savedLanguage();

export default i18n;
