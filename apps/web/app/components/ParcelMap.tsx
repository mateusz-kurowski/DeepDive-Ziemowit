"use client";

import { useEffect } from "react";
import * as L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents, GeoJSON, CircleMarker, ImageOverlay } from "react-leaflet";
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

export default function ParcelMap({ onSelectPoint, parcel, showDroughtLayer }: {
  onSelectPoint: (lat: number, lng: number) => void;
  parcel: ParcelResult | null;
  showDroughtLayer: boolean;
}) {
  const droughtBounds: [[number, number], [number, number]] | null =
    parcel?.lat != null && parcel?.lng != null
      ? [[parcel.lat - 0.012, parcel.lng - 0.018], [parcel.lat + 0.012, parcel.lng + 0.018]]
      : null;
  const droughtUrl = droughtBounds
    ? `https://sgeo.iung.pl/geoserver/Susza/wms?service=WMS&version=1.1.1&request=GetMap&layers=Susza:katgl_landuse2024&styles=&bbox=${droughtBounds[0][1]},${droughtBounds[0][0]},${droughtBounds[1][1]},${droughtBounds[1][0]}&width=600&height=400&srs=EPSG:4326&format=image/png&transparent=true`
    : null;

  return (
    <div className="map-frame">
      <MapContainer center={[52.1, 19.4]} zoom={6} scrollWheelZoom className="leaflet-map">
        <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
        <MapClick onSelectPoint={onSelectPoint} />
        <FitParcel parcel={parcel} />
        {showDroughtLayer && droughtUrl && droughtBounds && (
          <ImageOverlay
            key={`${parcel?.id}-drought`}
            url={droughtUrl}
            bounds={droughtBounds}
            opacity={0.72}
          />
        )}
        {parcel?.geometry && <GeoJSON key={parcel.id} data={parcel.geometry as Geometry} style={{ color: "#16805b", weight: 3, fillColor: "#36b37e", fillOpacity: 0.06 }} />}
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
