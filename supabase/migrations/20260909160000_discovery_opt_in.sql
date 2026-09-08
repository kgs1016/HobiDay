-- 사람 찾기 등록은 선택. 새 프로필에서 공개 선택을 생략하면 비공개로 저장한다.
-- 기존 회원의 공개 상태는 유지하며 프로필 설정에서 직접 변경할 수 있다.
alter table public.profiles alter column is_public set default false;
