/** 한국 환경부 PM2.5 등급 기준(24시간 평균 기준 값을 현재값에 준용). */
export function pm25Grade(value: number): string {
  if (value <= 15) return "좋음";
  if (value <= 35) return "보통";
  if (value <= 75) return "나쁨";
  return "매우 나쁨";
}

export function uvGrade(value: number): string {
  if (value < 3) return "낮음";
  if (value < 6) return "보통";
  if (value < 8) return "높음";
  if (value < 11) return "매우 높음";
  return "위험";
}
