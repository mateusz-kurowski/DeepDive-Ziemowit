"use client";

import { Fragment, useEffect, useMemo } from "react";
import * as L from "leaflet";
import { MapContainer, TileLayer, useMap, useMapEvents, GeoJSON, CircleMarker, Tooltip } from "react-leaflet";
import type { Geometry } from "geojson";
import type { ParcelResult } from "../types";

const POLAND_BOUNDS = L.latLngBounds([48.7, 13.7], [55.1, 24.5]);

function LimitToPoland() {
  const map = useMap();
  useEffect(() => {
    const updateMinZoom = () => {
      const zoom = map.getBoundsZoom(POLAND_BOUNDS, false);
      map.setMinZoom(zoom);
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

function FitParcels({ parcels, fitTrigger }: { parcels: ParcelResult[]; fitTrigger: number }) {
  const map = useMap();
  const parcelsKey = useMemo(
    () => parcels.map((item) => `${item.id}:${item.lat ?? ""}:${item.lng ?? ""}`).join("|"),
    [parcels],
  );

  useEffect(() => {
    if (parcels.length === 0) return;
    const combinedBounds = L.latLngBounds([]);
    for (const item of parcels) {
      if (item.geometry) {
        const layer = L.geoJSON(item.geometry as Geometry);
        const bounds = layer.getBounds();
        if (bounds.isValid()) {
          combinedBounds.extend(bounds);
          continue;
        }
      }
      if (item.lat != null && item.lng != null) {
        combinedBounds.extend([item.lat, item.lng]);
      }
    }
    if (combinedBounds.isValid()) {
      map.whenReady(() => {
        if (!map.getContainer()?.isConnected) return;
        try {
          map.stop();
          map.invalidateSize({ animate: false });
          map.fitBounds(combinedBounds, {
            padding: parcels.length > 1 ? [40, 40] : [32, 32],
            maxZoom: 17,
            animate: false,
          });
        } catch {
          // Pominięcie przejściowego błędu warstw Leaflet podczas odmontowywania kontenera mapy.
        }
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, parcelsKey, fitTrigger]);
  return null;
}

export type MapFocus = {
  lat: number;
  lng: number;
  zoom: number;
  token: number;
};

function FlyToFocus({ focus }: { focus: MapFocus | null }) {
  const map = useMap();
  useEffect(() => {
    if (!focus) return;
    const target = L.latLng(focus.lat, focus.lng);
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduceMotion) map.setView(target, focus.zoom, { animate: false });
    else map.flyTo(target, focus.zoom, { duration: 1.15 });
  }, [map, focus]);
  return null;
}

export default function ParcelMap({
  onSelectPoint,
  onSelectParcel,
  parcel = null,
  parcels,
  activeParcelId = null,
  fitTrigger = 0,
  focus = null,
  className = "map-frame",
}: {
  onSelectPoint?: (lat: number, lng: number) => void;
  onSelectParcel?: (parcel: ParcelResult) => void;
  parcel?: ParcelResult | null;
  parcels?: ParcelResult[];
  activeParcelId?: string | null;
  fitTrigger?: number;
  focus?: MapFocus | null;
  className?: string;
}) {
  const effectiveParcels = useMemo(
    () => (parcels && parcels.length > 0 ? parcels : parcel ? [parcel] : []),
    [parcels, parcel],
  );
  const isMulti = effectiveParcels.length > 1;

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
        <FlyToFocus focus={focus} />
        {onSelectPoint && <MapClick onSelectPoint={onSelectPoint} />}
        <FitParcels parcels={effectiveParcels} fitTrigger={fitTrigger} />
        {effectiveParcels.map((item, index) => {
          const isActive = !isMulti || !activeParcelId || item.id === activeParcelId;
          const polygonStyle = !isMulti
            ? { color: "#16805b", weight: 3, fillColor: "#36b37e", fillOpacity: 0.25 }
            : isActive
              ? { color: "#0f5132", weight: 4, fillColor: "#2bb673", fillOpacity: 0.34 }
              : { color: "#176b4b", weight: 2.5, fillColor: "#36b37e", fillOpacity: 0.18 };

          return (
            <Fragment key={item.id}>
              {item.geometry && (
                <GeoJSON
                  key={`${item.id}-${isActive ? "active" : "idle"}`}
                  data={item.geometry as Geometry}
                  style={polygonStyle}
                  eventHandlers={onSelectParcel ? {
                    click: (event) => {
                      L.DomEvent.stopPropagation(event);
                      onSelectParcel(item);
                    },
                  } : undefined}
                >
                  {isMulti && (
                    <Tooltip sticky direction="top">
                      Działka {item.parcel}{item.commune ? ` · ${item.commune}` : ""} (#{index + 1})
                    </Tooltip>
                  )}
                </GeoJSON>
              )}
              {item.lat != null && item.lng != null && (
                <CircleMarker
                  center={[item.lat, item.lng]}
                  radius={!isMulti ? 7 : isActive ? 8 : 6}
                  pathOptions={{
                    color: "#ffffff",
                    fillColor: !isMulti || isActive ? "#d97706" : "#176b4b",
                    fillOpacity: 1,
                    weight: 2,
                  }}
                  eventHandlers={onSelectParcel ? {
                    click: (event) => {
                      L.DomEvent.stopPropagation(event);
                      onSelectParcel(item);
                    },
                  } : undefined}
                />
              )}
            </Fragment>
          );
        })}
      </MapContainer>
    </div>
  );
}
