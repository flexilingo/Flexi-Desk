import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { rememberVideoList } from './listMemory';

/** Records the list page on screen, filters included, for the watch page's Back. */
export function useRememberVideoList(): void {
  const { pathname, search } = useLocation();
  useEffect(() => {
    rememberVideoList(`${pathname}${search}`);
  }, [pathname, search]);
}
