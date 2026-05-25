import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "success";
  size?: "sm" | "md" | "lg" | "xl";
  children: ReactNode;
  fullWidth?: boolean;
}

const variants = {
  primary:
    "bg-gradient-to-br from-orange-500 to-orange-600 hover:from-orange-400 hover:to-orange-500 " +
    "text-white shadow-lg shadow-orange-500/30 border border-orange-400/30",
  secondary:
    "bg-gradient-to-br from-orange-50 to-amber-50 hover:from-orange-100 hover:to-amber-100 " +
    "text-orange-700 border-2 border-orange-200 hover:border-orange-300",
  ghost:
    "bg-transparent hover:bg-orange-50 text-orange-600 border-2 border-transparent hover:border-orange-200",
  danger:
    "bg-gradient-to-br from-red-500 to-rose-600 hover:from-red-400 hover:to-rose-500 " +
    "text-white shadow-lg shadow-red-500/25 border border-red-400/30",
  success:
    "bg-gradient-to-br from-green-500 to-emerald-600 hover:from-green-400 hover:to-emerald-500 " +
    "text-white shadow-lg shadow-green-500/25 border border-green-400/30",
};

const sizes = {
  sm:  "px-4 py-2.5 text-sm min-h-[40px] gap-1.5 rounded-xl",
  md:  "px-6 py-3.5 text-base min-h-[52px] gap-2 rounded-2xl",
  lg:  "px-8 py-4 text-lg min-h-[64px] gap-2.5 rounded-2xl",
  xl:  "px-10 py-5 text-xl min-h-[76px] gap-3 rounded-3xl",
};

export default function Button({
  variant = "primary",
  size = "md",
  fullWidth,
  className,
  children,
  disabled,
  ...props
}: ButtonProps) {
  return (
    <button
      disabled={disabled}
      className={clsx(
        "inline-flex items-center justify-center",
        "font-display font-bold tracking-wide",
        "transition-all duration-150 active:scale-95",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100",
        "focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-400/50",
        variants[variant],
        sizes[size],
        fullWidth && "w-full",
        className
      )}
      {...props}
    >
      {children}
    </button>
  );
}
