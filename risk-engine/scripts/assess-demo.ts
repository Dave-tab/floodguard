// Runs the live pipeline for every pilot community and prints a compact table.
// Usage: npm run assess:demo [-- --json]
import { readFile } from "node:fs/promises";
import { PILOT_COMMUNITIES } from "../src/communities/pilot.ts";
import type { Community } from "../src/engine/types.ts";
import { runAssessment } from "../src/pipeline/runAssessment.ts";

const climatology = JSON.parse(await readFile("data/climatology.json", "utf8").catch(() => "{}"));
const json = process.argv.includes("--json");

for (const c of PILOT_COMMUNITIES) {
  const community: Community = { ...c, climatology: climatology[c.id] ?? null };
  const { assessment: a, weather: w, errors } = await runAssessment(community);
  if (json) {
    console.log(JSON.stringify({ assessment: a, weather: w && { ...w, hourly: w.hourly.slice(0, 6) }, errors }, null, 2));
    continue;
  }
  console.log(`\n=== ${c.name} (${c.state}) ===`);
  console.log(`severity=${a.severity ?? "—"} score=${a.riskScore ?? "—"} confidence=${a.confidence.level} (${a.confidence.score}) status=${a.status}`);
  console.log(`summary: ${a.summary}`);
  if (w) console.log(`weather: ${w.current.description}, next 24h ${w.next24h.totalMm} mm, peak ${w.next24h.peakIntensity}, max prob ${w.next24h.maxProbabilityPct ?? "n/a"}% — ${w.floodRelevance}`);
  if (errors.length) console.log(`errors: ${errors.join("; ")}`);
}
