type GradeColor = { name: string; hex: string };
type GradeSource = { label: string; url: string; published: string | null; checked: string };
export type GymGradeGuide = {
  id: string;
  name: string;
  aliases: string[];
  branchPrefixes: string[];
  colors: GradeColor[];
  sources: GradeSource[];
  note?: string;
};

/** 브랜드당 하나의 참고표. 출처 지점은 남기며 공식 V환산으로 사용하지 않는다. */
export const GYM_GRADE_GUIDES: GymGradeGuide[] = [
  {
    id: "theclimb", name: "더클라임",
    aliases: ["더 클라임", "더클라임 클라이밍", "더클", "The Climb", "더클라임 문래", "더클라임 강남", "더클라임 신림", "더클라임 일산"],
    branchPrefixes: ["더클라임클라이밍", "더클라임", "더클", "theclimb"],
    colors: [{name:"흰색",hex:"#F1F0EB"},{name:"노랑",hex:"#E9BF3A"},{name:"주황",hex:"#ED9354"},{name:"초록",hex:"#60A783"},{name:"파랑",hex:"#5F95D4"},{name:"빨강",hex:"#DF5957"},{name:"핑크",hex:"#ED9FBF"},{name:"보라",hex:"#A287C4"},{name:"회색",hex:"#969BA3"},{name:"갈색",hex:"#9A745C"},{name:"검정",hex:"#343B45"}],
    sources: [
      {label:"사당점 방문기 · V등급 안내판 사진",url:"https://unsasasi.tistory.com/1",published:"2025-07-11",checked:"2026-09-09"},
      {label:"일산점 방문기 · V등급 안내판 교차 확인",url:"https://blog.naver.com/yjkim610/223374018247",published:"2024-03-05",checked:"2026-09-09"},
      {label:"HOLDAY 문래점 · 핑크 포함 11색 참고표",url:"https://holday.rocks/gym/더클라임-문래점",published:null,checked:"2026-09-09"},
    ],
  },
  {
    id: "metrorock", name: "메트로락클라이밍",
    aliases: ["메트로락", "메트로락 클라이밍", "메트로락 클라이밍센터"], branchPrefixes: [],
    colors: [{name:"빨강",hex:"#DF5957"},{name:"노랑",hex:"#E9BF3A"},{name:"초록",hex:"#60A783"},{name:"파랑",hex:"#5F95D4"},{name:"보라",hex:"#A287C4"},{name:"검정",hex:"#343B45"}],
    sources: [{label:"메트로락 클라이밍장 안내표 · 이용자 재게시",url:"https://spiri7.com/post/479",published:null,checked:"2026-09-09"}],
    note: "공개된 클라이밍장 안내표 기준입니다. 원본 작성일은 확인되지 않아 현장 안내가 다르면 직접 입력해주세요. 핑크는 하강용 홀드로, 난이도 색상이 아닙니다.",
  },
  {
    id: "seoul-forest", name: "서울숲클라이밍",
    aliases: ["서울숲","서울숲클라이밍 영등포점","서울숲 클라이밍 영등포점","영등숲","서울숲클라이밍 구로점","서울숲 클라이밍 구로점","구로숲","서울숲클라이밍 잠실점","서울숲 클라이밍 잠실점","잠실숲","서울숲클라이밍 종로점","서울숲 클라이밍 종로점","종로숲"],
    branchPrefixes: ["서울숲클라이밍","서울숲"],
    colors: [{"name":"핑크","hex":"#ED9FBF"},{"name":"빨강","hex":"#DF5957"},{"name":"주황","hex":"#ED9354"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"남색","hex":"#526296"},{"name":"보라","hex":"#A287C4"},{"name":"갈색","hex":"#9A745C"},{"name":"검정","hex":"#343B45"}],
    sources: [
      {"label":"영등포점 방문 기록","url":"https://start2025.tistory.com/37","published":"2025-03-06","checked":"2026-09-09"},
      {"label":"서울숲 지점별 방문 기록","url":"https://hanzziii.tistory.com/v/entry/서울숲-클라이밍-지점별-특징","published":"2024-06-27","checked":"2026-09-09"},
    ],
  },
  {
    id: "peakers", name: "피커스",
    aliases: ["피커스 클라이밍","피커스 클라이밍 구로점","피커스 구로점","피커스 구로","피커스클라이밍 구로","피커스 클라이밍 종로점","피커스 종로점","피커스 종로"],
    branchPrefixes: ["피커스클라이밍","피커스"],
    colors: [{"name":"빨강","hex":"#DF5957"},{"name":"주황","hex":"#ED9354"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"남색","hex":"#526296"},{"name":"보라","hex":"#A287C4"},{"name":"회색","hex":"#969BA3"},{"name":"검정","hex":"#343B45"}],
    sources: [
      {"label":"피커스 구로점 현장 난이도표 사진","url":"https://running-rynn.tistory.com/7","published":"2026-07-23","checked":"2026-09-09"},
      {"label":"피커스 종로점 방문 기록","url":"https://career-review.tistory.com/entry/피커스","published":"2022-04-04","checked":"2026-09-09"},
    ],
    note: "검정은 최근 구로점 표 기준. 과거 종로점 자료는 회색까지 표시되어 있습니다.",
  },
  {
    id: "climbing-park", name: "클라이밍파크",
    aliases: ["클라이밍 파크","클팍","클라이밍파크 종로점","클라이밍 파크 종로점","클팍 종로","클라이밍파크 강남점","클라이밍 파크 강남점","클팍 강남"],
    branchPrefixes: ["클라이밍파크","클팍"],
    colors: [{"name":"노랑","hex":"#E9BF3A"},{"name":"핑크","hex":"#ED9FBF"},{"name":"파랑","hex":"#5F95D4"},{"name":"빨강","hex":"#DF5957"},{"name":"보라","hex":"#A287C4"},{"name":"갈색","hex":"#9A745C"},{"name":"회색","hex":"#969BA3"},{"name":"검정","hex":"#343B45"},{"name":"흰색","hex":"#F1F0EB"}],
    sources: [
      {"label":"클라이밍파크 종로점 방문 기록","url":"https://jjiyo.com/entry/%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EC%A2%85%EB%A1%9C-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D%ED%8C%8C%ED%81%AC-%EC%A2%85%EB%A1%9C%EC%A0%90-%EC%8B%9C%EC%84%A4-%EB%B0%A9%EB%AC%B8-%ED%9B%84%EA%B8%B0","published":"2024-11-12","checked":"2026-09-09"},
      {"label":"클라이밍파크 강남점 방문 기록","url":"https://jjiyo.com/entry/%EA%B0%95%EB%82%A8-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D%ED%8C%8C%ED%81%AC-%EA%B0%95%EB%82%A8%EC%A0%90-%EB%B0%A9%EB%AC%B8-%ED%9B%84%EA%B8%B0","published":"2024-09-23","checked":"2026-09-09"},
    ],
  },
  {
    id: "allez", name: "알레클라이밍",
    aliases: ["알레","알레클라임","알레 클라이밍 혜화","알레클라임 영등포점","알레클라이밍 영등포점","알레 클라이밍 영등포점","알레 영등포","알레 클라이밍 강동","알레클라이밍 강동점","알레 클라이밍 강동점","알레 강동"],
    branchPrefixes: ["알레클라이밍","알레클라임","알레"],
    colors: [{"name":"흰색","hex":"#F1F0EB"},{"name":"노랑","hex":"#E9BF3A"},{"name":"연두","hex":"#B2CC66"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"빨강","hex":"#DF5957"},{"name":"회색","hex":"#969BA3"},{"name":"갈색","hex":"#9A745C"},{"name":"핑크","hex":"#ED9FBF"},{"name":"검정","hex":"#343B45"}],
    sources: [
      {"label":"알레 영등포점 방문 기록","url":"https://jjiyo.com/entry/%EC%98%81%EB%93%B1%ED%8F%AC-%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EB%9B%B0%EB%9B%B0%EC%B2%9C%EA%B5%AD-%EC%9E%91%EA%B3%A0-%EA%B7%80%EC%97%AC%EC%9A%B4-%EC%95%8C%EB%A0%88-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EC%98%81%EB%93%B1%ED%8F%AC%EC%A0%90-%EB%B0%A9%EB%AC%B8-%ED%9B%84%EA%B8%B0","published":"2024-12-05","checked":"2026-09-09"},
      {"label":"알레 강동점 포함 지점별 방문 기록","url":"https://jjiyo.com/entry/%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D%EC%9E%A5-%EC%95%8C%EB%A0%88%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%ED%9B%84%EA%B8%B0","published":"2024-07-09","checked":"2026-09-09"},
      {"label":"혜화점 리뉴얼 방문 기록","url":"https://jjiyo.com/entry/%ED%98%9C%ED%99%94-%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EC%95%8C%EB%A0%88-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%ED%98%9C%ED%99%94%EC%A0%90-%EB%A6%AC%EB%89%B4%EC%96%BC-%EB%B0%A9%EB%AC%B8-%ED%9B%84%EA%B8%B0","published":"2024-10-08","checked":"2026-09-09"},
    ],
    note: "흰색·핑크는 영등포·강동 자료 기준. 혜화 리뉴얼 자료에는 두 색상이 표시되어 있지 않습니다.",
  },
  {
    id: "ssw", name: "손상원 클라이밍짐",
    aliases: ["손상원","손상원 클라이밍짐 을지로점","손상원클라이밍짐 을지로점","손상원 을지로"],
    branchPrefixes: ["손상원클라이밍짐","손상원"],
    colors: [{"name":"흰색","hex":"#F1F0EB"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"빨강","hex":"#DF5957"},{"name":"검정","hex":"#343B45"},{"name":"회색","hex":"#969BA3"},{"name":"갈색","hex":"#9A745C"},{"name":"핑크","hex":"#ED9FBF"},{"name":"보라","hex":"#A287C4"}],
    sources: [
      {"label":"손상원 을지로점 방문 기록","url":"https://jjiyo.com/entry/%EC%9D%84%EC%A7%80%EB%A1%9C-%ED%95%AB%ED%94%8C-%EC%86%90%EC%83%81%EC%9B%90%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D%EC%A7%90-%EC%9D%84%EC%A7%80%EB%A1%9C%EC%A0%90%EC%9D%98-%EB%A7%A4%EB%A0%A5-%EC%99%84%EC%A0%84-%EC%A0%95%EB%A6%AC-%F0%9F%A7%97%E2%80%8D%E2%99%80%EF%B8%8F%E2%9C%A8","published":"2024-12-02","checked":"2026-09-09"},
    ],
  },
  {
    id: "koala", name: "코알라클라이밍",
    aliases: ["코알라","코알라클라이밍 상암","코알라클라이밍 킨텍스점","코알라 클라이밍 킨텍스점","코알라클라이밍 킨텍스","코알라 킨텍스"],
    branchPrefixes: ["코알라클라이밍","코알라"],
    colors: [{"name":"핑크","hex":"#ED9FBF"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"주황","hex":"#ED9354"},{"name":"빨강","hex":"#DF5957"},{"name":"보라","hex":"#A287C4"},{"name":"검정","hex":"#343B45"},{"name":"흰색","hex":"#F1F0EB"}],
    sources: [
      {"label":"코알라 킨텍스점 방문 기록","url":"https://jjiyo.com/entry/%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EC%BD%94%EC%95%8C%EB%9D%BC-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%ED%82%A8%ED%85%8D%EC%8A%A4%EC%A0%90-%EB%B0%A9%EB%AC%B8-%ED%9B%84%EA%B8%B0","published":"2024-09-18","checked":"2026-09-09"},
    ],
  },
  {
    id: "catch-stone", name: "캐치스톤",
    aliases: ["캐치스톤클라이밍짐","캐치스톤 클라이밍","캐치스톤 클라이밍 부천시청점","캐치스톤 부천시청점","캐치스톤 부천시청","캐치스톤 2호점"],
    branchPrefixes: ["캐치스톤클라이밍짐","캐치스톤클라이밍","캐치스톤"],
    colors: [{"name":"빨강","hex":"#DF5957"},{"name":"주황","hex":"#ED9354"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"남색","hex":"#526296"},{"name":"보라","hex":"#A287C4"},{"name":"회색","hex":"#969BA3"},{"name":"갈색","hex":"#9A745C"},{"name":"핑크","hex":"#ED9FBF"}],
    sources: [
      {"label":"캐치스톤 부천시청점 방문 기록","url":"https://jjiyo.com/entry/%EB%B6%80%EC%B2%9C-%EC%8B%A4%EB%82%B4-%ED%81%B4%EB%9D%BC%EC%9D%B4%EB%B0%8D-%EC%BA%90%EC%B9%98%EC%8A%A4%ED%86%A4-%EB%B6%80%EC%B2%9C%EC%8B%9C%EC%B2%AD%EC%A0%90-%EC%BA%90%EC%B9%98%EC%8A%A4%ED%86%A4-2%ED%98%B8%EC%A0%90%EB%82%B4%EB%8F%88%EB%82%B4%EC%82%B0-%EB%B0%A9%EB%AC%B8%ED%9B%84%EA%B8%B0","published":"2025-01-31","checked":"2026-09-09"},
    ],
  },
  {
    id: "sinchon-damjang", name: "신촌담장",
    aliases: ["신촌 담장","신촌담장 클라이밍"],
    branchPrefixes: [],
    colors: [{"name":"빨강","hex":"#DF5957"},{"name":"주황","hex":"#ED9354"},{"name":"노랑","hex":"#E9BF3A"},{"name":"초록","hex":"#60A783"},{"name":"파랑","hex":"#5F95D4"},{"name":"남색","hex":"#526296"},{"name":"보라","hex":"#A287C4"},{"name":"흰색","hex":"#F1F0EB"},{"name":"검정","hex":"#343B45"}],
    sources: [
      {"label":"신촌담장 방문 기록","url":"https://start2025.tistory.com/42","published":"2025-03-11","checked":"2026-09-09"},
    ],
  },
];
const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");

/** 기존 지점 링크도 브랜드 표로 연결한다. 브랜드명이 포함된 임의 문장은 매칭하지 않는다. */
export function findGymGradeGuide(name: string): GymGradeGuide | undefined {
  const key = normalize(name);
  return GYM_GRADE_GUIDES.find(guide =>
    [guide.id, guide.name, ...guide.aliases].some(alias => normalize(alias) === key) ||
    guide.branchPrefixes.some(prefix => {
      const base = normalize(prefix);
      return key.startsWith(base) && /^[가-힣a-z0-9]+점$/.test(key.slice(base.length));
    }));
}
export function matchesGradeGuide(guide: GymGradeGuide, query: string): boolean {
  if (query.trim() && findGymGradeGuide(query)?.id === guide.id) return true;
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const values = [guide.name, ...guide.aliases, ...guide.sources.map(item => item.label)].map(normalize);
  return words.every(word => values.some(value => value.includes(normalize(word))));
}

export function gymGradeGuideHref(name: string): string {
  return '/me/grades?tab=gyms' + (name.trim() ? '&gym=' + encodeURIComponent(name.trim()) : '');
}
