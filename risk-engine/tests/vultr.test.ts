import { describe, expect, it } from "vitest";
import { assessCommunity } from "../src/engine/assess.ts";
import { explainAssessment, stripReasoning } from "../src/explain/vultr.ts";
import type { Community } from "../src/engine/types.ts";

const NOW = "2026-11-14T12:00:00.000Z";
const clim = {
  rain1h: { p90: 4.6, p99: 10.7, p999: 19 }, rain6h: { p90: 10, p99: 28, p999: 60 },
  rain24h: { p90: 14.5, p99: 38, p999: 95.6 }, rain7d: { p90: 68, p99: 131, p999: 219 }, source: "t", period: "t",
};
const c: Community = { id: "ikorodu", name: "Ikorodu", lga: "Ikorodu", state: "Lagos", lat: 6.62, lon: 3.51, mechanism: "pluvial", setting: "urban", susceptibility: 0.6, climatology: clim };
const prov = { source: "Open-Meteo", retrievedAt: NOW, measured: false, resolutionKm: 9 };
const a = assessCommunity({
  community: c, now: NOW, riverDischarge: null, riverGauge: null, observations: [],
  rainfallForecast: { ...prov, max1hMm: 1, max6hMm: 2, max24hMm: 3, maxProbabilityPct: 40 },
  antecedent: { ...prov, observedAt: NOW, past72hMm: 5, past7dMm: 10, soilMoisture: null },
});

const fakeFetch = (content: string, status = 200): typeof fetch => (async (_url: RequestInfo | URL, init?: RequestInit) => {
  const sent = JSON.parse(String(init?.body));
  expect((init?.headers as Record<string, string>).Authorization).toBe("Bearer test-key");
  expect(sent.messages[0].role).toBe("system");
  expect(sent.reasoning_effort).toBe("none");
  expect(sent.max_tokens).toBe(400);
  return new Response(status === 200 ? JSON.stringify({ choices: [{ message: { content } }], usage: { prompt_tokens: 300, completion_tokens: 60 } }) : "boom", { status });
}) as typeof fetch;

describe("Vultr explanation client", () => {
  it("returns faithful model text", async () => {
    const r = await explainAssessment(a, { apiKey: "test-key", fetchImpl: fakeFetch("Flood risk in Ikorodu is low right now.") });
    expect(r.source).toBe("llm");
    expect(r.usage?.completionTokens).toBe(60);
  });
  it("hides reasoning tags from residents", async () => {
    const r = await explainAssessment(a, { apiKey: "test-key", fetchImpl: fakeFetch("<think>maybe critical?</think>Flood risk in Ikorodu is low.") });
    expect(r.source).toBe("llm");
    expect(r.text).toBe("Flood risk in Ikorodu is low.");
  });
  it("falls back to the engine summary when the model contradicts it", async () => {
    const r = await explainAssessment(a, { apiKey: "test-key", fetchImpl: fakeFetch("Critical flooding expected. Evacuate now.") });
    expect(r.source).toBe("engine");
    expect(r.text).toBe(a.summary);
    expect(r.rejectedText).toMatch(/Evacuate/);
  });
  it("falls back on API errors", async () => {
    const r = await explainAssessment(a, { apiKey: "test-key", fetchImpl: fakeFetch("", 500) });
    expect(r.source).toBe("engine");
    expect(r.error).toMatch(/HTTP 500/);
  });
  it("strips an unclosed reasoning preamble", () => {
    expect(stripReasoning("thinking...</think> Risk is low.")).toBe("Risk is low.");
  });
});
