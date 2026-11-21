import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./styles.css";
import { initScript } from "./accessibility";
import AccessibilityMenu from "./components/AccessibilityMenu";

export const metadata: Metadata = {
  title: "Ziemowit – grunt to nawodnienie",
  description: "Ziemowit – asystent wodny rolnika. Sprawdź opady, wilgotność gleby i zalecenia dla swojej działki.",
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
