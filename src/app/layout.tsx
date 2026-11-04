import type { Metadata, Viewport } from "next";
import { QueryProvider } from "@/components/query-provider";
import "pretendard/dist/web/variable/pretendardvariable-dynamic-subset.css";
import "./globals.css";
import "./enhancements.css";
import "./sky.css";

const TITLE = "Daylog — 개인 맞춤형 실시간 정보판";
const DESCRIPTION = "내 위치의 날씨·대기질부터 시세·환율·지진·우주날씨까지. 출처와 시각을 숨기지 않고, 날짜별 기록을 자동으로 쌓아 3D로 보여 주는 실시간 정보판.";

export const metadata: Metadata = {
  title: { default: TITLE, template: "%s · Daylog" },
  description: DESCRIPTION,
  applicationName: "Daylog",
  keywords: ["실시간 정보판", "날씨", "미세먼지", "환율", "비트코인", "지진", "데이터 시각화", "3D"],
  openGraph: { type: "website", locale: "ko_KR", siteName: "Daylog", title: TITLE, description: DESCRIPTION },
  twitter: { card: "summary", title: TITLE, description: DESCRIPTION },
  formatDetection: { telephone: false, address: false, email: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#11120f" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko" suppressHydrationWarning>
      <body>
        <a className="skip-link" href="#main">본문으로 건너뛰기</a>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
