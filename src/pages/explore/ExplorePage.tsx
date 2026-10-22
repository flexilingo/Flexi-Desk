import { Route, Routes } from 'react-router-dom';
import { ExploreListPage } from './ExploreListPage';
import { ExploreDeckPage } from './ExploreDeckPage';

// Public decks from the FlexiLingo community: browse without an account, save into the
// local library. Reachable at /explore and /explore/:id.
export function ExplorePage() {
  return (
    <Routes>
      <Route index element={<ExploreListPage />} />
      <Route path=":deckId" element={<ExploreDeckPage />} />
    </Routes>
  );
}
