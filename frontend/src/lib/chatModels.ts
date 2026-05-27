export interface ChatModelOption {
  id: string;
  label: string;
  provider: string;
  tier: string;
  description: string;
  available: boolean;
  is_default: boolean;
}

const STORAGE_KEY = "bakerypilot.chatModel";

export function getStoredChatModel(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(STORAGE_KEY);
}

export function setStoredChatModel(modelId: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, modelId);
}

export function pickInitialModel(models: ChatModelOption[]): string {
  const stored = getStoredChatModel();
  if (stored && models.some((m) => m.id === stored && m.available)) {
    return stored;
  }
  const defaultModel = models.find((m) => m.is_default && m.available);
  if (defaultModel) return defaultModel.id;
  const firstAvailable = models.find((m) => m.available);
  return firstAvailable?.id ?? models[0]?.id ?? "claude-sonnet-4-6";
}

export function modelLabel(models: ChatModelOption[], modelId: string): string {
  return models.find((m) => m.id === modelId)?.label ?? modelId;
}

export function providerBadge(provider: string): string {
  switch (provider) {
    case "google":
      return "Gemini";
    case "groq":
      return "Groq";
    case "anthropic":
      return "Claude";
    default:
      return provider;
  }
}
