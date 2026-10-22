import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { HttpError, notFound } from "../errors.js";
import { countUsage } from "../services/usage.js";

/** Esri's World Imagery, the satellite view behind the place picker. 256 px tiles. */
const ESRI_SERVICE = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer";
/** How long a handed-out tile link works; a place dialog is open for minutes, not hours. */
const LINK_HOURS = 2;

/** Esri's own wording for the imagery providers, used until the service tells us its current list. */
const FALLBACK_CREDIT = "Esri, Vantor, GeoEye, Earthstar Geographics, CNES/Airbus DS, USDA, USGS, AeroGRID, IGN, and the GIS User Community";
/** Esri's terms ask for the provider list to stay current, so it's re-read from the service daily. */
const CREDIT_HOURS = 24;

export type FetchTile = (z: number, y: number, x: number) => Promise<Response>;
export type FetchCredit = () => Promise<string | null>;

export const esriTiles =
  (key: string): FetchTile =>
  (z, y, x) =>
    fetch(`${ESRI_SERVICE}/tile/${z}/${y}/${x}?token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });

/** The service's copyrightText: the imagery providers Esri's terms say to credit. */
export const esriCredit =
  (key: string): FetchCredit =>
  async () => {
    const res = await fetch(`${ESRI_SERVICE}?f=json&token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(5_000) });
    if (!res.ok) return null;
    const text = ((await res.json()) as { copyrightText?: unknown }).copyrightText;
    return typeof text === "string" && text.trim() ? text.trim() : null;
  };

/**
 * Satellite tiles go through us so the Esri key never ships in the apps and every tile is counted.
 * Map libraries can't add our sign-in header to tile requests, so a signed-in caller gets a link signed with the key
 * that works for a couple of hours.
 */
export const imageryRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const key = deps.imagery?.key;
  const sign = (exp: string) => createHmac("sha256", key!).update(`imagery:${exp}`).digest("base64url");
  let credit = { text: FALLBACK_CREDIT, until: 0 };
  const currentCredit = async () => {
    const now = deps.now().getTime();
    if (now >= credit.until) {
      const text = await (deps.imagery!.fetchCredit ?? esriCredit(key!))().catch(() => null);
      // A failed read keeps the last list and tries again in an hour.
      credit = { text: text ?? credit.text, until: now + (text ? CREDIT_HOURS : 1) * 3600_000 };
    }
    return credit.text;
  };

  app.get("/imagery", async () => {
    if (!key) return { tiles: null };
    const exp = String(Math.floor(deps.now().getTime() / 1000) + LINK_HOURS * 3600);
    return { tiles: `/imagery/{z}/{y}/{x}?exp=${exp}&sig=${sign(exp)}`, attribution: `Powered by Esri | ${await currentCredit()}` };
  });

  app.get<{ Params: { z: string; y: string; x: string }; Querystring: { exp?: string; sig?: string } }>(
    "/imagery/:z/:y/:x",
    { config: { signedLink: true } },
    async (req, reply) => {
      if (!key) throw notFound();
      const { exp = "", sig = "" } = req.query;
      const want = Buffer.from(sign(exp));
      const got = Buffer.from(sig);
      if (got.length !== want.length || !timingSafeEqual(got, want) || Number(exp) * 1000 < deps.now().getTime()) throw new HttpError(403, "this map link has expired");
      const [z, y, x] = [req.params.z, req.params.y, req.params.x].map(Number) as [number, number, number];
      if (![z, y, x].every(Number.isInteger) || z < 0 || z > 23 || y < 0 || x < 0 || y >= 2 ** z || x >= 2 ** z) throw notFound();
      await countUsage(deps.db, "imagery_tile", deps.now());
      const res = await (deps.imagery!.fetchTile ?? esriTiles(key))(z, y, x).catch(() => null);
      if (!res?.ok) throw new HttpError(res?.status === 404 ? 404 : 502, "no imagery for this spot");
      return reply
        .header("content-type", res.headers.get("content-type") ?? "image/jpeg")
        .header("cache-control", "private, max-age=86400")
        .send(Buffer.from(await res.arrayBuffer()));
    },
  );
};
