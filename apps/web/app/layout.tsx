import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";

export const metadata: Metadata = {
  title: "Zatrzymaj wodę, chroń plony",
  description: "Wybierz działkę i sprawdź jej położenie.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
