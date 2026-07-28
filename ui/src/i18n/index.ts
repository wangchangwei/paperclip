import i18n, { type InitOptions, type TOptions } from "i18next";
import { initReactI18next, useTranslation as useReactI18nextTranslation } from "react-i18next";

import { DEFAULT_LOCALE, i18nextResources, supportedLocales } from "./locales";

const LOCALE_STORAGE_KEY = "paperclip.locale";

function getStoredLocale(): string | null {
  try {
    return localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

const storedLocale = getStoredLocale();

// Persist the initial language to localStorage so it survives page reloads
// even before any React component mounts.
if (storedLocale) {
  // Sync <html lang> as early as possible.
  if (typeof document !== "undefined") {
    document.documentElement.lang = storedLocale;
    document.documentElement.dir = "ltr";
  }
}

const i18nextOptions: InitOptions = {
  resources: i18nextResources,
  // localStorage wins over the default (en), so we don't show the user
  // the wrong language for a flash on first load.
  lng: storedLocale ?? DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  supportedLngs: supportedLocales,
  defaultNS: "translation",
  interpolation: { escapeValue: false },
  returnObjects: false,
  initAsync: false,
};

void i18n.use(initReactI18next).init(i18nextOptions).catch((error: unknown) => {
  console.error("Failed to initialize i18next", error);
});

export function t(key: string, options: TOptions = {}) {
  return i18n.t(key, options);
}

export const useTranslation = useReactI18nextTranslation;
export { i18n };
