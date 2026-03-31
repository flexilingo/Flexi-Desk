import { Routes, Route } from 'react-router-dom';
import { ReviewOverview } from './ReviewOverview';
import { DeckDetailPage } from './DeckDetailPage';
import { ReviewSessionPage } from './ReviewSessionPage';
import { ReviewHistoryPage } from './ReviewHistoryPage';
import { SessionDetailPage } from './SessionDetailPage';
import { DeckHubPage } from './deck-hub/DeckHubPage';
import { TextToDeckPage } from './deck-hub/TextToDeckPage';
import { ImageToDeckPage } from './deck-hub/ImageToDeckPage';

export function ReviewPage() {
  return (
    <Routes>
      <Route index element={<ReviewOverview />} />
      <Route path="deck/:deckId" element={<DeckDetailPage />} />
      <Route path="session/:sessionId" element={<ReviewSessionPage />} />
      <Route path="session-detail/:sessionId" element={<SessionDetailPage />} />
      <Route path="history" element={<ReviewHistoryPage />} />
      <Route path="deck-hub" element={<DeckHubPage />} />
      <Route path="deck-hub/text" element={<TextToDeckPage />} />
      <Route path="deck-hub/image" element={<ImageToDeckPage />} />
    </Routes>
  );
}
