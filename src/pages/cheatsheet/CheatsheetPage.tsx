import { useEffect, type ComponentType } from 'react';
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from 'react-router-dom';
import { LookupProvider } from '@/components/lookup';
import CheatsheetIndexScreen from './components/CheatsheetIndexScreen';
import CheatsheetTopicScreen from './components/CheatsheetTopicScreen';
import VerbIndexScreen from './components/VerbIndexScreen';
import VerbScreen from './components/VerbScreen';
import { OfflineBanner } from './components/shared';

/**
 * Cheatsheet routes (the website's /dashboard/cheatsheet/...):
 *
 *   /cheatsheet                     -> /cheatsheet/fr
 *   /cheatsheet/:lang               the index: search, level filter, topic browser
 *   /cheatsheet/:lang/verbes        every verb
 *   /cheatsheet/:lang/verbes/:verb  one verb: pattern tree, every tense, examples
 *   /cheatsheet/:lang/:slug         one topic
 *
 * The word lookup wraps all of them, in the language being taught.
 */
function LangLayout() {
  const { lang = 'fr' } = useParams();
  const { pathname } = useLocation();

  // Each page opens at its top (the shell's scroll area keeps the old position otherwise).
  useEffect(() => {
    document.querySelector('[data-radix-scroll-area-viewport]')?.scrollTo({ top: 0 });
  }, [pathname]);

  if (!/^[a-z]{2}$/.test(lang)) return <Navigate to="/cheatsheet/fr" replace />;
  return (
    <LookupProvider language={lang}>
      <OfflineBanner />
      <Outlet />
    </LookupProvider>
  );
}

/** A screen that takes the taught language as a prop, read from the route. */
const withLang = (Screen: ComponentType<{ lang: string }>) =>
  function WithLang() {
    const { lang = 'fr' } = useParams();
    return <Screen lang={lang} />;
  };

const Index = withLang(CheatsheetIndexScreen);
const Topic = withLang(CheatsheetTopicScreen);
const Verbs = withLang(VerbIndexScreen);
const Verb = withLang(VerbScreen);

export function CheatsheetPage() {
  return (
    <Routes>
      <Route index element={<Navigate to="/cheatsheet/fr" replace />} />
      <Route path=":lang" element={<LangLayout />}>
        <Route index element={<Index />} />
        <Route path="verbes" element={<Verbs />} />
        <Route path="verbes/:verb" element={<Verb />} />
        <Route path=":slug" element={<Topic />} />
      </Route>
    </Routes>
  );
}
