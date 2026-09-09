# 암벽화 9색 · 최근 3개월 — 로컬 배포 대기

> 이 문서의 V기반 성취 계산은 이전 시안이다. 현재 로컬 기준은 [하비데이 색상 성취 v1](hobi-color-achievement-2026-09-09.md)이며, 공개 V자료는 선택 참고 기록으로 보존한다.


사용자는 하위 색을 줄인 9색 구성을 선택했다. 노랑·주황은 시작 흰색에 통합하고 중간·상위 구간에 빨강·핑크·회색·갈색을 추가했다. 기존 원본 이미지는 구버전 호환을 위해 보존한다.

## 로컬 승급 수치 시안

| 색 | 난이도 | 필요 완등 |
|---|---|---|
| 흰색 | 시작 단계 | 없음 |
| 초록 | V2 이상 | 5개 |
| 파랑 | V3 이상 | 10개 |
| 빨강 | V4 이상 | 15개 |
| 핑크 | V5 이상 | 20개 |
| 보라 | V6 이상 | 25개 |
| 회색 | V7 이상 | 30개 |
| 갈색 | V8 이상 | 35개 |
| 검정 | V9 이상 | 40개 |

수치는 하비데이 자체 시안이다. [더클라임 문래점 공개 참고 페이지](https://holday.rocks/gym/더클라임-문래점)의 11색 순서를 참고했으며, 이 페이지는 비공식 자료이고 지점별 차이가 있을 수 있다고 명시한다. 더클라임 공식 V환산표 또는 실제 이용자 분포에 맞춰 검증된 수치로 제시하지 않는다. 암장 홀드 색상→V등급 변환은 기존 `gymGradeMappings`와 별도다.

## 집계 규칙

- 한국 날짜로 3개월 전 같은 날부터 오늘까지 포함. 달력 기준이므로 고정 90일과는 다르며 해당 날짜가 없는 달은 말일로 맞춘다.
- 실제 `completed_on` 사용. 입력 시각 `created_at`으로 과거 완등 날짜를 추정하지 않는다.
- 각 단계의 최소 V 이상 개수를 합산해 충족한 가장 높은 단계를 적용한다. 높은 난이도는 하위 조건에도 포함된다.
- 승급해도 기록을 소비하거나 초기화하지 않는다. 기간 이탈·편집·삭제 후 현재 단계가 낮아질 수 있다.
- 날짜 없는 기존 기록은 내역/전체 누적 수를 유지하고, 실제 날짜를 편집하기 전에는 단계에서 제외한다. 본인 카드에 해당 개수 안내를 표시한다.
- V등급 모름은 전체/해당 기간 완등 수에 포함하되 승급에는 사용하지 않는다.
- 색상별 일괄 개수 입력은 개별 문제 ID가 없으므로 같은 문제 중복은 사용자가 제외해야 한다.

## 배포 및 호환

`20260909200000_shoe_stages_rolling.sql`은 완등 묶음·환산표 마이그레이션 다음에 적용한다. 원본 기록 수정/삭제는 없다.

새 `climbing_progress_v2`와 `public_climbing_achievements_v2`는 같은 비공개 집계 함수를 사용한다. 임의 사용자 ID의 기록을 집계하는 내부 함수는 클라이언트에 실행 권한을 주지 않는다. 공개 요약은 기존 `profile_visible`과 차단 정책을 따르고 ID·단계·전체 완등 수만 반환한다.

배포된 구버전 설치 앱은 새 색상 ID를 해석할 수 없으므로 기존 `climbing_progress`와 `public_climbing_achievements`의 7색·누적 규칙을 유지한다. 새 웹/새 앱 번들만 v2를 사용한다. 운영 DB 적용 → 웹 배포 → 새 앱 배포 순으로 반영한다. 기존 설치 앱과 새 웹은 앱 업데이트 전까지 서로 다른 기준으로 보일 수 있다.

## 일러스트 제작

도구: `image_gen.imagegen`, 기존 `web/public/illustrations/climbing-shoe/green-v2.webp`를 참조한 4회 편집. 모델 세부 옵션은 도구 기본값이다. 결과 확인 후 640×640 WebP로 변환(quality 86)했다.

각 출력은 `web/public/illustrations/climbing-shoe/{red,pink,gray,brown}-v2.webp`에 있다. 빨강/핑크/회색/갈색의 원본 PNG는 Codex generated_images에 보존했다.

실행 프롬프트 템플릿 (`{id}`와 `{color}`만 아래 값으로 치환):

> Use case: precise-object-edit. Edit target: the supplied approved HobiDay climbing shoe image. Create a {id} color variant of THIS EXACT SAME SHOE. Change ONLY the green suede/fabric panels and velcro strap to {color}. Keep the exact shoe shape, stitching, rubber areas, black loop, opening, camera angle, orientation, scale, position, composition, soft contact shadow and pure white background unchanged. Single shoe only. No text, no logo, no watermark. Square 640x640 target aspect, suitable for the same app profile illustration family. Do not redesign or add objects.

- red: muted coral red #D96365
- pink: dusty rose pink #DB93B4
- gray: silver slate gray #929CA9
- brown: warm cocoa brown #9B765D

## 검증

- 단계별 경계값, 혼합 V등급, 하위 난이도만으로 승급 불가, 삭제 재계산, 3개월 날짜 계산(윤년/말일/연도 경계), SQL/클라이언트 정책 및 이미지 존재 검증.
- 임시 PGlite DB의 108개 마이그레이션 적용, 기존 완등/공개 성취/묶음/환산표 테스트와 `shoe_stages_rolling.sql` 통과.
- 최근 3개월 시작 날짜 포함, 하루 전 기록 제외·내역 보존, 미래 입력 거절, 날짜 없는 기존 기록 보존과 변환, 공개 권한/차단/요청 크기 제한, v1 호환 테스트 포함.
- 변경 파일 ESLint, 전체 TypeScript 타입 검사, 암벽화/브랜드 안내/런타임 테스트 통과.
- 352px 브라우저 미리보기에서 V5 20개 일괄 저장 → 핑크 단계 계산 → 기준표 선택 행과 새 핑크 일러스트 표시 확인. 미리보기 기록은 새로 불러와 정리했다.
- 운영 DB 변경·빌드·배포는 이번 작업에서 실행하지 않는다.
