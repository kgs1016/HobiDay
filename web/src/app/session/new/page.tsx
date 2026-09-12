"use client";
import { requireParticipationProfile, handleParticipationError } from "@/lib/participation";

import { useEffect, useRef, useState } from "react";
import { useQueryId } from "@/lib/queryId";
import { useRouter } from "next/navigation";
import { LEVELS, levelRangeLabel, type LevelId } from "@/lib/levels";
import { CAPACITY_CHOICES } from "@/lib/capacity";
import {
  AGE_FROM,
  MOCK_GYMS,
  ageToOptions,
  clampAgeTo,
} from "@/lib/meetupOptions";
import {
  hasSupabase,
  currentUser,
  fetchGyms,
  createSession,
  fetchEditableSession,
  updateSession,
  type EditableSession,
  type Gym,
} from "@/lib/supabase";
import Calendar, { monthOf, ymd } from "@/components/Calendar";
import BackButton from "@/components/BackButton";
import GymPicker from "@/components/GymPicker";
import { ChevronDownIcon } from "@/components/icons";
import { useNow } from "@/lib/browserState";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 text-[13.5px] font-semibold">{label}</p>
      {children}
    </div>
  );
}

function Chip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-2 text-[13px] font-medium transition-colors ${
        active
          ? "border-accent bg-accent-soft text-accent-strong"
          : "border-line bg-surface text-muted"
      }`}
    >
      {children}
    </button>
  );
}

const hm = (d: Date) =>
  `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;

/* 화면을 열자마자 쓸 수 있는 날짜·시각.
   날짜만 오늘로 채우고 시각을 15:00 에 두면, 저녁에 들어온 사람은
   손도 대기 전에 "이미 지난 시각이에요" 와 잠긴 버튼을 본다 — 아무것도
   안 했는데 혼난 기분이 든다. 그래서 시각도 같이 옮긴다.

   서버는 "지금부터 30분 뒤" 부터 받는다. 여유를 조금 더 두고 다음 30분
   칸으로 올린다. 밤늦게 열어서 오늘 안에는 더 잡을 수 없으면 내일
   오후로 넘긴다 — 오늘을 고집하면 어차피 잠긴 화면이 된다. */
function defaultSlot(timestamp: number) {
  const now = new Date(timestamp);
  const today = ymd(now);
  const start = new Date(now.getTime() + 40 * 60 * 1000);
  start.setSeconds(0, 0);
  start.setMinutes(Math.ceil(start.getMinutes() / 30) * 30);

  // 22시가 넘으면 두 시간을 잡는 순간 자정을 넘는다
  if (ymd(start) === today && start.getHours() < 22) {
    const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
    return { date: today, start: hm(start), end: hm(end) };
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  return { date: ymd(tomorrow), start: "15:00", end: "17:00" };
}

// iOS 는 16px 미만 입력창에 포커스하면 화면을 강제로 확대한다 — 16px 유지
const boxCls =
  "rounded-lg border border-line bg-surface px-3 py-2.5 text-[16px] text-ink [color-scheme:light] focus:border-accent focus:outline-none";
const inputCls = `w-full ${boxCls}`;

export default function NewSession() {
  const now = useNow();
  const id = useQueryId();
  if (!now || id === undefined) return <main className="px-4 pt-24 text-center text-sm text-muted">불러오는 중…</main>;
  return id ? <EditSessionLoader key={id} id={id} now={now} /> : <NewSessionForm now={now} />;
}

function EditSessionLoader({ id, now }: { id: string; now: number }) {
  const [session, setSession] = useState<EditableSession | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let alive = true;
    fetchEditableSession(id).then(s => {
      if (!alive) return;
      if (!s) setError("내가 만든 모임만 수정할 수 있어요");
      else if (!["open", "confirmed"].includes(s.status) || new Date(s.starts_at).getTime() <= Date.now())
        setError("시작되거나 종료된 모임은 수정할 수 없어요");
      else { setError(""); setSession(s); }
    }).catch(e => { if (alive) setError(e instanceof Error ? e.message : "모임을 불러오지 못했어요"); });
    return () => { alive = false; };
  }, [id, attempt]);
  if (error) return <main className="px-4 py-5"><BackButton fallback={`/session?id=${id}`} /><p role="alert" className="mt-8 text-sm">{error}</p>
    <button className="button-secondary mt-4 rounded-lg px-4 py-2" onClick={() => setAttempt(a => a + 1)}>다시 시도</button></main>;
  if (!session) return <main className="px-4 pt-24 text-center text-sm text-muted">불러오는 중…</main>;
  return <NewSessionForm key={id} now={now} existing={session} />;
}

function NewSessionForm({ now, existing }: { now: number; existing?: EditableSession }) {
  const router = useRouter();
  // 실제 브라우저 시각을 받은 뒤 한 번만 초기화해 사용자 입력을 유지한다.
  const [initialSlot] = useState(() => existing ? { date: ymd(new Date(existing.starts_at)), start: hm(new Date(existing.starts_at)), end: hm(new Date(existing.ends_at)) } : defaultSlot(now));
  /* 클라이밍장 — gym master 에서 고른다. 마스터를 못 받는 환경(mock ·
     마이그레이션 전 DB)에서는 예전 자유입력 + 칩으로 동작한다. */
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [gym, setGym] = useState(existing?.gym ?? MOCK_GYMS[0]);
  const [gymId, setGymId] = useState<string | undefined>(existing?.gym_id ?? undefined);
  const [picking, setPicking] = useState(false);
  useEffect(() => {
    if (!hasSupabase()) return;
    let alive = true;
    fetchGyms().then((list) => {
      if (alive) setGyms(list);
    });
    return () => {
      alive = false;
    };
  }, []);
  const masterMode = !!gyms && gyms.length > 0;
  const selected = masterMode ? gyms!.find((g) => g.id === gymId) : undefined;

  const [date, setDate] = useState(initialSlot.date);
  // 보고 있는 달. 날짜를 고르면 그 달에 머문다
  const [month, setMonth] = useState(monthOf(initialSlot.date));

  const [startTime, setStartTime] = useState(initialSlot.start);
  const [endTime, setEndTime] = useState(initialSlot.end);
  // Keep the original timestamp when the displayed date/time is unchanged (including seconds).
  const startsAtValue = existing && date === initialSlot.date && startTime === initialSlot.start
    ? existing.starts_at : `${date}T${startTime}:00`;
  const endsAtValue = existing && date === initialSlot.date && endTime === initialSlot.end
    ? existing.ends_at : `${date}T${endTime}:00`;

  /* 달력에서 지난 날짜·90일 밖을 아예 못 고르게 한다 (서버도 같은 범위를
     거부한다). now 를 따라가니 자정을 넘겨도 어제가 남지 않는다. */
  const range = (() => {
    if (!now) return { min: "", max: "" };
    const in90 = new Date(now);
    in90.setDate(in90.getDate() + 90);
    return { min: ymd(new Date(now)), max: ymd(in90) };
  })();
  /* 최대 정원 = 호스트를 포함해 여기까지만 받는다 (2~6명).
     채워야 하는 수가 아니다 — 둘만 모여도 모임은 열린다. */
  const [capacity, setCapacity] = useState(existing?.capacity ?? 4);
  const [levelMin, setLevelMin] = useState<LevelId>(existing?.level_min ?? 2);
  const [levelMax, setLevelMax] = useState<LevelId>(existing?.level_max ?? 3);
  const [ageMin, setAgeMin] = useState<number>(existing?.age_min ?? 27);
  const [ageMax, setAgeMax] = useState<number>(existing?.age_max ?? 33);
  const [note, setNote] = useState(existing?.note ?? "");
  const submitting = useRef(false);
  const [saveError, setSaveError] = useState("");
  const [busy, setBusy] = useState(false);

  /* 못 만드는 이유. 있으면 등록 버튼을 잠그고 그 자리에 이유를 적는다.
     예전에는 버튼이 멀쩡해 보이다가 누른 뒤에야 alert 로 알려줬다 —
     달력이 지난 날짜를 흐리게 해도 칸에 직접 쳐 넣으면 들어오고,
     "오늘 + 방금 지난 시각" 은 달력만으로는 못 막는다.

     여기서 조용히 고쳐주지는 않는다. 연도를 잘못 친 것(2025 ↔ 2026)일
     수도 있어서, 값을 바꿔치기하면 무엇이 틀렸는지 영영 모른다. */
  const blocked = (() => {
    if (masterMode && !gymId && !existing) return "클라이밍장을 골라주세요";
    if (!masterMode && !gym.trim()) return "클라이밍장을 입력해주세요";
    if (!date) return "날짜를 골라주세요";
    if (new Date(endsAtValue).getTime() <= new Date(startsAtValue).getTime()) return "종료 시각이 시작보다 빨라요";
    if (!now) return null; // 시각을 아직 못 읽었다 — 서버가 마지막으로 막는다
    const startsAt = new Date(startsAtValue).getTime();
    if (startsAt < now) return "이미 지난 시각이에요";
    if (startsAt !== (existing ? new Date(existing.starts_at).getTime() : null) && startsAt < now + 30 * 60 * 1000)
      return "모임 시간이 너무 임박했어요 · 지금부터 30분 뒤부터 열 수 있어요";
    if (startsAt > now + 90 * 24 * 60 * 60 * 1000)
      return "모임은 90일 안쪽으로만 열 수 있어요";
    if (existing && capacity < existing.confirmed) return `확정된 ${existing.confirmed}명보다 정원을 줄일 수 없어요`;
    if (existing && new Date(existing.starts_at).getTime() <= now) return "시작된 모임은 수정할 수 없어요";
    if (note.length > 1000) return "한마디는 1,000자 이내로 적어주세요";
    return null;
  })();

  const toggleLevel = (id: LevelId) => {
    /* 범위 밖을 누르면 그쪽으로 넓히고, 범위 안을 누르면 그 레벨 하나로.
       L1~L5 전체도 된다 — 필터와 같은 동작이다 (SessionFilterBar).
       "인접 1단계까지" 제한은 2026-09-01 에 풀었다 (full_level_range). */
    if (id < levelMin) setLevelMin(id);
    else if (id > levelMax) setLevelMax(id);
    else {
      setLevelMin(id);
      setLevelMax(id);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || blocked) return;
    submitting.current = true;
    setBusy(true); setSaveError("");
    try {
      if (!(await requireParticipationProfile(router))) return;
      if (!hasSupabase()) { setSaveError("미리보기에서는 저장되지 않아요"); return; }
      const user = await currentUser();
      if (!user) { router.push("/login"); return; }
      const values = { gym, gymId, startsAt: new Date(startsAtValue).toISOString(),
        endsAt: new Date(endsAtValue).toISOString(), capacity, levelMin, levelMax, ageMin, ageMax, note };
      const r = existing ? await updateSession(existing.id, existing.edit_version, values) : await createSession(values);
      if (handleParticipationError(r.error, router)) return;
      const messages: Record<string, string> = {
        too_soon: "변경할 시작 시간은 지금부터 30분 이후로 골라주세요", past: "이미 지난 시각이에요",
        too_far: "모임은 90일 안쪽으로만 열 수 있어요", bad_capacity: "최대 정원을 다시 골라주세요",
        below_members: "참가 인원이 늘었어요. 확정 인원보다 정원을 줄일 수 없어요",
        bad_gym: "클라이밍장을 다시 선택해주세요", bad_time: "종료 시각은 시작 시각 이후로 골라주세요",
        bad_level: "참가 수준을 다시 골라주세요", bad_age: "나이대를 다시 골라주세요", long_note: "한마디는 1,000자 이내로 적어주세요",
        not_host: "내가 만든 모임만 수정할 수 있어요", closed: "시작되거나 종료된 모임은 수정할 수 없어요",
        conflict: "다른 화면에서 모임이 수정됐어요. 모임 정보로 돌아가 다시 열어주세요",
      };
      if (r.error) { setSaveError(messages[r.error] ?? "저장 결과를 확인하지 못했어요. 다시 시도해주세요"); return; }
      if (!r.id) { setSaveError("저장 결과를 확인하지 못했어요. 다시 시도해주세요"); return; }
      alert(existing ? "모임 정보를 수정했어요" : "모임을 열었어요!");
      router.replace(existing ? `/session?id=${existing.id}` : "/");
    } catch { setSaveError("저장하지 못했어요. 연결을 확인하고 다시 시도해주세요"); }
    finally { submitting.current = false; setBusy(false); }

  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton fallback={existing ? `/session?id=${existing.id}` : "/"} />
        <h1 className="text-[18px] font-bold tracking-tight">{existing ? "모임 수정" : "모임 만들기"}</h1>
      </header>

      <form onSubmit={submit}>
      <fieldset disabled={busy} className="flex min-w-0 flex-col gap-6 pb-8">
        <Field label="클라이밍장">
          {masterMode ? (
            /* 서울·경기 200곳 — 칩으로 못 늘어놓는다. 검색 시트에서 고른다 */
            <>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="button-secondary flex w-full items-center justify-between rounded-lg px-3.5 py-3 text-left"
              >
                <span
                  className={`text-[16px] ${selected ? "text-ink" : "text-faint"}`}
                >
                  {selected ? selected.name : existing ? gym : "클라이밍장을 검색해서 선택"}
                </span>
                <ChevronDownIcon size={16} className="shrink-0 text-faint" />
              </button>
              {selected && (
                <p className="mt-1.5 text-[12px] text-faint">
                  {selected.address}
                </p>
              )}
            </>
          ) : (
            /* mock · 마이그레이션 전 DB 폴백 — 예전 자유입력 그대로 */
            <>
              <input
                value={gym}
                onChange={(e) => setGym(e.target.value)}
                placeholder="예: 더클라임 강남점"
                className={inputCls}
              />
              <div className="mt-2 flex flex-wrap gap-1.5">
                {MOCK_GYMS.map((g) => (
                  <Chip key={g} active={gym === g} onClick={() => setGym(g)}>
                    {g}
                  </Chip>
                ))}
              </div>
            </>
          )}
        </Field>

        <Field label="날짜">
          {/* 지난 날짜와 90일 밖은 눌리지 않는다 (달력이 직접 막는다).
              min 이 빈 문자열인 동안 — 브라우저에서 시각을 읽기 전 —
              은 아무 날도 안 막힌 채로 잠깐 보이지만, 그때는 등록
              버튼이 잠겨 있어서 넘어가지 않는다. */}
          <div className="rounded-xl border border-line bg-surface p-3">
            <Calendar
              from={date}
              to={date}
              onPick={setDate}
              min={range.min}
              max={range.max}
              month={month}
              onMonth={setMonth}
            />
          </div>
        </Field>

        <Field label="시간">
          {/* 시각 칸을 반 폭으로 늘려놓으면 "04:30 PM" 옆이 텅 빈다.
              글자만큼만 차지하게 두고 사이에 ~ 를 넣으면, 두 칸이 각각의
              입력이 아니라 하나의 범위로 읽힌다 (필터의 시간 칸과 같은 모양) */}
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className={boxCls}
            />
            <span className="text-[13px] text-muted">~</span>
            <input
              type="time"
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className={boxCls}
            />
          </div>
        </Field>

        {/* 호스트를 포함한 수다 */}
        <Field label="최대 정원">
          <div className="flex flex-wrap gap-1.5">
            {(existing && existing.capacity > 6 ? [...CAPACITY_CHOICES, existing.capacity] : CAPACITY_CHOICES).map((c) => (
              <Chip key={c} active={capacity === c} onClick={() => setCapacity(c)}>
                {c}명
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="참가 수준">
          <div className="flex flex-wrap gap-1.5">
            {LEVELS.map((l) => (
              <Chip
                key={l.id}
                active={l.id >= levelMin && l.id <= levelMax}
                onClick={() => toggleLevel(l.id)}
              >
                {l.name}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {levelRangeLabel(levelMin, levelMax)}
          </p>
        </Field>

        <Field label="나이대">
          <div className="grid grid-cols-2 gap-2">
            <select
              value={ageMin}
              onChange={(e) => {
                /* 끝 칸은 시작 칸을 따라간다. 시작을 뒤로 옮겼는데 끝이
                   그대로면 "40대 초반부터 ~ 20대 후반까지" 가 된다. */
                const v = Number(e.target.value);
                setAgeMin(v);
                setAgeMax(clampAgeTo(v, ageMax));
              }}
              className={inputCls}
            >
              {(AGE_FROM.some(([, v]) => v === ageMin) ? AGE_FROM : [[`${ageMin}세부터`, ageMin] as const, ...AGE_FROM]).map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
            <select
              value={ageMax}
              onChange={(e) => setAgeMax(Number(e.target.value))}
              className={inputCls}
            >
              {(ageToOptions(ageMin).some(([, v]) => v === ageMax) ? ageToOptions(ageMin) : [...ageToOptions(ageMin), [`${ageMax}세까지`, ageMax] as const]).map(([label, v]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="한마디 (선택)">
          <input
            value={note}
            maxLength={1000}
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 초보도 환영해요, 같이 문제 풀어요"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </Field>

        <div>
          <button
            type="submit"
            disabled={busy || !!blocked}
            className="button-primary w-full rounded-xl py-3.5 text-[15px] font-semibold"
          >
            {busy ? "저장 중…" : existing ? "변경사항 저장" : "모임 등록하기"}
          </button>
          {blocked && (
            <p className="mt-2 text-center text-[12.5px] text-muted">{blocked}</p>
          )}
        </div>
        {existing && <p className="text-center text-xs text-muted">변경 내용은 신청자와 참가자에게 알려드려요.</p>}
        {saveError && <p role="alert" className="text-center text-sm text-danger">{saveError}</p>}
      </fieldset>
      </form>

      {picking && gyms && (
        <GymPicker
          gyms={gyms}
          onClose={() => setPicking(false)}
          onSelect={(g) => {
            setGym(g.name);
            setGymId(g.id);
            setPicking(false);
          }}
        />
      )}
    </main>
  );
}
