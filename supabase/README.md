# 마이그레이션 규칙

## 파일명은 시각 형식

```
YYYYMMDDHHMMSS_설명.sql        예: 20260815193457_capacity_max_two.sql
```

`001_`, `002_` 같은 순번은 **쓰지 않는다.** 두 사람이 각자 브랜치에서 작업하면
같은 번호를 만들게 되고, CLI 는 번호로만 적용 여부를 판단하기 때문에
나중에 병합된 쪽이 **에러 없이 조용히 건너뛰어진다.**

새 파일을 만들 때:

```bash
npx supabase migration new 설명
```

이렇게 하면 현재 시각으로 파일이 생성된다.

**단, CLI 는 UTC 로 찍는다.** 우리 초기 파일들은 한국시각(KST)으로 붙어 있어서
CLI 가 만든 파일이 이미 적용된 파일보다 **9시간 앞선 이름**으로 나올 수 있다.
그러면 순서가 뒤집혀 push 가 막힌다. 만든 뒤 `ls` 로 **맨 마지막에 오는지**
확인하고, 아니면 마지막 파일보다 뒤로 이름을 바꾼다.

## 적용 — 역할을 나눈다

```
JWH (동업자)  브랜치에서 마이그레이션 작성 → main 병합.  DB 는 건드리지 않는다
main (이쪽)   병합 확인 → db push 로 일괄 적용
```

DB 적용을 한쪽에서만 하는 이유: 양쪽이 각자 push 하면 "DB 에는 있는데
main 에는 아직 없는 파일" 이 생기고, 그 사이에 만들어지는 파일과 시각
순서가 얽힌다. 실제로 한 번 겪었다 (`--include-all` 로 풀었다).

수정할 게 생기면 **이미 적용된 파일을 고치지 말고 새 파일로** 쓴다.
CLI 는 적용 사실만 기억하지 내용이 바뀐 건 모른다.

```bash
npx supabase db push
```

로컬에 있고 원격에 없는 것만 순서대로 적용된다.
적용 전에 확인하려면 `--dry-run` 을 붙인다.

상태 확인:

```bash
npx supabase migration list      # 로컬 ↔ 원격 대조
```

## 처음 쓰는 사람

```bash
npx supabase login
npx supabase link --project-ref loigwslmwvltdurjttpe
```

`link` 는 DB 비밀번호를 묻는다 (대시보드 > Project Settings > Database).

## 이미 손으로 적용한 마이그레이션이 있다면

대시보드에서 직접 실행한 SQL 은 CLI 가 모른다. 그대로 `db push` 하면
다시 실행되므로, 먼저 "적용됨" 으로 표시한다:

```bash
npx supabase migration repair --status applied <버전>
```

## 주의

- 마이그레이션은 **몇 번 실행해도 안전하게** 쓴다
  (`create or replace`, `if not exists`, 제약은 `drop ... if exists` 후 재생성)
- 금액·정원 같은 값이 앱 코드에도 있으면 **양쪽을 함께 바꾼다.**
  한쪽만 바꾸면 화면 문구와 실제 동작이 어긋난다
  (예: `credit_rule()` ↔ `web/src/lib/supabase.ts` 의 `REQUEST_COST`)

## schema.sql 은 지웠다

이 폴더에 있던 `schema.sql` (SQL Editor 에 통째로 붙여넣는 초기 세팅 파일)은
`20260801000000_base_schema` 로 옮겨진 뒤에도 8월 초 시점 그대로 남아 있었다.
정원 (2,3) · 신청 즉시 확정 · 신청비와 차단 필터 없음 — 전부 옛 규칙인데
파일 머리에는 "몇 번을 다시 돌려도 안전하다" 라고 적혀 있었다.

`create or replace function` 은 함수를 통째로 갈아치우므로, 이걸 본 DB 에서
실행하면 승인제·신청비·차단이 들어간 현재 함수들이 소리 없이 옛 로직으로
돌아간다 — `verify.sql` 이 경고하는 바로 그 사고다. 그래서 지웠다.

- 빈 DB 세우기 → 아래 샌드박스 절차대로 `db push` (base_schema 부터 전부 올라간다)
- 초기 스키마가 궁금하면 → `migrations/20260801000000_base_schema.sql` (내용 동일)

## 테스트용 프로젝트 (샌드박스)

DB 가 하나뿐이면 브랜치에서 DB 변경을 확인할 데가 없다. Supabase 무료
계정은 프로젝트를 2개까지 주므로, 실험용을 따로 하나 둔다.

```
브랜치 작업 중   샌드박스에 db push → 마음껏 실험 (깨져도 무관)
검증 끝나면      main 병합 → 본 DB 는 여기서 적용
```

샌드박스는 빈 DB 라 마이그레이션 전체를 처음부터 돌리게 된다. 그래서
"빈 DB 에서도 깨끗하게 올라가는지" 가 매번 검증된다 — 본 DB 에서는 영영
확인 못 하는 부분이다.

### 새 프로젝트 세우기

```bash
npx supabase login
npx supabase link --project-ref <샌드박스_ref>   # 본 프로젝트 ref 아님!
npx supabase db push
```

`web/.env.local` 은 샌드박스 키로 채운다 (git 에 안 올라가서 서로 안 섞인다).
키는 대시보드 위쪽 **[Connect] > App Frameworks > Next.js** 에서 두 줄이
값까지 채워진 채로 나온다. 수동으로 찾을 거면 **Settings > Data API** 의
Project URL 과 **Settings > API Keys** 의 anon 을 각각 가져온다 — 예전
`Settings > API` 한 페이지는 이 둘로 쪼개졌다.

대시보드에서 두 가지만 더 만진다.

- **Authentication > Providers > Email > Confirm email `off`**
  — 테스트 계정을 여러 개 만들려면 인증 메일이 걸림돌이 된다
- 오픈 잠금 해제 — 안 하면 대기 화면만 나온다

  ```sql
  update app_config set sessions_open = true, people_open = true;
  ```

### 본 DB 에는

`20260801000000_base_schema` 는 이미 손으로 적용돼 있다. 다시 돌릴 필요가
없으니 한 번만 표시해둔다.

```bash
npx supabase migration repair --status applied 20260801000000
```
