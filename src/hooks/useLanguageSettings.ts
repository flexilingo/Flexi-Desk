import { useState, useEffect } from 'react';
import { getSetting } from '@/lib/tauri-bridge';

let cachedNative: string | null = null;
let cachedTarget: string | null = null;

export function useLanguageSettings() {
  const [nativeLang, setNativeLang] = useState(cachedNative || 'en');
  const [targetLang, setTargetLang] = useState(cachedTarget || 'en');

  useEffect(() => {
    Promise.all([
      getSetting('native_language'),
      getSetting('target_language'),
    ]).then(([native, target]) => {
      if (native) {
        cachedNative = native;
        setNativeLang(native);
      }
      if (target) {
        cachedTarget = target;
        setTargetLang(target);
      }
    });
  }, []);

  return { nativeLang, targetLang };
}
