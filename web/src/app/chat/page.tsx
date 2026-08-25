"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQueryParam } from "@/lib/queryId";
import { level } from "@/lib/levels";
import ReportSheet from "@/components/ReportSheet";
import { notifyPush } from "@/lib/nativePush";
import {
  currentUser,
  fetchChatMessages,
  fetchChats,
  fetchRoom,
  fetchSessionChatMessages,
  fetchSessionChats,
  hasSupabase,
  leaveChat,
  markChatRead,
  markSessionChatRead,
  sendChat,
  sendSessionChat,
  signedPhotoUrls,
  type Chat,
  type ChatMessage,
  type RoomPerson,
  type SessionChat,
  type SessionChatMessage,
} from "@/lib/supabase";

const when = (iso: string) => {
  const d = new Date(iso);
  const today = new Date();
  const sameDay =
    d.getFullYear() === today.getFullYear() &&
    d.getMonth() === today.getMonth() &&
    d.getDate() === today.getDate();
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return sameDay ? hm : `${d.getMonth() + 1}/${d.getDate()}`;
};

/** 방이 어떻게 열렸는지 — 모임에서 만났거나, 관심 수락으로 연결됐거나 */
const origin = (c: Chat) =>
  c.gym ? `${c.gym}에서 만났어요` : "관심을 수락해서 연결됐어요";

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

/* 방은 모임이 끝나거나 취소되고 24시간 뒤에 사라진다
   (session_chat_open 이 닫는다). 남은 시간을 초읽기로 보여주진 않는다 —
   알아서 좋을 게 없고, 1분마다 다시 그릴 이유도 없다. */
function endedNotice(c: SessionChat): string | null {
  if (c.status === "cancelled")
    return "매칭이 취소되었어요. 하루 뒤에 채팅방이 사라져요.";
  return new Date(c.ends_at).getTime() < Date.now()
    ? "모임이 종료되었어요. 하루 뒤에 채팅방이 사라져요."
    : null;
}

/** 모임방 부제 — "토 8/31 · 15:00 · 2:2" */
const sessionSub = (c: SessionChat) => {
  const d = new Date(c.starts_at);
  const hm = `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  return `${DAYS[d.getDay()]} ${d.getMonth() + 1}/${d.getDate()} · ${hm} · ${c.capacity}:${c.capacity}`;
};

type Tab = "request" | "session";

export default function ChatPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [tab, setTab] = useState<Tab>("request");
  const [chats, setChats] = useState<Chat[] | null>(null);
  const [rooms, setRooms] = useState<SessionChat[] | null>(null);
  const [photoUrls, setPhotoUrls] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Chat | null>(null);
  const [openRoom, setOpenRoom] = useState<SessionChat | null>(null);

  const load = useCallback(async () => {
    const [list, group] = await Promise.all([fetchChats(), fetchSessionChats()]);
    setChats(list);
    setRooms(group);
    if (list?.length)
      setPhotoUrls(
        await signedPhotoUrls(list.map((c) => c.photo).filter(Boolean) as string[])
      );
  }, []);

  useEffect(() => {
    // 모임 상세의 "모임 채팅 열기" 는 /chat#session 으로 보낸다
    if (window.location.hash === "#session") setTab("session");

    (async () => {
      if (!hasSupabase()) return setAuthed(false);
      const user = await currentUser();
      setAuthed(!!user);
      if (user) load();
    })();
  }, [load]);

  /* 진행 화면에서 ← 로 돌아오면 보던 방이 그대로 열려 있어야 한다.
     방을 여는 건 화면 전환이 아니라 이 페이지의 상태라, 브라우저
     뒤로가기만으로는 목록으로 떨어진다. 그래서 주소로 받아 다시 연다. */
  const roomParam = useQueryParam("room");
  useEffect(() => {
    if (!roomParam || !rooms) return;
    const r = rooms.find((x) => x.session_id === roomParam);
    if (r) {
      setTab("session");
      openSession(r);
    }
    // 한 번 열고 나면 주소에서 지운다 — 목록으로 나갔다가 다시
    // 들어올 때 또 열려버리는 걸 막는다
    window.history.replaceState(null, "", "/chat#session");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomParam, rooms]);

  /** 방을 열면 읽음으로 표시한다 (목록의 배지가 바로 사라지게 낙관적 갱신) */
  const openThread = async (c: Chat) => {
    setOpen(c);
    setChats((list) =>
      (list ?? []).map((x) => (x.match_id === c.match_id ? { ...x, unread: 0 } : x))
    );
    await markChatRead(c.match_id);
  };

  const openSession = async (c: SessionChat) => {
    setOpenRoom(c);
    setRooms((list) =>
      (list ?? []).map((x) =>
        x.session_id === c.session_id ? { ...x, unread: 0 } : x
      )
    );
    await markSessionChatRead(c.session_id);
  };

  const unreadOf = (list: { unread: number }[] | null) =>
    (list ?? []).reduce((n, x) => n + (x.unread > 0 ? 1 : 0), 0);

  if (authed === false)
    return (
      <main className="px-4">
        <header className="pt-6 pb-4">
          <h1 className="text-[19px] font-extrabold tracking-tight">채팅</h1>
        </header>
        <div className="mt-14 flex flex-col items-center gap-3 text-center">
          <p className="text-[14px] text-muted">로그인하면 대화가 보여요</p>
          <Link
            href="/login"
            className="rounded-xl bg-accent px-6 py-2.5 text-[14px] font-bold text-white"
          >
            로그인 하기
          </Link>
        </div>
      </main>
    );

  if (open)
    return (
      <Thread
        chat={open}
        onBack={() => {
          setOpen(null);
          load(); // 나올 때 목록·마지막 메시지 갱신
        }}
      />
    );

  if (openRoom)
    return (
      <SessionThread
        room={openRoom}
        onBack={() => {
          setOpenRoom(null);
          load();
        }}
      />
    );

  const loading = chats === null || rooms === null;

  return (
    <main className="px-4">
      <header className="pt-6 pb-3">
        <h1 className="text-[19px] font-extrabold tracking-tight">채팅</h1>
      </header>

      {/* 관심으로 열린 1:1 과 모임 단체방은 성격이 달라서 탭으로 나눈다 */}
      <div className="flex border-b border-line">
        {(
          [
            ["request", "관심 채팅", unreadOf(chats)],
            ["session", "모임 채팅", unreadOf(rooms)],
          ] as const
        ).map(([key, label, badge]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex flex-1 items-center justify-center gap-1.5 pb-2.5 pt-1 text-[15px] font-bold ${
              tab === key ? "border-b-2 border-accent text-ink" : "text-muted"
            }`}
          >
            {label}
            {badge > 0 && (
              <span className="min-w-[17px] rounded-full bg-accent px-1 text-[10.5px] font-extrabold leading-[17px] text-white">
                {badge > 9 ? "9+" : badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="pt-14 text-center text-muted">불러오는 중…</p>
      ) : tab === "session" ? (
        rooms.length === 0 ? (
          <div className="mt-16 flex flex-col items-center gap-2 text-center">
            <span className="text-4xl">🧗</span>
            <p className="text-[15px] font-bold">아직 열린 모임 채팅이 없어요</p>
            <p className="text-[13px] leading-relaxed text-muted">
              호스트가 신청을 받아주면
              <br />
              그때부터 참가자끼리 여기서 이야기해요
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2 py-3 pb-6">
            {rooms.map((c) => (
              <button
                key={c.session_id}
                onClick={() => openSession(c)}
                className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left"
              >
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-mint/15 text-xl">
                  🧗
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-extrabold">
                    {c.gym}
                    <span className="ml-1.5 text-[12px] font-medium text-muted">
                      {c.members}명
                    </span>
                  </p>
                  <p
                    className={`mt-0.5 truncate text-[12.5px] ${
                      c.unread > 0 ? "font-semibold text-ink" : "text-muted"
                    }`}
                  >
                    {c.last_body ?? sessionSub(c)}
                  </p>
                  {/* 곧 사라질 방이라는 걸 목록에서도 알린다 */}
                  {endedNotice(c) && (
                    <p className="mt-0.5 truncate text-[11.5px] text-muted">
                      {endedNotice(c)}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  <span className="text-[11.5px] text-muted">{when(c.last_at)}</span>
                  {c.unread > 0 && (
                    <span className="min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[11px] font-extrabold leading-[18px] text-white">
                      {c.unread > 99 ? "99+" : c.unread}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )
      ) : chats.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-2 text-center">
          <span className="text-4xl">💌</span>
          <p className="text-[15px] font-bold">아직 연결된 상대가 없어요</p>
          <p className="text-[13px] leading-relaxed text-muted">
            보낸 관심을 상대가 수락하면
            <br />
            여기서 대화가 시작돼요
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2 py-3 pb-6">
          {chats.map((c) => (
            <button
              key={c.match_id}
              onClick={() => openThread(c)}
              className="flex items-center gap-3.5 rounded-2xl border border-line bg-surface p-4 text-left"
            >
              {c.photo && photoUrls[c.photo] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrls[c.photo]}
                  alt={c.nickname}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xl">
                  🧗
                </div>
              )}
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold">
                  {c.nickname}
                  <span className="ml-1.5 text-[12px] font-medium text-muted">
                    {c.age} · L{c.level} {level(c.level).name}
                  </span>
                </p>
                <p
                  className={`mt-0.5 truncate text-[12.5px] ${
                    c.unread > 0 ? "font-semibold text-ink" : "text-muted"
                  }`}
                >
                  {c.last_body ?? origin(c)}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-1">
                <span className="text-[11.5px] text-muted">{when(c.last_at)}</span>
                {c.unread > 0 && (
                  <span className="min-w-[18px] rounded-full bg-accent px-1.5 text-center text-[11px] font-extrabold leading-[18px] text-white">
                    {c.unread > 99 ? "99+" : c.unread}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </main>
  );
}

/* 키보드가 올라오면 iOS 는 fixed 요소를 줄이지 않고 화면을 스크롤한다.
   그러면 입력창만 보이고 헤더·대화가 화면 밖으로 밀려난다.
   visualViewport 로 "실제 보이는 영역"을 받아 그 높이에 맞춘다. */
function useKeyboardViewport() {
  const [vv, setVv] = useState<{ h: number; top: number } | null>(null);

  useEffect(() => {
    const v = window.visualViewport;
    if (!v) return; // 미지원 브라우저는 h-dvh 폴백
    const update = () => setVv({ h: v.height, top: v.offsetTop });
    update();
    v.addEventListener("resize", update);
    v.addEventListener("scroll", update);
    return () => {
      v.removeEventListener("resize", update);
      v.removeEventListener("scroll", update);
    };
  }, []);

  // 키보드가 열렸으면 홈바 여백을 넣지 않는다 (키보드 위에 빈 틈이 생김)
  const keyboardOpen = !!vv && vv.h < window.innerHeight - 100;
  return { vv, keyboardOpen };
}

/* 전체화면 오버레이. 1:1 방과 모임 단체방이 같은 껍데기를 쓴다.
   레이아웃 래퍼가 하단 네비용 padding-bottom 을 갖고 있어서, 그 안에서
   min-h-screen + sticky 로 입력창을 붙이면 화면 밖으로 밀려난다.
   높이는 visualViewport 값으로 직접 지정한다 (inset-0 은 키보드를 모른다). */
function ChatFrame({
  onBack,
  title,
  sub,
  action,
  onTitle,
  closedNote,
  onSend,
  children,
}: {
  onBack: () => void;
  title: string;
  sub: string;
  /** 헤더 오른쪽 — 1:1 방은 신고 버튼이 붙는다 */
  action?: React.ReactNode;
  /** 채워져 있으면 입력창 대신 이 안내를 둔다 (상대가 나간 방) */
  closedNote?: string | null;
  /** 제목을 누를 때 — 1:1 은 상대 프로필, 모임방은 진행 화면 */
  onTitle?: () => void;
  onSend: (body: string) => Promise<void>;
  children: React.ReactNode;
}) {
  const { vv, keyboardOpen } = useKeyboardViewport();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    await onSend(body);
    setBusy(false);
    setText("");
  };

  return (
    <div
      className="fixed inset-x-0 top-0 z-40 mx-auto flex h-dvh max-w-md flex-col bg-bg px-4"
      style={{
        height: vv ? `${vv.h}px` : undefined,
        transform: vv ? `translateY(${vv.top}px)` : undefined,
        paddingBottom: keyboardOpen ? 0 : "env(safe-area-inset-bottom)",
      }}
    >
      <header
        className="flex shrink-0 items-center gap-3 pb-3"
        style={{
          paddingTop: keyboardOpen
            ? "0.75rem"
            : "calc(1.25rem + env(safe-area-inset-top))",
        }}
      >
        <button onClick={onBack} className="text-lg text-muted">
          ←
        </button>
        <div className="min-w-0 flex-1">
          {onTitle ? (
            /* 누를 수 있다는 걸 알려야 해서 ›  를 붙인다 */
            <button
              onClick={onTitle}
              className="flex max-w-full items-center gap-1 text-left"
            >
              <div className="min-w-0">
                <h1 className="truncate text-[17px] font-extrabold tracking-tight">
                  {title}
                </h1>
                <p className="truncate text-[11.5px] text-muted">{sub}</p>
              </div>
              <span className="shrink-0 text-[15px] text-muted">›</span>
            </button>
          ) : (
            <>
              <h1 className="truncate text-[17px] font-extrabold tracking-tight">
                {title}
              </h1>
              <p className="truncate text-[11.5px] text-muted">{sub}</p>
            </>
          )}
        </div>
        {action}
      </header>

      {/* min-h-0 이 없으면 flex 아이템이 내용만큼 커져서 스크롤이 안 걸린다 */}
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">{children}</div>

      {closedNote ? (
        <p className="shrink-0 bg-bg py-4 text-center text-[12.5px] leading-relaxed text-muted">
          {closedNote}
        </p>
      ) : (
      <form onSubmit={submit} className="flex shrink-0 gap-2 bg-bg py-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="메시지 보내기"
          maxLength={1000}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface px-3.5 py-3 text-[16px] text-ink placeholder:text-muted/60"
        />
        <button
          disabled={busy || !text.trim()}
          className="shrink-0 rounded-xl bg-accent px-4 text-[14px] font-bold text-white disabled:opacity-40"
        >
          전송
        </button>
      </form>
      )}
    </div>
  );
}

/** 말풍선 — 단체방에서는 남의 말에 보낸 사람이 붙는다 */
function Bubble({
  m,
  name,
  photoUrl,
  isHost,
}: {
  m: ChatMessage;
  name?: string | null;
  photoUrl?: string;
  isHost?: boolean;
}) {
  const bubble = (
    <div
      className={`max-w-full rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed ${
        m.mine
          ? "rounded-br-md bg-accent text-white"
          : "rounded-bl-md bg-surface2 text-ink"
      }`}
    >
      {m.body}
      <span
        className={`ml-2 align-bottom text-[10.5px] ${
          m.mine ? "text-white/70" : "text-muted"
        }`}
      >
        {when(m.created_at)}
      </span>
    </div>
  );

  // "○○님이 나갔어요" 같은 안내 — 누구 말도 아니라 가운데에 둔다
  if (m.kind === "system")
    return (
      <p className="my-2 self-center rounded-full bg-surface2 px-3.5 py-1.5 text-center text-[12px] text-muted">
        {m.body}
      </p>
    );

  if (m.mine) return <div className="max-w-[78%] self-end">{bubble}</div>;

  // 1:1 방은 상대가 한 명뿐이라 이름을 붙이지 않는다
  if (!name) return <div className="max-w-[78%] self-start">{bubble}</div>;

  return (
    <div className="flex max-w-[86%] gap-2 self-start">
      {photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl}
          alt=""
          className="mt-4 h-7 w-7 shrink-0 rounded-full object-cover"
        />
      ) : (
        <span className="mt-4 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-surface2 text-[13px]">
          🧗
        </span>
      )}
      <div className="min-w-0">
        <p className="mb-0.5 text-[11.5px] font-semibold text-muted">
          {name}
          {isHost && <span className="ml-1 text-mint">· 호스트</span>}
        </p>
        {bubble}
      </div>
    </div>
  );
}

/* 1:1 방에서 제목을 누르면 뜨는 상대 프로필.
   목록(my_chats)이 이미 내려주는 값만 쓴다 — 프로필 전체를 다시
   불러오면 방을 열 때마다 요청이 하나 더 붙는데, 여기서 궁금한 건
   "얼굴이랑 대충 누구였지" 정도다. */
function PartnerSheet({ chat, onClose }: { chat: Chat; onClose: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!chat.photo) return;
    (async () => setUrl((await signedPhotoUrls([chat.photo!]))[chat.photo!] ?? null))();
  }, [chat.photo]);

  const lv = level(chat.level);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end bg-black/60"
      onClick={onClose}
    >
      {/* 크기·비율은 사람 찾기의 프로필 시트(app/page.tsx)와 맞춘다 */}
      <div
        className="mx-auto max-h-[88vh] w-full max-w-md overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
        style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
        onClick={(e) => e.stopPropagation()}
      >
        {url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={url}
            alt={chat.nickname}
            className="aspect-square w-full rounded-2xl object-cover"
          />
        ) : (
          <div className="flex aspect-square w-full items-center justify-center rounded-2xl bg-surface2 text-6xl">
            🧗
          </div>
        )}

        <p className="mt-4 text-[19px] font-extrabold">
          {chat.nickname}
          <span className="ml-2 text-[13px] font-medium text-muted">
            {chat.age}
          </span>
        </p>
        <p className="mt-1 text-[13px] text-muted">
          L{chat.level} {lv.name} ({lv.colors})
          {chat.home_gym && ` · ${chat.home_gym}`}
        </p>
        <p className="mt-3 text-[12.5px] leading-relaxed text-muted">
          {origin(chat)}
        </p>

        <button
          onClick={onClose}
          className="mt-5 w-full rounded-xl border border-line py-3.5 text-[14px] font-bold"
        >
          닫기
        </button>
      </div>
    </div>
  );
}

function Thread({ chat, onBack }: { chat: Chat; onBack: () => void }) {
  const [msgs, setMsgs] = useState<ChatMessage[] | null>(null);
  const [reporting, setReporting] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // 실패(상대가 나감 등)해도 보고 있던 대화를 지우지 않는다
    const list = await fetchChatMessages(chat.match_id);
    if (list) setMsgs(list);
    // 방을 보고 있는 동안 도착한 메시지도 읽음 처리한다
    await markChatRead(chat.match_id);
  }, [chat.match_id]);

  useEffect(() => {
    load();
    // 실시간 대신 폴링 — 규모가 작을 때는 이게 단순하고 확실하다
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const send = async (body: string) => {
    const r = await sendChat(chat.match_id, body);
    if (r.error) {
      if (r.error === "closed") return alert("상대가 대화방을 나갔어요.");
      return alert(`전송 실패: ${r.error}`);
    }
    // 실패해도 조용히 — 알림이 전송을 막으면 안 된다
    notifyPush(chat.partner_id, "💬 새 메시지", body.slice(0, 80), "/chat");
    load();
  };

  const leave = async () => {
    if (
      !confirm(
        "이 대화방에서 나갈까요?\n" +
          "내 목록에서만 사라져요. 상대에게는 내가 나갔다고 표시되고,\n" +
          "상대까지 나가면 대화가 완전히 지워져요."
      )
    )
      return;
    const r = await leaveChat(chat.match_id);
    if (r.error) return alert(`실패: ${r.error}`);
    onBack();
  };

  return (
    <>
      <ChatFrame
        onBack={onBack}
        title={chat.nickname}
        sub={`${origin(chat)} · L${chat.level} ${level(chat.level).name}`}
        onTitle={() => setShowProfile(true)}
        closedNote={
          chat.partner_left
            ? "상대가 대화방을 나갔어요. 더 이상 메시지를 보낼 수 없어요."
            : null
        }
        action={
          <div className="flex shrink-0 items-center">
            <button
              onClick={leave}
              aria-label="대화방 나가기"
              className="px-2 py-1 text-[12px] font-semibold text-muted/70"
            >
              나가기
            </button>
            <button
              onClick={() => setReporting(true)}
              aria-label="신고하기"
              className="px-2 py-1 text-[12px] font-semibold text-muted/70"
            >
              신고
            </button>
          </div>
        }
        onSend={send}
      >
        {msgs === null ? (
          <p className="pt-10 text-center text-muted">불러오는 중…</p>
        ) : msgs.length === 0 ? (
          <p className="px-6 pt-10 text-center text-[13px] leading-relaxed text-muted">
            관심을 수락해서 열린 방이에요.
            <br />
            먼저 말을 걸어보세요 🧗
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {msgs.map((m) => (
              <Bubble key={m.id} m={m} />
            ))}
            <div ref={bottom} />
          </div>
        )}
      </ChatFrame>

      {showProfile && (
        <PartnerSheet chat={chat} onClose={() => setShowProfile(false)} />
      )}

      {reporting && (
        <ReportSheet
          targetId={chat.partner_id}
          nickname={chat.nickname}
          context="chat"
          refId={chat.match_id}
          onClose={() => setReporting(false)}
          // 차단되면 이 방은 더 열리지 않는다 — 목록으로 돌려보낸다
          onDone={onBack}
        />
      )}
    </>
  );
}

function SessionThread({
  room,
  onBack,
}: {
  room: SessionChat;
  onBack: () => void;
}) {
  const [msgs, setMsgs] = useState<SessionChatMessage[] | null>(null);
  const [photos, setPhotos] = useState<Record<string, string>>({});
  // 신고 — 단체방이라 누구를 신고할지 먼저 고른다
  const [picking, setPicking] = useState(false);
  const [members, setMembers] = useState<RoomPerson[] | null>(null);
  const [target, setTarget] = useState<RoomPerson | null>(null);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    // 실패(차단·모임 취소로 not_allowed 등)해도 보던 화면을 지우지 않는다
    const list = await fetchSessionChatMessages(room.session_id);
    if (list) setMsgs(list);
    await markSessionChatRead(room.session_id);
    if (list?.length) {
      const paths = [
        ...new Set(list.map((m) => m.sender_photo).filter(Boolean) as string[]),
      ];
      if (paths.length) setPhotos(await signedPhotoUrls(paths));
    }
  }, [room.session_id]);

  useEffect(() => {
    load();
    const t = setInterval(load, 5_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [msgs?.length]);

  const send = async (body: string) => {
    const r = await sendSessionChat(room.session_id, body);
    if (r.error) return alert(`전송 실패: ${r.error}`);
    // 시간·장소를 맞추는 방이라 알림이 없으면 반쪽이다. 실패해도 조용히.
    if (r.notify?.length)
      notifyPush(r.notify, `💬 ${room.gym}`, body.slice(0, 80), "/chat#session");
    load();
  };

  const router = useRouter();

  const ended = endedNotice(room);

  const openPicker = async () => {
    setPicking(true);
    if (members === null) {
      const r = await fetchRoom(room.session_id);
      setMembers(r.room ? r.room.people.filter((p) => !p.is_me) : []);
    }
  };

  return (
    <>
    <ChatFrame
      onBack={onBack}
      title={room.gym}
      sub={`${sessionSub(room)} · ${room.members}명`}
      onTitle={() => router.push(`/room?id=${room.session_id}&from=chat`)}
      action={
        <button
          onClick={openPicker}
          aria-label="신고하기"
          className="shrink-0 px-2 py-1 text-[12px] font-semibold text-muted/70"
        >
          신고
        </button>
      }
      onSend={send}
    >
      {msgs === null ? (
        <p className="pt-10 text-center text-muted">불러오는 중…</p>
      ) : msgs.length === 0 && !ended ? (
        <p className="px-6 pt-10 text-center text-[13px] leading-relaxed text-muted">
          같이 갈 사람이 정해져서 열린 방이에요.
          <br />
          만날 시간과 장소를 여기서 맞춰보세요 🧗
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {msgs.map((m) => (
            <Bubble
              key={m.id}
              m={m}
              name={m.sender_name ?? "탈퇴한 사용자"}
              photoUrl={m.sender_photo ? photos[m.sender_photo] : undefined}
              isHost={m.sender_is_host}
            />
          ))}
          {/* 시스템 안내 — 말풍선이 아니라 가운데 한 줄로 둔다 */}
          {ended && (
            <p className="my-2 self-center rounded-full bg-surface2 px-3.5 py-1.5 text-center text-[12px] text-muted">
              {ended}
            </p>
          )}
          <div ref={bottom} />
        </div>
      )}
    </ChatFrame>

    {/* 누구를 신고할지 고르는 시트 */}
    {picking && (
      <div
        className="fixed inset-0 z-50 flex items-end bg-black/60"
        onClick={() => setPicking(false)}
      >
        <div
          className="max-h-[70vh] w-full overflow-y-auto rounded-t-3xl border-t border-line bg-surface p-5"
          style={{ paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))" }}
          onClick={(e) => e.stopPropagation()}
        >
          <p className="text-[17px] font-extrabold">누구를 신고할까요?</p>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-muted">
            신고하면 차단도 함께 되어, 이 모임과 채팅방이 내 화면에서 사라져요.
          </p>
          {members === null ? (
            <p className="py-8 text-center text-[13px] text-muted">불러오는 중…</p>
          ) : members.length === 0 ? (
            <p className="py-8 text-center text-[13px] text-muted">
              신고할 수 있는 참가자가 없어요
            </p>
          ) : (
            <div className="mt-4 flex flex-col gap-1.5">
              {members.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    setPicking(false);
                    setTarget(p);
                  }}
                  className="rounded-xl border border-line bg-bg px-4 py-3 text-left text-[14px] font-bold"
                >
                  {p.nickname}
                </button>
              ))}
            </div>
          )}
          <button
            onClick={() => setPicking(false)}
            className="mt-4 w-full rounded-xl border border-line py-3.5 text-[14px] font-bold"
          >
            취소
          </button>
        </div>
      </div>
    )}

    {target && (
      <ReportSheet
        targetId={target.id}
        nickname={target.nickname}
        context="session"
        refId={room.session_id}
        onClose={() => setTarget(null)}
        // 신고=차단 → 서버가 이 방을 닫는다. 목록으로 돌려보낸다.
        onDone={onBack}
      />
    )}
    </>
  );
}
