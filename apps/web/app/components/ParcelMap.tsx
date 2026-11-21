"use client";

import { useEffect } from "react";
import * as L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents, GeoJSON, CircleMarker } from "react-leaflet";
import type { Geometry } from "geojson";
import type { ParcelResult } from "../types";

const POLAND_BOUNDS = L.latLngBounds([48.7, 13.7], [55.1, 24.5]);

function LimitToPoland() {
  const map = useMap();
  useEffect(() => {
    const updateMinZoom = () => {
      const zoom = map.getBoundsZoom(POLAND_BOUNDS, false);
      map.setMinZoom(zoom);
      map.fitBounds(POLAND_BOUNDS, {
        animate: false,
        padding: [8, 8],
      });
    };
    updateMinZoom();
    map.on("resize", updateMinZoom);
    return () => { map.off("resize", updateMinZoom); };
  }, [map]);
  return null;
}

function MapClick({ onSelectPoint }: { onSelectPoint: (lat: number, lng: number) => void }) {
  useMapEvents({ click: ({ latlng }) => onSelectPoint(latlng.lat, latlng.lng) });
  return null;
}

function FitParcel({ parcel }: { parcel: ParcelResult | null }) {
  const map = useMap();
  useEffect(() => {
    if (!parcel?.geometry) return;
    const layer = L.geoJSON(parcel.geometry as Geometry);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [32, 32], maxZoom: 17 });
  }, [map, parcel]);
  return null;
}

export default function ParcelMap({ onSelectPoint, parcel, className = "map-frame" }: {
  onSelectPoint?: (lat: number, lng: number) => void;
  parcel: ParcelResult | null;
  className?: string;
}) {
  return (
    <div className={className}>
      <MapContainer
        center={[52.1, 19.4]}
        zoom={6}
        maxBounds={POLAND_BOUNDS}
        maxBoundsViscosity={1}
        scrollWheelZoom
        className="leaflet-map"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          maxZoom={19}
        />
        <LimitToPoland />
        {onSelectPoint && <MapClick onSelectPoint={onSelectPoint} />}
        <FitParcel parcel={parcel} />
        {parcel?.geometry && <GeoJSON key={parcel.id} data={parcel.geometry as Geometry} style={{ color: "#16805b", weight: 3, fillColor: "#36b37e", fillOpacity: 0.25 }} />}
        {parcel?.lat != null && parcel?.lng != null && (
          <CircleMarker
            center={[parcel.lat, parcel.lng]}
            radius={7}
            pathOptions={{ color: "#ffffff", fillColor: "#d97706", fillOpacity: 1, weight: 2 }}
          />
        )}
      </MapContainer>
    </div>
  );
}
