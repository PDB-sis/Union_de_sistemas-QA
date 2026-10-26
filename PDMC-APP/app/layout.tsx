import type { Metadata } from "next";
import "../frontend/styles/globals.css";
import { ThemeProvider } from "@frontend/components/theme-provider";

export const metadata: Metadata = {
  title: "Panel de Mejora Continua",
  description:
    "Centro personal para priorizar transferencias, incidencias, negativos y proyectos de mejora.",
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased"><ThemeProvider>{children}</ThemeProvider></body>
    </html>
  );
}
