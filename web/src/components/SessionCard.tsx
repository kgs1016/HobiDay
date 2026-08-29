import Link from "next/link";
import { slotsLeft, type Session } from "@/lib/mock";
import { totalSeats } from "@/lib/capacity";
import { AvatarFallback, PhotoIcon } from "@/components/icons";
import { ageRangeLabel } from "@/lib/meetupOptions";

/* 목록의 한 줄 — 떠 있는 카드가 아니라 feed 의 항목이다.
   테두리·그림자·둥근 컨테이너 없이 사진과 여백, 얇은 divider(부모의
   divide-y)로만 구분한다. */
export default function SessionCard({
  session: s,
  hostPhotoUrl,
  gymPhotoUrl,
}: {
  session: Session;
  /* 사진 버킷이 비공개라 서명 URL 을 목록에서 한 번에 받아 넘긴다 */
  hostPhotoUrl?: string;
  /* 클라이밍짐 사진 — 아직 데이터가 없어 자리만 잡아둔다.
     URL 이 넘어오면 그대로 그려진다. */
  gymPhotoUrl?: string;
}) {
  const left = slotsLeft(s);
  const full = left.total <= 0;
  const total = totalSeats(s.capacity, s.genderMode);
  const joined = s.maleJoined + s.femaleJoined;
  /* 이미 신청했거나 내가 연 모임이면 목록에서부터 누를 일이 없다.
     cancelled 는 취소한 것이므로 다시 신청할 수 있어야 한다. */
  const mine =
    s.iAmHost
      ? "내가 연 모임"
      : s.myStatus === "waiting"
        ? "승인 대기"
        : s.myStatus === "confirmed"
          ? "참여 중"
          : null;

  /* 목록에서는 모집 현황만 — 실제 신청은 상세 화면에서 한다.
     성비 모임은 총원만으로는 어느 자리가 남았는지 알 수 없어서,
     남은 성별 자리를 글로 덧붙인다. 색(blue/pink)으로 말하지 않는다. */
  const genderLeft =
    s.genderMode === "any"
      ? null
      : [left.male > 0 && `남 ${left.male}`, left.female > 0 && `여 ${left.female}`]
          .filter(Boolean)
          .join(" · ");
  const slots = mine ? (
    <span
      className={`shrink-0 text-[12px] font-medium ${
        s.myStatus === "confirmed" ? "text-accent" : "text-muted"
      }`}
    >
      {mine}
    </span>
  ) : full ? (
    <span className="shrink-0 text-[12px] text-faint">마감</span>
  ) : genderLeft ? (
    <span className="shrink-0 text-[12.5px] text-muted">
      {joined}/{total} ·{" "}
      <b className="font-semibold text-ink">{genderLeft}자리</b>
    </span>
  ) : (
    <span className="shrink-0 text-[12.5px] text-muted">
      <b className="font-semibold text-ink">{joined}</b> / {total}명
    </span>
  );

  return (
    <Link
      href={`/session?id=${s.id}`}
      className="flex gap-3.5 py-4 transition-colors active:bg-surface2"
    >
      {/* 클라이밍짐 사진 */}
      {gymPhotoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={gymPhotoUrl}
          alt=""
          className="h-[84px] w-[84px] shrink-0 rounded-lg object-cover"
        />
      ) : (
        <span className="flex h-[84px] w-[84px] shrink-0 items-center justify-center rounded-lg bg-surface2 text-faint">
          <PhotoIcon size={24} />
        </span>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* 장소 */}
        <p className="truncate text-[15px] font-semibold tracking-tight">
          <span className="align-middle">{s.gym}</span>
          {s.isAway && (
            <span className="ml-1.5 align-middle text-[11px] font-normal text-faint">
              원정
            </span>
          )}
        </p>

        {/* 일시 */}
        <p className="mt-[3px] text-[13px] text-muted">
          {s.date} · {s.start}–{s.end}
        </p>

        {/* 구하는 조건 — 사진 옆 좁은 폭이라 레벨은 짧게.
            성별 무관 모임만 따로 알린다 (반반이 기본값이라). */}
        <p className="mt-[3px] truncate text-[12.5px] text-muted">
          {s.levelMin === s.levelMax
            ? `L${s.levelMin}`
            : `L${s.levelMin}–L${s.levelMax}`}{" "}
          · {ageRangeLabel(s.ageMin, s.ageMax)}
          {s.genderMode === "any" && " · 성별 무관"}
        </p>

        {/* 호스트 · 모집 현황 */}
        <div className="mt-auto flex items-center justify-between gap-2 pt-1">
          {s.host ? (
            <div className="flex min-w-0 items-center gap-1.5">
              {hostPhotoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hostPhotoUrl}
                  alt=""
                  className="h-5 w-5 shrink-0 rounded-full object-cover"
                />
              ) : (
                <AvatarFallback size={20} />
              )}
              <p className="truncate text-[12px] text-muted">
                {[
                  s.host.age ? `${s.host.nickname} ${s.host.age}` : s.host.nickname,
                  s.host.level && `L${s.host.level}`,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            </div>
          ) : (
            <span />
          )}
          {slots}
        </div>
      </div>
    </Link>
  );
}
