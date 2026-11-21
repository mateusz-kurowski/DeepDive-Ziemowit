import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Zatrzymaj wodę",
  description: "Wstępny szkic aplikacji HackNation",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pl">
      <body>{children}</body>
    </html>
  );
}
