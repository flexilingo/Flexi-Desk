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
import { useAuthStore } from '@/stores/authStore';

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
        <Route path="review" element={<ReviewPage />} />
        <Route path="reading" element={<ReadingPage />} />
        <Route path="tutor" element={<TutorPage />} />
        <Route path="caption" element={<CaptionPage />} />
        <Route path="pronunciation" element={<PronunciationPage />} />
        <Route path="writing" element={<WritingPage />} />
        <Route path="exam" element={<ExamPage />} />
        <Route path="podcast" element={<PodcastPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>
    </Routes>
  );
}

export default App;
