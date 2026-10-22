import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { Deps } from "../app.js";
import { HttpError, notFound } from "../errors.js";
import { countUsage } from "../services/usage.js";

/** Esri's World Imagery, the satellite view behind the place picker. 256 px tiles. */
const ESRI_IMAGERY = "https://ibasemaps-api.arcgis.com/arcgis/rest/services/World_Imagery/MapServer/tile";
/** How long a handed-out tile link works; a place dialog is open for minutes, not hours. */
const LINK_HOURS = 2;

export type FetchTile = (z: number, y: number, x: number) => Promise<Response>;

export const esriTiles =
  (key: string): FetchTile =>
  (z, y, x) =>
    fetch(`${ESRI_IMAGERY}/${z}/${y}/${x}?token=${encodeURIComponent(key)}`, { signal: AbortSignal.timeout(10_000) });

/**
 * Satellite tiles go through us so the Esri key never ships in the apps and every tile is counted.
 * Map libraries can't add our sign-in header to tile requests, so a signed-in caller gets a link signed with the key
 * that works for a couple of hours.
 */
export const imageryRoutes = (deps: Deps) => async (app: FastifyInstance) => {
  const key = deps.imagery?.key;
  const sign = (exp: string) => createHmac("sha256", key!).update(`imagery:${exp}`).digest("base64url");

  app.get("/imagery", async () => {
    if (!key) return { tiles: null };
    const exp = String(Math.floor(deps.now().getTime() / 1000) + LINK_HOURS * 3600);
    return { tiles: `/imagery/{z}/{y}/{x}?exp=${exp}&sig=${sign(exp)}`, attribution: "Powered by Esri | Esri, Maxar, Earthstar Geographics, and the GIS User Community" };
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
