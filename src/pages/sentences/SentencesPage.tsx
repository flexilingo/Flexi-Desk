import { useEffect } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { LookupProvider } from '@/components/lookup';
import { PRACTICE_LANGS } from './lib/types';
import { HistoryScreen } from './components/HistoryScreen';
import { PracticeScreen } from './components/PracticeScreen';

/** The practised language, read from the route; anything the bank is not written for goes to French. */
function LangLayout() {
  const { lang = 'fr' } = useParams();
  const { pathname } = useLocation();

  // Each page opens at its top (the shell's scroll area keeps the old position otherwise).
  useEffect(() => {
    document.querySelector('[data-radix-scroll-area-viewport]')?.scrollTo({ top: 0 });
  }, [pathname]);

  if (!(PRACTICE_LANGS as readonly string[]).includes(lang))
    return <Navigate to="/sentences/fr" replace />;
  // Every word of every sentence opens the word dialog, in the language being practised.
  return (
    <LookupProvider language={lang}>
      <Outlet />
    </LookupProvider>
  );
}

function Practice() {
  const { lang = 'fr' } = useParams();
  return <PracticeScreen lang={lang} />;
}

function History() {
  const { lang = 'fr' } = useParams();
  return <HistoryScreen lang={lang} />;
}

/**
 * Sentence practice and its record — the website's /dashboard/sentences/<lang> and
 * /dashboard/sentences/<lang>/history, at /sentences/:lang and /sentences/:lang/history.
 * The menu's entry (/sentences) lands on French.
 */
export function SentencesPage() {
  return (
    <Routes>
      <Route index element={<Navigate to="/sentences/fr" replace />} />
      <Route path=":lang" element={<LangLayout />}>
        <Route index element={<Practice />} />
        <Route path="history" element={<History />} />
      </Route>
    </Routes>
  );
}
