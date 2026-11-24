import { useQuery } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import type * as maplibregl from "maplibre-gl";
import type { Place, PlaceInput, PlaceSearchResult } from "../api/types";
import { useDeletePlace, useSavePlace } from "../api/hooks";
import { api, errorMessage } from "../api/client";
import { API_URL } from "../env";
import { useRel } from "../lib/relationship";
import { FormSheet, Icon, Spinner, TextField, cx, useSnackbar } from "./ui";

/** Free OpenStreetMap tiles; no key or billing account needed. */
const STYLE = "https://tiles.openfreemap.org/styles/liberty";
export const MIN_RADIUS = 100;
export const MAX_RADIUS = 2000;

/** A polygon approximating a circle of [radiusM] metres around a point, for drawing the radius. */
function circle(lng: number, lat: number, radiusM: number) {
  const pts: [number, number][] = [];
  const dLat = radiusM / 111_320;
  const dLng = radiusM / (111_320 * Math.cos((lat * Math.PI) / 180));
  for (let i = 0; i <= 64; i++) {
    const a = (i / 64) * 2 * Math.PI;
    pts.push([lng + dLng * Math.cos(a), lat + dLat * Math.sin(a)]);
  }
  return { type: "Feature" as const, properties: {}, geometry: { type: "Polygon" as const, coordinates: [pts] } };
}

/** MapLibre 6 draws with WebGL 2 only; without it (hardware acceleration off, old GPU or driver) the map can't start. */
function canDrawMap() {
  try {
    return !!document.createElement("canvas").getContext("webgl2");
  } catch {
    return false;
  }
}

/** The zoom at which the circle comfortably fills the map. */
const zoomFor = (radiusM: number, lat: number) => Math.max(10, Math.min(18, Math.log2((156_543 * Math.cos((lat * Math.PI) / 180) * 160) / radiusM)));

/**
 * A map with a fixed pin in the middle and the place's radius around it. Dragging the map moves the pin.
 * Read-only maps (thumbnails, previews) don't move.
 */
export function PlaceMap({
  lat,
  lng,
  radiusM,
  onMove,
  className,
  interactive = true,
  imagery = null,
  satellite = false,
}: {
  lat: number;
  lng: number;
  radiusM: number;
  onMove?(p: { lat: number; lng: number }): void;
  className?: string;
  interactive?: boolean;
  /** Where satellite tiles come from, when the server offers them. */
  imagery?: Imagery | null;
  /** Show the satellite photo instead of the street map. */
  satellite?: boolean;
}) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const radius = useRef(radiusM);
  radius.current = radiusM;
  const photo = useRef({ imagery, satellite });
  photo.current = { imagery, satellite };
  const moved = useRef(onMove);
  moved.current = onMove;
  const [drawable] = useState(canDrawMap);

  useEffect(() => {
    if (!el.current || !drawable) return;
    let gone = false;
    let made: maplibregl.Map | null = null;
    // The map library is big, so it loads only when a map is first shown.
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"), import("maplibre-gl/dist/maplibre-gl.css")]).then(
      ([lib, { default: workerUrl }]) => {
        if (gone || !el.current) return;
        // MapLibre 6 looks for its worker beside its own file, which bundling moves; point it at the bundled one.
        lib.setWorkerUrl(workerUrl);
        made = make(lib, el.current);
      },
    );
    return () => {
      gone = true;
      try {
        made?.remove();
      } catch {
        // A map that failed partway through starting can throw while being torn down; it's going away regardless.
      }
    };
    // The map is made once; later changes move it below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function make(lib: typeof maplibregl, container: HTMLElement) {
    const m = new lib.Map({
      container,
      style: STYLE,
      center: [lng, lat],
      zoom: zoomFor(radiusM, lat),
      interactive,
      attributionControl: false,
    });
    // Top right, so the credit doesn't cover the dialog's hint and locate button along the bottom.
    m.addControl(new lib.AttributionControl({ compact: true }), "top-right");
    map.current = m;
    const draw = () => {
      const c = m.getCenter();
      const src = m.getSource("radius") as maplibregl.GeoJSONSource | undefined;
      src?.setData(circle(c.lng, c.lat, radius.current));
    };
    m.on("load", () => {
      showPhoto(m);
      m.addSource("radius", { type: "geojson", data: circle(lng, lat, radiusM) });
      m.addLayer({ id: "radius-fill", type: "fill", source: "radius", paint: { "fill-color": "#9C4332", "fill-opacity": 0.14 } });
      m.addLayer({ id: "radius-line", type: "line", source: "radius", paint: { "line-color": "#9C4332", "line-width": 2 } });
    });
    m.on("move", draw);
    m.on("moveend", () => {
      const c = m.getCenter();
      moved.current?.({ lat: c.lat, lng: c.lng });
    });
    return m;
  }

  /** Adds the satellite layer once tiles are on offer, under the radius, and shows or hides it. */
  function showPhoto(m: maplibregl.Map) {
    const { imagery: tiles, satellite: on } = photo.current;
    if (!tiles || !m.isStyleLoaded()) return;
    if (!m.getSource("imagery")) {
      // 256 px tiles; past level 19 Esri's photos run out in most places, so the map stretches the last ones.
      m.addSource("imagery", { type: "raster", tiles: [API_URL + tiles.tiles], tileSize: 256, maxzoom: 19 });
      m.addLayer({ id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } }, m.getLayer("radius-fill") ? "radius-fill" : undefined);
    }
    m.setLayoutProperty("imagery", "visibility", on ? "visible" : "none");
  }

  useEffect(() => {
    if (map.current) showPhoto(map.current);
    // showPhoto reads the latest values itself.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imagery, satellite]);

  // A new spot from search or "my location" recentres the map; the pin follows.
  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    if (Math.abs(c.lat - lat) > 1e-6 || Math.abs(c.lng - lng) > 1e-6) m.jumpTo({ center: [lng, lat], zoom: Math.max(m.getZoom(), zoomFor(radiusM, lat) - 1) });
  }, [lat, lng, radiusM]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    const c = m.getCenter();
    (m.getSource("radius") as maplibregl.GeoJSONSource | undefined)?.setData(circle(c.lng, c.lat, radiusM));
  }, [radiusM]);

  return (
    <div className={cx("relative overflow-hidden bg-surface-container-highest", className)}>
      {/* Sized inline: MapLibre's own stylesheet sets position: relative on this element, and as unlayered CSS it
          beats Tailwind's layered "absolute", which left the map 0 px tall. */}
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
      {!drawable && (
        <p className="absolute inset-x-4 top-4 text-center text-body-medium text-on-surface-variant">
          This browser can't draw the map. Turn on hardware acceleration, or search for the address instead.
        </p>
      )}
      {/* The pin stays in the middle; its point is the place. */}
      <svg viewBox="-16 -44 32 46" className="pointer-events-none absolute top-1/2 left-1/2 h-11 w-8 -translate-x-1/2 -translate-y-full" aria-hidden>
        <path d="M0 0 C -4 -10, -14 -16, -14 -28 A 14 14 0 1 1 14 -28 C 14 -16, 4 -10, 0 0 Z" className="fill-primary stroke-surface" strokeWidth="2" />
        <circle cx="0" cy="-28" r="5" className="fill-surface" />
      </svg>
    </div>
  );
}

/** Every saved place as a circle with its name, framed to fit them all (mockup 22). It doesn't move. */
export function PlacesMap({ places, className }: { places: Pick<Place, "id" | "name" | "lat" | "lng" | "radiusM">[]; className?: string }) {
  const el = useRef<HTMLDivElement>(null);
  const [drawable] = useState(canDrawMap);
  const key = places.map((p) => `${p.id}:${p.lat}:${p.lng}:${p.radiusM}:${p.name}`).join("|");
  useEffect(() => {
    if (!el.current || !drawable || !places.length) return;
    let gone = false;
    let made: maplibregl.Map | null = null;
    void Promise.all([import("maplibre-gl"), import("maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url"), import("maplibre-gl/dist/maplibre-gl.css")]).then(
      ([lib, { default: workerUrl }]) => {
        if (gone || !el.current) return;
        lib.setWorkerUrl(workerUrl);
        const circles = places.map((p) => circle(p.lng, p.lat, p.radiusM));
        const bounds = new lib.LngLatBounds();
        circles.forEach((c) => c.geometry.coordinates[0]!.forEach((pt) => bounds.extend(pt)));
        const m = new lib.Map({
          container: el.current,
          style: STYLE,
          bounds,
          fitBoundsOptions: { padding: 48, maxZoom: 16 },
          interactive: false,
          attributionControl: false,
        });
        m.addControl(new lib.AttributionControl({ compact: true }), "bottom-right");
        m.on("load", () => {
          m.addSource("places", { type: "geojson", data: { type: "FeatureCollection", features: circles } });
          m.addLayer({ id: "places-fill", type: "fill", source: "places", paint: { "fill-color": "#9C4332", "fill-opacity": 0.14 } });
          m.addLayer({ id: "places-line", type: "line", source: "places", paint: { "line-color": "#9C4332", "line-width": 2 } });
          m.addSource("labels", {
            type: "geojson",
            data: {
              type: "FeatureCollection",
              features: places.map((p) => ({
                type: "Feature" as const,
                properties: { name: p.name },
                geometry: { type: "Point" as const, coordinates: [p.lng, p.lat] },
              })),
            },
          });
          m.addLayer({
            id: "places-label",
            type: "symbol",
            source: "labels",
            layout: { "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 13 },
            paint: { "text-color": "#1F1A17", "text-halo-color": "#FFFFFF", "text-halo-width": 1.5 },
          });
        });
        made = m;
      },
    );
    return () => {
      gone = true;
      try {
        made?.remove();
      } catch {
        // Going away regardless.
      }
    };
    // Redrawn when the places change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, drawable]);
  if (!drawable || !places.length) return null;
  return (
    <div className={cx("relative overflow-hidden bg-surface-container-highest", className)}>
      <div ref={el} style={{ position: "absolute", inset: 0 }} />
    </div>
  );
}

/** The satellite tile link the server hands out; null tiles when it has no imagery key. */
type Imagery = { tiles: string; attribution: string };

/** Satellite tiles, when the server has them. The signed link lasts two hours, so it's fetched again after one. */
function useImagery(enabled: boolean) {
  return useQuery({
    queryKey: ["imagery"],
    queryFn: async () => {
      const r = await api<{ tiles: string | null; attribution?: string }>("/imagery");
      return r.tiles ? { tiles: r.tiles, attribution: r.attribution ?? "" } : null;
    },
    enabled,
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
  });
}

/** Looks up addresses and businesses, nearest to [near] first, through our server. The [chosen] address isn't searched again. */
function useAddressSearch(q: string, near: { lat: number; lng: number }, chosen: string | null) {
  const [found, setFound] = useState<PlaceSearchResult[]>([]);
  const [state, setState] = useState<"idle" | "searching" | "done" | "failed">("idle");
  useEffect(() => {
    setFound([]);
    if (q.trim().length < 3 || q === chosen) return setState("idle");
    setState("searching");
    let gone = false;
    const t = setTimeout(() => {
      api<PlaceSearchResult[]>(`/places/search?${new URLSearchParams({ q, lat: String(near.lat), lng: String(near.lng) })}`)
        .then((r) => !gone && (setFound(r), setState("done")))
        .catch(() => !gone && setState("failed"));
    }, 350);
    return () => {
      gone = true;
      clearTimeout(t);
    };
    // Only a new query searches again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);
  return { found, state };
}

export const fmtRadius = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m % 1000 ? 1 : 0)} km` : `${m} m`);

/** Add or change a place: search or drag the map, name it, and set how close counts. */
export function PlaceDialog({ place, open, onClose, onSaved }: { place: Place | null; open: boolean; onClose(): void; onSaved?(p: Place): void }) {
  const { rel } = useRel();
  const snack = useSnackbar();
  const save = useSavePlace(rel.id);
  const remove = useDeletePlace(rel.id);
  const [draft, setDraft] = useState<PlaceInput>({ name: "", address: null, lat: 40.7128, lng: -74.006, radiusM: 150 });
  const [q, setQ] = useState("");
  // The address picked from the list stays in the field without searching for it again.
  const [chosen, setChosen] = useState<string | null>(null);
  const [located, setLocated] = useState(false);
  const [satellite, setSatellite] = useState(false);
  const imagery = useImagery(open).data ?? null;
  const { found, state: searching } = useAddressSearch(q, draft, chosen);

  useEffect(() => {
    if (!open) return;
    setQ(place?.address ?? "");
    setChosen(place?.address ?? null);
    if (place) return setDraft({ name: place.name, address: place.address, lat: place.lat, lng: place.lng, radiusM: place.radiusM });
    setDraft({ name: "", address: null, lat: 40.7128, lng: -74.006, radiusM: 150 });
    setLocated(false);
    // A new place starts where the Dominant is, when the browser says.
    navigator.geolocation?.getCurrentPosition(
      (pos) => {
        setLocated(true);
        setDraft((d) => ({ ...d, lat: pos.coords.latitude, lng: pos.coords.longitude }));
      },
      () => undefined,
      { timeout: 10_000 },
    );
  }, [open, place]);

  const set = (p: Partial<PlaceInput>) => setDraft((d) => ({ ...d, ...p }));
  const pick = (f: PlaceSearchResult) => {
    const address = [f.name, f.address].filter(Boolean).join(", ").slice(0, 200);
    set({ lat: f.lat, lng: f.lng, address, name: draft.name || f.name.slice(0, 40) });
    setChosen(address);
    setQ(address);
  };
  const valid = draft.name.trim().length > 0;
  const submit = () =>
    save.mutate(
      { id: place?.id, input: draft },
      {
        onSuccess: (p) => {
          snack(place ? "Place saved" : `${p.name} added`);
          onSaved?.(p);
          onClose();
        },
        onError: (e) => snack(errorMessage(e)),
      },
    );

  if (!open) return null;
  return (
    <FormSheet title={place ? "Edit place" : "New place"} onClose={onClose} onSave={submit} saving={save.isPending} canSave={valid}>
      <div className="relative">
        <label className="flex items-center gap-3 border-b border-outline-variant py-3 focus-within:border-on-surface">
          <Icon name="search" className="text-on-surface-variant" />
          <input
            aria-label="Search an address or business"
            placeholder="Search an address or business"
            // Our own suggestions only: the browser's saved addresses would cover them.
            name="fealty-place-search"
            autoComplete="off"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={found.length > 0}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            // Enter takes the top match, so it doesn't submit the form or look like nothing happened.
            onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), found[0] && pick(found[0]))}
            className="min-w-0 flex-1 bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant"
          />
          {searching === "searching" && <Spinner size={20} />}
        </label>
        {(searching === "done" && !found.length) || searching === "failed" ? (
          <p className={cx("mt-1 text-body-medium", searching === "failed" ? "text-error" : "text-on-surface-variant")}>
            {searching === "failed" ? "Search isn't working right now. Drag the map to the spot instead." : "No matches. Try just the street and city."}
          </p>
        ) : null}
        {found.length > 0 && (
          <ul className="absolute inset-x-0 top-full z-20 mt-1 overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest">
            {found.map((f, i) => (
              <li key={i} className="border-t border-outline-variant first:border-t-0">
                <button type="button" className="state-layer flex w-full flex-col px-4 py-2.5 text-left" onClick={() => pick(f)}>
                  <span className="truncate text-body-large text-on-surface">{f.name}</span>
                  <span className="truncate text-body-medium text-on-surface-variant">{f.address}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div>
        <div className="relative">
          <PlaceMap
            lat={draft.lat}
            lng={draft.lng}
            radiusM={draft.radiusM}
            onMove={(c) => set(c)}
            imagery={imagery}
            satellite={satellite}
            className="h-72 rounded-md border border-outline-variant md:h-80"
          />
          {imagery && (
            <div className="absolute top-3 right-3 flex rounded-full border border-outline-variant bg-surface-container-lowest p-1">
              {[false, true].map((on) => (
                <button
                  key={String(on)}
                  type="button"
                  aria-pressed={satellite === on}
                  onClick={() => setSatellite(on)}
                  className={cx("h-8 rounded-full px-4 text-label-large", satellite === on ? "bg-on-surface text-surface" : "text-on-surface-variant")}
                >
                  {on ? "Satellite" : "Map"}
                </button>
              ))}
            </div>
          )}
          {/* Esri's terms want its credit always visible while the photos are showing, not behind the map's info button. */}
          {imagery && satellite && (
            <span className="pointer-events-none absolute right-3 bottom-3 left-3 text-right">
              <span className="rounded-xs bg-inverse-surface/70 px-1.5 py-0.5 text-label-small text-inverse-on-surface">{imagery.attribution}</span>
            </span>
          )}
        </div>
        <p className="mt-2 text-body-large text-on-surface-variant">
          {!place && chosen && q === chosen
            ? "Search can be a few houses off. Drag the map until the pin is on the building."
            : "Drag the map to move the pin."}{" "}
          <button
            type="button"
            className="text-primary"
            onClick={() =>
              navigator.geolocation?.getCurrentPosition(
                (pos) => (setLocated(true), set({ lat: pos.coords.latitude, lng: pos.coords.longitude })),
                () => snack("Allow location in your browser to use this"),
              )
            }
          >
            Use my location
          </button>
        </p>
        {!place && !located && !chosen && <p className="text-body-medium text-on-surface-variant">Or search for the address above.</p>}
      </div>
      <TextField label="Name" value={draft.name} maxLength={40} onChange={(e) => set({ name: e.target.value })} placeholder="Gym, Home, Work" />
      <div>
        <div className="text-body-medium text-on-surface-variant">Radius · {fmtRadius(draft.radiusM)}</div>
        <input
          type="range"
          aria-label="Radius"
          min={MIN_RADIUS}
          max={MAX_RADIUS}
          step={50}
          value={draft.radiusM}
          onChange={(e) => set({ radiusM: Number(e.target.value) })}
          className="my-3 w-full accent-on-surface"
        />
        <p className="text-body-medium text-on-surface-variant">
          Arriving anywhere inside the circle counts. At least 100 m, since phones can't tell much closer.
        </p>
      </div>
      {place && (
        <button
          type="button"
          disabled={remove.isPending}
          className="self-start text-body-large text-error disabled:opacity-40"
          onClick={() => remove.mutate(place.id, { onSuccess: () => (snack("Place deleted"), onClose()), onError: (e) => snack(errorMessage(e)) })}
        >
          Delete this place
        </button>
      )}
    </FormSheet>
  );
}
