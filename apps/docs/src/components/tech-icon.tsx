import { techIcons } from '@/lib/tech-icons';

// These brands' official marks are pure/near-black - fixed to that hex,
// they'd disappear against a dark background. Render them with the
// surrounding text color instead so they invert with the theme, the way
// each of these brands' own dark-mode logo treatment does.
const MONOCHROME_ICONS = new Set<keyof typeof techIcons>(['nextdotjs', 'github', 'resend']);

export function TechIcon({
  icon,
  size = 20,
}: {
  icon: keyof typeof techIcons;
  size?: number;
}) {
  const { path, hex, name } = techIcons[icon];
  const fill = MONOCHROME_ICONS.has(icon) ? 'currentColor' : hex;
  return (
    <svg role="img" viewBox="0 0 24 24" width={size} height={size} fill={fill} aria-label={name}>
      <path d={path} />
    </svg>
  );
}
