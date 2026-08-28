"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryId, useQueryParam } from "@/lib/queryId";
import { careerLabel, level } from "@/lib/levels";
import { DEMO_ID, buildDemoRoom } from "@/lib/roomDemo";
import {
  VIDEO_MAX_BYTES,
  addSessionVideo,
  deleteSessionVideo,
  fetchMatches,
  fetchRoom,
  signedPhotoUrls,
  signedVideoUrl,
  submitSelection,
  uploadSessionVideo,
  type Room,
  type RoomPerson,
} from "@/lib/supabase";
import { capacityLabel } from "@/lib/capacity";

/* 워밍업 가이드 — 시작 직후가 가장 어색한 구간이라
   같이 할 거리를 주면 아이스브레이킹·부상예방·클린이 배려가 한 번에 해결된다. */
const WARMUP = [
  ["손가락·손목", "가볍게 돌리고 늘려주세요. 여기서 다치는 사람이 제일 많아요"],
  ["어깨·등", "팔 돌리기 20회. 어깨가 안 풀리면 다음날 아파요"],
  ["쉬운 문제 2~3개", "제일 낮은 색으로 몸 풀기. 완등이 목적이 아니에요"],
  ["낙법", "매트에 엉덩이부터. 손목으로 짚지 않기"],
];

const hhmm = (iso: string) => {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

const ERRORS: Record<string, string> = {
  no_profile: "먼저 프로필을 만들어주세요",
  not_found: "모임을 찾을 수 없어요",
  not_confirmed: "확정된 참가자만 볼 수 있어요",
};

export default function Room() {
  const qid = useQueryId();
  const from = useQueryParam("from");
  const id = qid ?? "";
  const router = useRouter();
  // /room?id=demo — 혼자서 화면을 확인하기 위한 경로. DB를 타지 않는다.
  const isDemo = id === DEMO_ID;

  const [room, setRoom] = useState<Room | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [err, setErr] = useState<string | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [matches, setMatches] = useState<Awaited<ReturnType<typeof fetchMatches>>>(null);
  const [submitted, setSubmitted] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (qid === undefined) return; // 주소를 아직 안 읽었다
    if (isDemo) {
      setRoom(buildDemoRoom());
      return;
    }
    if (!id) return setErr("not_found");
    const r = await fetchRoom(id);
    if (r.error) return setErr(r.error);
    const room = r.room!;
    setRoom(room);
    setPhotoUrls(
      await signedPhotoUrls(room.people.map((p) => p.photo).filter(Boolean) as string[])
    );
    if (room.selection_open) setMatches(await fetchMatches(id));
  }, [id, qid, isDemo]);

  useEffect(() => {
    load();
  }, [load]);

  /* 채팅방에서 들어왔으면 그 방으로 돌려보낸다.
     방을 여는 건 /chat 의 상태일 뿐 화면 전환이 아니라, 뒤로가기만으로는
     보던 방이 닫히고 목록으로 떨어진다. */
  const back = () => {
    if (from === "chat" && qid) router.push(`/chat?room=${qid}#session`);
    else router.back();
  };

  if (err)
    return (
      <main className="px-4 pt-24 text-center">
        <p className="text-3xl">🧗</p>
        <p className="mt-3 text-[15px] font-bold">{ERRORS[err] ?? err}</p>
        <button
          onClick={() => router.push("/")}
          className="mt-6 rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
        >
          홈으로
        </button>
      </main>
    );

  if (!room)
    return <main className="px-4 pt-20 text-center text-muted">불러오는 중…</main>;

  const others = room.people.filter((p) => !p.is_me);

  const onUpload = async (file: File) => {
    if (isDemo) {
      alert("데모에서는 업로드가 저장되지 않아요. 실제 모임에서 써보세요!");
      return;
    }
    if (file.size > VIDEO_MAX_BYTES) {
      return alert(
        `영상이 너무 커요 (${(file.size / 1024 / 1024).toFixed(0)}MB).\n50MB 이하로 줄여주세요 — 20~30초면 충분해요.`
      );
    }
    setUploading(true);
    const up = await uploadSessionVideo(id, file);
    if (up.error) {
      setUploading(false);
      return alert(`업로드 실패: ${up.error}`);
    }
    const r = await addSessionVideo(id, up.path!);
    setUploading(false);
    // 등반 인증은 실제로 등반한 모임에서만 — 서버가 막는다
    if (r.error === "not_started")
      return alert("모임이 시작한 뒤에 인증할 수 있어요.");
    if (r.error) return alert(`실패: ${r.error}`);
    if (r.earned)
      alert(
        `영상 인증 완료! 크레딧 +${r.earned.toLocaleString()}\n` +
          `현재 ${r.balance?.toLocaleString()}크레딧`
      );
    load();
  };

  const onPlay = async (path: string) => {
    const url = await signedVideoUrl(path);
    if (!url) return alert("영상을 열지 못했어요");
    window.open(url, "_blank", "noopener");
  };

  const onDelete = async (videoId: string) => {
    if (!confirm("이 영상을 지울까요?")) return;
    await deleteSessionVideo(videoId);
    load();
  };



  return (
    <main className="px-4 pb-10">
      <header className="flex items-center gap-3 pt-5 pb-4">
        <button onClick={back} className="text-lg text-muted">
          ←
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[19px] font-extrabold tracking-tight">
            {room.session.gym}
          </h1>
          <p className="text-[12px] text-muted">
            {hhmm(room.session.starts_at)}~{hhmm(room.session.ends_at)} ·{" "}
            {capacityLabel(room.matched, room.session.gender_mode)}
          </p>
        </div>
      </header>

      {isDemo && (
        <p className="mb-3 rounded-xl border border-dashed border-accent/50 bg-accent/10 px-4 py-2.5 text-[12px] leading-relaxed text-accent">
          <b>데모 화면입니다.</b> 저장되지 않고, 실제 참가자가 아니에요.
        </p>
      )}

      {/* 참가자 — 확정된 사람끼리는 프로필을 서로 본다 */}
      <section className="rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-bold">
          🧗 함께하는 사람{" "}
          <span className="font-medium text-muted">{others.length}명</span>
        </h2>

        {others.length === 0 ? (
          <p className="mt-2 text-[12.5px] leading-relaxed text-muted">
            아직 다른 참가자가 확정되지 않았어요.{" "}
            {room.session.gender_mode === "any"
              ? "자리가 차면"
              : "성비가 맞으면"}{" "}
            여기에 보여요.
          </p>
        ) : (
          <div className="mt-3 flex flex-col gap-2.5">
            {others.map((p) => (
              <PersonRow key={p.id} p={p} photo={p.photo ? photoUrls[p.photo] : undefined} />
            ))}
          </div>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-muted">
          모임 목록에서는 서로 안 보이지만, 확정된 참가자끼리는 프로필이 열려요.
        </p>
      </section>

      {/* 워밍업 */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-bold">👋 시작 전 워밍업</h2>
        <div className="mt-3 flex flex-col gap-2.5">
          {WARMUP.map(([t, d]) => (
            <div key={t} className="flex gap-2.5">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
              <div>
                <p className="text-[13.5px] font-bold">{t}</p>
                <p className="text-[12.5px] text-muted">{d}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 영상 인증 */}
      <section className="mt-3 rounded-2xl border border-line bg-surface p-4">
        <h2 className="text-[14px] font-bold">🎥 오늘의 등반 인증</h2>
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
          완등한 문제를 자유롭게 올려주세요. <b className="text-ink">완등 못 해도 괜찮아요</b> —
          서로 찍어주는 게 진짜예요. 영상은 <b className="text-ink">나만</b> 볼 수 있어요.
        </p>

        {room.videos.length > 0 && (
          <div className="mt-3 flex flex-col gap-1.5">
            {room.videos.map((v, i) => (
              <div
                key={v.id}
                className="flex items-center gap-2 rounded-lg bg-surface2 px-3 py-2.5"
              >
                <button
                  onClick={() => onPlay(v.video_url)}
                  className="flex-1 text-left text-[13px] font-bold text-mint"
                >
                  ▶ 영상 {room.videos.length - i}
                </button>
                <button
                  onClick={() => onDelete(v.id)}
                  className="shrink-0 text-[12px] text-muted"
                >
                  삭제
                </button>
              </div>
            ))}
          </div>
        )}

        <label
          className={`mt-3 block w-full cursor-pointer rounded-lg py-2.5 text-center text-[13px] font-bold ${
            uploading ? "bg-surface2 text-muted" : "bg-accent text-white"
          }`}
        >
          {uploading ? "올리는 중…" : "🎥 등반 영상 올리기"}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = ""; // 같은 파일 다시 골라도 onChange 가 뜨게
              if (f) onUpload(f);
            }}
          />
        </label>
        <p className="mt-2 text-[11.5px] text-muted">
          크레딧은 모임당 한 번 적립돼요 · 최대 50MB
        </p>
      </section>

      {/* 최종선택은 뺐다 (2026-08 결정) — 모임 채팅이 생겨서 "서로 고르기"
          없이도 이어질 사람은 이어진다. 어색한 의식을 남길 이유가 없다.
          서버 함수(selection_submit·my_matches)는 남아 있으니 되살리려면
          git 이력의 이 섹션을 복원하면 된다. */}
    </main>
  );
}

function PersonRow({ p, photo }: { p: RoomPerson; photo?: string }) {
  return (
    <div className="flex items-center gap-3">
      {photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo}
          alt={p.nickname}
          className="h-12 w-12 shrink-0 rounded-full object-cover"
        />
      ) : (
        <div
          className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full text-lg ${
            p.gender === "f" ? "bg-female/15" : "bg-male/15"
          }`}
        >
          🧗
        </div>
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[14.5px] font-extrabold">
          {p.nickname}
          <span className="ml-1.5 text-[12px] font-medium text-muted">
            {[p.age, p.height && `${p.height}cm`, p.area].filter(Boolean).join(" · ")}
          </span>
        </p>
        <p className="truncate text-[12.5px] text-muted">
          {[
            `L${p.level} ${level(p.level).name}`,
            careerLabel(p.career) && `구력 ${careerLabel(p.career)}`,
            p.home_gym,
            p.mbti,
          ]
            .filter(Boolean)
            .join(" · ")}
        </p>
        {p.intro && (
          <p className="mt-0.5 truncate text-[12.5px] text-ink/85">
            &ldquo;{p.intro}&rdquo;
          </p>
        )}
      </div>
    </div>
  );
}
