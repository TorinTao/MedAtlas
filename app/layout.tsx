import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MedAtlas | 医学多模态研究星图",
  description: "沿时间轴探索医学多模态 Agent 文献、证据与可执行研究选题。",
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
    <html lang="zh-CN">
      <body className="antialiased">{children}</body>
    </html>
  );
}
