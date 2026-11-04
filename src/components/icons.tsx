import {
  Banknote, Bitcoin, CalendarHeart, ChevronDown, ChevronUp, Cloud, CloudSun, Droplets, Leaf, MapPin, RefreshCw, Sun, Thermometer, Umbrella, Wind,
  type LucideIcon,
} from "lucide-react";

/** 한 가지 스타일(Lucide, 선 1.8px)로 통일한 아이콘 세트. 장식용이라 스크린리더에서는 숨긴다. */
const ICONS = {
  thermometer: Thermometer,
  umbrella: Umbrella,
  sun: Sun,
  air: Wind,
  holiday: CalendarHeart,
  cloud: Cloud,
  forecast: CloudSun,
  bitcoin: Bitcoin,
  fx: Banknote,
  leaf: Leaf,
  pin: MapPin,
  drop: Droplets,
  refresh: RefreshCw,
  down: ChevronDown,
  up: ChevronUp,
} satisfies Record<string, LucideIcon>;

export type IconName = keyof typeof ICONS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  const Component = ICONS[name];
  return <Component size={size} strokeWidth={1.8} aria-hidden="true" focusable="false" className={className} />;
}
