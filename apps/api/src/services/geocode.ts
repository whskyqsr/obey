import type { PlaceSearchResult } from "@obey/contracts";
import { config } from "../config.js";

/** Address and business search. Photon is komoot's free OpenStreetMap search, for fair use; swapping it is one function. */
export type Geocoder = (q: string, near: { lat: number; lng: number } | null) => Promise<PlaceSearchResult[]>;

const PHOTON = "https://photon.komoot.io/api/";

/**
 * Photon often finds nothing for a full US address with a unit, ZIP or country on it,
 * so a query that finds nothing is tried once more without them.
 */
export const plainAddress = (q: string) =>
  q
    .replace(/,?\s*(?:apt|apartment|unit|suite|ste)\.?\s*[\w-]+|,?\s*#\s*[\w-]+/gi, "")
    .replace(/\s\d{5}(?:-\d{4})?(?=\s*(?:,|$|usa\b|united states))/gi, "")
    .replace(/,?\s*(?:usa|united states(?: of america)?)\s*$/i, "")
    .replace(/\s*,(?:\s*,)+/g, ",")
    .replace(/[\s,]+$/, "")
    .trim();

export const photonGeocoder: Geocoder = async (q, near) => {
  const found = await photon(q, near);
  const plain = plainAddress(q);
  return found.length || plain === q || plain.length < 3 ? found : photon(plain, near);
};

const photon: Geocoder = async (q, near) => {
  const params = new URLSearchParams({ q, limit: "5" });
  if (near) {
    params.set("lat", String(near.lat));
    params.set("lon", String(near.lng));
  }
  const res = await fetch(`${PHOTON}?${params}`, {
    headers: { "user-agent": "Fealty (https://fealty.me; hello@fealty.me)" },
    signal: AbortSignal.timeout(8_000),
  });
  if (!res.ok) throw new Error(`photon ${res.status}`);
  const body = (await res.json()) as { features: { geometry: { coordinates: [number, number] }; properties: Record<string, string | undefined> }[] };
  return body.features.map((f) => {
    const p = f.properties;
    const street = [p.housenumber, p.street].filter(Boolean).join(" ");
    return {
      name: p.name || street || p.city || "",
      address: [p.name ? street : null, p.city, p.state].filter(Boolean).join(", "),
      lat: f.geometry.coordinates[1],
      lng: f.geometry.coordinates[0],
    };
  });
};

type GeoapifyResult = { lat: number; lon: number; name?: string; address_line1?: string; address_line2?: string };

/** Geoapify's results, trimmed to what the place dialog shows. */
export const fromGeoapify = (results: GeoapifyResult[]): PlaceSearchResult[] =>
  results.map((r) => ({
    name: r.address_line1 || r.name || "",
    address: (r.address_line2 ?? "").replace(/,?\s*United States of America$/, ""),
    lat: r.lat,
    lng: r.lon,
  }));

/** Geoapify adds OpenAddresses to OpenStreetMap, so it finds homes OSM has no house number for, and suggests them as you type. */
export const geoapifyGeocoder =
  (key: string): Geocoder =>
  async (q, near) => {
    const params = new URLSearchParams({ text: q, limit: "5", format: "json", apiKey: key });
    if (near) params.set("bias", `proximity:${near.lng},${near.lat}`);
    const res = await fetch(`https://api.geoapify.com/v1/geocode/autocomplete?${params}`, { signal: AbortSignal.timeout(8_000) });
    if (!res.ok) throw new Error(`geoapify ${res.status}`);
    return fromGeoapify(((await res.json()) as { results?: GeoapifyResult[] }).results ?? []);
  };

/** Geoapify when it's set up, with Photon behind it if Geoapify fails or finds nothing. */
export const addressSearch: Geocoder = async (q, near) => {
  if (!config.geoapifyKey) return photonGeocoder(q, near);
  const found = await geoapifyGeocoder(config.geoapifyKey)(q, near).catch(() => []);
  return found.length ? found : photonGeocoder(q, near);
};
