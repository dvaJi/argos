import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement>;

function base(props: IconProps): IconProps {
  return {
    width: 16,
    height: 16,
    viewBox: "0 0 16 16",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.5,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    ...props,
  };
}

export function RefreshIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9" />
      <path d="M13.5 2.5v2.4h-2.4" />
    </svg>
  );
}

export function CoinsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <ellipse cx="8" cy="4.5" rx="5" ry="2.25" />
      <path d="M3 4.5v2.5c0 1.24 2.24 2.25 5 2.25s5-1.01 5-2.25V4.5" />
      <path d="M3 7v2.5c0 1.24 2.24 2.25 5 2.25s5-1.01 5-2.25V7" />
    </svg>
  );
}

export function CachedIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M2 5.5A4.5 4.5 0 0 1 13 5" />
      <path d="M13 2.5V5h-2.5" />
      <path d="M14 10.5A4.5 4.5 0 0 1 3 11" />
      <path d="M3 13.5V11h2.5" />
    </svg>
  );
}

export function OutputIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M8 2v9" />
      <path d="M4.5 7.5 8 11l3.5-3.5" />
      <path d="M3 13.5h10" />
    </svg>
  );
}

export function WalletIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="1.5" y="3.5" width="13" height="9" rx="1.5" />
      <path d="M11 8.25h.01" />
      <path d="M1.5 6.5h13" />
    </svg>
  );
}

export function LayersIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m8 1.5 6 3-6 3-6-3 6-3Z" />
      <path d="m2 8 6 3 6-3" />
      <path d="m2 11 6 3 6-3" />
    </svg>
  );
}
