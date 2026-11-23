import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Вертипорты Москвы · eVTOL · демо-панель",
  description: "P01 · трек 04 · КОНТУР Н · НИУ МГСУ",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
