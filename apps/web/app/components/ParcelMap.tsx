"use client";

import { useEffect } from "react";
import * as L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents, GeoJSON } from "react-leaflet";
import type { Geometry } from "geojson";
import type { ParcelResult } from "../types";

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

export default function ParcelMap({ onSelectPoint, parcel }: {
  onSelectPoint: (lat: number, lng: number) => void;
  parcel: ParcelResult | null;
}) {
  return (
    <div className="map-frame">
      <MapContainer center={[52.1, 19.4]} zoom={6} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClick onSelectPoint={onSelectPoint} />
        <FitParcel parcel={parcel} />
        {parcel?.geometry && <GeoJSON key={parcel.id} data={parcel.geometry as Geometry} style={{ color: "#16805b", weight: 3, fillColor: "#36b37e", fillOpacity: 0.25 }} />}
      </MapContainer>
    </div>
  );
}
