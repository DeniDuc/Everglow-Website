"use client";

import { useRef, useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, Checkbox } from "@/components/admin/ui";
import { money } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/admin";
import { nextStatuses, type OrderStatus } from "@/lib/orders/status";
import { setOrderStatus, type Shortage } from "../actions";

type Cancellation = {
  keptCents: number;
  refundCents: number;
  creditCents: number;
  balanceDueCents: number;
  label: string | null;
};

/** Lifecycle buttons for the order header. Cancelling and handing over ask for confirmation. */
export function StatusActions({
  orderId,
  status,
  cancellation,
  labels,
  titles,
}: {
  orderId: string;
  status: OrderStatus;
  cancellation: Cancellation;
  labels: Record<MessageKey, string>;
  titles: Record<string, string>;
}) {
  const t = (k: MessageKey) => labels[k] ?? k;
  const [pending, start] = useTransition();
  const [error, setError] = useState<{ text: string; shortages: Shortage[] } | null>(null);
  const [idChecked, setIdChecked] = useState(false);
  const [confirming, setConfirming] = useState<OrderStatus | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const options = nextStatuses(status);

  function go(to: OrderStatus, allowOverbook = false) {
    setError(null);
    start(async () => {
      const res = await setOrderStatus({ orderId, to, idChecked: to === "out" ? idChecked : undefined, allowOverbook });
      if (!res.ok) setError({ text: res.error, shortages: res.shortages ?? [] });
      else {
        dialog.current?.close();
        setConfirming(null);
      }
    });
  }
  function ask(to: OrderStatus) {
    if (to === "cancelled" || to === "out") {
      setConfirming(to);
      setError(null);
      dialog.current?.showModal();
    } else go(to);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((to, i) => (
        <Button
          key={to}
          type="button"
          disabled={pending}
          variant={to === "cancelled" ? "danger" : i === 0 ? "primary" : "secondary"}
          onClick={() => ask(to)}
        >
          {pending && i === 0 && <Loader2 className="size-4 animate-spin" />}
          {titles[to]}
        </Button>
      ))}
      {error && !confirming && (
        <p role="alert" className="w-full text-sm text-red-700">
          {error.text}{" "}
          {error.shortages.length > 0 && (
            <button type="button" className="font-semibold underline" onClick={() => go(options[0], true)}>
              {t("order.allowOverbook")}
            </button>
          )}
        </p>
      )}
      <dialog
        ref={dialog}
        onClose={() => setConfirming(null)}
        className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-admin-line p-0 backdrop:bg-black/40"
      >
        <div className="space-y-4 p-6 text-sm text-admin-text">
          {confirming === "cancelled" && (
            <>
              <h2 className="text-lg font-semibold">{t("order.cancelTitle")}</h2>
              {cancellation.label && <p className="text-admin-muted">{cancellation.label}</p>}
              <dl className="space-y-1">
                {(
                  [
                    ["order.cancelKept", cancellation.keptCents],
                    ["order.cancelCredit", cancellation.creditCents],
                    ["order.cancelRefund", cancellation.refundCents],
                    ["order.cancelBalanceDue", cancellation.balanceDueCents],
                  ] as const
                ).map(([k, v]) => (
                  <div key={k} className="flex justify-between">
                    <dt>{t(k)}</dt>
                    <dd className="font-semibold">{money(v)}</dd>
                  </div>
                ))}
              </dl>
              <p className="text-xs text-admin-muted">{t("order.cancelHint")}</p>
            </>
          )}
          {confirming === "out" && (
            <>
              <h2 className="text-lg font-semibold">{titles.out}</h2>
              <Checkbox
                label={t("order.idChecked")}
                checked={idChecked}
                onChange={(e) => setIdChecked(e.target.checked)}
              />
            </>
          )}
          {error && (
            <p role="alert" className="text-red-700">
              {error.text}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" onClick={() => dialog.current?.close()}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant={confirming === "cancelled" ? "danger" : "primary"}
              disabled={pending}
              onClick={() => confirming && go(confirming)}
            >
              {pending && <Loader2 className="size-4 animate-spin" />} {t("order.confirm")}
            </Button>
          </div>
        </div>
      </dialog>
    </div>
  );
}
