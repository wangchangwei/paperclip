import { useCallback, useEffect, useState } from "react";
import { i18n } from "@/i18n";

const LOCALE_STORAGE_KEY = "paperclip.locale";

export type LocalePreference = string | null;

/**
 * Reads the persisted locale from localStorage.
 * Returns null if nothing is stored or storage is unavailable.
 */
export function getStoredLocale(): LocalePreference {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

/**
 * Writes the locale to localStorage and synchronously updates
 * i18next's language and the <html> lang/dir attributes.
 */
export function setLocale(locale: string): void {
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Storage can be unavailable in private contexts.
  }
  i18n.changeLanguage(locale);
  syncHtmlAttributes(locale);
}

function syncHtmlAttributes(locale: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.lang = locale;
  // dir is left as ltr for now; RTL is out of scope for this phase.
  document.documentElement.dir = "ltr";
}

/**
 * React hook for reading and writing the user's locale preference.
 * Initialises from localStorage on mount, then subscribes to i18next
 * language changes so the component stays in sync if something else
 * (e.g. a page reload) changes the language.
 */
export function useLocalePreference() {
  const [locale, setLocaleState] = useState<LocalePreference>(() => getStoredLocale());

  // Keep our copy of the language in sync if i18next changes independently
  // (e.g. because the page was reloaded and it read localStorage).
  useEffect(() => {
    const handleLanguageChange = (lng: string) => {
      setLocaleState(lng);
    };
    i18n.on("languageChanged", handleLanguageChange);
    return () => {
      i18n.off("languageChanged", handleLanguageChange);
    };
  }, []);

  const changeLocale = useCallback((newLocale: string) => {
    setLocale(newLocale);
    setLocaleState(newLocale);
  }, []);

  return { locale, changeLocale };
}
