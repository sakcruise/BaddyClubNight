import { useState } from "react";
import { Check, Ban, RotateCcw, X, Trash2 } from "lucide-react";
import Avatar from "../shared/Avatar";
import type { Member, PaymentStatus, PaidMethod } from "../../types";

export const METHODS: { value: PaidMethod; label: string }[] = [
  { value: "cash", label: "Cash" },
  { value: "bank_transfer", label: "Bank" },
  { value: "upi", label: "UPI" },
  { value: "other", label: "Other" },
];
export const METHOD_LABEL: Record<PaidMethod, string> = { cash: "cash", bank_transfer: "bank", upi: "UPI", other: "other" };

export const STATUS_STYLE: Record<PaymentStatus, string> = {
  paid: "bg-green-100 text-green-700 border-green-300",
  unpaid: "bg-amber-100 text-amber-700 border-amber-300",
  waived: "bg-gray-100 text-gray-500 border-gray-300",
};

export const money = (n: number) => `£${n.toFixed(2)}`;
export const shortDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });

/** One charge (a due or a night fee) with mark paid / waive / unpaid / remove controls. */
export default function PayRow({ member, title, amount, status, method, paidAt, busy, onSet, onRemove }: {
  member?: Member;
  /** Shown instead of the member name (e.g. the period label on a profile page). */
  title?: string;
  amount: number;
  status: PaymentStatus;
  method: PaidMethod | null;
  paidAt: string | null;
  busy: boolean;
  onSet: (status: PaymentStatus, method?: PaidMethod) => void;
  onRemove?: () => void;
}) {
  const [picking, setPicking] = useState(false);

  return (
    <div className={`bg-white rounded-2xl border border-gray-100 shadow-sm flex items-center gap-3 p-3 ${busy ? "opacity-60" : ""}`}>
      {member && <Avatar name={member.name} memberType={member.member_type} size="sm" />}
      <div className="flex-1 min-w-0">
        <div className="font-display font-bold text-sm text-gray-900 truncate">{title ?? member?.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5">
          <span className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded-md border ${STATUS_STYLE[status]}`}>
            {status}
          </span>
          <span className="text-xs font-display font-semibold text-gray-500">{money(amount)}</span>
          {status === "paid" && method && paidAt && (
            <span className="text-[10px] text-gray-400 font-display truncate">
              {METHOD_LABEL[method]} · {shortDate(paidAt)}
            </span>
          )}
        </div>
      </div>

      {picking ? (
        <div className="flex gap-1 flex-wrap justify-end">
          {METHODS.map((m) => (
            <button
              key={m.value}
              onClick={() => { setPicking(false); onSet("paid", m.value); }}
              className="px-2 py-1 rounded-lg bg-green-500 text-white text-[11px] font-display font-bold hover:bg-green-600 active:scale-95"
            >
              {m.label}
            </button>
          ))}
          <button onClick={() => setPicking(false)} className="px-2 py-1 rounded-lg bg-gray-100 text-gray-500">
            <X size={12} />
          </button>
        </div>
      ) : (
        <div className="flex gap-0.5">
          {status !== "paid" && (
            <button onClick={() => setPicking(true)} disabled={busy} title="Mark paid"
              className="p-2 rounded-xl text-green-600 hover:bg-green-50 disabled:opacity-40">
              <Check size={15} />
            </button>
          )}
          {status === "unpaid" && (
            <button onClick={() => onSet("waived")} disabled={busy} title="Waive — nothing owed"
              className="p-2 rounded-xl text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40">
              <Ban size={15} />
            </button>
          )}
          {status !== "unpaid" && (
            <button onClick={() => onSet("unpaid")} disabled={busy} title="Back to unpaid"
              className="p-2 rounded-xl text-gray-400 hover:text-amber-600 hover:bg-amber-50 disabled:opacity-40">
              <RotateCcw size={15} />
            </button>
          )}
          {onRemove && (
            <button onClick={onRemove} disabled={busy} title="Remove this charge"
              className="p-2 rounded-xl text-gray-300 hover:text-red-500 hover:bg-red-50 disabled:opacity-40">
              <Trash2 size={15} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
