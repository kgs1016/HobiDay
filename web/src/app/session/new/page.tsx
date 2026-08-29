"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LEVELS, type LevelId } from "@/lib/levels";
import {
  CAPACITY_CHOICES,
  GENDER_MODES,
  capacityChipLabel,
  type GenderMode,
} from "@/lib/capacity";
import {
  AGE_FROM,
  MOCK_GYMS,
  ageToOptions,
  clampAgeTo,
} from "@/lib/meetupOptions";
import {
  hasSupabase,
  currentUser,
  fetchMyProfileDb,
  fetchGyms,
  createSession,
  type Gym,
} from "@/lib/supabase";
import { isProfileComplete } from "@/lib/profileGate";
import Calendar, { monthOf, ymd } from "@/components/Calendar";
import BackButton from "@/components/BackButton";
import GymPicker from "@/components/GymPicker";
import { ChevronDownIcon } from "@/components/icons";

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
          ? "border-accent bg-accent text-white"
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
function defaultSlot() {
  const now = new Date();
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
  const router = useRouter();
  /* 암장 — gym master 에서 고른다. 마스터를 못 받는 환경(mock ·
     마이그레이션 전 DB)에서는 예전 자유입력 + 칩으로 동작한다. */
  const [gyms, setGyms] = useState<Gym[] | null>(null);
  const [gym, setGym] = useState(MOCK_GYMS[0]);
  const [gymId, setGymId] = useState<string | undefined>();
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

  /* 빈 값으로 시작해서 브라우저에서 오늘로 채운다. 렌더 중에 new Date()
     를 부르면 서버가 미리 그려둔 날이 박혀서, 하루만 지나도 어제가
     기본값이 된다. 달력을 아무 데도 안 짚은 채 열어두면 여는 사람이
     "어디부터 고를 수 있는지" 를 스스로 알아내야 한다. */
  const [date, setDate] = useState("");
  // 보고 있는 달. 날짜를 고르면 그 달에 머문다
  const [month, setMonth] = useState(monthOf(""));

  const [startTime, setStartTime] = useState("15:00");
  const [endTime, setEndTime] = useState("17:00");

  /* 지금 시각. 렌더 중에 new Date() 를 부르면 프리렌더된 값이 박혀서
     하루만 지나도 어제가 기준이 된다. 브라우저에서 읽고, 30초마다
     새로 본다 — 화면을 켜둔 채로 시작 시각이 지나가면 그 순간부터
     등록 버튼이 잠겨야 한다.
     0 = 아직 안 읽음 (이때는 시각 규칙을 재지 않는다). */
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const slot = defaultSlot();
    setDate((d) => d || slot.date);
    setMonth(monthOf(slot.date));
    setStartTime(slot.start);
    setEndTime(slot.end);
    const t = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  /* 달력에서 지난 날짜·90일 밖을 아예 못 고르게 한다 (서버도 같은 범위를
     거부한다). now 를 따라가니 자정을 넘겨도 어제가 남지 않는다. */
  const range = (() => {
    if (!now) return { min: "", max: "" };
    const in90 = new Date(now);
    in90.setDate(in90.getDate() + 90);
    return { min: ymd(new Date(now)), max: ymd(in90) };
  })();
  /* 성비를 먼저 고르고 정원을 고른다 — 정원의 뜻이 성비에 따라 달라진다.
     반반이면 성별당 인원(2 = 2:2), 무관이면 총 인원(4 = 4명). */
  const [genderMode, setGenderMode] = useState<GenderMode>("balanced");
  const [capacity, setCapacity] = useState(2);
  const [levelMin, setLevelMin] = useState<LevelId>(2);
  const [levelMax, setLevelMax] = useState<LevelId>(3);
  const [ageMin, setAgeMin] = useState<number>(27);
  const [ageMax, setAgeMax] = useState<number>(33);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  /* 모드를 바꾸면 정원도 그 모드에서 고를 수 있는 값으로 옮겨준다.
     그냥 두면 "무관인데 정원 1(혼자 하는 모임)" 이 만들어져 서버가
     거절한다. 2 는 양쪽 모드에 다 있어서 안전한 착지점이다. */
  const pickMode = (m: GenderMode) => {
    setGenderMode(m);
    if (!CAPACITY_CHOICES[m].includes(capacity)) setCapacity(2);
  };

  /* 못 만드는 이유. 있으면 등록 버튼을 잠그고 그 자리에 이유를 적는다.
     예전에는 버튼이 멀쩡해 보이다가 누른 뒤에야 alert 로 알려줬다 —
     달력이 지난 날짜를 흐리게 해도 칸에 직접 쳐 넣으면 들어오고,
     "오늘 + 방금 지난 시각" 은 달력만으로는 못 막는다.

     여기서 조용히 고쳐주지는 않는다. 연도를 잘못 친 것(2025 ↔ 2026)일
     수도 있어서, 값을 바꿔치기하면 무엇이 틀렸는지 영영 모른다. */
  const blocked = (() => {
    if (masterMode && !gymId) return "암장을 골라주세요";
    if (!masterMode && !gym.trim()) return "암장을 입력해주세요";
    if (!date) return "날짜를 골라주세요";
    if (endTime <= startTime) return "종료 시각이 시작보다 빨라요";
    if (!now) return null; // 시각을 아직 못 읽었다 — 서버가 마지막으로 막는다
    const startsAt = new Date(`${date}T${startTime}:00`).getTime();
    if (startsAt < now) return "이미 지난 시각이에요";
    if (startsAt < now + 30 * 60 * 1000)
      return "모임 시간이 너무 임박했어요 · 지금부터 30분 뒤부터 열 수 있어요";
    if (startsAt > now + 90 * 24 * 60 * 60 * 1000)
      return "모임은 90일 안쪽으로만 열 수 있어요";
    return null;
  })();

  const toggleLevel = (id: LevelId) => {
    // 인접 1단계까지만 허용 — 클릭한 레벨을 포함해 범위 재계산
    if (id < levelMin) {
      if (levelMax - id <= 1) setLevelMin(id);
      else {
        setLevelMin(id);
        setLevelMax((id + 1) as LevelId);
      }
    } else if (id > levelMax) {
      if (id - levelMin <= 1) setLevelMax(id);
      else {
        setLevelMax(id);
        setLevelMin((id - 1) as LevelId);
      }
    } else {
      setLevelMin(id);
      setLevelMax(id);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!hasSupabase()) {
      alert("목데이터 단계예요 — Supabase 연결 후 실제로 등록됩니다.");
      router.push("/");
      return;
    }
    if (masterMode && !gymId) return alert("암장을 선택해주세요");
    if (!masterMode && !gym.trim()) return alert("암장을 입력해주세요");
    if (!date) return alert("날짜를 선택해주세요");
    if (endTime <= startTime) return alert("종료 시각이 시작보다 빨라요");
    // 서버도 막지만(지난 시각·30분 이내·90일 초과 거부) 여기서 먼저 알려주는
    // 게 친절하다. 달력이 지난 날짜를 막아줘도 "오늘 + 방금 지난 시각" 은
    // 통과되므로 필요하다.
    // 지난 시각과 임박은 고쳐야 할 게 다르다 — 지난 건 잘못 고른 것이고,
    // 임박은 제대로 골랐는데 규칙에 걸린 것이다. 그래서 문구를 나눈다.
    const startsAt = new Date(`${date}T${startTime}:00`);
    if (startsAt < new Date())
      return alert("이미 지난 시각이에요. 시간을 다시 골라주세요");
    if (startsAt < new Date(Date.now() + 30 * 60 * 1000))
      return alert("모임 시간이 너무 임박했어요. 지금부터 30분 뒤부터 열 수 있어요");

    setBusy(true);
    const user = await currentUser();
    if (!user) {
      setBusy(false);
      alert("모임을 만들려면 로그인이 필요해요");
      router.push("/login");
      return;
    }
    const profile = await fetchMyProfileDb();
    if (!isProfileComplete(profile)) {
      setBusy(false);
      alert(
        profile
          ? "프로필을 먼저 완성해주세요 (대표 사진·구력)"
          : "먼저 프로필을 만들어주세요 (모임 참여의 기본 정보예요)"
      );
      router.push("/profile/new");
      return;
    }

    const r = await createSession({
      gym,
      gymId,
      startsAt: new Date(`${date}T${startTime}:00`).toISOString(),
      endsAt: new Date(`${date}T${endTime}:00`).toISOString(),
      capacity,
      genderMode,
      levelMin,
      levelMax,
      ageMin,
      ageMax,
      note,
    });
    setBusy(false);

    if (r.error === "too_soon")
      return alert("모임 시간이 너무 임박했어요. 지금부터 30분 뒤부터 열 수 있어요");
    if (r.error === "past") return alert("이미 지난 시각이에요. 시간을 다시 골라주세요");
    if (r.error === "too_far") return alert("모임은 90일 안쪽으로만 열 수 있어요");
    if (r.error === "bad_capacity" || r.error === "bad_mode")
      return alert("정원을 다시 골라주세요");
    if (r.error === "bad_gym") return alert("암장을 다시 선택해주세요");
    if (r.error) return alert(`등록 실패: ${r.error}`);
    alert(
      genderMode === "any"
        ? "모임을 열었어요! 정원이 차면 확정돼요."
        : "모임을 열었어요! 성비가 맞으면 확정돼요."
    );
    router.push("/");
  };

  return (
    <main className="px-4">
      <header className="flex items-center gap-2 pt-4 pb-4">
        <BackButton />
        <h1 className="text-[18px] font-bold tracking-tight">모임 만들기</h1>
      </header>

      <form className="flex flex-col gap-6 pb-8" onSubmit={submit}>
        <Field label="암장">
          {masterMode ? (
            /* 서울·경기 200곳 — 칩으로 못 늘어놓는다. 검색 시트에서 고른다 */
            <>
              <button
                type="button"
                onClick={() => setPicking(true)}
                className="flex w-full items-center justify-between rounded-lg border border-line bg-surface px-3.5 py-3 text-left"
              >
                <span
                  className={`text-[16px] ${selected ? "text-ink" : "text-faint"}`}
                >
                  {selected ? selected.name : "암장을 검색해서 선택"}
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
          <p className="mt-1.5 text-[12px] text-muted">1.5~2시간을 권장해요</p>
        </Field>

        <Field label="성비">
          <div className="flex gap-1.5">
            {GENDER_MODES.map((m) => (
              <Chip
                key={m.id}
                active={genderMode === m.id}
                onClick={() => pickMode(m.id)}
              >
                {m.label}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="정원">
          <div className="flex gap-1.5">
            {CAPACITY_CHOICES[genderMode].map((c) => (
              <Chip key={c} active={capacity === c} onClick={() => setCapacity(c)}>
                {capacityChipLabel(c, genderMode)}
              </Chip>
            ))}
          </div>
        </Field>

        <Field label="레벨 범위 (인접 1단계까지)">
          <div className="flex gap-1.5">
            {LEVELS.map((l) => (
              <Chip
                key={l.id}
                active={l.id >= levelMin && l.id <= levelMax}
                onClick={() => toggleLevel(l.id)}
              >
                L{l.id}
              </Chip>
            ))}
          </div>
          <p className="mt-1.5 text-[12px] text-muted">
            {LEVELS.slice(levelMin - 1, levelMax)
              .map((l) => `L${l.id} ${l.name}(${l.colors})`)
              .join(" · ")}
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
              {AGE_FROM.map(([label, v]) => (
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
              {ageToOptions(ageMin).map(([label, v]) => (
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
            onChange={(e) => setNote(e.target.value)}
            placeholder="예: 초보도 환영해요, 같이 문제 풀어요"
            className="w-full rounded-lg border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-faint focus:border-accent focus:outline-none"
          />
        </Field>

        <div>
          <button
            type="submit"
            disabled={busy || !!blocked}
            className="w-full rounded-xl bg-accent py-3.5 text-[15px] font-semibold text-white active:bg-accent-pressed disabled:opacity-50"
          >
            {busy ? "등록 중…" : "모임 등록하기"}
          </button>
          {blocked && (
            <p className="mt-2 text-center text-[12.5px] text-muted">{blocked}</p>
          )}
        </div>
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
