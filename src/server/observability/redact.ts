/**
 * Scrubs credentials from text before it is logged, persisted or returned to a client. Provider
 * error bodies and network errors are untrusted text; this is a defence-in-depth layer on top of
 * never putting keys into URLs or messages in the first place.
 */
const SECRET_PATTERNS: RegExp[] = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi,
  /\bgsk_[A-Za-z0-9]{8,}/g, // Groq
  /\bsk-or-[A-Za-z0-9-]{8,}/g, // OpenRouter
  /\bsk-[A-Za-z0-9_-]{16,}/g, // OpenAI-style
  /\bhf_[A-Za-z0-9]{8,}/g, // Hugging Face
  /\bAIza[0-9A-Za-z_-]{20,}/g, // Google
  // Account identifiers are not credentials, but provider errors echo them and result pages
  // are shareable, so they are removed too.
  /\borg[_-][A-Za-z0-9]{8,}/g, // Groq / OpenAI organization ids
  /([?&](?:key|api_key|apikey|token)=)[^&\s]+/gi,
];

export function redactSecrets(text: string): string {
  return SECRET_PATTERNS.reduce(
    (result, pattern) =>
      result.replace(pattern, (match, prefix?: string) =>
        typeof prefix === "string" && match.startsWith(prefix)
          ? `${prefix}[REDACTED]`
          : "[REDACTED]",
      ),
    text,
  );
}

/** Redact and bound the length of untrusted text (e.g. provider error bodies). */
export function sanitizeMessage(text: string, maxLength = 500): string {
  const clean = redactSecrets(text).replace(/\s+/g, " ").trim();
  return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
}
