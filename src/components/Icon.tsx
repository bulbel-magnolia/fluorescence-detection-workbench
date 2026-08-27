import type { SVGProps } from 'react';

export type IconName =
  | 'overview'
  | 'pulse'
  | 'import'
  | 'export'
  | 'history'
  | 'team'
  | 'settings'
  | 'bluetooth'
  | 'battery'
  | 'cloud'
  | 'user'
  | 'arrow'
  | 'play'
  | 'stop'
  | 'scan'
  | 'flask'
  | 'warning'
  | 'info'
  | 'check'
  | 'file'
  | 'network'
  | 'link'
  | 'plus'
  | 'trash'
  | 'reset'
  | 'chevron-down';

const paths: Record<IconName, React.ReactNode> = {
  overview: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  pulse: <path d="M3 12h4l2.3-6 4.2 12 2.4-6H21" />,
  import: (
    <>
      <path d="M12 3v12" />
      <path d="m7 10 5 5 5-5" />
      <path d="M4 19h16" />
    </>
  ),
  export: (
    <>
      <path d="M12 21V9" />
      <path d="m7 14 5-5 5 5" />
      <path d="M4 5h16" />
    </>
  ),
  history: (
    <>
      <path d="M3 12a9 9 0 1 0 3-6.7L3 8" />
      <path d="M3 3v5h5" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  team: (
    <>
      <circle cx="9" cy="8" r="3" />
      <circle cx="17" cy="9" r="2" />
      <path d="M3 20c0-4 2.5-6 6-6s6 2 6 6" />
      <path d="M15 15c3.5 0 6 1.5 6 5" />
    </>
  ),
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1a1.7 1.7 0 0 0 1.9.3A1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1Z" />
    </>
  ),
  bluetooth: <path d="m7 7 10 10-5 4V3l5 4L7 17" />,
  battery: (
    <>
      <rect x="3" y="7" width="17" height="10" rx="2" />
      <path d="M22 10v4" />
      <path d="M6 10h8v4H6z" />
    </>
  ),
  cloud: <path d="M5 18h13a4 4 0 0 0 .5-8A7 7 0 0 0 5 8.5 4.8 4.8 0 0 0 5 18Z" />,
  user: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" />
    </>
  ),
  arrow: (
    <>
      <path d="M5 12h14" />
      <path d="m14 7 5 5-5 5" />
    </>
  ),
  play: <path d="m8 5 11 7-11 7Z" />,
  stop: <rect x="6" y="6" width="12" height="12" rx="2" />,
  scan: (
    <>
      <path d="M4 8V4h4" />
      <path d="M16 4h4v4" />
      <path d="M20 16v4h-4" />
      <path d="M8 20H4v-4" />
      <path d="M7 12h10" />
    </>
  ),
  flask: (
    <>
      <path d="M9 3h6" />
      <path d="M10 3v6l-5 9a2 2 0 0 0 2 3h10a2 2 0 0 0 2-3l-5-9V3" />
      <path d="M7 16h10" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3 2 21h20Z" />
      <path d="M12 9v5" />
      <path d="M12 18h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6" />
      <path d="M12 7h.01" />
    </>
  ),
  check: <path d="m4 12 5 5L20 6" />,
  file: (
    <>
      <path d="M6 2h8l4 4v16H6Z" />
      <path d="M14 2v5h5" />
      <path d="M9 13h6" />
      <path d="M9 17h6" />
    </>
  ),
  network: (
    <>
      <circle cx="5" cy="12" r="2.5" />
      <circle cx="12" cy="5" r="2.5" />
      <circle cx="19" cy="12" r="2.5" />
      <circle cx="12" cy="19" r="2.5" />
      <path d="m7 10 3-3" />
      <path d="m14 7 3 3" />
      <path d="m17 14-3 3" />
      <path d="m10 17-3-3" />
    </>
  ),
  link: (
    <>
      <path d="M10 13a5 5 0 0 0 7.5.5l2-2a5 5 0 0 0-7-7l-1.2 1.2" />
      <path d="M14 11a5 5 0 0 0-7.5-.5l-2 2a5 5 0 0 0 7 7l1.2-1.2" />
    </>
  ),
  plus: (
    <>
      <path d="M12 5v14" />
      <path d="M5 12h14" />
    </>
  ),
  trash: (
    <>
      <path d="M4 7h16" />
      <path d="M9 3h6l1 4H8Z" />
      <path d="m6 7 1 14h10l1-14" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </>
  ),
  reset: (
    <>
      <path d="M4 4v6h6" />
      <path d="M5.5 15a8 8 0 1 0 .7-7.8L4 10" />
    </>
  ),
  'chevron-down': <path d="m7 9 5 5 5-5" />,
};

interface IconProps extends SVGProps<SVGSVGElement> {
  name: IconName;
  size?: number;
}

export function Icon({ name, size = 20, ...props }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name]}
    </svg>
  );
}
