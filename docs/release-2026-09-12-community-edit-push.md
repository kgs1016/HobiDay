# 2026-09-12 일괄 배포

## 포함 내용

- 호스트의 모임 정보 수정과 작성자의 영상 설명·파일·썸네일 수정
- 자유게시판 글·댓글 추천과 최근 반응 기반 HOT 보기
- iOS/Android 앱 버전 안내 정책과 내 프로필 바로 수정 진입
- 로그인·앱 복귀 시 푸시 기기 등록, 발송 재시도, 부분 성공 영수증, 예약 대기열 처리
- Play 스토어 그래픽, 인스타그램 프로필·카드뉴스, 클라이밍화 표기 스크린샷

## 운영 반영

- `20260912090000_session_and_video_edit.sql`
- `20260912100000_push_delivery_retry.sql`
- `20260912110000_board_recommendations_and_hot.sql`
- `20260912120000_native_app_update_policy.sql`
- `push` Edge Function version 9, JWT 검증 사용
- Vault 인증과 `pg_net`을 사용하는 `notifications-push` 1분 주기 작업

과거 누락 마이그레이션은 없었으며 네 버전만 순서대로 적용했다. 예약 작업은 Edge Function HTTP 200 응답을 확인했다. 앱 업데이트 안내·푸시 등록·Android 알림 채널은 네이티브 번들 코드이므로 다음 Codemagic 빌드에 포함해야 한다.

## 검증

- `npm run check`
- 모임·영상 수정, 푸시 재시도, 게시판 추천/HOT, 앱 업데이트 정책 PGlite 검사
- Next.js 정적 빌드 42개 경로 및 iOS/Android Capacitor 동기화
- 운영 마이그레이션 이력, 함수 버전, 확장·예약 작업 상태 재조회
