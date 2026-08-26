import type { Metadata } from "next";
import { QueryProvider } from "@/components/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pulseboard — 실시간 정보판",
  description: "출처와 시각을 숨기지 않는 개인 맞춤형 실시간 정보판",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body><QueryProvider>{children}</QueryProvider></body>
    </html>
  );
}
