#!/usr/bin/env node
/* 커뮤니티 기사 수집 — 대회 정보·클라이밍 뉴스를 밖에서 가져와 DB 에 쌓는다.
 *
 *  GitHub Actions (.github/workflows/community-feed.yml) 가 몇 시간마다
 *  돌린다. 앱은 community_articles 를 읽기만 한다 (RPC community_articles).
 *
 *  출처
 *    대회  IFSC 공식 일정 ICS — https://calendar.ifsc.stream
 *          (sportclimbing/ifsc-calendar 가 IFSC 사이트에서 만들어 배포하는
 *          구독용 달력. 라운드 하나가 VEVENT 하나라, 같은 장소·같은 주의
 *          라운드를 대회 하나로 묶는다 — groupIfsc)
 *    대회  구글 뉴스 RSS "클라이밍 대회 …" — 국내 대회는 기계가 읽을 일정표가
 *          없다. 기사로 건져 "대회 소식" 에 날짜 없이 올린다. 정확한 일정은
 *          운영자가 community_article_upsert 로 손으로 넣는다.
 *    뉴스  구글 뉴스 RSS "클라이밍 OR 볼더링 OR 스포츠클라이밍"
 *
 *  쓰기: PostgREST upsert (on_conflict=external_id, merge-duplicates).
 *  hidden 은 보내지 않는다 — 운영자가 감춘 기사가 다음 수집에 되살아나면
 *  안 된다. 오래된 기사는 DB 크론(community_articles_purge)이 치운다.
 *
 *  실행
 *    SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/community-feed.mjs
 *    node scripts/community-feed.mjs --dry-run     # 쓰지 않고 결과만 출력
 *
 *  service role 키는 RLS 를 통과하는 키라 저장소·앱에 절대 넣지 않는다.
 *  레포 Settings > Secrets > Actions 에 SUPABASE_SERVICE_ROLE_KEY 로만 둔다.
 */

import { pathToFileURL } from "node:url";

const IFSC_ICS = "https://calendar.ifsc.stream";
const gnews = (q) =>
  `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=ko&gl=KR&ceid=KR:ko`;
const NEWS_QUERY = "클라이밍 OR 볼더링 OR 스포츠클라이밍";
const COMP_QUERY =
  '"클라이밍 대회" OR "볼더링 대회" OR "스포츠클라이밍 선수권" OR "클라이밍 선수권" OR "클라이밍 월드컵"';
/** 이보다 오래된 기사는 처음부터 받지 않는다 */
const NEWS_MAX_AGE_DAYS = 45;
const FETCH_TIMEOUT_MS = 30_000;
const UA = "HobiDay community feed (+https://hobiday-eight.vercel.app)";

/* ── ICS ── */

/** 줄 접기(RFC 5545 3.1)를 편다 — 다음 줄이 공백으로 시작하면 이어진 줄 */
export function unfoldIcs(text) {
  return text.replace(/\r\n?/g, "\n").replace(/\n[ \t]/g, "");
}

/** VEVENT 마다 { PROP: { value, params } } */
export function parseIcs(text) {
  const events = [];
  let cur = null;
  for (const line of unfoldIcs(text).split("\n")) {
    if (line === "BEGIN:VEVENT") {
      cur = {};
      continue;
    }
    if (line === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":");
    if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    const p = {};
    for (const x of params) {
      const j = x.indexOf("=");
      if (j > 0) p[x.slice(0, j).toUpperCase()] = x.slice(j + 1);
    }
    cur[name.toUpperCase()] = { value: line.slice(i + 1), params: p };
  }
  return events;
}

export function unescapeIcs(s) {
  return s.replace(/\\n/gi, "\n").replace(/\\([,;\\])/g, "$1");
}

/** DTSTART/DTEND → "YYYY-MM-DD" (시각이 있으면 KST 날짜) */
export function icsDate(prop) {
  if (!prop) return null;
  const m = prop.value
    .trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/);
  if (!m) return null;
  if (!m[4] || !m[7]) return `${m[1]}-${m[2]}-${m[3]}`; // 날짜만, 또는 현지 시각
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] ?? 0));
  return new Date(utc + 9 * 3600_000).toISOString().slice(0, 10);
}

function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / 86_400_000);
}

/** 문자열들의 공통 앞부분.
 *  "… Keqiao 2026 - Boulder Men Final" 과 "… Keqiao 2026 - Boulder Women Final" 의
 *  공통 앞부분은 "… 2026 - Boulder " 인데, 대회 이름은 마지막 구분자 앞까지다.
 *  구분자가 없으면 낱말 중간에서 끊기지 않게 마지막 공백까지. */
export function commonPrefix(list) {
  if (list.length === 0) return "";
  let p = list[0];
  for (const s of list.slice(1)) {
    let i = 0;
    while (i < p.length && i < s.length && p[i] === s[i]) i++;
    p = p.slice(0, i);
  }
  if (list.length > 1) {
    let cut = -1;
    for (const sep of [" - ", " – ", " — ", ": ", " | "]) cut = Math.max(cut, p.lastIndexOf(sep));
    if (cut > 0) p = p.slice(0, cut);
    else if (!/\s$/.test(p) && list.some((s) => s.length > p.length && !/^\s/.test(s[p.length])))
      p = p.slice(0, Math.max(0, p.lastIndexOf(" ")));
  }
  return p.replace(/[\s\-–—:|·,(]+$/u, "").trim();
}

/** 라운드 단위 VEVENT 를 대회 하나로 묶는다.
 *  같은 장소이고 날짜가 7일 안에 이어지면 같은 대회로 본다.
 *  제목은 라운드 제목들의 공통 앞부분 (너무 짧으면 첫 제목). */
export function groupIfsc(events) {
  const rows = events
    .map((ev) => {
      const title = unescapeIcs(ev.SUMMARY?.value ?? "").trim();
      const starts = icsDate(ev.DTSTART);
      if (!title || !starts) return null;
      let ends = icsDate(ev.DTEND) ?? starts;
      // 날짜만 있는 DTEND 는 배타적(다음 날) — 하루 당긴다
      if (ev.DTEND?.params.VALUE === "DATE" && ends > starts) ends = addDays(ends, -1);
      if (ends < starts) ends = starts;
      const desc = unescapeIcs(ev.DESCRIPTION?.value ?? "");
      return {
        title,
        starts,
        ends,
        location: ev.LOCATION ? unescapeIcs(ev.LOCATION.value).trim() : "",
        url: ev.URL?.value?.trim() || desc.match(/https?:\/\/[^\s"'<>]+/)?.[0] || null,
        desc,
      };
    })
    .filter(Boolean)
    .sort((a, b) => (a.starts < b.starts ? -1 : a.starts > b.starts ? 1 : 0));

  const groups = [];
  for (const r of rows) {
    const key = r.location.toLowerCase();
    const g = groups.find(
      (x) => x.key === key && daysBetween(x.ends, r.starts) <= 7 && daysBetween(x.starts, r.ends) <= 14
    );
    if (g) {
      g.items.push(r);
      if (r.ends > g.ends) g.ends = r.ends;
    } else groups.push({ key, starts: r.starts, ends: r.ends, items: [r] });
  }

  return groups.map((g) => {
    const first = g.items[0];
    const prefix = commonPrefix(g.items.map((x) => x.title));
    const title = g.items.length > 1 && prefix.length >= 8 ? prefix : first.title;
    const slug =
      (g.key || "tba").replace(/[^a-z0-9가-힣]+/g, "-").replace(/^-|-$/g, "") || "tba";
    return {
      kind: "competition",
      external_id: `ifsc:${slug}:${g.starts}`,
      title: title.slice(0, 200),
      summary:
        g.items.length > 1
          ? `라운드 ${g.items.length}개 · ${first.desc.split("\n")[0].slice(0, 500)}`.replace(/ · $/, "")
          : first.desc.split("\n")[0].slice(0, 600) || null,
      url: g.items.map((x) => x.url).find(Boolean) ?? null,
      source: "IFSC",
      image_url: null,
      location: first.location.slice(0, 120) || null,
      starts_at: g.starts,
      ends_at: g.ends,
      published_at: `${g.starts}T00:00:00+09:00`,
    };
  });
}

/* ── RSS (구글 뉴스) ── */

export function decodeEntities(s) {
  s = s.trim();
  const c = s.match(/^<!\[CDATA\[([\s\S]*)\]\]>$/);
  if (c) s = c[1];
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&amp;/g, "&");
}

export function stripHtml(s) {
  return decodeEntities(decodeEntities(s).replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}

export function parseRss(xml) {
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const x = m[1];
    const tag = (n) => {
      const r = x.match(new RegExp(`<${n}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${n}>`));
      return r ? decodeEntities(r[1]) : null;
    };
    const src = x.match(/<source(?:\s+url="([^"]*)")?[^>]*>([\s\S]*?)<\/source>/);
    items.push({
      title: tag("title"),
      link: tag("link"),
      guid: tag("guid"),
      pubDate: tag("pubDate"),
      description: tag("description"),
      source: src ? decodeEntities(src[2]) : null,
    });
  }
  return items;
}

/** 구글 뉴스 항목 → 기사 행. kind 별로 external_id 를 나눈다 — 같은 기사가
 *  대회 소식과 뉴스에 둘 다 걸리면 둘 다 보여준다 (덮어쓰기보다 낫다). */
export function gnewsRows(xml, kind, now = Date.now()) {
  const tag = kind === "news" ? "news" : "comp";
  return parseRss(xml)
    .map((it) => {
      const key = it.guid || it.link;
      let title = (it.title ?? "").trim();
      if (!key || !title) return null;
      // 구글 뉴스 제목은 " - 출처" 로 끝난다
      if (it.source && title.endsWith(` - ${it.source}`))
        title = title.slice(0, -(it.source.length + 3)).trim();
      const t = it.pubDate ? Date.parse(it.pubDate) : NaN;
      if (Number.isNaN(t) || now - t > NEWS_MAX_AGE_DAYS * 86_400_000) return null;
      const summary = it.description ? stripHtml(it.description) : "";
      return {
        kind,
        external_id: `gnews:${tag}:${key}`.slice(0, 500),
        title: title.slice(0, 200),
        // 구글 뉴스 설명은 대개 제목의 반복이라, 다른 말일 때만 싣는다
        summary: summary && !summary.startsWith(title.slice(0, 20)) ? summary.slice(0, 600) : null,
        url: it.link,
        source: it.source,
        image_url: null,
        location: null,
        starts_at: null,
        ends_at: null,
        published_at: new Date(t).toISOString(),
      };
    })
    .filter(Boolean);
}

/* ── 가져오기 · 쓰기 ── */

async function get(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "text/calendar, application/rss+xml, text/xml, */*" },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  return res.text();
}

export async function collect(fetchText = get) {
  const rows = [];
  const failures = [];
  const jobs = [
    ["IFSC 일정", () => fetchText(IFSC_ICS).then((t) => groupIfsc(parseIcs(t)))],
    ["대회 소식", () => fetchText(gnews(COMP_QUERY)).then((t) => gnewsRows(t, "competition"))],
    ["뉴스", () => fetchText(gnews(NEWS_QUERY)).then((t) => gnewsRows(t, "news"))],
  ];
  for (const [name, run] of jobs) {
    try {
      const r = await run();
      console.log(`${name}: ${r.length}건`);
      rows.push(...r);
    } catch (e) {
      console.error(`${name} 실패: ${e.message ?? e}`);
      failures.push(name);
    }
  }
  // 한 요청 안에 같은 external_id 가 두 번 있으면 upsert 가 거부한다
  const seen = new Set();
  const uniq = rows.filter((r) => !seen.has(r.external_id) && seen.add(r.external_id));
  return { rows: uniq, failures };
}

async function upsert(rows, url, key) {
  const stamp = new Date().toISOString();
  for (let i = 0; i < rows.length; i += 100) {
    const chunk = rows.slice(i, i + 100).map((r) => ({ ...r, updated_at: stamp }));
    const res = await fetch(`${url}/rest/v1/community_articles?on_conflict=external_id`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=minimal",
      },
      body: JSON.stringify(chunk),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`upsert HTTP ${res.status}: ${await res.text()}`);
  }
}

async function main() {
  const dry = process.argv.includes("--dry-run");
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!dry && (!url || !key)) {
    console.error(
      "SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 가 필요해요.\n" +
        "GitHub 이면 레포 Settings > Secrets and variables > Actions 에 " +
        "SUPABASE_SERVICE_ROLE_KEY 를 넣으세요 (대시보드 Settings > API Keys > service_role)."
    );
    process.exit(1);
  }

  const { rows, failures } = await collect();
  if (dry) {
    console.log(JSON.stringify(rows, null, 2));
  } else if (rows.length) {
    await upsert(rows, url.replace(/\/$/, ""), key);
    console.log(`저장: ${rows.length}건`);
  }
  if (failures.length === 3) {
    console.error("모든 출처에서 실패했어요");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
