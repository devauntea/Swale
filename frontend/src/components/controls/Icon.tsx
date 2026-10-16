import type { CSSProperties } from "react";

export type IconName =
  | "layers"
  | "drop"
  | "building"
  | "basin"
  | "complaint"
  | "chevron"
  | "refresh"
  | "pin"
  | "sparkle"
  | "arrow"
  | "close"
  | "send"
  | "info"
  | "clock"
  | "focus"
  | "check"
  | "chat"
  | "sun"
  | "moon"
  | "expand";
const paths: Record<IconName, string> = {
  layers: "m12 3 9 5-9 5-9-5 9-5Zm-9 9 9 5 9-5M3 16l9 5 9-5",
  drop: "M12 3c-2 4-7 8-7 12a7 7 0 0 0 14 0c0-4-5-8-7-12ZM8 15a4 4 0 0 0 4 4",
  building:
    "M4 21V7h9v14M13 11h7v10M2 21h20M7 10h3M7 14h3M7 18h3M16 14h1M16 18h1",
  basin: "M4 6h16v14H4V6ZM7 3v3m5-3v3m5-3v3M7 10v6m5-6v6m5-6v6",
  complaint: "M5 4h14v12h-7l-5 4v-4H5V4ZM8 8h8m-8 4h5",
  chevron: "m6 9 6 6 6-6",
  refresh:
    "M20 7v5h-5M4 17v-5h5M6 7a7 7 0 0 1 12-1l2 3M4 15l2 3a7 7 0 0 0 12-1",
  pin: "M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0ZM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0Z",
  sparkle:
    "m12 3 2.6 6.4L21 12l-6.4 2.6L12 21l-2.6-6.4L3 12l6.4-2.6L12 3ZM20 2v4m-2-2h4",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  close: "m6 6 12 12M6 18 18 6",
  send: "m3 3 19 9-19 9 4-9-4-9Zm4 9h15",
  info: "M12 17v-5m0-5h.01M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  clock: "M12 6v6l4 2M22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z",
  focus:
    "M3 8V3h5m8 0h5v5m0 8v5h-5M8 21H3v-5M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z",
  check: "m5 12 4 4L19 6",
  chat: "M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0ZM7 10h10m-10 4h6",
  sun: "M12 3V1m0 22v-2M3 12H1m22 0h-2M5.6 5.6 4.2 4.2m15.6 15.6-1.4-1.4M5.6 18.4l-1.4 1.4M19.8 4.2l-1.4 1.4M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0Z",
  moon: "M20.8 13A9 9 0 0 1 11 3.2a9 9 0 1 0 9.8 9.8Z",
  expand: "M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5",
};
export function Icon({
  name,
  size = 18,
  className,
  style,
}: {
  name: IconName;
  size?: number;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={paths[name]} />
    </svg>
  );
}
