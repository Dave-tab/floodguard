// Live test of the AI explanation: runs real assessments for the pilot communities, asks the
// Vultr model to explain each one several times, and reports how many replies passed the
// safety checks. Usage: npm run explain:live   (needs VULTR_INFERENCE_API_KEY in .env)
import { readFile } from "node:fs/promises";
import { PILOT_COMMUNITIES } from "../src/communities/pilot.ts";
import type { Community } from "../src/engine/types.ts";
import { DEFAULT_VULTR_MODEL, explainAssessment } from "../src/explain/vultr.ts";
import { runAssessment } from "../src/pipeline/runAssessment.ts";

try { process.loadEnvFile(".env"); } catch { /* no .env file */ }
const apiKey = process.env.VULTR_INFERENCE_API_KEY;
if (!apiKey) {
  console.error("Missing VULTR_INFERENCE_API_KEY. Copy .env.example to .env and paste the key from the Vultr console.");
  process.exit(1);
}
const model = process.env.VULTR_INFERENCE_MODEL || DEFAULT_VULTR_MODEL;
const RUNS = Number(process.env.EXPLAIN_RUNS ?? 3);
const climatology = JSON.parse(await readFile("data/climatology.json", "utf8").catch(() => "{}"));

let total = 0, accepted = 0, errors = 0, tokensIn = 0, tokensOut = 0;
for (const c of PILOT_COMMUNITIES) {
  const community: Community = { ...c, climatology: climatology[c.id] ?? null };
  const { assessment } = await runAssessment(community);
  console.log(`\n=== ${c.name}: ${assessment.severity ?? "unavailable"} (${assessment.confidence.level} confidence) ===`);
  for (let i = 1; i <= RUNS; i++) {
    const r = await explainAssessment(assessment, { apiKey, model, reasoningEffort: (process.env.VULTR_REASONING_EFFORT as "none" | "low" | undefined) || undefined });
    total++;
    if (r.source === "llm") accepted++;
    if (r.error) errors++;
    tokensIn += r.usage?.promptTokens ?? 0;
    tokensOut += r.usage?.completionTokens ?? 0;
    const tag = r.source === "llm" ? "ACCEPTED" : r.error ? "ERROR -> engine summary" : "REJECTED -> engine summary";
    const words = (r.rejectedText ?? r.text).split(/\s+/).length;
    console.log(`  [${i}] ${tag}${r.rejectReason ? ` (${r.rejectReason})` : ""}${r.attempts && r.attempts > 1 ? ` after ${r.attempts} tries` : ""} [${words} words]: ${r.error ?? r.rejectedText ?? r.text}`);
  }
}
console.log(`\nModel ${model}: ${accepted}/${total} accepted, ${total - accepted - errors} rejected by checks, ${errors} errors. Tokens: ${tokensIn} in / ${tokensOut} out.`);
