import { useTranslation, type Language } from "./i18n";

type TrStrings = { en: string; pt?: string; es?: string; fr?: string };

/** Localized string helper — English default, supports legacy [pt, en] tuples. */
export function useTr() {
  const { language } = useTranslation();

  return (strings: TrStrings | [string, string], params?: Record<string, string | number>): string => {
    let text: string;
    if (Array.isArray(strings)) {
      const [pt, en] = strings;
      text = language === "pt" ? pt : en;
    } else {
      switch (language as Language) {
        case "pt":
          text = strings.pt ?? strings.en;
          break;
        case "es":
          text = strings.es ?? strings.en;
          break;
        case "fr":
          text = strings.fr ?? strings.en;
          break;
        default:
          text = strings.en;
      }
    }

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        text = text.replace(`{${key}}`, String(value));
      });
    }
    return text;
  };
}

/** Non-hook helper for legacy pages using language string. */
export function trLang(language: Language, strings: TrStrings | [string, string]): string {
  if (Array.isArray(strings)) {
    return language === "pt" ? strings[0] : strings[1];
  }
  switch (language) {
    case "pt":
      return strings.pt ?? strings.en;
    case "es":
      return strings.es ?? strings.en;
    case "fr":
      return strings.fr ?? strings.en;
    default:
      return strings.en;
  }
}
