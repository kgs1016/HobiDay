import Link from "next/link";
import { level, levelRangeLabel } from "@/lib/levels";
import { slotsLeft, type Session } from "@/lib/mock";

function ageLabel(min: number, max: number) {
  const band = (n: number) => {
    const decade = Math.floor(n / 10) * 10;
    const pos = n % 10 <= 3 ? "초반" : n % 10 <= 6 ? "중반" : "후반";
    return `${decade}대 ${pos}`;
  };
  const a = band(min);
  const b = band(max);
  return a === b ? a : `${a} ~ ${b}`;
}

export default function SessionCard({
  session: s,
  hostPhotoUrl,
}: {
  session: Session;
  /* 사진 버킷이 비공개라 서명 URL 을 목록에서 한 번에 받아 넘긴다 */
  hostPhotoUrl?: string;
}) {
  const left = slotsLeft(s);
  const full = left.total <= 0;
  const anyGender = s.genderMode === "any";
  /* 이미 신청했거나 내가 연 모임이면 목록에서부터 누를 일이 없다.
     cancelled 는 취소한 것이므로 다시 신청할 수 있어야 한다. */
  const mine =
    s.iAmHost
      ? "내가 연 모임"
      : s.myStatus === "waiting"
        ? "승인 대기중"
        : s.myStatus === "confirmed"
          ? "참여 중"
          : null;

  return (
    <Link
      href={`/session?id=${s.id}`}
      className="block rounded-2xl border border-line bg-surface p-4 active:scale-[0.99] transition-transform"
    >
      {/* 짐 · 시간 */}
      <div className="flex items-center justify-between gap-2">
        <p className="font-extrabold text-[15.5px] tracking-tight">
          {s.gym}
          {s.isAway && (
            <span className="ml-1.5 text-[11px] font-bold text-mint align-middle">
              🗺 원정
            </span>
          )}
        </p>
        <p className="text-[13px] text-muted shrink-0">
          {s.date} · {s.start}~{s.end}
        </p>
      </div>

      {/* 레벨 · 나이 */}
      <p className="mt-2 text-[13.5px] text-ink/90">
        {levelRangeLabel(s.levelMin, s.levelMax)}
      </p>
      <p className="mt-0.5 text-[13px] text-muted">{ageLabel(s.ageMin, s.ageMax)}</p>

      {/* 호스트 — 참가자와 달리 확정 전에도 보인다 */}
      {s.host && (
        <div className="mt-3 flex items-center gap-2.5 border-t border-line pt-3">
          {hostPhotoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={hostPhotoUrl}
              alt=""
              className="h-8 w-8 shrink-0 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface2 text-[15px]">
              🧗
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold text-muted">호스트</p>
            <p className="truncate text-[13px] font-bold">
              {[
                // 소개 페이지 목업과 같은 순서 — "서연 27 · 연남동 · L3 중급"
                s.host.age ? `${s.host.nickname} ${s.host.age}` : s.host.nickname,
                s.host.area,
                s.host.level && `L${s.host.level} ${level(s.host.level).name}`,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
        </div>
      )}

      {/* 자리 현황 */}
      <div className="mt-3 flex items-center justify-between border-t border-line pt-3">
        {full ? (
          <span className="text-[13px] font-bold text-muted">모집 마감</span>
        ) : (
          <span className="text-[13px] font-semibold">
            {anyGender ? (
              /* 성별 무관 모임에는 "남 자리 / 여 자리" 가 없다 */
              <span>{left.total}자리</span>
            ) : (
              <>
                {left.male > 0 && <span className="text-male">남 {left.male}자리</span>}
                {left.male > 0 && left.female > 0 && (
                  <span className="text-muted"> · </span>
                )}
                {left.female > 0 && (
                  <span className="text-female">여 {left.female}자리</span>
                )}
              </>
            )}
            <span className="text-muted"> 남음</span>
          </span>
        )}
        {/* 내 모임·신청한 모임은 마감보다 앞선다 — 확정된 자리가 "마감" 으로
            보이면 내가 못 들어간 것처럼 읽힌다 */}
        <span
          className={`rounded-lg px-3.5 py-1.5 text-[13px] font-bold ${
            mine || full ? "bg-surface2 text-muted" : "bg-accent text-white"
          }`}
        >
          {mine ?? (full ? "마감" : "참여 신청")}
        </span>
      </div>
    </Link>
  );
}
