/** The environment variable that enables each provider (shown in setup hints; never a value). */
export const PROVIDER_KEY_ENV: Record<string, string> = {
  groq: "GROQ_API_KEY",
  gemini: "GEMINI_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
  huggingface: "HUGGINGFACE_API_KEY",
  demo: "ENABLE_DEMO_PROVIDER",
};
