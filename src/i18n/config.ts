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
import enExam from './locales/en/exam.json';
import faExam from './locales/fa/exam.json';
import arExam from './locales/ar/exam.json';
import frExam from './locales/fr/exam.json';
import hiExam from './locales/hi/exam.json';
import zhExam from './locales/zh/exam.json';
import enCelpip from './locales/en/celpip.json';
import faCelpip from './locales/fa/celpip.json';
import arCelpip from './locales/ar/celpip.json';
import frCelpip from './locales/fr/celpip.json';
import hiCelpip from './locales/hi/celpip.json';
import zhCelpip from './locales/zh/celpip.json';
import enReader from './locales/en/reader.json';
import enReadingLibrary from './locales/en/readingLibrary.json';
import enReaderDesk from './locales/en/readerDesk.json';
import faReader from './locales/fa/reader.json';
import faReadingLibrary from './locales/fa/readingLibrary.json';
import faReaderDesk from './locales/fa/readerDesk.json';
import arReader from './locales/ar/reader.json';
import arReadingLibrary from './locales/ar/readingLibrary.json';
import arReaderDesk from './locales/ar/readerDesk.json';
import frReader from './locales/fr/reader.json';
import frReadingLibrary from './locales/fr/readingLibrary.json';
import frReaderDesk from './locales/fr/readerDesk.json';
import hiReader from './locales/hi/reader.json';
import hiReadingLibrary from './locales/hi/readingLibrary.json';
import hiReaderDesk from './locales/hi/readerDesk.json';
import zhReader from './locales/zh/reader.json';
import zhReadingLibrary from './locales/zh/readingLibrary.json';
import zhReaderDesk from './locales/zh/readerDesk.json';
import enUpdater from './locales/en/updater.json';
import faUpdater from './locales/fa/updater.json';
import arUpdater from './locales/ar/updater.json';
import frUpdater from './locales/fr/updater.json';
import hiUpdater from './locales/hi/updater.json';
import zhUpdater from './locales/zh/updater.json';

import enSentences from './locales/en/sentences.json';
import faSentences from './locales/fa/sentences.json';
import arSentences from './locales/ar/sentences.json';
import frSentences from './locales/fr/sentences.json';
import hiSentences from './locales/hi/sentences.json';
import zhSentences from './locales/zh/sentences.json';
import enWordDialog from './locales/en/wordDialog.json';
import faWordDialog from './locales/fa/wordDialog.json';
import arWordDialog from './locales/ar/wordDialog.json';
import frWordDialog from './locales/fr/wordDialog.json';
import hiWordDialog from './locales/hi/wordDialog.json';
import zhWordDialog from './locales/zh/wordDialog.json';
import enDeckHubOcr from './locales/en/deckHubOcr.json';
import faDeckHubOcr from './locales/fa/deckHubOcr.json';
import arDeckHubOcr from './locales/ar/deckHubOcr.json';
import frDeckHubOcr from './locales/fr/deckHubOcr.json';
import hiDeckHubOcr from './locales/hi/deckHubOcr.json';
import zhDeckHubOcr from './locales/zh/deckHubOcr.json';
import enDashboard from './locales/en/dashboard.json';
import faDashboard from './locales/fa/dashboard.json';
import arDashboard from './locales/ar/dashboard.json';
import frDashboard from './locales/fr/dashboard.json';
import hiDashboard from './locales/hi/dashboard.json';
import zhDashboard from './locales/zh/dashboard.json';

import enDecks from './locales/en/decks.json';
import faDecks from './locales/fa/decks.json';
import arDecks from './locales/ar/decks.json';
import frDecks from './locales/fr/decks.json';
import hiDecks from './locales/hi/decks.json';
import zhDecks from './locales/zh/decks.json';

import enAi from './locales/en/ai.json';
import faAi from './locales/fa/ai.json';
import arAi from './locales/ar/ai.json';
import frAi from './locales/fr/ai.json';
import hiAi from './locales/hi/ai.json';
import zhAi from './locales/zh/ai.json';

import enVideos from './locales/en/videos.json';
import faVideos from './locales/fa/videos.json';
import arVideos from './locales/ar/videos.json';
import frVideos from './locales/fr/videos.json';
import hiVideos from './locales/hi/videos.json';
import zhVideos from './locales/zh/videos.json';

import enCheatsheet from './locales/en/cheatsheet.json';
import faCheatsheet from './locales/fa/cheatsheet.json';
import arCheatsheet from './locales/ar/cheatsheet.json';
import frCheatsheet from './locales/fr/cheatsheet.json';
import hiCheatsheet from './locales/hi/cheatsheet.json';
import zhCheatsheet from './locales/zh/cheatsheet.json';

import enNotes from './locales/en/notes.json';
import enVocabulary from './locales/en/vocabulary.json';
import faNotes from './locales/fa/notes.json';
import faVocabulary from './locales/fa/vocabulary.json';
import arNotes from './locales/ar/notes.json';
import arVocabulary from './locales/ar/vocabulary.json';
import frNotes from './locales/fr/notes.json';
import frVocabulary from './locales/fr/vocabulary.json';
import hiNotes from './locales/hi/notes.json';
import hiVocabulary from './locales/hi/vocabulary.json';
import zhNotes from './locales/zh/notes.json';
import zhVocabulary from './locales/zh/vocabulary.json';

import enPodcastUi from './locales/en/podcastUi.json';
import faPodcastUi from './locales/fa/podcastUi.json';
import arPodcastUi from './locales/ar/podcastUi.json';
import frPodcastUi from './locales/fr/podcastUi.json';
import hiPodcastUi from './locales/hi/podcastUi.json';
import zhPodcastUi from './locales/zh/podcastUi.json';

import enListening from './locales/en/listening.json';
import faListening from './locales/fa/listening.json';
import arListening from './locales/ar/listening.json';
import frListening from './locales/fr/listening.json';
import hiListening from './locales/hi/listening.json';
import zhListening from './locales/zh/listening.json';

import enAccount from './locales/en/account.json';
import faAccount from './locales/fa/account.json';
import arAccount from './locales/ar/account.json';
import frAccount from './locales/fr/account.json';
import hiAccount from './locales/hi/account.json';
import zhAccount from './locales/zh/account.json';

const resources = {
  en: {
    common: enCommon,
    account: enAccount,
    notes: enNotes,
    vocabulary: enVocabulary,
    cheatsheet: enCheatsheet,
    videos: enVideos,
    decks: enDecks,
    dashboard: enDashboard,
    updater: enUpdater,
    deckHubOcr: enDeckHubOcr,
    wordDialog: enWordDialog,
    sentences: enSentences,
    ai: enAi,
    study: enStudy,
    celpip: enCelpip,
    exam: enExam,
    reader: enReader,
    readingLibrary: enReadingLibrary,
    readerDesk: enReaderDesk,
    podcastUi: enPodcastUi,
    listening: enListening,
  },
  fa: {
    common: faCommon,
    account: faAccount,
    notes: faNotes,
    vocabulary: faVocabulary,
    cheatsheet: faCheatsheet,
    videos: faVideos,
    decks: faDecks,
    dashboard: faDashboard,
    updater: faUpdater,
    deckHubOcr: faDeckHubOcr,
    wordDialog: faWordDialog,
    sentences: faSentences,
    ai: faAi,
    study: faStudy,
    celpip: faCelpip,
    exam: faExam,
    reader: faReader,
    readingLibrary: faReadingLibrary,
    readerDesk: faReaderDesk,
    podcastUi: faPodcastUi,
    listening: faListening,
  },
  ar: {
    common: arCommon,
    account: arAccount,
    notes: arNotes,
    vocabulary: arVocabulary,
    cheatsheet: arCheatsheet,
    videos: arVideos,
    decks: arDecks,
    dashboard: arDashboard,
    updater: arUpdater,
    deckHubOcr: arDeckHubOcr,
    wordDialog: arWordDialog,
    sentences: arSentences,
    ai: arAi,
    study: arStudy,
    celpip: arCelpip,
    exam: arExam,
    reader: arReader,
    readingLibrary: arReadingLibrary,
    readerDesk: arReaderDesk,
    podcastUi: arPodcastUi,
    listening: arListening,
  },
  fr: {
    common: frCommon,
    account: frAccount,
    notes: frNotes,
    vocabulary: frVocabulary,
    cheatsheet: frCheatsheet,
    videos: frVideos,
    decks: frDecks,
    dashboard: frDashboard,
    updater: frUpdater,
    deckHubOcr: frDeckHubOcr,
    wordDialog: frWordDialog,
    sentences: frSentences,
    ai: frAi,
    study: frStudy,
    celpip: frCelpip,
    exam: frExam,
    reader: frReader,
    readingLibrary: frReadingLibrary,
    readerDesk: frReaderDesk,
    podcastUi: frPodcastUi,
    listening: frListening,
  },
  hi: {
    common: hiCommon,
    account: hiAccount,
    notes: hiNotes,
    vocabulary: hiVocabulary,
    cheatsheet: hiCheatsheet,
    videos: hiVideos,
    decks: hiDecks,
    dashboard: hiDashboard,
    updater: hiUpdater,
    deckHubOcr: hiDeckHubOcr,
    wordDialog: hiWordDialog,
    sentences: hiSentences,
    ai: hiAi,
    study: hiStudy,
    celpip: hiCelpip,
    exam: hiExam,
    reader: hiReader,
    readingLibrary: hiReadingLibrary,
    readerDesk: hiReaderDesk,
    podcastUi: hiPodcastUi,
    listening: hiListening,
  },
  zh: {
    common: zhCommon,
    account: zhAccount,
    notes: zhNotes,
    vocabulary: zhVocabulary,
    cheatsheet: zhCheatsheet,
    videos: zhVideos,
    decks: zhDecks,
    dashboard: zhDashboard,
    updater: zhUpdater,
    deckHubOcr: zhDeckHubOcr,
    wordDialog: zhWordDialog,
    sentences: zhSentences,
    ai: zhAi,
    study: zhStudy,
    celpip: zhCelpip,
    exam: zhExam,
    reader: zhReader,
    readingLibrary: zhReadingLibrary,
    readerDesk: zhReaderDesk,
    podcastUi: zhPodcastUi,
    listening: zhListening,
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
