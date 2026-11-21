import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { initScript } from "./accessibility";
import AccessibilityMenu from "./components/AccessibilityMenu";

export const metadata: Metadata = {
  title: "Zatrzymaj wodę, chroń plony",
  description: "Wybierz działkę i sprawdź jej położenie.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: initScript }} />
      </head>
      <body>
        <AccessibilityMenu />
        {children}
      </body>
    </html>
  );
}
