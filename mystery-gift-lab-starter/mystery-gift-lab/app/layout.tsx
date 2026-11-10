import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "神秘禮物研究所｜Mystery Gift Lab",
  description: "一起猜心意，交換一份神秘驚喜！"
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-Hant">
      <body>{children}</body>
    </html>
  );
}