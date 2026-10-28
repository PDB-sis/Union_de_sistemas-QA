import type { Metadata, Viewport } from "next";
import "@fontsource-variable/manrope";
import "@fontsource-variable/jetbrains-mono";
import "../frontend/styles/globals.css";
import { ThemeProvider } from "@frontend/components/theme-provider";
import { paletteBootScript } from "@frontend/lib/palette";

export const metadata: Metadata = {
  title: { default: "PDMC · Panel de Mejora Continua", template: "%s · PDMC" },
  description:
    "Plataforma operativa para controlar transferencias, recepciones, inconsistencias, negativos, devoluciones y facturación.",
  applicationName: "PDMC",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f4ea" },
    { media: "(prefers-color-scheme: dark)", color: "#0e1630" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: paletteBootScript }} /></head>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
