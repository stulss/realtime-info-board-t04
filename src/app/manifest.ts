import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Daylog — 개인 맞춤형 실시간 정보판",
    short_name: "Daylog",
    description: "출처와 시각을 숨기지 않는 개인 맞춤형 실시간 정보판",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f2ed",
    theme_color: "#d8ff3e",
    lang: "ko",
    icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" }],
  };
}
