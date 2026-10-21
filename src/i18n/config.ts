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
import enStudy from './locales/en/study.json';
import faStudy from './locales/fa/study.json';
import arStudy from './locales/ar/study.json';
import frStudy from './locales/fr/study.json';
import hiStudy from './locales/hi/study.json';
import zhStudy from './locales/zh/study.json';
import enCelpip from './locales/en/celpip.json';
import faCelpip from './locales/fa/celpip.json';
import arCelpip from './locales/ar/celpip.json';
import frCelpip from './locales/fr/celpip.json';
import hiCelpip from './locales/hi/celpip.json';
import zhCelpip from './locales/zh/celpip.json';
import enReader from './locales/en/reader.json';
import enReadingLibrary from './locales/en/readingLibrary.json';
import faReader from './locales/fa/reader.json';
import faReadingLibrary from './locales/fa/readingLibrary.json';
import arReader from './locales/ar/reader.json';
import arReadingLibrary from './locales/ar/readingLibrary.json';
import frReader from './locales/fr/reader.json';
import frReadingLibrary from './locales/fr/readingLibrary.json';
import hiReader from './locales/hi/reader.json';
import hiReadingLibrary from './locales/hi/readingLibrary.json';
import zhReader from './locales/zh/reader.json';
import zhReadingLibrary from './locales/zh/readingLibrary.json';

const resources = {
  en: {
    common: enCommon,
    study: enStudy,
    celpip: enCelpip,
    reader: enReader,
    readingLibrary: enReadingLibrary,
  },
  fa: {
    common: faCommon,
    study: faStudy,
    celpip: faCelpip,
    reader: faReader,
    readingLibrary: faReadingLibrary,
  },
  ar: {
    common: arCommon,
    study: arStudy,
    celpip: arCelpip,
    reader: arReader,
    readingLibrary: arReadingLibrary,
  },
  fr: {
    common: frCommon,
    study: frStudy,
    celpip: frCelpip,
    reader: frReader,
    readingLibrary: frReadingLibrary,
  },
  hi: {
    common: hiCommon,
    study: hiStudy,
    celpip: hiCelpip,
    reader: hiReader,
    readingLibrary: hiReadingLibrary,
  },
  zh: {
    common: zhCommon,
    study: zhStudy,
    celpip: zhCelpip,
    reader: zhReader,
    readingLibrary: zhReadingLibrary,
  },
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
