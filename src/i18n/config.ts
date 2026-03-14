import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

// Import locale files
import enCommon from './locales/en/common.json';
import faCommon from './locales/fa/common.json';
import arCommon from './locales/ar/common.json';
import frCommon from './locales/fr/common.json';
import hiCommon from './locales/hi/common.json';
import zhCommon from './locales/zh/common.json';

const resources = {
  en: { common: enCommon },
  fa: { common: faCommon },
  ar: { common: arCommon },
  fr: { common: frCommon },
  hi: { common: hiCommon },
  zh: { common: zhCommon },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    fallbackLng: 'en',
    defaultNS: 'common',
    interpolation: { escapeValue: false },
    detection: {
      order: ['localStorage', 'navigator'],
      caches: ['localStorage'],
    },
  });

export default i18n;
