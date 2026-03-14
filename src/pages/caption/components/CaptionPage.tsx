import { useEffect } from 'react';
import { useCaptionStore } from '../stores/captionStore';
import { SessionList } from './SessionList';
import { CapturePanel } from './CapturePanel';
import { LiveCapturePanel } from './LiveCapturePanel';
import { SessionDetail } from './SessionDetail';
import { WhisperSetup } from './WhisperSetup';
import { ErrorBanner } from './ErrorBanner';

export function CaptionPage() {
  const { view, whisperInfo, checkWhisper, fetchSessions, fetchDevices } = useCaptionStore();

  useEffect(() => {
    checkWhisper();
    fetchSessions();
    fetchDevices();
  }, [checkWhisper, fetchSessions, fetchDevices]);

  // Show setup screen if whisper is not configured
  if (whisperInfo && !whisperInfo.isAvailable) {
    return (
      <div className="space-y-4">
        <ErrorBanner />
        <WhisperSetup />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <ErrorBanner />
      {view === 'sessions' && <SessionList />}
      {view === 'capture' && <CapturePanel />}
      {view === 'live-capture' && <LiveCapturePanel />}
      {view === 'session-detail' && <SessionDetail />}
    </div>
  );
}
