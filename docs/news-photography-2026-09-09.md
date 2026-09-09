# 뉴스 사진 교체

2026-09-10 일괄 웹 릴리스에 포함한다. 스토어 배포는 별도다. 실제 사진 2장과 사진풍 AI 4장으로 기존 일러스트를 교체한다.
뉴스 목록과 상세에서 같은 이미지를 사용한다. 원문·제목·본문·발행일·운영 DB는 변경하지 않는다.
기존 `image_url`을 확인한 뒤 `web/src/content/news-artwork.json`의 동봉 이미지로 연결한다.
운영자가 다른 이미지 주소를 등록하면 해당 이미지를 우선하며 기존 크레딧을 붙이지 않는다.
DB 수정이나 콘텐츠 SQL 재실행은 필요 없다. 이전 일러스트 파일은 기존 앱을 위해 보존한다.

## 적용 이미지

| 기사 | 종류 | 파일 |
|---|---|---|
| 의료지원 협약 | AI · 손목 테이핑 클로즈업 | [medical-support-v2.webp](../web/public/images/news/medical-support-v2.webp) |
| 서채현 코페르 동메달 | 실제 · 대회 준비 모습 | [koper-bronze-v2.jpg](../web/public/images/news/koper-bronze-v2.jpg) |
| 라발 리드 우승 | AI · 리드 등반 | [laval-lead-v2.webp](../web/public/images/news/laval-lead-v2.webp) |
| 라발 파라클라이밍 | 실제 · 파라 시리즈 결승 | [laval-para-v2.jpg](../web/public/images/news/laval-para-v2.jpg) |
| 아시아유스 결과 | AI · 볼더링 경기장 전경 | [asian-youth-v2.webp](../web/public/images/news/asian-youth-v2.webp) |
| 후보선수 훈련 | AI · 실내 볼더링 훈련 | [summer-training-v2.webp](../web/public/images/news/summer-training-v2.webp) |

## 실제 사진 출처와 사용 범위

2026-09-09 [World Climbing 사진 자료실 약관](https://photo.worldclimbing.com/controller/credits)에서
사진의 무료 보도용 사용과 `촬영자 / World Climbing` 크레딧 조건을 확인했다.
뉴스 보도에만 사용하며 앱 광고·홍보 배너용으로 재사용하지 않는다.
공개 사진 페이지에서 제공하는 800×533 미리보기 원본을 그대로 동봉한다.
사진에 포함된 World Climbing 로고를 제거하지 않고, 목록·상세 모두 전체 프레임을 유지한다.
사용자 요청에 따라 목록은 사진과 날짜만 간결하게 표시하고 매체명·사진 아래 문구는 생략한다. 촬영자 표기와 출처 링크는 기사 상세에서 제공하며, 상세 크레딧에서 원본 페이지를 연다.

- 서채현: [FSC145182](https://photo.worldclimbing.com/item/en/1/145182), Dimitris Tosidis / World Climbing.
  공식 메타데이터: 2026 코페르 대회, 2026-09-05, 인물 Chaehyun Seo.
  워밍업 사진으로 소개하며 결승 등반이나 시상식으로 설명하지 않는다.
  공개 파일: https://d0.momapix.com/ifsc/320002b6613060880b6d9119f2c4f2f92f8a1fb7b1cfe2b8bef6043164b3db7b3c7d3/Preview145182.jpg
- 파라클라이밍: [FSC144695](https://photo.worldclimbing.com/item/en/1/144695), Slobodan Miskovic / World Climbing.
  공식 메타데이터: 2026 라발 월드 클라이밍 파라 시리즈, 결승 2일차(2026-08-29).
  기사 본문의 유럽선수권 결과가 해당 시리즈를 바탕으로 집계됐다. 사진을 독일 선수로 설명하지 않는다.
  공개 파일: https://d1.momapix.com/ifsc/320003216a1ddcb62992928df0026898581c9a5ee2ca482cf5494def43317f8780a2a/Preview144695.jpg

## 생성 기록

builtin imagegen으로 신규 생성. 참조 이미지 없음. 1536×1024 원본을 1200×800 WebP로 최적화했다.
실제 인물·대회·병원·훈련장의 기록 사진이 아니다. 사용자 요청에 따라 목록 썸네일의 AI 배지를 제거하고, 기사 상세의 AI 사진 아래에 `[이해를 돕기 위해 AI로 생성한 사진입니다]`를 표시한다. 실사진은 촬영자 크레딧을 유지한다.
공통 색 필터를 씌우지 않고 자연광·경기장 조명·피사체 구도를 달리했다.

원본 폴더: `/Users/kgs/.codex/generated_images/01a07596-3828-7d80-b19a-d0078b0df317/`

| 이미지 | 원본 |
|---|---|
| medical-support-v2 | exec-83f3582f-6313-43a2-84a7-a7c0e09c118a.png |
| asian-youth-v2 | exec-79a893b4-6954-4f2d-be0a-1b1e6ad815eb.png |
| summer-training-v2 | exec-69247f86-0d3c-4664-818c-c3952fe65f60.png |
| laval-lead-v2 | exec-6114a7a9-be02-4fe6-8d27-f92bb7f7425e.png |

### 의료지원·유스·훈련 공통 프롬프트

각 개별 프롬프트 앞에 다음 문장을 붙였다.

```text
Use case: photorealistic-natural. Create a landscape 3:2 editorial photograph-style supporting image for a Korean climbing news app. This is a conceptual stock-style image, not a depiction of an actual news event or identifiable real athlete. Natural photographic detail and believable equipment, no illustration, no CGI look, no lettering, no logos, no watermarks, no graphic overlays.
```

의료지원:

```text
Close-up documentary photograph of an adult climber's forearm and hand with a small strip of sports tape being gently checked by a sports physiotherapist, faces outside frame. Clean sports clinic, a worn climbing shoe and rolled athletic tape quietly visible at the edge of the examination bench. Soft daylight, warm off-white tones and natural skin textures. 85mm lens, shallow depth of field. Focus on credible preventative athlete care, no wounds, no medical emblem. No posed handshake.
```

유스:

```text
Wide architectural sports photograph from the spectator area of an empty modern indoor competition bouldering wall before a youth competition. Three visually distinct problems with sculptural yellow, violet and green holds on a pale grey wall, deep grey continuous safety mats, a few empty spectator chairs in foreground. No people, no legible scores or signage. Cool daylight mixed with venue lighting, 28mm lens, straight architectural lines, crisp hold and mat textures. A real competition atmosphere without implying any particular venue.
```

훈련:

```text
Candid close-to-ground side-view photograph in a Korean indoor bouldering gym during a relaxed training session. An anonymous adult climber in dark trousers and a muted green sports shirt traverses only a short distance above thick continuous crash mats, hands and feet naturally connected to holds; another adult in background warming up, out of focus. Afternoon sun entering from the side, earthy warm grey wall with scattered vivid red and blue holds. 35mm documentary photography, subtle film grain, authentic chalk marks and worn shoes. No harness or rope for this low bouldering scene. No faces clearly recognizable.
```

### 리드 프롬프트

```text
Use case: photorealistic-natural. Landscape 3:2 documentary sports photograph-style supporting image for a climbing news article about lead competition. Conceptual image, not an actual event or any identifiable real athlete. Dramatic low angle, an anonymous adult climber viewed from the back reaching upward on a tall steep indoor lead climbing wall, properly fitted harness and visible lead rope running through quickdraws below. Large lime-green volumes against a dark slate wall, distant spectators only as indistinct out-of-focus shapes below. Cool arena spotlights, authentic chalk traces, realistic muscles, fabric and climbing hardware, 70mm sports photography, a strong diagonal composition. No invented medals, podium, scoreboards or event logos; no legible text, no watermark. Avoid illustration, CGI, excessively glossy skin.
```

## 검증 결과

6개 파일 전체 디코딩과 크기 검증 통과. 뉴스 회귀 검사에서 목록/상세의 실사진 크레딧, AI 표시,
원본 비율, 이전 DB 주소 교체, 운영자가 나중에 바꾼 외부 이미지 보존을 확인했다.
변경 파일 ESLint 및 전체 TypeScript 검사 통과. 로컬 모바일 폭에서 서채현 실사진의 워터마크/크레딧과
의료지원 AI 상세를 확인했다. 후속 요청 반영 뒤 모바일 뉴스 목록에서 배지 제거, 상세에서 AI 안내문과 실사진 크레딧을 재검수했으며 뉴스 회귀 검사·변경 파일 린트도 통과했다.
개발 화면 검수는 Supabase를 끈 예시 데이터로 수행했다. 2026-09-10 별도 폴더에서 운영 공개 연결 설정으로 웹 빌드·네이티브 동기화를 완료하고 양 플랫폼의 6개 이미지 일치를 확인했다. 뉴스 본문/날짜/이미지 URL의 운영 DB 변경은 필요하지 않다. 웹 배포는 main 병합으로 수행한다.
