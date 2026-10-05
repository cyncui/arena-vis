import type { SVGProps } from 'react';

const iconPaths = {
  'chevron-down': 'M4 6l4 4 4-4',
  'chevron-right': 'M6 4l4 4-4 4',
  'arrow-left': 'M13 8H3m4-4L3 8l4 4',
  channel: 'M4 5l7 1-4 6M4 3.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M11 4.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M7 10.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3',
  block: 'M8 3l5 5-5 5-5-5z',
  info: 'M8 1.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13M8 7.5v4M8 4.5v.25',
  orbit: 'M8 6.5a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3M2 12c-2-2 0-6 4-9s8-3 8-1-2 6-6 9-6 3-6 1M3 3c3-2 7 0 9 4s2 7 0 7-6-2-9-6-3-5 0-5',
  close: 'M4 4l8 8M12 4l-8 8',
};

type InterfaceIconProps = SVGProps<SVGSVGElement> & {
  name: keyof typeof iconPaths;
};

export default function InterfaceIcon({ name, className = '', ...props }: InterfaceIconProps) {
  return (
    <svg
      {...props}
      width={16}
      height={16}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.25}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`inline-block shrink-0 ${className}`}
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}
