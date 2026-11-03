import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "데이터 출처·개인정보",
  description: "Pulseboard가 쓰는 공개 데이터의 출처와 이용 조건, 위치·기록 등 개인정보 처리 방식을 안내합니다.",
};

type Source = { name: string; what: string; url: string; terms: string; note?: string };

const SOURCES: Source[] = [
  { name: "Open-Meteo", what: "내 위치 날씨·예보·대기질(CAMS 모델)과 과거 기온·PM2.5", url: "https://open-meteo.com/en/terms", terms: "CC BY 4.0 · 무료 API는 비상업적 이용 한정", note: "상업 서비스로 운영하려면 Open-Meteo의 상업용 구독이 필요합니다." },
  { name: "기상청 단기예보 · 에어코리아", what: "초단기실황, 시·도별 대기오염 측정값", url: "https://www.data.go.kr", terms: "공공데이터포털 이용허락 조건(공공누리)에 따름", note: "서버 환경변수 DATA_GO_KR_SERVICE_KEY가 있어야 표시됩니다." },
  { name: "USGS Earthquake Hazards Program", what: "최근 24시간·과거 일별 지진", url: "https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits", terms: "미국 정부 저작물(공개 도메인) · 출처 표기 권장" },
  { name: "NOAA SWPC · GFZ Potsdam", what: "지자기 Kp 지수(실시간·과거)", url: "https://www.swpc.noaa.gov/content/data-access", terms: "NOAA 공개 도메인 · GFZ는 CC BY 4.0", note: "GFZ Kp는 출처 표기가 필요합니다." },
  { name: "Upbit Open API", what: "BTC/KRW 시세와 일봉 종가", url: "https://docs.upbit.com", terms: "Upbit 이용약관·API 이용 조건에 따름" },
  { name: "CoinGecko", what: "ETH/USD 시세와 일별 가격", url: "https://www.coingecko.com/en/api/documentation", terms: "무료 공개 API는 호출 제한과 출처 표기 조건이 있습니다.", note: "Powered by CoinGecko API" },
  { name: "Frankfurter · 한국수출입은행", what: "USD/KRW 참조환율 · 고시환율", url: "https://frankfurter.dev", terms: "Frankfurter는 ECB 등 공식 참조환율을 무료 제공 · 수출입은행은 별도 인증키" },
  { name: "Open Notify", what: "ISS 현재 위치", url: "http://open-notify.org", terms: "공개 API" },
  { name: "Sensor.Community", what: "주변 시민 센서 PM2.5", url: "https://sensor.community", terms: "ODbL(데이터베이스 라이선스)" },
  { name: "Nager.Date", what: "한국 공휴일", url: "https://date.nager.at", terms: "MIT 라이선스 공개 API" },
  { name: "BigDataCloud", what: "좌표 → 지명 변환(역지오코딩)", url: "https://www.bigdatacloud.com/free-api/free-reverse-geocode-to-city-api", terms: "무료 클라이언트용 API · 출처 표기 필요" },
  { name: "GitHub Status", what: "GitHub 서비스 상태", url: "https://www.githubstatus.com", terms: "공개 상태 API" },
];

export default function AboutPage() {
  return (
    <main id="main" className="about-page">
      <header className="topbar">
        <div className="brand"><span className="brand-mark">P</span><span>Pulseboard</span></div>
        <Link className="text-link" href="/">← 정보판</Link>
      </header>

      <section className="about-hero">
        <p className="eyebrow">DATA &amp; PRIVACY</p>
        <h1>데이터 출처와 개인정보</h1>
        <p>값만 보여 주지 않고 어디서 왔는지, 언제 가져왔는지를 함께 보여 주는 것이 이 정보판의 원칙입니다.</p>
      </section>

      <section aria-labelledby="privacy-heading" className="about-block">
        <h2 id="privacy-heading">개인정보는 이렇게 다룹니다</h2>
        <ul>
          <li><strong>위치</strong>: 날씨를 내 위치로 보여 주려고 브라우저의 위치 권한을 요청합니다. 거부해도 서울 기준으로 모두 쓸 수 있습니다. 좌표는 소수 둘째 자리(약 1km)로 줄여서 날씨·지명 조회에만 쓰고, 서버에 저장하지 않습니다.</li>
          <li><strong>날짜별 기록</strong>: 위젯 값의 일별 요약은 <em>이 브라우저(localStorage)</em>에만 저장됩니다. 서버로 보내지 않으며, 화면의 &ldquo;기록 삭제&rdquo;로 언제든 지울 수 있습니다. 다른 기기에서는 보이지 않습니다.</li>
          <li><strong>지명 조회</strong>: 좌표를 지명으로 바꾸기 위해 서버가 BigDataCloud에 좌표(소수 둘째 자리)를 보냅니다. 계정·식별자는 보내지 않습니다.</li>
          <li><strong>쿠키·추적</strong>: 광고·분석용 쿠키나 제3자 추적 스크립트를 쓰지 않습니다. 테마 선택과 위치 선택만 브라우저에 저장합니다.</li>
          <li><strong>API 키</strong>: 공공데이터포털 등의 키는 서버 환경변수로만 쓰이며 브라우저로 내려가지 않습니다.</li>
        </ul>
      </section>

      <section aria-labelledby="sources-heading" className="about-block">
        <h2 id="sources-heading">데이터 출처와 이용 조건</h2>
        <p className="about-note">아래 조건은 각 공급자의 공개 안내를 요약한 것이며 변경될 수 있습니다. 서비스를 공개·상업적으로 운영하기 전에는 각 공급자의 최신 약관을 직접 확인하세요.</p>
        <div className="history-table-wrap">
          <table className="history-table about-table">
            <thead><tr><th scope="col">출처</th><th scope="col">사용처</th><th scope="col">이용 조건</th></tr></thead>
            <tbody>
              {SOURCES.map((source) => (
                <tr key={source.name}>
                  <th scope="row"><a href={source.url} target="_blank" rel="noreferrer">{source.name} ↗</a></th>
                  <td>{source.what}</td>
                  <td>{source.terms}{source.note && <><br /><small>{source.note}</small></>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="notes-heading" className="about-block">
        <h2 id="notes-heading">알아 두세요</h2>
        <ul>
          <li>대기질(Open-Meteo)은 위성·모델 기반 추정값이라 측정소 실측값과 다를 수 있습니다. 한국 기준 등급은 현재값에 준용한 표시입니다.</li>
          <li>지진·우주날씨·환율·시세는 정보 제공용이며 투자·안전 판단의 근거로 쓰지 마세요.</li>
          <li>과거 값은 공급자가 제공한 일별 원자료입니다. 서버 점검이나 공급자 오류로 일부 지표가 비어 있을 수 있고, 이 경우 가능한 지표만 채웁니다.</li>
        </ul>
      </section>

      <footer className="page-footer">
        <span>Pulseboard</span>
        <p>데이터는 각 공급자 API의 제공 범위와 갱신 주기를 따릅니다.</p>
      </footer>
    </main>
  );
}
