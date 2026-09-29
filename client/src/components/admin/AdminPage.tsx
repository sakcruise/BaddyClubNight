import type { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import ShuttlecockIcon from "../shared/ShuttlecockIcon";

interface Props {
  title: string;
  subtitle?: string;
  /** Right-hand header slot: counts, primary action, etc. */
  aside?: ReactNode;
  /** Widest content column; defaults to a reading width. */
  width?: "md" | "lg" | "xl";
  children: ReactNode;
}

const WIDTHS = { md: "max-w-2xl", lg: "max-w-4xl", xl: "max-w-6xl" };

export default function AdminPage({ title, subtitle, aside, width = "lg", children }: Props) {
  const navigate = useNavigate();
  return (
    <div
      className="min-h-screen min-h-[100dvh] flex flex-col"
      style={{ background: "linear-gradient(160deg, rgb(var(--p-50)) 0%, rgb(var(--p-100)) 50%, rgb(var(--p-100)) 100%)" }}
    >
      <header
        className="flex items-center gap-4 px-4 sm:px-6 flex-shrink-0"
        style={{
          background: "linear-gradient(135deg, rgb(var(--p-900)) 0%, rgb(var(--p-700)) 40%, rgb(var(--p-600)) 70%, rgb(var(--p-500)) 100%)",
          minHeight: "72px",
        }}
      >
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-1.5 bg-white/15 hover:bg-white/25 text-white px-3 py-2 rounded-xl text-sm font-display font-bold border border-white/20 transition-all"
        >
          <ArrowLeft size={15} /> <span className="hidden sm:inline">Home</span>
        </button>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="bg-white/15 rounded-xl p-1.5 hidden sm:block">
            <ShuttlecockIcon size={28} />
          </div>
          <div className="min-w-0">
            <h1 className="font-display font-black text-white text-lg leading-tight truncate">{title}</h1>
            {subtitle && <p className="text-orange-200 text-xs font-display truncate">{subtitle}</p>}
          </div>
        </div>
        {aside && <div className="ml-auto flex items-center gap-2">{aside}</div>}
      </header>

      <main className={`flex-1 ${WIDTHS[width]} mx-auto w-full p-4 sm:p-6`}>{children}</main>
    </div>
  );
}
