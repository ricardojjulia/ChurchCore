import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { anthropicCreateMock } = vi.hoisted(() => ({ anthropicCreateMock: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class MockAnthropic {
    messages = { create: anthropicCreateMock };
  },
}));

import { AiNotConfiguredError, AiProviderError, OPENROUTER_URL, completeChat, isAiConfigured } from "./gateway";
import { anthropicModelFor, openRouterModelsFor } from "./models";

// Shaped like OpenRouter's documented chat-completions response.
const openRouterResponse = {
  id: "gen-1",
  model: "google/gemini-2.5-pro",
  choices: [{ index: 0, finish_reason: "stop", message: { role: "assistant", content: "  Ship it.  " } }],
  usage: { prompt_tokens: 120, completion_tokens: 45, total_tokens: 165, cost: 0.00069 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

const request = {
  feature: "hq-advisor" as const,
  system: "You are an advisor.",
  messages: [{ role: "user" as const, content: "What first?" }],
  maxTokens: 500,
};

describe("completeChat via OpenRouter", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENROUTER_API_KEY", "or-key");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    vi.stubEnv("AI_MODELS_HQ_ADVISOR", "");
    fetchMock.mockResolvedValue(json(openRouterResponse));
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends the documented request: URL, method, headers, ranked models, ZDR policy, system first", async () => {
    await completeChat(request);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(url).toBe(OPENROUTER_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ Authorization: "Bearer or-key", "Content-Type": "application/json" });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual({
      model: "anthropic/claude-sonnet-5.5",
      models: ["anthropic/claude-sonnet-5.5", "google/gemini-2.5-pro"],
      messages: [
        { role: "system", content: "You are an advisor." },
        { role: "user", content: "What first?" },
      ],
      max_tokens: 500,
      provider: { zdr: true, data_collection: "deny", allow_fallbacks: true },
    });
  });

  it("parses text, the answering model and usage including cost", async () => {
    expect(await completeChat(request)).toEqual({
      text: "Ship it.",
      model: "google/gemini-2.5-pro",
      provider: "openrouter",
      usage: { promptTokens: 120, completionTokens: 45, costUsd: 0.00069 },
    });
  });

  it("reports a null cost when the response carries none", async () => {
    fetchMock.mockResolvedValue(json({ ...openRouterResponse, usage: { prompt_tokens: 1, completion_tokens: 2 } }));
    expect((await completeChat(request)).usage.costUsd).toBeNull();
  });

  it("honours the AI_MODELS_<FEATURE> override", async () => {
    vi.stubEnv("AI_MODELS_HQ_ADVISOR", "google/gemini-2.5-flash, anthropic/claude-haiku-4.5");
    await completeChat(request);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.model).toBe("google/gemini-2.5-flash");
    expect(body.models).toEqual(["google/gemini-2.5-flash", "anthropic/claude-haiku-4.5"]);
  });

  it.each([402, 429, 500, 503])("maps HTTP %i to a provider error without the provider's text", async (status) => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(json({ error: { code: status, message: "secret-detail sk-or-leak", metadata: {} } }, status));
    const error = await completeChat(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(status);
    expect(error.message).not.toMatch(/secret-detail|sk-or-leak/);
    spy.mockRestore();
  });

  it("treats an {error} body on a 200 as a failure", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(json({ error: { code: 502, message: "upstream says boom" } }));
    const error = await completeChat(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.message).not.toContain("boom");
    spy.mockRestore();
  });

  it("fails closed when no ZDR endpoint qualifies (a 404 error), never retrying without the policy", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockResolvedValue(json({ error: { code: 404, message: "No endpoints found matching your data policy" } }, 404));
    await expect(completeChat(request)).rejects.toBeInstanceOf(AiProviderError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });

  it("treats an empty response as an error", async () => {
    fetchMock.mockResolvedValue(json({ ...openRouterResponse, choices: [{ message: { content: "  " } }] }));
    await expect(completeChat(request)).rejects.toThrow("AI returned an empty response.");
  });

  it("maps a network failure or timeout to a provider error with a generic message", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockRejectedValue(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
    const error = await completeChat(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBeNull();
    expect(error.message).not.toMatch(/timeout/i);
    spy.mockRestore();
  });

  it("aborts on a signal from the caller", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    fetchMock.mockImplementation((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => init.signal!.addEventListener("abort", () => reject(new Error("aborted")))),
    );
    const controller = new AbortController();
    const pending = completeChat({ ...request, signal: controller.signal }).catch((caught) => caught);
    controller.abort();
    expect(await pending).toBeInstanceOf(AiProviderError);
    spy.mockRestore();
  });

  it("prefers OpenRouter when both keys are set", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    await completeChat(request);
    expect(fetchMock).toHaveBeenCalled();
    expect(anthropicCreateMock).not.toHaveBeenCalled();
  });
});

describe("completeChat direct-Anthropic backup", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "sk-ant");
    vi.stubEnv("AI_HQ_MODEL", "");
    vi.stubEnv("AI_MINISTRY_MODEL", "");
    vi.stubEnv("AI_ANTHROPIC_MODEL_HQ_ADVISOR", "");
    anthropicCreateMock.mockResolvedValue({
      model: "claude-sonnet-5-5",
      content: [{ type: "text", text: "Direct answer." }],
      usage: { input_tokens: 10, output_tokens: 4 },
    });
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is used only when the OpenRouter key is absent, with the feature's Anthropic id and no cost", async () => {
    const result = await completeChat(request);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(anthropicCreateMock.mock.calls[0][0]).toEqual({
      model: "claude-sonnet-5-5",
      max_tokens: 500,
      system: "You are an advisor.",
      messages: [{ role: "user", content: "What first?" }],
    });
    expect(result).toEqual({
      text: "Direct answer.",
      model: "claude-sonnet-5-5",
      provider: "anthropic",
      usage: { promptTokens: 10, completionTokens: 4, costUsd: null },
    });
  });

  it("wraps SDK errors without their text and treats empty content as an error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    anthropicCreateMock.mockRejectedValueOnce(Object.assign(new Error("401 invalid x-api-key sk-ant"), { status: 401 }));
    const error = await completeChat(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(error.status).toBe(401);
    expect(error.message).not.toContain("sk-ant");
    anthropicCreateMock.mockResolvedValueOnce({ content: [], usage: {} });
    await expect(completeChat(request)).rejects.toThrow("AI returned an empty response.");
    spy.mockRestore();
  });

  it("uses each feature's default direct model, with the legacy and per-feature env overrides", () => {
    expect(anthropicModelFor("hq-council-synthesis")).toBe("claude-opus-5-5");
    expect(anthropicModelFor("hq-council-seat")).toBe("claude-sonnet-5-5");
    expect(anthropicModelFor("ministry")).toBe("claude-haiku-4-5-20251001");
    vi.stubEnv("AI_HQ_MODEL", "claude-legacy");
    expect(anthropicModelFor("hq-advisor")).toBe("claude-legacy");
    vi.stubEnv("AI_ANTHROPIC_MODEL_HQ_ADVISOR", "claude-specific");
    expect(anthropicModelFor("hq-advisor")).toBe("claude-specific");
    vi.stubEnv("AI_MINISTRY_MODEL", "claude-custom-model");
    expect(anthropicModelFor("ministry")).toBe("claude-custom-model");
    expect(openRouterModelsFor("ministry")).toEqual(["anthropic/claude-haiku-4.5", "google/gemini-2.5-flash"]);
  });
});

describe("completeChat with no key", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("throws AiNotConfiguredError and reports unconfigured", async () => {
    expect(isAiConfigured()).toBe(false);
    const error = await completeChat(request).catch((caught) => caught);
    expect(error).toBeInstanceOf(AiNotConfiguredError);
    expect(error.message).toContain("not configured");
  });

  it("reports configured when either key is set", () => {
    vi.stubEnv("OPENROUTER_API_KEY", "x");
    expect(isAiConfigured()).toBe(true);
  });
});
