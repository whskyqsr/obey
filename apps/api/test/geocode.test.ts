import { describe, expect, it } from "vitest";
import { censusQuery, fromGeoapify, plainAddress } from "../src/services/geocode.js";

describe("plainAddress", () => {
  it("drops the unit, ZIP and country that Photon trips on", () => {
    expect(plainAddress("123 Main St Apt 4B, Ann Arbor, MI 48104")).toBe("123 Main St, Ann Arbor, MI");
    expect(plainAddress("123 Main St #4, Detroit, MI 48201-1234, USA")).toBe("123 Main St, Detroit, MI");
    expect(plainAddress("Planet Fitness, Royal Oak")).toBe("Planet Fitness, Royal Oak");
    // A five-digit house number isn't a ZIP.
    expect(plainAddress("12345 Grand River Ave, Novi, MI 48375")).toBe("12345 Grand River Ave, Novi, MI");
  });
});

describe("fromGeoapify", () => {
  it("shows the street line as the name and the town under it", () => {
    expect(fromGeoapify([{ lat: 42.2, lon: -84.4, address_line1: "100 Main Street", address_line2: "Springfield, IL 62701, United States of America" }])).toEqual([
      { name: "100 Main Street", address: "Springfield, IL 62701", lat: 42.2, lng: -84.4 },
    ]);
  });
});

describe("censusQuery", () => {
  const street = {
    lat: 39.8,
    lon: -89.6,
    rank: { confidence_building_level: 0.75 },
    street: "Main Street",
    city: "Springfield",
    state_code: "IL",
    postcode: "62701",
    country_code: "us",
  };
  it("asks for the house when Geoapify is only guessing along the street", () => {
    expect(censusQuery(street, "100 Main St")).toBe("100 Main Street, Springfield, IL 62701");
    expect(censusQuery({ ...street, housenumber: "100" }, "Main")).toBe("100 Main Street, Springfield, IL 62701");
  });
  it("leaves houses it already found, other countries, and searches without a number", () => {
    expect(censusQuery({ ...street, rank: { confidence_building_level: 1 } }, "100 Main St")).toBeNull();
    expect(censusQuery({ ...street, country_code: "ca" }, "100 Main St")).toBeNull();
    expect(censusQuery(street, "Main St")).toBeNull();
  });
});
