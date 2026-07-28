import { Globe, Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { useLocalePreference } from "@/hooks/useLocalePreference";
import { supportedLocales } from "@/i18n/locales";
import type { SupportedLocale } from "@/i18n/locales";

type LocaleSwitcherVariant = "icon" | "menu-action";

const LOCALE_LABELS: Record<string, string> = {
  en: "English",
  ar: "العربية",
  bn: "বাংলা",
  cs: "Čeština",
  da: "Dansk",
  de: "Deutsch",
  el: "Ελληνικά",
  es: "Español",
  fa: "فارسی",
  fi: "Suomi",
  fil: "Filipino",
  fr: "Français",
  he: "עברית",
  hi: "हिन्दी",
  hu: "Magyar",
  id: "Bahasa Indonesia",
  it: "Italiano",
  ja: "日本語",
  ko: "한국어",
  mr: "मराठी",
  ms: "Bahasa Melayu",
  nb: "Norsk Bokmål",
  nl: "Nederlands",
  pa: "ਪੰਜਾਬੀ",
  pl: "Polski",
  "pt-BR": "Português (BR)",
  "pt-PT": "Português (PT)",
  ro: "Română",
  ru: "Русский",
  sv: "Svenska",
  sw: "Kiswahili",
  ta: "தமிழ்",
  te: "తెలుగు",
  th: "ไทย",
  tr: "Türkçe",
  uk: "Українська",
  ur: "اردو",
  vi: "Tiếng Việt",
  "zh-CN": "简体中文",
  "zh-TW": "繁體中文",
};

interface LocaleSwitcherProps {
  className?: string;
  /**
   * `icon` (default): compact globe icon button — suitable for headers
   * and any surface that just wants a locale switch affordance.
   *
   * `menu-action`: full-width row with label + description + icon —
   * matches the surrounding `MenuAction` rows in `SidebarAccountMenu`.
   */
  variant?: LocaleSwitcherVariant;
  /**
   * Called after the user selects a locale.
   */
  onAfterSelect?: () => void;
}

function LocaleMenuItem({
  locale,
  currentLocale,
  onSelect,
}: {
  locale: string;
  currentLocale: string | null;
  onSelect: (locale: SupportedLocale) => void;
}) {
  const isSelected = locale === currentLocale;
  const label = LOCALE_LABELS[locale] ?? locale;

  return (
    <button
      type="button"
      className={cn(
        "flex w-full items-center justify-between gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/60",
        isSelected && "bg-accent/40",
      )}
      onClick={() => onSelect(locale as SupportedLocale)}
      aria-label={label}
      aria-current={isSelected ? ("true" as const) : undefined}
    >
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{locale}</span>
      </span>
      {isSelected && <Check className="size-4 shrink-0 text-muted-foreground" />}
    </button>
  );
}

/**
 * Canonical locale-switcher widget. Both the in-app header and the account
 * menu render through this component so the label, icon, and switch behaviour
 * stay in sync.
 */
export function LocaleSwitcher({ className, variant = "icon", onAfterSelect }: LocaleSwitcherProps) {
  const { locale, changeLocale } = useLocalePreference();
  const currentLabel = locale ? (LOCALE_LABELS[locale] ?? locale) : "English";
  const supported: SupportedLocale[] = supportedLocales as SupportedLocale[];

  function handleSelect(newLocale: SupportedLocale) {
    changeLocale(newLocale);
    onAfterSelect?.();
  }

  if (variant === "menu-action") {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button
            type="button"
            className={cn(
              "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-accent/60",
              className,
            )}
            aria-label="Switch language"
          >
            <span className="mt-0.5 rounded-lg border border-border bg-background/70 p-2 text-muted-foreground">
              <Globe className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium text-foreground">Language</span>
              <span className="block text-xs text-muted-foreground">Switch UI language.</span>
            </span>
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          sideOffset={10}
          className="w-72 max-h-80 overflow-y-auto p-2"
        >
          <div className="px-3 py-2">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Language</p>
          </div>
          <div className="space-y-0.5">
            {supported.map((loc) => (
              <LocaleMenuItem
                key={loc}
                locale={loc as string}
                currentLocale={locale}
                onSelect={handleSelect}
              />
            ))}
          </div>
        </PopoverContent>
      </Popover>
    );
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={() => {}}
          aria-label="Switch language"
          title={currentLabel}
          className={cn("text-muted-foreground", className)}
        >
          <Globe />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        side="bottom"
        align="end"
        sideOffset={8}
        className="w-60 max-h-80 overflow-y-auto p-2"
      >
        <div className="px-3 py-2">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Language</p>
        </div>
        <div className="space-y-0.5">
          {supported.map((loc) => (
            <LocaleMenuItem
              key={loc}
              locale={loc as string}
              currentLocale={locale}
              onSelect={handleSelect}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
