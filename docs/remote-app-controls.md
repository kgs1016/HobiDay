# 앱 업데이트·점검 안내 운영

이 문서는 두 기능이 포함된 1.1.3 설치 이후의 동작을 설명한다. 기능이 없는 기존
바이너리에는 서버 설정만으로 화면을 추가할 수 없다. 새 버전 공개만으로 모든 사용자의
설치 버전이 바뀌지도 않는다.

## 원격 제어

- 점검: `app_maintenance.enabled/title/message`. 점검 중 일반 사용자에게 안내 화면만
  표시하고 서버에서도 서비스 접근을 막는다. `app_testers`의 지정 계정만 이용한다.
- 권장 업데이트: `app_config.ios_latest_version` / `android_latest_version`.
  현재 설치 버전보다 높으면 안내한다. ‘나중에’는 해당 플랫폼·버전에 한해 24시간 유지한다.
- 필수 업데이트: `ios_minimum_version` / `android_minimum_version`.
  이보다 낮은 버전의 서비스 화면을 렌더링하지 않는다. ‘나중에’가 없으며 스토어로 이동한다.
- 업데이트 문구: `app_config.update_title/update_message`.
- 점검과 업데이트를 독립적으로 조회한다. 필수 업데이트 화면이 점검 화면보다 우선한다.
  로그인·비밀번호 재설정·인증 콜백·문의·약관·탈퇴는 유지한다.
- 점검 중 지정 테스트 계정의 필수 업데이트는 서버에서 면제한다. 로그인 직후 정책을
  다시 확인하므로 익명 사용자에게 내려온 필수 업데이트 상태에 갇히지 않는다.
- 앱 실행, 복귀, 네트워크 재연결, 계정 변경 및 화면을 보고 있는 동안 30초마다 확인한다.
  서버 설정을 해제하면 같은 방식으로 화면을 복구한다. 강제 로그아웃은 하지 않는다.

## 운영 순서

1. Codemagic은 이 변경이 포함된 **최신 main**으로 iOS/Android를 각각 빌드한다.
2. TestFlight/내부 테스트에서 일반 계정·테스트 계정으로 아래 시나리오를 확인한다.
3. 스토어 심사·출시를 마치고 해당 국가에서 다운로드할 수 있는지 확인한다.
4. 공개된 플랫폼의 `latest_version`만 올린다. 양쪽 스토어 공개일이 다르면 따로 적용한다.
5. 필수 업데이트가 필요한 경우에만 같은 플랫폼의 `minimum_version`을 올린다.
   최소 버전은 최신 버전보다 높게 설정하지 않는다. 미출시 버전을 요구하면 사용자가
   업데이트할 방법이 없으므로 출시 전에 정책을 올리지 않는다.
6. 오류가 있으면 `minimum_version=null`로 필수 요구를 해제한다. 잘못 올린 권장
   버전도 실제 다운로드 가능한 버전으로 되돌린다. 이미 확인한 필수 정책은 단순 통신
   실패로 사라지지 않으며, 성공적으로 해제 정책을 조회하면 풀린다.

예: **1.1.4가 Android에 실제 공개된 뒤에만** 관리자 SQL Editor에서 실행한다.

```sql
begin;
update public.app_config
set android_latest_version = '1.1.4',
    android_minimum_version = '1.1.4', -- 권장 안내만 하려면 null
    update_title = '앱을 업데이트해 주세요',
    update_message = '더 나은 하비데이가 준비됐어요.'
where id = 1;
commit;
```

이 예제는 문서일 뿐이며 운영에 실행하지 않았다. iOS는 대응하는 `ios_` 필드를 사용한다.

점검 시작은 `supabase/ops/renewal-close.sql`, 재개는 `renewal-reopen.sql`을 사용한다.
배치 작업의 중지·복구까지 포함하므로 단순히 enabled만 바꾸는 것보다 이 절차를 따른다.
문구만 바꿀 때는 활성 상태를 유지한 채 아래 필드를 수정한다.

```sql
update public.app_maintenance
set title = '리뉴얼 준비 중', message = '조금만 기다려주세요.', updated_at = now()
where id = 1;
```

## 검증과 빌드 방어

- `web/scripts/test-app-update.cjs`: 버전 비교, 필수/권장, 잘못된 정책 거부, 버전별 미루기.
- `web/scripts/test-release-gates.cjs`: 실제 React 화면과 가짜 Capacitor/Supabase를 이용해
  iOS·Android 각각 점검 중 업데이트 확인, 필수 안내 우선순위, 미루기 후 필수 전환,
  스토어 열기/실패 링크, 통신 실패, 딥링크 차단, 테스트 로그인 예외, 30초 점검 전환,
  서비스 재개, 실제 설치 버전 변경 후 안내 해제를 확인한다.
- `supabase/tests/run-maintenance-test.cjs`: 서버 역할·계정별 접근, 필수 버전 테스터 예외,
  점검 중 푸시 차단, 재개 시 복구를 분리된 로컬 DB에서 검사한다.
- `npm run sync`: 버전 정책 테스트 → 정적 빌드 → 네이티브 동기화 → `out`·Android·iOS
  세 자산 묶음의 두 RPC/필수 안내 포함 검사를 수행한다. 빠진 경우 배포 빌드가 실패한다.

브라우저 테스트는 `web/.env.local`의 공개 Supabase URL만 읽는다. 운영 API는 전부
가로채며 실제 로그인·계정 수정·정책 변경은 하지 않는다. 실행 예:

```sh
# web 디렉터리, 별도 터미널
npm run dev -- --port 3195
# Playwright를 사용할 수 있는 Node 환경에서
GATE_TEST_URL=http://127.0.0.1:3195 node scripts/test-release-gates.cjs
# 필요한 경우 PLAYWRIGHT_MODULE에 기존 설치 모듈 경로를 지정한다.
```

실기기에서 빌드 설치와 스토어 앱 이동을 마지막으로 확인해야 한다. 브라우저 브리지
시뮬레이션과 정적 빌드 성공은 서명된 IPA/AAB의 실기기 검증을 대체하지 않는다.
