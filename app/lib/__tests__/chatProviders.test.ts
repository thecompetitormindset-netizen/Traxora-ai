import { describe, it, expect } from "vitest";
import { configuredProviders, NoProviderConfigured, AllProvidersFailed } from "../chatProviders";

// Ask AI answered "Something went wrong. Please try again." for everything,
// including a deployment with no API key at all — which sends someone round
// in a circle forever, because no number of retries conjures a key.
//
// These cover the two things that were actually wrong: which providers a
// deployment has, and telling a setup problem apart from a passing outage.

describe("which providers a deployment has", () => {
  it("lists them in the order they are tried", () => {
    expect(configuredProviders({
      GEMINI_API_KEY: "a", ANTHROPIC_API_KEY: "b", GROQ_API_KEY: "c", DEEPSEEK_API_KEY: "d",
    } as unknown as NodeJS.ProcessEnv)).toEqual(["gemini", "anthropic", "groq", "deepseek"]);
  });

  it("skips the ones with no key", () => {
    expect(configuredProviders({ GROQ_API_KEY: "c" } as unknown as NodeJS.ProcessEnv)).toEqual(["groq"]);
    expect(configuredProviders({ ANTHROPIC_API_KEY: "b", DEEPSEEK_API_KEY: "d" } as unknown as NodeJS.ProcessEnv))
      .toEqual(["anthropic", "deepseek"]);
  });

  it("is empty when nothing is configured", () => {
    // The case that produced the misleading message: no key anywhere, and the
    // reader told to try again.
    expect(configuredProviders({} as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });

  it("ignores a key that is present but blank", () => {
    expect(configuredProviders({ GEMINI_API_KEY: "" } as unknown as NodeJS.ProcessEnv)).toEqual([]);
  });
});

describe("telling the two failures apart", () => {
  it("names a deployment with no provider at all", () => {
    const e = new NoProviderConfigured();
    expect(e).toBeInstanceOf(Error);
    expect(e.message).toContain("No AI provider");
  });

  it("records every provider it tried and why each failed", () => {
    // The attempts are for the log, not the screen: they can carry upstream
    // detail — a URL, a quota message — that does not belong in front of a
    // reader.
    const e = new AllProvidersFailed(["gemini (429)", "groq (timeout)"], new Error("timeout"));
    expect(e.attempts).toEqual(["gemini (429)", "groq (timeout)"]);
    expect(e.message).toContain("2 provider(s) failed");
    expect(e.message).toContain("gemini (429)");
  });

  it("is a distinct type, so the route can answer differently", () => {
    // 503 and "this is not switched on" for one; 502 and "try again" for the
    // other. Collapsing them is what made the message useless.
    expect(new NoProviderConfigured() instanceof AllProvidersFailed).toBe(false);
    expect(new AllProvidersFailed([], null) instanceof NoProviderConfigured).toBe(false);
  });
});

describe("falling back between providers", () => {
  const ok = (name: string, text: string) => ({ name, run: async () => text });
  const boom = (name: string, msg: string) => ({ name, run: async () => { throw new Error(msg); } });

  it("takes the first provider that answers", async () => {
    const { firstReply } = await import("../chatProviders");
    expect(await firstReply([ok("a", "from a"), ok("b", "from b")], null)).toBe("from a");
  });

  it("keeps going after one fails, all the way to the last", async () => {
    // The bug: a Groq failure used to throw out of the chain, so a DeepSeek
    // key sitting right there was never reached.
    const { firstReply } = await import("../chatProviders");
    expect(await firstReply([boom("a", "429"), boom("b", "timeout"), ok("c", "from c")], null)).toBe("from c");
  });

  it("treats an empty reply as a failure and moves on", async () => {
    // A provider that answers with nothing has not answered, and rendering it
    // put an empty bubble on screen with nothing to say why.
    const { firstReply } = await import("../chatProviders");
    expect(await firstReply([ok("a", "   "), ok("b", "real answer")], null)).toBe("real answer");
  });

  it("throws NoProviderConfigured when there is nothing to try", async () => {
    const { firstReply, NoProviderConfigured: NPC } = await import("../chatProviders");
    await expect(firstReply([], null)).rejects.toBeInstanceOf(NPC);
  });

  it("throws AllProvidersFailed naming each attempt, when every one fails", async () => {
    const { firstReply, AllProvidersFailed: APF } = await import("../chatProviders");
    const err = await firstReply([boom("a", "429 quota"), ok("b", "")], null).catch(e => e);
    expect(err).toBeInstanceOf(APF);
    expect(err.attempts).toEqual(["a (429 quota)", "b (empty reply)"]);
  });

  it("trims the reply it returns", async () => {
    const { firstReply } = await import("../chatProviders");
    expect(await firstReply([ok("a", "  spaced  ")], null)).toBe("spaced");
  });
});
