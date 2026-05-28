// Lightweight i18n for BakeryPilot.
//
// Two supported languages: en (default) and fr. Selected language is held in
// AppContext (see lib/context.tsx) and persisted to localStorage. The boot
// script in app/layout.tsx writes the same value to <html data-lang="..."> so
// SSR + first paint match the user's preference and there's no flash.
//
// Strings are keyed by dot-separated namespaces (e.g. "sidebar.home"). When a
// key is missing in the active dictionary, the English string is returned and
// a console.warn fires in development to surface untranslated copy.

export type Language = "en" | "fr";

export const SUPPORTED_LANGUAGES: Language[] = ["en", "fr"];
export const DEFAULT_LANGUAGE: Language = "en";
export const LANGUAGE_STORAGE_KEY = "bakerypilot.language";

export const LANGUAGE_LABEL: Record<Language, string> = {
  en: "EN",
  fr: "FR",
};

export const LANGUAGE_NAME: Record<Language, string> = {
  en: "English",
  fr: "Français",
};

// ---------------------------------------------------------------------------
// Translation dictionary
//
// Keep keys grouped by feature area. Both languages MUST have the same set of
// keys — the type system enforces this via `Translations` below.
// ---------------------------------------------------------------------------

const en = {
  // Sidebar nav
  "sidebar.home": "Home",
  "sidebar.flowsight": "FlowSight",
  "sidebar.inventory": "Inventory",
  "sidebar.production": "Production",
  "sidebar.suppliers": "Suppliers",
  "sidebar.schedule": "Schedule",
  "sidebar.settings": "Settings",
  "sidebar.admin": "Admin",
  "sidebar.brand_tagline": "Ops copilot",
  "sidebar.collapse": "‹ collapse",

  // TopBar
  "topbar.all_plants": "All Plants",
  "topbar.live": "Live",
  "topbar.notifications": "Notifications",
  "topbar.notifications_empty": "No notifications",
  "topbar.ask_copilot": "Ask Copilot →",
  "topbar.start_tour": "Start product tour",
  "topbar.toggle_theme_to_dark": "Switch to dark mode",
  "topbar.toggle_theme_to_light": "Switch to light mode",
  "topbar.language": "Language",

  // Bottom strip
  "bottom.waste_avoided": "Waste avoided",
  "bottom.co2e_saved": "CO₂e saved",
  "bottom.active_disruptions": "Active disruptions",
  "bottom.moq_tax_ytd": "MOQ-tax YTD",

  // Buttons / generic
  "btn.approve": "Approve",
  "btn.reject": "Reject",
  "btn.send": "Send",
  "btn.cancel": "Cancel",
  "btn.confirm": "Confirm",
  "btn.discard": "Discard",
  "btn.save": "Save",
  "btn.close": "Close",
  "btn.edit": "Edit",
  "btn.new_chat": "New chat",
  "btn.expand": "Expand",
  "btn.collapse": "Collapse",
  "btn.sign_out": "Sign out",

  // Copilot
  "copilot.title": "Copilot",
  "copilot.placeholder": "Ask anything… (Shift+Enter for new line)",
  "copilot.welcome":
    "Hi. I have full read across plants, suppliers, and orders. What would you like to know?",
  "copilot.send_hint": "Enter to send · Shift+Enter for new line",
  "copilot.thinking": "Thinking…",
  "copilot.drafting": "Drafting response…",
  "copilot.no_speech": "No speech detected — try again, closer to the mic.",
  "copilot.mic_denied":
    "Microphone access was denied. Allow it in your browser site settings and try again.",

  // Status labels
  "status.healthy": "Healthy",
  "status.attention": "Attention",
  "status.critical": "Critical",
} as const;

type TranslationKey = keyof typeof en;
type Dictionary = Record<TranslationKey, string>;

const fr: Dictionary = {
  // Sidebar nav
  "sidebar.home": "Accueil",
  "sidebar.flowsight": "FlowSight",
  "sidebar.inventory": "Inventaire",
  "sidebar.production": "Production",
  "sidebar.suppliers": "Fournisseurs",
  "sidebar.schedule": "Calendrier",
  "sidebar.settings": "Paramètres",
  "sidebar.admin": "Admin",
  "sidebar.brand_tagline": "Copilote des opérations",
  "sidebar.collapse": "‹ réduire",

  // TopBar
  "topbar.all_plants": "Toutes les usines",
  "topbar.live": "En direct",
  "topbar.notifications": "Notifications",
  "topbar.notifications_empty": "Aucune notification",
  "topbar.ask_copilot": "Demander au Copilote →",
  "topbar.start_tour": "Démarrer la visite guidée",
  "topbar.toggle_theme_to_dark": "Passer au mode sombre",
  "topbar.toggle_theme_to_light": "Passer au mode clair",
  "topbar.language": "Langue",

  // Bottom strip
  "bottom.waste_avoided": "Gaspillage évité",
  "bottom.co2e_saved": "CO₂e économisé",
  "bottom.active_disruptions": "Perturbations actives",
  "bottom.moq_tax_ytd": "Taxe MOQ cumulée",

  // Buttons / generic
  "btn.approve": "Approuver",
  "btn.reject": "Rejeter",
  "btn.send": "Envoyer",
  "btn.cancel": "Annuler",
  "btn.confirm": "Confirmer",
  "btn.discard": "Abandonner",
  "btn.save": "Enregistrer",
  "btn.close": "Fermer",
  "btn.edit": "Modifier",
  "btn.new_chat": "Nouvelle discussion",
  "btn.expand": "Agrandir",
  "btn.collapse": "Réduire",
  "btn.sign_out": "Se déconnecter",

  // Copilot
  "copilot.title": "Copilote",
  "copilot.placeholder":
    "Posez votre question… (Maj+Entrée pour une nouvelle ligne)",
  "copilot.welcome":
    "Bonjour. J'ai un accès en lecture sur les usines, fournisseurs et commandes. Que souhaitez-vous savoir ?",
  "copilot.send_hint":
    "Entrée pour envoyer · Maj+Entrée pour une nouvelle ligne",
  "copilot.thinking": "Réflexion…",
  "copilot.drafting": "Rédaction de la réponse…",
  "copilot.no_speech":
    "Aucune parole détectée — réessayez en parlant plus près du micro.",
  "copilot.mic_denied":
    "L'accès au microphone a été refusé. Autorisez-le dans les paramètres du site et réessayez.",

  // Status labels
  "status.healthy": "Sain",
  "status.attention": "Attention",
  "status.critical": "Critique",
};

const DICTIONARIES: Record<Language, Dictionary> = { en, fr };

/**
 * Resolve a translation key for a given language. Falls back to English when
 * the key is missing in the target dictionary (and warns once in dev).
 */
export function translate(key: TranslationKey, lang: Language): string {
  const dict = DICTIONARIES[lang] ?? DICTIONARIES[DEFAULT_LANGUAGE];
  if (dict[key] != null) return dict[key];
  if (process.env.NODE_ENV !== "production") {
    // eslint-disable-next-line no-console
    console.warn(`[i18n] missing translation for "${key}" in "${lang}"`);
  }
  return DICTIONARIES.en[key] ?? key;
}

export type { TranslationKey };
