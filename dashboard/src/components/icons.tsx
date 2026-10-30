type IconProps = { size?: number };

function Svg({ size = 16, children }: IconProps & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const Logo = ({ size = 22 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 2 4 5.2v6.1c0 4.7 3.2 8.7 8 10.7 4.8-2 8-6 8-10.7V5.2L12 2Z" fill="currentColor" />
    <path d="M12 6.2v11.6M8 9.4h8M8.6 13.4h6.8" stroke="var(--bg)" strokeWidth="1.6" strokeLinecap="round" />
  </svg>
);

export const IconOverview = (p: IconProps) => (
  <Svg {...p}>
    <rect x="2" y="2" width="5" height="6" rx="1" />
    <rect x="9" y="2" width="5" height="3.5" rx="1" />
    <rect x="9" y="7.5" width="5" height="6.5" rx="1" />
    <rect x="2" y="10" width="5" height="4" rx="1" />
  </Svg>
);
export const IconTraffic = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2 4h12M2 8h12M2 12h7" />
  </Svg>
);
export const IconFindings = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 1.8 2.5 4v3.7c0 3 2.3 5.4 5.5 6.5 3.2-1.1 5.5-3.5 5.5-6.5V4L8 1.8Z" />
    <path d="M8 5.5v3M8 10.6v.1" />
  </Svg>
);
export const IconSearch = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="7" cy="7" r="4.2" />
    <path d="m10.3 10.3 3.2 3.2" />
  </Svg>
);
export const IconRefresh = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.5 3.5v3h-3M2.5 12.5v-3h3" />
    <path d="M3.4 6.8A5 5 0 0 1 12.7 5.6L13.5 6.5M12.6 9.2a5 5 0 0 1-9.3 1.2L2.5 9.5" />
  </Svg>
);
export const IconSun = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="8" cy="8" r="2.8" />
    <path d="M8 1.5v1.4M8 13.1v1.4M1.5 8h1.4M13.1 8h1.4M3.4 3.4l1 1M11.6 11.6l1 1M12.6 3.4l-1 1M4.4 11.6l-1 1" />
  </Svg>
);
export const IconMoon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13.2 9.6A5.6 5.6 0 0 1 6.4 2.8a5.6 5.6 0 1 0 6.8 6.8Z" />
  </Svg>
);
export const IconClose = (p: IconProps) => (
  <Svg {...p}>
    <path d="m3.5 3.5 9 9M12.5 3.5l-9 9" />
  </Svg>
);
export const IconCopy = (p: IconProps) => (
  <Svg {...p}>
    <rect x="5.5" y="5.5" width="8" height="8" rx="1.5" />
    <path d="M10.5 5.5V4A1.5 1.5 0 0 0 9 2.5H4A1.5 1.5 0 0 0 2.5 4v5A1.5 1.5 0 0 0 4 10.5h1.5" />
  </Svg>
);
export const IconDownload = (p: IconProps) => (
  <Svg {...p}>
    <path d="M8 2.5v7.5M4.8 7.2 8 10.3l3.2-3.1M2.5 13h11" />
  </Svg>
);
export const IconArrow = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 8h10M9 4l4 4-4 4" />
  </Svg>
);
export const IconSort = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 6.5 3-3 3 3M5 9.5l3 3 3-3" />
  </Svg>
);
export const IconLogout = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6.5 2.5h-3v11h3M10 5l3 3-3 3M13 8H6.5" />
  </Svg>
);
export const IconCommand = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5.5 5.5h5v5h-5zM5.5 5.5V4a1.5 1.5 0 1 0-1.5 1.5h1.5M10.5 5.5H12A1.5 1.5 0 1 0 10.5 4v1.5M5.5 10.5H4A1.5 1.5 0 1 0 5.5 12v-1.5M10.5 10.5V12a1.5 1.5 0 1 0 1.5-1.5h-1.5" />
  </Svg>
);
