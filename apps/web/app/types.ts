export type ParcelResult = {
  id: string;
  parcel: string;
  commune: string;
  county: string;
  voivodeship: string;
  lat: number | null;
  lng: number | null;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
};
