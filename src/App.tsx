import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import { useTheme } from '@/hooks/useTheme';
import { useDirection } from '@/hooks/useDirection';
import { Shell } from '@/components/layout/Shell';
import { DashboardPage } from '@/pages/dashboard';
import { ReviewPage } from '@/pages/review';
import { ReadingPage } from '@/pages/reading';
import { TutorPage } from '@/pages/tutor';
import { CaptionPage } from '@/pages/caption';
import { PronunciationPage } from '@/pages/pronunciation';
import { WritingPage } from '@/pages/writing';
import { ExamPage } from '@/pages/exam';
import { PodcastPage } from '@/pages/podcast';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { VocabularyPage } from '@/pages/vocabulary';
import { PluginManagerPage } from '@/pages/plugins/PluginManagerPage';
import { useAuthStore } from '@/stores/authStore';
import { ENABLED_MODULES } from '@/config/features';

function App() {
  // Initialize theme system (applies dark class to <html>)
  useTheme();

  // Set document direction (RTL for Arabic/Persian)
  useDirection();

  // Initialize auth (restore session from local DB)
  useEffect(() => {
    useAuthStore.getState().initialize();
  }, []);

  return (
    <Routes>
      <Route element={<Shell />}>
        <Route index element={<DashboardPage />} />
        {ENABLED_MODULES.review && <Route path="review" element={<ReviewPage />} />}
        {ENABLED_MODULES.reading && <Route path="reading" element={<ReadingPage />} />}
        {ENABLED_MODULES.tutor && <Route path="tutor" element={<TutorPage />} />}
        {ENABLED_MODULES.caption && <Route path="caption" element={<CaptionPage />} />}
        {ENABLED_MODULES.pronunciation && <Route path="pronunciation" element={<PronunciationPage />} />}
        {ENABLED_MODULES.writing && <Route path="writing" element={<WritingPage />} />}
        {ENABLED_MODULES.exam && <Route path="exam" element={<ExamPage />} />}
        {ENABLED_MODULES.podcast && <Route path="podcast" element={<PodcastPage />} />}
        {ENABLED_MODULES.vocabulary && <Route path="vocabulary" element={<VocabularyPage />} />}
        {ENABLED_MODULES.plugins && <Route path="plugins" element={<PluginManagerPage />} />}
        {ENABLED_MODULES.settings && <Route path="settings" element={<SettingsPage />} />}
      </Route>
    </Routes>
  );
}

export default App;
