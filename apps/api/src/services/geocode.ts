import type { PlaceSearchResult } from "@obey/contracts";

/** Address and business search. Photon is komoot's free OpenStreetMap search, for fair use; swapping it is one function. */
export type Geocoder = (q: string, near: { lat: number; lng: number } | null) => Promise<PlaceSearchResult[]>;

const PHOTON = "https://photon.komoot.io/api/";

export const photonGeocoder: Geocoder = async (q, near) => {
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
