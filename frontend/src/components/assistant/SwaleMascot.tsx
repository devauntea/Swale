import { useId } from "react";
import "./assistant.css";

export type MascotExpression =
  | "idle"
  | "opening"
  | "greeting"
  | "processing"
  | "highlighting"
  | "information"
  | "error"
  | "closing";

interface Props {
  expression?: MascotExpression;
  className?: string;
}

/** Original, compact vector interpretation of the supplied Swale character. */
export function SwaleMascot({ expression = "idle", className = "" }: Props) {
  const id = useId();
  const happy = expression === "greeting" || expression === "opening";
  return (
    <svg
      className={`swale-mascot ${className}`}
      data-expression={expression}
      viewBox="0 0 112 128"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient
          id={`${id}-coat`}
          x1="28"
          y1="68"
          x2="83"
          y2="113"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#FFE17A" />
          <stop offset="1" stopColor="#F8BD2B" />
        </linearGradient>
        <linearGradient
          id={`${id}-blue`}
          x1="29"
          y1="36"
          x2="80"
          y2="83"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#4599FF" />
          <stop offset="1" stopColor="#1456BF" />
        </linearGradient>
        <linearGradient
          id={`${id}-canopy`}
          x1="25"
          y1="8"
          x2="104"
          y2="39"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#418EFA" />
          <stop offset="1" stopColor="#1663D6" />
        </linearGradient>
      </defs>
      <ellipse cx="56" cy="122" rx="30" ry="3.5" fill="#122A52" opacity=".12" />
      <g className="mascot-umbrella">
        <path
          d="M79 17 68 99"
          stroke="#142E55"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M8 33C22 12 56 4 78 7c16 2 25 14 30 34-8-5-14-5-21 0-7-6-14-7-23-3-7-6-14-7-24-3-10-7-19-7-32-2Z"
          fill="#174588"
        />
        <path
          d="M8 33C22 12 56 4 78 7c16 2 25 14 30 34-9-5-15-5-22 0-7-19-15-27-26-29C39 15 23 22 8 33Z"
          fill={`url(#${id}-canopy)`}
        />
        <path
          d="M60 12C51 17 44 24 40 35M60 12c5 4 7 13 4 26M60 12c13 4 20 13 22 29"
          stroke="#82B8FF"
          strokeWidth=".9"
          opacity=".6"
        />
        <path
          d="m8 33 1-1M108 41v-1"
          stroke="#6BABFF"
          strokeWidth="3"
          strokeLinecap="round"
        />
      </g>
      <g className="mascot-body">
        <path
          d="m41 105-3 13c-1 3 5 4 13 3l3-17M61 104l2 17c9 1 15 0 14-3l-5-13"
          fill={`url(#${id}-blue)`}
        />
        <path
          d="M38 118c4 2 9 2 14 0v4c-8 2-15 0-14-4ZM63 119c5 1 10 1 14-1 2 4-5 6-14 4Z"
          fill="#10294F"
        />
        <g className="mascot-wave-arm">
          <path
            d="M36 77c-7 3-13 8-17 16l12 8 15-17"
            fill={`url(#${id}-coat)`}
            stroke="#E7A626"
            strokeWidth="1.1"
            strokeLinejoin="round"
          />
          <path d="m20 94-3 5c-2 6 6 9 10 4l3-5" fill={`url(#${id}-blue)`} />
        </g>
        <path
          d="M37 72c-5 7-9 19-10 35 11 6 21 7 29 4 9 3 18 2 28-3-2-16-6-29-13-37Z"
          fill={`url(#${id}-coat)`}
          stroke="#E7AD2F"
          strokeWidth="1.1"
          strokeLinejoin="round"
        />
        <path
          d="m55 81 1 30M41 94l-1 11-10-2 2-10M70 94l2 11 9-2-2-10"
          stroke="#C78B1C"
          strokeWidth="1.1"
          opacity=".7"
        />
        <path
          d="M44 78v11M65 78v11"
          stroke="#153969"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
        <path
          d="M43 88v3M66 88v3"
          stroke="#153969"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <path
          d="M50 95c3-3 5 3 8 0s5 3 8 0M50 99c3-3 5 3 8 0s5 3 8 0"
          stroke="#216ED8"
          strokeWidth="2"
          strokeLinecap="round"
        />
        <path
          d="M76 78c9 2 13 8 12 16l-12 1-7-11"
          fill={`url(#${id}-coat)`}
          stroke="#E7AD2F"
          strokeWidth="1.1"
        />
        <path
          d="M84 86c-5-4-10-2-11 2-1 5 5 9 10 6 3-2 4-5 1-8Z"
          fill={`url(#${id}-blue)`}
        />
        <path
          d="m80 88-2 10"
          stroke="#142E55"
          strokeWidth="4.5"
          strokeLinecap="round"
        />
        <path
          d="M27 56c3-15 15-26 29-32 14 6 24 17 28 32l-3 18c-11 10-41 12-53-1Z"
          fill={`url(#${id}-coat)`}
          stroke="#E4AC31"
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <path
          d="M32 55c4-13 12-20 24-23 12 3 21 10 24 24 4 16-7 25-24 25-17 0-28-9-24-26Z"
          fill={`url(#${id}-blue)`}
        />
        <path
          d="M37 58c0-11 9-17 19-17s19 6 19 17c0 12-8 17-19 17s-19-5-19-17Z"
          fill="#112442"
          stroke="#0E3F8E"
          strokeWidth="1.2"
        />
        <g className="mascot-eyes">
          {happy ? (
            <path
              d="M45 58c1-5 5-5 7 0m10 0c1-5 5-5 7 0"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
            />
          ) : (
            <>
              <rect
                x="45"
                y="51"
                width="5.5"
                height="14"
                rx="2.75"
                fill="white"
              />
              <rect
                x="62"
                y="51"
                width="5.5"
                height="14"
                rx="2.75"
                fill="white"
              />
            </>
          )}
        </g>
        {expression === "information" && (
          <path
            d="M53 68q3 3 6 0"
            stroke="#8EC5FF"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        )}
      </g>
    </svg>
  );
}
