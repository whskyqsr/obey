import { describe, expect, it } from "vitest";
import { plainAddress } from "../src/services/geocode.js";

describe("plainAddress", () => {
  it("drops the unit, ZIP and country that Photon trips on", () => {
    expect(plainAddress("123 Main St Apt 4B, Ann Arbor, MI 48104")).toBe("123 Main St, Ann Arbor, MI");
    expect(plainAddress("123 Main St #4, Detroit, MI 48201-1234, USA")).toBe("123 Main St, Detroit, MI");
    expect(plainAddress("Planet Fitness, Royal Oak")).toBe("Planet Fitness, Royal Oak");
    // A five-digit house number isn't a ZIP.
    expect(plainAddress("12345 Grand River Ave, Novi, MI 48375")).toBe("12345 Grand River Ave, Novi, MI");
  });
});
