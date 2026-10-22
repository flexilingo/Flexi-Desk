import { Routes, Route } from 'react-router-dom';
import { DeckListPage } from './DeckListPage';
import { DeckFormPage } from './DeckFormPage';
import { DeckDetailPage } from './DeckDetailPage';
import { ShareLinksPage } from './ShareLinksPage';
import { SharedReviewsPage } from './SharedReviewsPage';
import { SharedReviewDetailPage } from './SharedReviewDetailPage';
import { DeckHubPage } from './deck-hub/DeckHubPage';
import { TextToDeckPage } from './deck-hub/TextToDeckPage';
import { ImageToDeckPage } from './deck-hub/ImageToDeckPage';

// Deck management surface ("Decks" in the sidebar). The SRS session runner lives in the
// Study module — see pages/study/.
export function ReviewPage() {
  return (
    <Routes>
      <Route index element={<DeckListPage />} />
      <Route path="create" element={<DeckFormPage />} />
      <Route path="deck/:deckId" element={<DeckDetailPage />} />
      <Route path="deck/:deckId/edit" element={<DeckFormPage />} />
      <Route path="share-links" element={<ShareLinksPage />} />
      <Route path="shared-reviews" element={<SharedReviewsPage />} />
      <Route path="shared-reviews/:sessionId" element={<SharedReviewDetailPage />} />
      <Route path="deck-hub" element={<DeckHubPage />} />
      <Route path="deck-hub/text" element={<TextToDeckPage />} />
      <Route path="deck-hub/image" element={<ImageToDeckPage />} />
    </Routes>
  );
}
