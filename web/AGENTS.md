<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

# 새 화면은 `[id]` 동적 경로를 쓰지 않는다

네이티브 앱(Capacitor)은 서버 없이 폰에 설치된 파일을 웹뷰가 직접 연다.
그래서 네이티브 빌드는 `output: 'export'` 로 돌고, 주소의
**경로 부분은 빌드 시점에 파일이 존재해야** 한다.

모임 id 는 출시 뒤에 유저가 만드는 값이라 파일을 미리 만들 수 없다.

```
✗  app/session/[id]/page.tsx      →  /session/abc-123   빌드 불가
✓  app/session/page.tsx           →  /session?id=abc-123
```

id 는 `useQueryId()` (`src/lib/queryId.ts`) 로 읽는다. `useSearchParams` 는
페이지 전체를 Suspense 로 감싸게 만들어서 쓰지 않는다.

`[id]` 를 추가하면 **웹 배포는 멀쩡하고 네이티브 빌드만 깨진다.** 눈치채기
어려우니 새 화면을 만들면 아래를 돌려볼 것.

## 두 가지 빌드

```bash
npm run build     # 웹 배포용 (Vercel). export 아님
npm run sync      # 네이티브용 — export + android/ios 반영
```

`export` 를 웹에도 켜면 Vercel 이 `.html` 확장자 주소를 404 로 돌려서
`/intro.html` (홍보에 쓰는 랜딩 주소) 이 죽는다. 그래서 네이티브에서만 켠다.

# 앱 문구는 설명하지 않는다

화면에 "~예요" 식 세부 설명을 최대한 적지 않는다 (2026-09 결정).
UI 가 스스로 말하게 하고, 유저가 알아서 알아보게 둔다.

예외: 돈과 규칙 고지는 남긴다 — 신청비 차감·반환, 신고·차단의 결과처럼
분쟁과 심사에서 "말해줬는가" 가 기준이 되는 것들.
