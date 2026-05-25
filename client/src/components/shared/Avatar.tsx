import { clsx } from "clsx";
import type { MemberType } from "../../types";

interface AvatarProps {
  name: string;
  url?: string;
  size?: "xs" | "sm" | "md" | "lg" | "xl";
  memberType?: MemberType;
  className?: string;
}

const sizes = {
  xs: "w-6 h-6 text-[10px]",
  sm: "w-8 h-8 text-xs",
  md: "w-12 h-12 text-sm",
  lg: "w-16 h-16 text-lg",
  xl: "w-24 h-24 text-2xl",
};

function initials(name: string): string {
  return name
    .split(" ")
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase();
}

// Colour by member type
const TYPE_COLORS: Record<MemberType, string> = {
  male:   "bg-sky-300 text-sky-900",
  female: "bg-pink-300 text-pink-900",
  guest:  "bg-purple-400 text-white",
};

// Fallback palette for when no type is provided
const PALETTE = [
  "bg-orange-400 text-white",
  "bg-amber-400 text-white",
  "bg-green-500 text-white",
  "bg-teal-500 text-white",
  "bg-blue-500 text-white",
  "bg-violet-500 text-white",
  "bg-pink-500 text-white",
  "bg-rose-500 text-white",
];

function colorFor(name: string): string {
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) % PALETTE.length;
  return PALETTE[hash];
}

export default function Avatar({ name, url, size = "md", memberType, className }: AvatarProps) {
  const color = memberType ? TYPE_COLORS[memberType] : colorFor(name);

  return url ? (
    <img
      src={url}
      alt={name}
      className={clsx("rounded-full object-cover", sizes[size], className)}
    />
  ) : (
    <div
      className={clsx(
        "rounded-full flex items-center justify-center font-display font-black",
        sizes[size],
        color,
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
