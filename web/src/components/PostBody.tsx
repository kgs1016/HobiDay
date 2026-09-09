import { Fragment } from "react";

/** 게시글은 평문으로 보관한다. 소제목과 http(s) 링크만 표현하고 HTML은 실행하지 않는다. */
function LinkedText({ text }: { text: string }) {
  const pattern = /\[([^\]\n]+)\]\((https?:\/\/[^\s<>]+)\)|(https?:\/\/[^\s<>]+)/gi;
  const parts = [];
  let cursor = 0;
  for (const match of text.matchAll(pattern)) {
    const start = match.index!;
    parts.push(text.slice(cursor, start));
    const rawUrl = match[2] ?? match[3];
    const href = match[2] ? rawUrl : rawUrl.replace(/[.,!?;:)\]}]+$/, "");
    let safe = false;
    try {
      const url = new URL(href);
      safe = ["https:", "http:"].includes(url.protocol) && !url.username && !url.password;
    } catch { /* 올바른 주소가 아니면 평문 그대로 보여준다. */ }
    parts.push(safe ? (
      <Fragment key={start}>
        <a href={href} target="_blank" rel="noopener noreferrer ugc" className="break-words font-medium text-accent-strong underline decoration-accent-strong/30 underline-offset-4">
          {match[1] ?? href}
        </a>
        {!match[2] && rawUrl.slice(href.length)}
      </Fragment>
    ) : match[0]);
    cursor = start + match[0].length;
  }
  parts.push(text.slice(cursor));
  return <>{parts}</>;
}

export default function PostBody({ body }: { body: string }) {
  return <div className="mt-5 space-y-5 break-words text-[15px] leading-[1.85]">
    {body.split(/\n\s*\n/).filter(Boolean).map((block, index) => {
      const heading = block.match(/^## ([^\n]+)(?:\n([\s\S]*))?$/);
      return <div key={index}>
        {heading && <h2 className="mb-1.5 pt-1 text-[15px] font-bold leading-relaxed">{heading[1]}</h2>}
        {(!heading || heading[2]) && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">
          <LinkedText text={heading ? heading[2] : block} />
        </p>}
      </div>;
    })}
  </div>;
}
