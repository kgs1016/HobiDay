# 휴대폰 푸시 알림 — 2026-09-12

## 운영 배포 상태

- 프로젝트 `loigwslmwvltdurjttpe`, 앱 ID `kr.hobiday.app`.
- `push` Edge Function version 9 ACTIVE, JWT 검증 사용.
- `APNS_KEY`, `APNS_KEY_ID`, `APPLE_TEAM_ID`, `FIREBASE_SERVICE_ACCOUNT` 이름이 등록되어 있다. 키 유효성이나 발송 성공까지 확인한 것은 아니다.
- 배포 전 점검 당시 등록 기기는 iOS 2대, Android 0대였다. Android 앱의 Firebase 설정 파일은 로컬에 있다.
- `20260912100000_push_delivery_retry.sql`, `pg_net`, Vault의 `service_role_key`, 1분 주기 `notifications-push` 작업을 운영에 적용했다.
- 예약 작업의 Edge Function HTTP 200 응답을 확인했다. 최종 APNs/FCM 수신과 다음 네이티브 빌드의 기기 등록은 실기기 점검이 필요하다.

## 반영된 동작

- 모든 로그인 방식(이메일 포함), 앱 재진입, 휴대폰 설정에서 알림 허용 후 복귀, 네트워크 복구 시 기기 등록을 확인한다.
- 이미 허용한 사용자에게 권한을 다시 요청하지 않는다. 기기 저장 실패는 제한적으로 재시도한다. 토큰·비밀키는 로그에 남기지 않는다.
- iOS는 APNs, Android는 FCM. Android 채팅·모임 알림 채널을 만들고 앱 실행 중 표시 옵션도 설정했다.
- Edge Function에 OPTIONS/CORS 응답을 추가해 웹뷰의 발송 요청을 처리한다.
- 새 앱의 알림함 소식은 `notify_send_pending`에 먼저 저장하고 즉시 발송한다. 실패하면 예약 작업이 다시 처리한다. 구버전 `notify_send`는 호환성을 위해 유지한다.
- 채팅처럼 알림함에 남기지 않는 즉시 푸시는 서버에서 최대 3회 시도한다. 이 경로는 앱의 발송 요청에 의존하며 장기 보관 대기열은 아니다.
- 서버에서 이미 생성한 취소·거절 안내는 앱에서 또 발송하지 않는다.
- 예약 대기열은 한 번에 20건, 발송 작업 임대 2분, 최대 8회 재시도하며 24시간 지난 소식은 보내지 않는다. 조회 실패를 기기 없음으로 처리하지 않는다.
- 한 사람의 여러 기기 중 일부만 실패하면 성공한 기기의 영수증을 보존하고 실패한 기기만 재시도한다. 발송 성공 직후 서버가 중단되어 영수증 저장 자체가 실패한 경우까지 정확히 한 번을 보장하지는 않는다.
- FCM의 일반 400/404 응답으로 기기 토큰을 삭제하지 않는다. 명확한 UNREGISTERED 오류만 삭제한다.

## 재배포·운영 순서

1. `20260912100000_push_delivery_retry.sql`을 적용한다. 기존 마이그레이션은 재실행하지 않는다.
2. `supabase/functions/push`를 배포한다. `delivery.ts`도 포함한다. 기존 발송 키를 유지한다.
3. 운영의 실제 service role 키를 Supabase Vault에 `service_role_key` 이름으로 안전하게 저장한다. 저장소·터미널 출력·채팅에 값을 남기지 않는다.
4. `pg_net` 확장을 확인한 뒤 `supabase/ops/enable-push-scheduler.sql`을 실행한다. 대상 프로젝트 URL을 확인한다. 1분 주기이며 동일 이름으로 재실행하면 작업을 갱신한다.
5. 예약 작업의 HTTP 응답을 확인한다. cron 실행 성공만으로 실제 APNs/FCM 발송 성공을 판단하지 않는다. `retry_pending`, `sent`, 오류 상태와 최근 기기 등록 수를 함께 확인한다.
6. 웹 배포 및 네이티브 동기화 후 Codemagic에서 앱을 다시 빌드한다. 설치된 앱은 내장 파일을 사용하므로 웹 배포만으로 등록 코드·알림 채널이 갱신되지 않는다.

구버전 앱을 포함한 최종 시험: iPhone 및 Android에서 각각 로그인 → OS 알림 허용 → 앱을 배경으로 보내거나 화면 잠금 → 테스트 계정 간 채팅·신청·승인 → 수신 알림 탭 후 화면 이동. 거부 후 설정에서 허용하고 복귀, 로그아웃·계정 전환, 네트워크 끊김·복구도 확인한다. 실제 사용자에게 시험 알림을 보내지 않는다.

## 로컬 검사

- `cd web && node scripts/test-push.cjs`
- `NODE_PATH=/path/to/pglite/node_modules node supabase/tests/run-push-retry-test.cjs`
- 변경된 웹 코드 타입·린트 검사. 운영 키나 실제 푸시 없이 모의 기기·발송 서버 및 격리 PostgreSQL에서 검사한다.
