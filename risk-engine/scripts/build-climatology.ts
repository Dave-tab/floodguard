// Fetches 20 years of ERA5 hourly rainfall/soil moisture and the GloFAS discharge
// reanalysis for each pilot community, and writes data/climatology.json.
// Usage: npm run climatology
import { mkdir, writeFile } from "node:fs/promises";
import { assembleClimatology } from "../src/climatology/build.ts";
import { PILOT_COMMUNITIES } from "../src/communities/pilot.ts";
import { fetchArchive, fetchDischargeHistory } from "../src/providers/openMeteo.ts";

const START = "2005-01-01";
const END = "2024-12-31";
const apiKey = process.env.OPEN_METEO_API_KEY;

const out: Record<string, unknown> = {};
for (const c of PILOT_COMMUNITIES) {
  process.stdout.write(`${c.id}: rainfall... `);
  const arch = await fetchArchive(c.lat, c.lon, START, END, { apiKey });
  let discharge: { dates: string[]; values: (number | null)[] } | undefined;
  if (c.riverPoint) {
    process.stdout.write("discharge... ");
    const h = await fetchDischargeHistory(c.riverPoint.lat, c.riverPoint.lon, "1984-01-01", END, { apiKey });
    discharge = { dates: h.time, values: h.discharge };
  }
  const clim = assembleClimatology({
    hourlyPrecip: arch.precipitation,
    soilMoisture: arch.soilMoisture,
    discharge,
    period: `${START}/${END}${discharge ? "; discharge 1984-01-01/" + END : ""}`,
  });
  out[c.id] = { ...clim, generatedAt: new Date().toISOString(), hours: arch.time.length };
  console.log("done", JSON.stringify({ rain24h: clim.rain24h, rp: clim.dischargeReturnPeriods }));
}
await mkdir("data", { recursive: true });
await writeFile("data/climatology.json", JSON.stringify(out, null, 2));
console.log("wrote data/climatology.json");
