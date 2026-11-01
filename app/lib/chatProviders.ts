// Choosing and falling back between AI providers for Ask AI.
//
// Separated from the route because the route imports next-auth, and the
// decisions worth testing — which providers exist, what to do when they all
// fail — have nothing to do with authentication.
//
// Ask AI answered "Something went wrong. Please try again." for everything,
// including a deployment with no API key at all. That sends someone round in
// a circle forever: no number of retries conjures a key. The two failures are
// different facts and the types below keep them apart.

/** Nothing is configured. Retrying cannot help; this needs a key. */
export class NoProviderConfigured extends Error {
  constructor() {
    super("No AI provider is configured.");
    this.name = "NoProviderConfigured";
  }
}

/** Everything configured was tried and none answered. Usually passes. */
export class AllProvidersFailed extends Error {
  constructor(public readonly attempts: string[], cause?: unknown) {
    super(`All ${attempts.length} provider(s) failed: ${attempts.join(", ")}`);
    this.name = "AllProvidersFailed";
    this.cause = cause;
  }
}

/** One way of getting a reply. */
export type Provider<T> = { name: string; run: (input: T) => Promise<string> };

/**
 * The providers a deployment can use, in the order to try them.
 *
 * Reported by name only. A key's presence is a fact worth exposing to a
 * health check; its value never is.
 */
export function configuredProviders(env: NodeJS.ProcessEnv = process.env): string[] {
  const names: string[] = [];
  if (env.GEMINI_API_KEY)    names.push("gemini");
  if (env.ANTHROPIC_API_KEY) names.push("anthropic");
  if (env.GROQ_API_KEY)      names.push("groq");
  if (env.DEEPSEEK_API_KEY)  names.push("deepseek");
  return names;
}

/**
 * Ask each provider in turn until one answers.
 *
 * Every one is tried. The previous version fell through on a Gemini or
 * Anthropic failure but let a Groq failure throw, so a DeepSeek key sitting
 * right there was never reached — a fallback chain that stopped falling back
 * two-thirds of the way along.
 *
 * An empty reply counts as a failure. A provider that answers with nothing has
 * not answered, and rendering it put an empty bubble on screen with no
 * indication that anything had gone wrong.
 */
export async function firstReply<T>(list: Provider<T>[], input: T): Promise<string> {
  if (list.length === 0) throw new NoProviderConfigured();

  const attempts: string[] = [];
  let lastError: unknown;

  for (const p of list) {
    try {
      const text = (await p.run(input)).trim();
      if (text) return text;
      attempts.push(`${p.name} (empty reply)`);
    } catch (err) {
      attempts.push(`${p.name} (${err instanceof Error ? err.message.slice(0, 120) : "failed"})`);
      lastError = err;
    }
  }
  throw new AllProvidersFailed(attempts, lastError);
}
