export type ParcelResult = {
  id: string;
  parcel: string;
  commune: string;
  county: string;
  voivodeship: string;
  geometry: {
    type: "Polygon" | "MultiPolygon";
    coordinates: number[][][] | number[][][][];
  } | null;
};
