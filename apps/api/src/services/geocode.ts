import type { PlaceSearchResult } from "@obey/contracts";

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
