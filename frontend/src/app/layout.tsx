import type { Metadata } from "next";
import "./globals.css";
import "./atelier.css";
import "./salon.css";
import "./navigation.css";
import "./clock.css";
import "./shri.css";
export const metadata: Metadata = {
  title: "Sesh — Virtual Study Room",
  description:
    "A quiet space to study. Track your time, understand your rhythm, and make room for what matters.",
  icons: { icon: "/favicon.svg" },
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  );
}
