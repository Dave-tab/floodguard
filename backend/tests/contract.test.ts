// Compile-time and runtime checks that responses fit the frontend's own types on main.
// If the frontend types change, `npm run typecheck` fails here first.
import { describe, expect, it } from "vitest";
import type { LocationCommunity as FeLocationCommunity } from "../../src/features/location/types/location.types.ts";
import type { MapHazard } from "../../src/features/resident/hazardMapService.ts";
import type { Community as FeCommunity, VerifiedHazardSummary, WeatherContext as FeWeather } from "../../src/types/resident.ts";
import { hazardRecord } from "../src/app.ts";
import { toLocationCommunity, toResidentCommunity } from "../src/locations.ts";
import { toWeatherContext } from "../src/weather.ts";
import { ids, NOW, setup } from "./fakes.ts";

describe("frontend contract", () => {
  it("mappers produce the frontend types", async () => {
    const { db, locations } = await setup();
    const idx = await locations.index();
    const c = db.communities[0]!;
    const resident: FeCommunity = toResidentCommunity(c, idx);
    const loc: FeLocationCommunity = toLocationCommunity(c, idx);
    const weather: FeWeather = toWeatherContext(null, NOW.toISOString());
    const r = db.addReport("VERIFIED", { latitude: 6.6, longitude: 3.5 });
    const h = hazardRecord({ ...r }, c, idx);
    const summary: VerifiedHazardSummary = h;
    const map: Omit<MapHazard, "latitude" | "longitude"> = h;
    expect([resident.id, loc.id, weather.status, summary.status, map.status]).toEqual([c.id, c.id, "unavailable", "verified", "verified"]);
  });

  it("overview has every CommunityOverviewData key", async () => {
    const { app } = await setup();
    const data = (await app.inject({ url: `/communities/${ids.ikorodu}/overview` })).json().data;
    expect(Object.keys(data).sort()).toEqual(["community", "hotlines", "isDemoData", "risk", "safetyGuidelines", "verifiedHazards", "weather"]);
    for (const k of ["status", "level", "score", "summary", "explanation", "explanationStatus", "factors", "missingInputs", "limitations", "disclaimer", "confidence", "assessedAt", "isDemoData"]) {
      expect(data.risk).toHaveProperty(k);
    }
    expect(data.isDemoData).toBe(false);
  });

  it("collections use the { data } envelope the services accept", async () => {
    const { app } = await setup();
    for (const url of ["/locations/states", "/locations/states/NG025/lgas", "/locations/communities?status=active", "/locations/communities?search=iko", "/hazards?status=verified", "/risk-assessments?status=active", "/safety/guidelines", "/safety/hotlines"]) {
      const res = await app.inject({ url });
      expect(res.statusCode, url).toBe(200);
      expect(Array.isArray(res.json().data), url).toBe(true);
    }
    const impact = (await app.inject({ url: "/platform/impact" })).json().data;
    expect(impact).toMatchObject({ isDemoData: false, activeCommunities: 2, activeVolunteers: null });
  });
});
