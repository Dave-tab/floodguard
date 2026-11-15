import { describe, expect, it } from "vitest";
import { toIso } from "../src/providers/openMeteo.ts";

describe("toIso", () => {
  it("adds seconds and UTC to Open-Meteo hourly times", () => {
    expect(toIso("2026-11-14T15:00")).toBe("2026-11-14T15:00:00Z");
  });
  it("turns a date into midnight UTC", () => {
    expect(toIso("2026-11-14")).toBe("2026-11-14T00:00:00Z");
  });
  it("leaves times that already end in a timezone unchanged", () => {
    expect(toIso("2026-11-14T15:00:00Z")).toBe("2026-11-14T15:00:00Z");
    expect(toIso("2026-11-14T15:00:00+01:00")).toBe("2026-11-14T15:00:00+01:00");
  });
  it("does not treat a 'z' elsewhere in the string as a timezone", () => {
    expect(toIso("z026-11-14T15:00")).toBe("z026-11-14T15:00:00Z");
  });
});
