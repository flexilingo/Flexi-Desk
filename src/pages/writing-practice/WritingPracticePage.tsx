import { useEffect } from 'react';
import { Route, Routes, useLocation } from 'react-router-dom';
import { LandingScreen } from './components/LandingScreen';
import { SessionScreen } from './components/SessionScreen';

/**
 * The website's /dashboard/writing-practice and /dashboard/writing-practice/[sessionId],
 * at /writing-practice and /writing-practice/:sessionId. There is no menu entry: the
 * website has none either (it is reached from the dashboard's cards).
 */
export function WritingPracticePage() {
  const { pathname } = useLocation();
  useEffect(() => {
    document.querySelector('[data-radix-scroll-area-viewport]')?.scrollTo({ top: 0 });
  }, [pathname]);
  return (
    <Routes>
      <Route index element={<LandingScreen />} />
      <Route path=":sessionId" element={<SessionScreen />} />
    </Routes>
  );
}
