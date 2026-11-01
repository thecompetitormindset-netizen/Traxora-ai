// Which model to ask each provider for.
//
// Every model name in this app was stale at the same time, so Ask AI failed on
// every provider at once and looked like a broken feature rather than three
// expired strings. Groq retired llama-3.3-70b-versatile on 16 August 2026;
// Gemini's 2.0 Flash went the same way around June; Anthropic's haiku-4-5 was
// superseded. None of that is unusual — providers retire model names on their
// own schedule and will keep doing it.
//
// So two things changed. Each provider has a LIST of names rather than one,
// tried in order, so a single retirement is survivable. And each can be
// overridden from the environment, so the next one is a config change at
// three in the morning rather than a deploy. Groq's own documentation gives
// exactly this advice: design systems to be model-agnostic and make the model
// name a setting.
//
// The lists are ordered current-first, with the old name kept last — an
// account pinned to a legacy model should still work.

export type ProviderName = "gemini" | "anthropic" | "groq" | "deepseek";

/**
 * Candidate models per provider, best first.
 *
 * Checked against each provider's own deprecation notices on 1 November 2026.
 * They will go out of date again; that is what the environment override and
 * the fallback list are for.
 */
export const MODEL_CANDIDATES: Record<ProviderName, string[]> = {
  // Free tier is Flash-class. 2.5 Flash is the stable baseline; 2.0 is kept
  // last because an older project may still be served it.
  gemini: ["gemini-2.5-flash", "gemini-2.5-flash-lite", "gemini-2.0-flash"],

  anthropic: ["claude-haiku-5-5", "claude-haiku-4-5-20251001"],

  // Groq's own suggested replacements for the retired Llama models. The 20b
  // is first: it is quicker and plenty for a chat that answers in five
  // sentences.
  groq: ["openai/gpt-oss-20b", "openai/gpt-oss-120b", "qwen/qwen3.6-27b", "llama-3.3-70b-versatile"],

  deepseek: ["deepseek-chat"],
};

/** The environment variable that overrides a provider's model. */
export const MODEL_ENV: Record<ProviderName, string> = {
  gemini:    "GEMINI_MODEL",
  anthropic: "ANTHROPIC_MODEL",
  groq:      "GROQ_MODEL",
  deepseek:  "DEEPSEEK_MODEL",
};

/**
 * The models to try for a provider, in order.
 *
 * An override wins outright rather than being added to the list: someone who
 * names a model means that one, and quietly falling back to another would
 * make the setting a suggestion.
 */
export function modelsFor(provider: ProviderName, env: NodeJS.ProcessEnv = process.env): string[] {
  const override = env[MODEL_ENV[provider]]?.trim();
  if (override) return [override];
  return MODEL_CANDIDATES[provider];
}

/**
 * Whether an error reads like "that model is gone" rather than a real outage.
 *
 * Only worth trying another name when the name is the problem. Retrying every
 * candidate against a rate limit would turn one 429 into four, which is how a
 * free tier gets exhausted faster than it needs to be.
 */
export function looksLikeBadModel(message: string): boolean {
  const m = message.toLowerCase();
  if (/\b(429|rate.?limit|quota|insufficient|overloaded|timeout|econn|fetch failed)\b/.test(m)) return false;
  return /\b(404|400)\b/.test(m)
    || /(model|not found|does not exist|decommission|deprecat|unsupported|invalid.*model)/.test(m);
}
