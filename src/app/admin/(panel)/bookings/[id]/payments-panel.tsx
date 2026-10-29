"use client";

import { useState, useTransition } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { Button, Card, Field, Input, Select } from "@/components/admin/ui";
import { formatLocal, money } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/admin";
import type { PaymentInput } from "@/lib/orders/schema";
import { addPayment, removePayment } from "../actions";

export type PaymentRow = {
  id: string;
  kind: "payment" | "refund";
  method: string;
  amountCents: number;
  reference: string | null;
  receivedAt: string;
};

export function PaymentsPanel({
  orderId,
  payments,
  remainingCents,
  today,
  canEdit,
  labels,
}: {
  orderId: string;
  payments: PaymentRow[];
  remainingCents: number;
  today: string;
  canEdit: boolean;
  labels: Record<MessageKey, string>;
}) {
  const t = (k: MessageKey) => labels[k] ?? k;
  const blank = (): PaymentInput => ({
    kind: "payment",
    method: "etransfer",
    amountCents: Math.max(0, remainingCents),
    reference: "",
    receivedDate: today,
  });
  const [form, setForm] = useState<PaymentInput | null>(null);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const open = () => {
    const f = blank();
    setForm(f);
    setAmount(f.amountCents ? (f.amountCents / 100).toFixed(2) : "");
    setError(null);
  };
  const submit = () =>
    start(async () => {
      if (!form) return;
      const res = await addPayment(orderId, {
        ...form,
        amountCents: Math.round(Number.parseFloat(amount.replace(/[$,\s]/g, "") || "0") * 100),
      });
      if (res.ok) setForm(null);
      else setError(res.error);
    });

  return (
    <Card
      title={t("order.payments")}
      padded={false}
      actions={
        canEdit && !form ? (
          <Button type="button" variant="ghost" className="h-8 px-2" onClick={open}>
            <Plus className="size-4" /> {t("order.addPayment")}
          </Button>
        ) : null
      }
    >
      {payments.length === 0 && !form && <p className="px-5 py-4 text-sm text-admin-muted">{t("order.noPayments")}</p>}
      {payments.length > 0 && (
        <ul className="divide-y divide-admin-line text-sm">
          {payments.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-5 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {p.kind === "refund" ? t("order.refund") : t("order.payment")} ·{" "}
                  {t(`method.${p.method}` as MessageKey)}
                </p>
                <p className="truncate text-xs text-admin-muted">
                  {formatLocal(p.receivedAt, "MMM d, yyyy")}
                  {p.reference ? ` · ${p.reference}` : ""}
                </p>
              </div>
              <span className={p.kind === "refund" ? "font-semibold text-red-600" : "font-semibold"}>
                {p.kind === "refund" ? "−" : ""}
                {money(p.amountCents)}
              </span>
              {canEdit && p.method !== "booqable" && (
                <button
                  type="button"
                  aria-label={`${t("common.delete")} ${money(p.amountCents)}`}
                  className="rounded p-1 text-admin-muted hover:bg-red-50 hover:text-red-600"
                  disabled={pending}
                  onClick={() =>
                    start(async () => {
                      if (!window.confirm(t("common.delete") + "?")) return;
                      const res = await removePayment(p.id);
                      if (!res.ok) setError(res.error);
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {form && (
        <div className="space-y-3 border-t border-admin-line p-5">
          <div className="flex gap-2" role="radiogroup" aria-label={t("order.payment")}>
            {(["payment", "refund"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={form.kind === k}
                onClick={() => setForm({ ...form, kind: k })}
                className={`h-9 flex-1 rounded-md border text-sm font-semibold ${form.kind === k ? "border-admin-blue bg-admin-blue-soft text-admin-blue" : "border-admin-line"}`}
              >
                {k === "payment" ? t("order.payment") : t("order.refund")}
              </button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("order.amount")}>
              <Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </Field>
            <Field label={t("order.method")}>
              <Select
                value={form.method}
                onChange={(e) => setForm({ ...form, method: e.target.value as PaymentInput["method"] })}
              >
                {(["etransfer", "cash", "card", "cheque", "credit", "other"] as const).map((m) => (
                  <option key={m} value={m}>
                    {t(`method.${m}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("order.date")}>
              <Input
                type="date"
                value={form.receivedDate}
                onChange={(e) => setForm({ ...form, receivedDate: e.target.value })}
              />
            </Field>
            <Field label={t("order.reference")}>
              <Input value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} />
            </Field>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => setForm(null)}>
              {t("common.cancel")}
            </Button>
            <Button type="button" variant="primary" disabled={pending} onClick={submit}>
              {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
            </Button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="px-5 pb-4 text-sm text-red-700">
          {error}
        </p>
      )}
    </Card>
  );
}
