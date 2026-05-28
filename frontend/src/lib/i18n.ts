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
  "status.ok": "OK",
  "status.warn": "Warning",
  "status.expired": "Expired",
  "status.pending": "Pending",
  "status.confirmed": "Confirmed",
  "status.rejected": "Rejected",
  "status.planned": "Planned",
  "status.producing": "Producing",
  "status.idle": "Idle",
  "status.setup": "Setup",
  "status.maintenance": "Maintenance",
  "status.complete": "Complete",
  "status.cancelled": "Cancelled",

  // Materials / Inventory page
  "materials.title": "Inventory",
  "materials.subtitle": "Ingredient lots, spoilage risk, substitution",
  "materials.search_placeholder": "Search lots, ingredients, suppliers…",
  "materials.all_facilities": "All facilities",
  "materials.col_lot": "Lot",
  "materials.col_ingredient": "Ingredient",
  "materials.col_qty": "Quantity",
  "materials.col_expiry": "Expiry",
  "materials.col_risk": "Risk",
  "materials.col_facility": "Facility",
  "materials.col_storage": "Storage",
  "materials.col_supplier": "Supplier",
  "materials.empty": "No lots match your filters.",
  "materials.action_transfer": "Transfer",
  "materials.action_write_off": "Write off",
  "materials.action_substitute": "Substitute",

  // Production page
  "production.title": "Production",
  "production.subtitle": "Lines, orders, yield",
  "production.tab_lines": "Lines",
  "production.tab_orders": "Orders",
  "production.tab_products": "Products",
  "production.tab_finished_goods": "Finished goods",
  "production.new_order": "New order",
  "production.col_line": "Line",
  "production.col_sku": "SKU",
  "production.col_status": "Status",
  "production.col_qty": "Quantity",
  "production.col_planned_start": "Planned start",
  "production.col_completed": "Completed",
  "production.col_capacity": "Capacity",
  "production.empty_orders": "No production orders.",
  "production.empty_lines": "No lines configured.",
  "production.assign": "Assign",
  "production.produce": "Produce",
  "production.recipe": "Recipe",
  "production.feasibility": "Feasibility",

  // Schedule page
  "schedule.title": "Schedule",
  "schedule.subtitle": "Production runs and changeovers",
  "schedule.tab_production": "Production",
  "schedule.tab_outbound": "Outbound",
  "schedule.run_optimizer": "Run optimizer",
  "schedule.what_if": "What-if",
  "schedule.proposed_change": "Proposed change",
  "schedule.before": "Before",
  "schedule.after": "After",
  "schedule.col_start": "Start",
  "schedule.col_end": "End",

  // Scorecard / Suppliers page
  "scorecard.title": "Scorecard",
  "scorecard.tab_suppliers": "Suppliers",
  "scorecard.tab_performance": "Performance",
  "scorecard.col_supplier": "Supplier",
  "scorecard.col_on_time": "On-time",
  "scorecard.col_fill_rate": "Fill rate",
  "scorecard.col_window": "Window compliance",
  "scorecard.col_price_var": "Price vs benchmark",
  "scorecard.col_moq_tax": "MOQ-tax QTD",
  "scorecard.col_contract_expiry": "Contract expiry",
  "scorecard.tab_overview": "Overview",
  "scorecard.tab_contact": "Contact",
  "scorecard.tab_messages": "Messages",
  "scorecard.tab_negotiate": "Negotiate",
  "scorecard.negotiate_goal": "Goal",
  "scorecard.negotiate_tone": "Tone",
  "scorecard.generate_draft": "Generate draft",
  "scorecard.send_to_supplier": "Send to supplier",
  "scorecard.subject": "Subject",
  "scorecard.drafting_live": "ProcurementAgent · drafting live",
  "scorecard.generated_draft": "Generated draft",

  // FlowSight / Facilities page
  "flowsight.title": "FlowSight",
  "flowsight.layers": "Layers",
  "flowsight.live": "live",
  "flowsight.suppliers_count": "suppliers",
  "flowsight.plants_count": "plants",
  "flowsight.retailers_count": "retailers",
  "flowsight.disruption_feed": "Disruption feed",

  // Settings page
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.theme_dark": "Dark",
  "settings.theme_light": "Light",
  "settings.accent": "Accent",
  "settings.language": "Language",
  "settings.notifications": "Notifications",
  "settings.profile": "Profile",
  "settings.display_name": "Display name",
  "settings.role": "Role",
  "settings.default_facility": "Default facility",
  "settings.notif_toast": "Toast notifications",
  "settings.notif_expiring": "Expiring lots",
  "settings.notif_supplier": "Supplier risk",
  "settings.notif_yield": "Yield anomalies",

  // Admin page
  "admin.title": "Admin",
  "admin.subtitle": "Operational tooling",

  // Home page
  "home.title": "Operations overview",
  "home.suppliers_at_risk": "Suppliers at risk",
  "home.lots_critical": "Critical lots",
  "home.active_runs": "Active runs",
  "home.todays_summary": "Today's summary",

  // Action cards
  "card.pending": "Pending approval",
  "card.confirm_question": "Approve this action?",
  "card.reject_reason_placeholder": "Reason (optional)",
  "card.executed_at": "Executed at",
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
  "status.ok": "OK",
  "status.warn": "Avertissement",
  "status.expired": "Expiré",
  "status.pending": "En attente",
  "status.confirmed": "Confirmé",
  "status.rejected": "Rejeté",
  "status.planned": "Planifié",
  "status.producing": "En production",
  "status.idle": "Inactif",
  "status.setup": "Configuration",
  "status.maintenance": "Maintenance",
  "status.complete": "Terminé",
  "status.cancelled": "Annulé",

  // Materials / Inventory page
  "materials.title": "Inventaire",
  "materials.subtitle": "Lots d'ingrédients, risque de gaspillage, substitution",
  "materials.search_placeholder": "Rechercher lots, ingrédients, fournisseurs…",
  "materials.all_facilities": "Toutes les usines",
  "materials.col_lot": "Lot",
  "materials.col_ingredient": "Ingrédient",
  "materials.col_qty": "Quantité",
  "materials.col_expiry": "Expiration",
  "materials.col_risk": "Risque",
  "materials.col_facility": "Usine",
  "materials.col_storage": "Stockage",
  "materials.col_supplier": "Fournisseur",
  "materials.empty": "Aucun lot ne correspond à vos filtres.",
  "materials.action_transfer": "Transférer",
  "materials.action_write_off": "Radier",
  "materials.action_substitute": "Substituer",

  // Production page
  "production.title": "Production",
  "production.subtitle": "Lignes, commandes, rendement",
  "production.tab_lines": "Lignes",
  "production.tab_orders": "Commandes",
  "production.tab_products": "Produits",
  "production.tab_finished_goods": "Produits finis",
  "production.new_order": "Nouvelle commande",
  "production.col_line": "Ligne",
  "production.col_sku": "Produit",
  "production.col_status": "Statut",
  "production.col_qty": "Quantité",
  "production.col_planned_start": "Début prévu",
  "production.col_completed": "Terminé",
  "production.col_capacity": "Capacité",
  "production.empty_orders": "Aucune commande de production.",
  "production.empty_lines": "Aucune ligne configurée.",
  "production.assign": "Assigner",
  "production.produce": "Produire",
  "production.recipe": "Recette",
  "production.feasibility": "Faisabilité",

  // Schedule page
  "schedule.title": "Calendrier",
  "schedule.subtitle": "Lancements de production et changements de série",
  "schedule.tab_production": "Production",
  "schedule.tab_outbound": "Expéditions",
  "schedule.run_optimizer": "Lancer l'optimiseur",
  "schedule.what_if": "Hypothèse",
  "schedule.proposed_change": "Changement proposé",
  "schedule.before": "Avant",
  "schedule.after": "Après",
  "schedule.col_start": "Début",
  "schedule.col_end": "Fin",

  // Scorecard / Suppliers page
  "scorecard.title": "Tableau de bord",
  "scorecard.tab_suppliers": "Fournisseurs",
  "scorecard.tab_performance": "Performance",
  "scorecard.col_supplier": "Fournisseur",
  "scorecard.col_on_time": "Ponctualité",
  "scorecard.col_fill_rate": "Taux de remplissage",
  "scorecard.col_window": "Respect fenêtre",
  "scorecard.col_price_var": "Prix vs référence",
  "scorecard.col_moq_tax": "Taxe MOQ (trim.)",
  "scorecard.col_contract_expiry": "Expiration contrat",
  "scorecard.tab_overview": "Aperçu",
  "scorecard.tab_contact": "Contact",
  "scorecard.tab_messages": "Messages",
  "scorecard.tab_negotiate": "Négocier",
  "scorecard.negotiate_goal": "Objectif",
  "scorecard.negotiate_tone": "Ton",
  "scorecard.generate_draft": "Générer un brouillon",
  "scorecard.send_to_supplier": "Envoyer au fournisseur",
  "scorecard.subject": "Sujet",
  "scorecard.drafting_live": "ProcurementAgent · rédaction en direct",
  "scorecard.generated_draft": "Brouillon généré",

  // FlowSight / Facilities page
  "flowsight.title": "FlowSight",
  "flowsight.layers": "Couches",
  "flowsight.live": "en direct",
  "flowsight.suppliers_count": "fournisseurs",
  "flowsight.plants_count": "usines",
  "flowsight.retailers_count": "détaillants",
  "flowsight.disruption_feed": "Flux de perturbations",

  // Settings page
  "settings.title": "Paramètres",
  "settings.theme": "Thème",
  "settings.theme_dark": "Sombre",
  "settings.theme_light": "Clair",
  "settings.accent": "Couleur d'accent",
  "settings.language": "Langue",
  "settings.notifications": "Notifications",
  "settings.profile": "Profil",
  "settings.display_name": "Nom affiché",
  "settings.role": "Rôle",
  "settings.default_facility": "Usine par défaut",
  "settings.notif_toast": "Notifications éphémères",
  "settings.notif_expiring": "Lots en expiration",
  "settings.notif_supplier": "Risque fournisseur",
  "settings.notif_yield": "Anomalies de rendement",

  // Admin page
  "admin.title": "Admin",
  "admin.subtitle": "Outils d'exploitation",

  // Home page
  "home.title": "Aperçu des opérations",
  "home.suppliers_at_risk": "Fournisseurs à risque",
  "home.lots_critical": "Lots critiques",
  "home.active_runs": "Lancements actifs",
  "home.todays_summary": "Résumé du jour",

  // Action cards
  "card.pending": "En attente d'approbation",
  "card.confirm_question": "Approuver cette action ?",
  "card.reject_reason_placeholder": "Motif (optionnel)",
  "card.executed_at": "Exécuté à",
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
