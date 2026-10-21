import { Routes, Route } from 'react-router-dom';
import { ReviewOverview } from './ReviewOverview';
import { DeckDetailPage } from './DeckDetailPage';
import { DeckHubPage } from './deck-hub/DeckHubPage';
import { TextToDeckPage } from './deck-hub/TextToDeckPage';
import { ImageToDeckPage } from './deck-hub/ImageToDeckPage';

// Deck management surface ("Decks" in the sidebar). The SRS review-session runner
// that used to live here was replaced by the Study module — see pages/study/.
export function ReviewPage() {
  return (
    <Routes>
      <Route index element={<ReviewOverview />} />
      <Route path="deck/:deckId" element={<DeckDetailPage />} />
      <Route path="deck-hub" element={<DeckHubPage />} />
      <Route path="deck-hub/text" element={<TextToDeckPage />} />
      <Route path="deck-hub/image" element={<ImageToDeckPage />} />
    </Routes>
  );
}
