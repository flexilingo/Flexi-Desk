import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { invoke } from '@tauri-apps/api/core';
import { useTheme } from '@/hooks/useTheme';
import { useDirection } from '@/hooks/useDirection';
import { Shell } from '@/components/layout/Shell';
import { DashboardPage } from '@/pages/dashboard';
import { StudyPage } from '@/pages/study';
import { ReviewPage } from '@/pages/review';
import { ExplorePage } from '@/pages/explore';
import { ReadingPage } from '@/pages/reading';
import { TutorPage } from '@/pages/tutor';
import { CaptionPage } from '@/pages/caption';
import { PronunciationPage } from '@/pages/pronunciation';
import { WritingPracticePage } from '@/pages/writing-practice';
import { CelpipPage } from '@/pages/celpip';
import { ReaderPage } from '@/pages/reader';
import { CheatsheetPage } from '@/pages/cheatsheet';
import { SentencesPage } from '@/pages/sentences';
import { PodcastPage } from '@/pages/podcast';
import { VideosPage } from '@/pages/videos';
import { SettingsPage } from '@/pages/settings/SettingsPage';
import { VocabularyPage } from '@/pages/vocabulary';
import { NotesPage } from '@/pages/notes';
import { AccountLayout } from '@/pages/account/AccountLayout';
import { SubscriptionPage } from '@/pages/subscription/SubscriptionPage';
import { WhatsNewPage } from '@/pages/whatsnew/WhatsNewPage';
import { PluginManagerPage } from '@/pages/plugins/PluginManagerPage';
import { useAuthStore } from '@/stores/authStore';
import { ENABLED_MODULES } from '@/config/features';
import { SetupWizard } from '@/components/onboarding/SetupWizard';
import { getSetting } from '@/lib/tauri-bridge';
import { UpdateToast } from '@/components/UpdateToast';
import { useUpdaterStore } from '@/stores/updaterStore';

function App() {
  // Initialize theme system (applies dark class to <html>)
  useTheme();

  // Set document direction (RTL for Arabic/Persian)
  useDirection();

  const [showOnboarding, setShowOnboarding] = useState<boolean | null>(null); // null = loading

  // Initialize auth + check onboarding state
  useEffect(() => {
    useAuthStore.getState().initialize();
    getSetting('onboarding_complete')
      .then((val) => setShowOnboarding(val !== 'true'))
      .catch((err) => {
        // A rejected settings read used to leave `showOnboarding` null forever,
        // and `App` renders nothing in that state — a silent white window.
        console.error('Failed to read onboarding state:', err);
        setShowOnboarding(false);
      });
  }, []);

  // Look for a new version once per launch (silent when offline).
  useEffect(() => {
    if (showOnboarding === false) void useUpdaterStore.getState().check({ silent: true });
  }, [showOnboarding]);

  // Auto-start Ollama on app launch (if configured)
  useEffect(() => {
    if (showOnboarding === false) {
      getSetting('ai_provider')
        .then((provider) => {
          if (!provider || provider === 'ollama') {
            invoke('ollama_start_serve').catch(() => {}); // silent — may already be running
          }
        })
        .catch(() => {});
    }
  }, [showOnboarding]);

  // Show nothing while checking onboarding state
  if (showOnboarding === null) return null;

  // Show setup wizard on first launch
  if (showOnboarding) {
    return <SetupWizard onComplete={() => setShowOnboarding(false)} />;
  }

  return (
    <>
      <UpdateToast />
      <Routes>
        <Route element={<Shell />}>
          <Route index element={<DashboardPage />} />
          {ENABLED_MODULES.study && <Route path="study/*" element={<StudyPage />} />}
          {ENABLED_MODULES.review && <Route path="review/*" element={<ReviewPage />} />}
          {ENABLED_MODULES.browse && <Route path="explore/*" element={<ExplorePage />} />}
          {ENABLED_MODULES.reading && <Route path="reading" element={<ReadingPage />} />}
          {ENABLED_MODULES.reader && <Route path="reader/*" element={<ReaderPage />} />}
          {ENABLED_MODULES.cheatsheet && <Route path="cheatsheet/*" element={<CheatsheetPage />} />}
          {ENABLED_MODULES.sentences && <Route path="sentences/*" element={<SentencesPage />} />}
          {ENABLED_MODULES.tutor && <Route path="tutor" element={<TutorPage />} />}
          {ENABLED_MODULES.caption && <Route path="caption" element={<CaptionPage />} />}
          {ENABLED_MODULES.pronunciation && (
            <Route path="pronunciation" element={<PronunciationPage />} />
          )}
          {ENABLED_MODULES.writingPractice && (
            <Route path="writing-practice/*" element={<WritingPracticePage />} />
          )}
          {ENABLED_MODULES.celpip && <Route path="celpip/*" element={<CelpipPage />} />}
          {(ENABLED_MODULES.celpip || ENABLED_MODULES.tcf) && (
            <Route path="exam/:examType/*" element={<CelpipPage />} />
          )}
          {ENABLED_MODULES.podcast && <Route path="podcast/*" element={<PodcastPage />} />}
          {ENABLED_MODULES.videos && <Route path="videos/*" element={<VideosPage />} />}
          {ENABLED_MODULES.vocabulary && <Route path="vocabulary" element={<VocabularyPage />} />}
          {ENABLED_MODULES.notes && <Route path="notes" element={<NotesPage />} />}
          {ENABLED_MODULES.plugins && <Route path="plugins" element={<PluginManagerPage />} />}
          {ENABLED_MODULES.settings && <Route path="settings" element={<SettingsPage />} />}
          {ENABLED_MODULES.account && (
            <>
              <Route path="account/*" element={<AccountLayout />} />
              <Route path="community" element={<Navigate to="/account/community" replace />} />
              <Route path="friends" element={<Navigate to="/account/friends" replace />} />
              <Route path="xp-history" element={<Navigate to="/account/xp" replace />} />
              <Route path="analytics" element={<Navigate to="/account/stats" replace />} />
            </>
          )}
          {ENABLED_MODULES.subscription && (
            <>
              <Route path="subscription" element={<SubscriptionPage />} />
              <Route path="pro" element={<Navigate to="/subscription" replace />} />
            </>
          )}
          {ENABLED_MODULES.whatsNew && <Route path="whats-new" element={<WhatsNewPage />} />}
        </Route>
      </Routes>
    </>
  );
}

export default App;
