import { Route, Routes } from 'react-router-dom';
import { CatalogPage } from './CatalogPage';
import { ChannelPage } from './ChannelPage';
import { ChannelsPage } from './ChannelsPage';
import { WatchPage } from './WatchPage';

// Videos: learn from real YouTube videos with our tappable, CEFR-scored subtitles. The picture is
// YouTube's; the transcript, word taps, deck, notes and Ask Lena are the podcast player's.
// Reachable at /videos, /videos/channels, /videos/channel/:channelId and /videos/watch/:id.
export function VideosPage() {
  return (
    <Routes>
      <Route index element={<CatalogPage />} />
      <Route path="channels" element={<ChannelsPage />} />
      <Route path="channel/:channelId" element={<ChannelPage />} />
      <Route path="watch/:id" element={<WatchPage />} />
    </Routes>
  );
}
