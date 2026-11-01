import { describe, it, expect } from "vitest";
import { modelsFor, looksLikeBadModel, MODEL_CANDIDATES, MODEL_ENV } from "../chatModels";

// Every model name in this app expired at roughly the same time, so Ask AI
// failed on every provider at once and looked like a broken feature rather
// than three stale strings. Providers retire names on their own schedule and
// will keep doing it, so what is tested here is surviving the next one.

const env = (o: Record<string, string>) => o as unknown as NodeJS.ProcessEnv;

describe("which models a provider is asked for", () => {
  it("offers more than one, so a single retirement is survivable", () => {
    for (const p of ["gemini", "anthropic", "groq"] as const) {
      expect(MODEL_CANDIDATES[p].length, `${p} needs a fallback`).toBeGreaterThan(1);
    }
  });

  it("leads with a current name and keeps the retired one last", () => {
    // Groq retired llama-3.3-70b-versatile on 16 August 2026. It stays at the
    // end rather than being deleted: an account pinned to a legacy model
    // should still work.
    const groq = modelsFor("groq", env({}));
    expect(groq[0]).not.toBe("llama-3.3-70b-versatile");
    expect(groq[groq.length - 1]).toBe("llama-3.3-70b-versatile");

    const gemini = modelsFor("gemini", env({}));
    expect(gemini[0]).toBe("gemini-2.5-flash");
    expect(gemini).toContain("gemini-2.0-flash");
  });

  it("lets the environment override, and that override wins outright", () => {
    // Someone who names a model means that one. Falling back past it would
    // make the setting a suggestion.
    expect(modelsFor("groq", env({ GROQ_MODEL: "my/model" }))).toEqual(["my/model"]);
    expect(modelsFor("gemini", env({ GEMINI_MODEL: "gemini-9" }))).toEqual(["gemini-9"]);
  });

  it("ignores a blank override rather than asking for an empty model", () => {
    expect(modelsFor("groq", env({ GROQ_MODEL: "   " }))).toEqual(MODEL_CANDIDATES.groq);
  });

  it("names an environment variable for every provider", () => {
    for (const p of Object.keys(MODEL_CANDIDATES) as Array<keyof typeof MODEL_CANDIDATES>) {
      expect(MODEL_ENV[p], `${p} needs an override variable`).toMatch(/^[A-Z_]+$/);
    }
  });
});

describe("knowing when the model name is the problem", () => {
  it("recognises a retired or unknown model", () => {
    for (const m of [
      "404: model not found",
      "400: The model `llama-3.3-70b-versatile` has been decommissioned",
      "model_not_found",
      "404 Not Found: models/gemini-2.0-flash is not supported",
      "invalid model specified",
    ]) {
      expect(looksLikeBadModel(m), m).toBe(true);
    }
  });

  it("does NOT treat a rate limit or an outage as a bad name", () => {
    // Trying three more names against a 429 turns one refusal into four,
    // which is the quickest way to exhaust a free tier.
    for (const m of [
      "429: You exceeded your current quota",
      "rate limit reached for requests",
      "529: overloaded",
      "fetch failed",
      "ETIMEDOUT",
      "insufficient balance",
    ]) {
      expect(looksLikeBadModel(m), m).toBe(false);
    }
  });

  it("prefers the outage reading when a message could be either", () => {
    // "429 model overloaded" mentions a model but is plainly a rate limit;
    // reading it as a bad name would burn the remaining candidates.
    expect(looksLikeBadModel("429 model overloaded, try again")).toBe(false);
  });

  it("does not fire on an empty or unrelated message", () => {
    expect(looksLikeBadModel("")).toBe(false);
    expect(looksLikeBadModel("something went wrong")).toBe(false);
  });
});
