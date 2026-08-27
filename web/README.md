# HobiDay 웹앱

볼더링 모임 매칭 앱 하비데이의 프런트엔드 — Next.js (App Router) + Supabase.
같은 코드가 웹(Vercel)과 네이티브 앱(Capacitor 웹뷰) 두 곳에 실린다.

## 개발

```bash
npm install
npm run dev        # http://localhost:3000
```

Supabase 키는 `.env.local` 에 넣는다 (git 에 안 올라간다):

```
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

새 대시보드는 anon 키를 PUBLISHABLE_KEY 라고 부른다 — 어느 이름이든 인식한다
(`src/lib/supabase.ts`). **키가 없으면 화면은 목데이터로 돈다.** 개발 폴백이라
에러 없이 조용히 목이 나오니, 실제 데이터가 안 보이면 키부터 확인할 것.
키 받는 곳과 샌드박스 DB 세우는 법은 [`../supabase/README.md`](../supabase/README.md).

## 빌드가 두 가지다

```bash
npm run build      # 웹 배포용 (Vercel) — export 아님
npm run sync       # 네이티브용 — output: 'export' 로 빌드해 android/ios 에 반영
```

왜 갈라지는지, 그리고 **새 화면에 `[id]` 동적 경로를 쓰면 안 되는 이유**는
[AGENTS.md](AGENTS.md) 에 있다. `[id]` 를 쓰면 웹 배포는 멀쩡하고 네이티브
빌드만 깨지니, 새 화면을 만들면 `npm run sync` 가 도는지 확인할 것.

## 어디가 기준인가

- DB 스키마·정책의 현재 기준: `../supabase/migrations/` 의 헤더 주석 + `../supabase/verify.sql`
- 데이터 접근은 전부 `src/lib/supabase.ts` 를 거친다
- 금액·정원 같은 값은 서버 `credit_rule()` 과 짝이다 — 한쪽만 바꾸지 말 것
  (`../supabase/README.md` 의 "주의" 참고)
