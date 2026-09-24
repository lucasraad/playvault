import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gamer Profile",
  description: "Fundação do projeto Gamer Profile.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
