"use client";

import { useEffect, useRef, useState } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { MapContainer, Marker, TileLayer, useMapEvents } from "react-leaflet";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, Search } from "lucide-react";

// Leaflet's default marker icon paths assume a plain <img> setup, which
// breaks under a bundler - point them at the actual imported asset URLs
// instead of Leaflet's own relative-path guesses.
import markerIcon2x from "leaflet/dist/images/marker-icon-2x.png";
import markerIcon from "leaflet/dist/images/marker-icon.png";
import markerShadow from "leaflet/dist/images/marker-shadow.png";

L.Icon.Default.mergeOptions({
  iconRetinaUrl: markerIcon2x.src,
  iconUrl: markerIcon.src,
  shadowUrl: markerShadow.src,
});

const DEFAULT_CENTER: [number, number] = [22.9734, 78.6569]; // India, roughly centred
const DEFAULT_ZOOM = 5;

type NominatimResult = { display_name: string; lat: string; lon: string };

async function reverseGeocode(lat: number, lon: number) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`
    );
    const data = await res.json();
    return data.display_name as string | undefined;
  } catch {
    return undefined;
  }
}

function ClickToPlace({ onPlace }: { onPlace: (lat: number, lon: number) => void }) {
  useMapEvents({
    click(e) {
      onPlace(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

export function LocationPicker({
  latitude,
  longitude,
  address,
  onChange,
}: {
  latitude: number | null;
  longitude: number | null;
  address: string;
  onChange: (value: { latitude: number; longitude: number; address: string }) => void;
}) {
  const [query, setQuery] = useState(address);
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<NominatimResult[]>([]);
  const mapRef = useRef<L.Map | null>(null);
  const position: [number, number] | null = latitude != null && longitude != null ? [latitude, longitude] : null;

  useEffect(() => {
    if (position && mapRef.current) mapRef.current.setView(position, 15);
    // Only re-center when the picked point itself changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [latitude, longitude]);

  async function place(lat: number, lon: number) {
    const label = (await reverseGeocode(lat, lon)) ?? query;
    onChange({ latitude: lat, longitude: lon, address: label });
    setQuery(label);
  }

  async function search(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    setSearching(true);
    setResults([]);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(query)}`
      );
      setResults(await res.json());
    } catch {
      // Silent: Nominatim being briefly unreachable shouldn't block onboarding.
    } finally {
      setSearching(false);
    }
  }

  function pickResult(r: NominatimResult) {
    const lat = Number(r.lat);
    const lon = Number(r.lon);
    onChange({ latitude: lat, longitude: lon, address: r.display_name });
    setQuery(r.display_name);
    setResults([]);
    mapRef.current?.setView([lat, lon], 15);
  }

  return (
    <div className="space-y-2">
      <form onSubmit={search} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search for an address"
          className="pl-9 pr-9"
        />
        {searching && <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </form>

      {results.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-border">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onClick={() => pickResult(r)}
              className="block w-full truncate px-3 py-2 text-left text-xs hover:bg-muted"
            >
              {r.display_name}
            </button>
          ))}
        </div>
      )}

      <div className="h-56 overflow-hidden rounded-xl border border-border">
        <MapContainer
          center={position ?? DEFAULT_CENTER}
          zoom={position ? 15 : DEFAULT_ZOOM}
          style={{ height: "100%", width: "100%" }}
          ref={mapRef}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ClickToPlace onPlace={place} />
          {position && (
            <Marker
              position={position}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const m = e.target as L.Marker;
                  const { lat, lng } = m.getLatLng();
                  place(lat, lng);
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <MapPin className="h-3.5 w-3.5 shrink-0" />
        Search, click the map, or drag the pin to place it. Optional - skip if you&apos;d rather not.
      </p>
    </div>
  );
}
