type SparklineProps = {
  values: number[];
  width?: number;
  height?: number;
  label: string;
};

/** 의존성 없는 SVG 스파크라인. 값이 1개면 점, 2개 이상이면 면적+선(그리기 모션). */
export function Sparkline({ values, width = 160, height = 44, label }: SparklineProps) {
  const pad = 4;
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (index: number) => (values.length === 1 ? width / 2 : pad + (index * (width - pad * 2)) / (values.length - 1));
  const y = (value: number) => (max === min ? height / 2 : height - pad - ((value - min) / (max - min)) * (height - pad * 2));
  const points = values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`);
  const last = values.length - 1;

  return (
    <svg className="sparkline" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label} preserveAspectRatio="none">
      {values.length > 1 && (
        <>
          <polygon className="sparkline__area" points={`${x(0)},${height} ${points.join(" ")} ${x(last)},${height}`} />
          <polyline className="sparkline__line" points={points.join(" ")} pathLength={1} />
        </>
      )}
      <circle className="sparkline__dot" cx={x(last)} cy={y(values[last])} r={3.2} />
    </svg>
  );
}
