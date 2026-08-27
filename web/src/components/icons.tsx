/* 기능 아이콘 — OS 이모지 대신 쓰는 통일된 line icon 세트.
   1.8px stroke · round cap · 단색(currentColor). 색은 부모의 text 색을 따른다. */

type IconProps = {
  size?: number;
  className?: string;
  strokeWidth?: number;
};

function Base({
  size = 22,
  className,
  strokeWidth = 1.8,
  children,
}: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
    >
      {children}
    </svg>
  );
}

export function HomeIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 10.5 12 4l8 6.5" />
      <path d="M5.5 9.5V19a1 1 0 0 0 1 1h3.5v-5.5h4V20h3.5a1 1 0 0 0 1-1V9.5" />
    </Base>
  );
}

export function ChatIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M21 11.6c0 4.2-4 7.4-9 7.4-1 0-2-.13-2.9-.37L5 20l.9-3.2C4.7 15.4 4 13.6 4 11.6 4 7.4 7.6 4.2 12 4.2s9 3.2 9 7.4Z" />
    </Base>
  );
}

export function InboxIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 13.5h4.2l1.3 2.2h5l1.3-2.2H20" />
      <path d="M6.4 5.5h11.2a1 1 0 0 1 .95.68L20 13.5V18a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1v-4.5l1.45-7.32a1 1 0 0 1 .95-.68Z" />
    </Base>
  );
}

export function UserIcon(p: IconProps) {
  return (
    <Base {...p}>
      <circle cx="12" cy="8.2" r="3.6" />
      <path d="M4.8 19.6c.9-3.2 3.8-5 7.2-5s6.3 1.8 7.2 5" />
    </Base>
  );
}

export function ChevronLeftIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m14.5 5.5-6.5 6.5 6.5 6.5" />
    </Base>
  );
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="m9.5 5.5 6.5 6.5-6.5 6.5" />
    </Base>
  );
}

export function PlusIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M12 5v14M5 12h14" />
    </Base>
  );
}

export function CameraIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M4 8.5A1.5 1.5 0 0 1 5.5 7h2l1.4-2h6.2L16.5 7h2A1.5 1.5 0 0 1 20 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 17.5v-9Z" />
      <circle cx="12" cy="13" r="3.4" />
    </Base>
  );
}

export function VideoIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="3.5" y="6.5" width="12" height="11" rx="2" />
      <path d="m15.5 10.5 5-2.8v8.6l-5-2.8" />
    </Base>
  );
}

export function PhotoIcon(p: IconProps) {
  return (
    <Base {...p}>
      <rect x="4" y="5" width="16" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17 4.5-4.5 3 3 3.5-3.5L20 16" />
    </Base>
  );
}

export function PlayIcon(p: IconProps) {
  return (
    <Base {...p}>
      <path d="M8.5 5.8v12.4L18.5 12 8.5 5.8Z" />
    </Base>
  );
}

/* 사진이 없을 때 쓰는 프로필 자리표시 — 이모지(🧗) 대신 중립 아이콘 원 */
export function AvatarFallback({
  size = 56,
  className = "",
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      style={{ width: size, height: size }}
      className={`flex shrink-0 items-center justify-center rounded-full bg-surface2 text-faint ${className}`}
    >
      <UserIcon size={Math.round(size * 0.5)} />
    </span>
  );
}
