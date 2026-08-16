'use client';

import { useEffect } from 'react';

import { STORAGE_KEYS } from '@/store/storage';
import { useUiStore } from '@/store/ui.store';

/**
 * `<html lang>` / `<html dir>` are owned by the client because the locale lives
 * in a persisted store. The server always renders `lang="en" dir="ltr"`;
 * `LocaleScript` fixes the attributes *before first paint* (same trick
 * next-themes uses for the dark class) and `LocaleSync` keeps them in step with
 * the store afterwards. `<html>` carries `suppressHydrationWarning`.
 */

const LOCALE_BOOTSTRAP = `(function(){try{var raw=localStorage.getItem('${STORAGE_KEYS.ui}');if(!raw)return;var parsed=JSON.parse(raw);var locale=parsed&&parsed.state&&parsed.state.locale;if(locale!=='ar'&&locale!=='en')return;var el=document.documentElement;el.lang=locale;el.dir=locale==='ar'?'rtl':'ltr';}catch(e){}})();`;

export function LocaleScript() {
  return <script id="nawy-locale-bootstrap" dangerouslySetInnerHTML={{ __html: LOCALE_BOOTSTRAP }} />;
}

export function LocaleSync() {
  const locale = useUiStore((state) => state.locale);
  const dir = useUiStore((state) => state.dir);

  useEffect(() => {
    const element = document.documentElement;
    if (element.lang !== locale) element.lang = locale;
    if (element.dir !== dir) element.dir = dir;
  }, [locale, dir]);

  return null;
}
