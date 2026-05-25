"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Select } from "@mantine/core";

import { setLocaleAction } from "@/app/language-actions";
import { useI18n } from "@/components/i18n-provider";
import { localeLabels, supportedLocales, type Locale } from "@/lib/i18n";

export function LanguageSelect({
  size = "sm",
}: {
  size?: "xs" | "sm";
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { locale, t } = useI18n();

  function handleLocaleChange(value: string | null) {
    if (!value) return;
    startTransition(async () => {
      await setLocaleAction(value);
      router.refresh();
    });
  }

  return (
    <Select
      aria-label={t("common", "language")}
      data={supportedLocales.map((option) => ({
        value: option,
        label: localeLabels[option],
      }))}
      value={locale}
      onChange={(value) => handleLocaleChange(value as Locale | null)}
      disabled={isPending}
      size={size}
      radius="xl"
    />
  );
}
