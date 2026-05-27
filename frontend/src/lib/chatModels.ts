export interface ChatModelOption {
  id: string;
  label: string;
  provider: string;
  tier: string;
  description: string;
  available: boolean;
  is_default: boolean;
}

export function providerBadge(provider: string): string {
  switch (provider) {
    case "google":
      return "Gemini";
    case "groq":
      return "Groq";
    case "anthropic":
      return "Claude";
    case "openai":
      return "OpenAI";
    default:
      return provider;
  }
}
