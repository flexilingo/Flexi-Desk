import { Routes, Route } from 'react-router-dom';
import { ReviewOverview } from './ReviewOverview';
import { DeckDetailPage } from './DeckDetailPage';
import { ReviewSessionPage } from './ReviewSessionPage';
import { ReviewHistoryPage } from './ReviewHistoryPage';
import { SessionDetailPage } from './SessionDetailPage';

export function ReviewPage() {
  return (
    <Routes>
      <Route index element={<ReviewOverview />} />
      <Route path="deck/:deckId" element={<DeckDetailPage />} />
      <Route path="session/:sessionId" element={<ReviewSessionPage />} />
      <Route path="session-detail/:sessionId" element={<SessionDetailPage />} />
      <Route path="history" element={<ReviewHistoryPage />} />
    </Routes>
  );
}
