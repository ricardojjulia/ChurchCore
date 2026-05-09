"use client";

import { createContext, useContext } from "react";

import { defaultLocale, messages, type Locale } from "@/lib/i18n";

type I18nContextValue = {
  locale: Locale;
  t: (namespace: keyof typeof messages.en, key: string, values?: Record<string, string | number>) => string;
};

const I18nContext = createContext<I18nContextValue>({
  locale: defaultLocale,
  t: (_namespace, key) => key,
});

function interpolate(value: string, values?: Record<string, string | number>) {
  if (!values) return value;

  return Object.entries(values).reduce(
    (next, [key, replacement]) => next.replaceAll(`{${key}}`, String(replacement)),
    value,
  );
}

export function I18nProvider({
  children,
  locale,
}: {
  children: React.ReactNode;
  locale: Locale;
}) {
  function t(namespace: keyof typeof messages.en, key: string, values?: Record<string, string | number>) {
    const namespaceMessages = messages[locale][namespace] as Record<string, string>;
    const fallbackMessages = messages.en[namespace] as Record<string, string>;
    return interpolate(namespaceMessages[key] ?? fallbackMessages[key] ?? key, values);
  }

  return (
    <I18nContext.Provider value={{ locale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}
