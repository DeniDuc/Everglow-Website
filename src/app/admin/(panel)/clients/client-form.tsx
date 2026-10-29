"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button, Card, Field, Input, Select, Textarea } from "@/components/admin/ui";
import type { MessageKey } from "@/lib/i18n/admin";
import type { NewCustomerInput } from "@/lib/orders/schema";
import { saveClient } from "./actions";

const sources = ["website", "facebook_marketplace", "phone", "referral", "walk_in", "other"] as const;

export function ClientForm({
  id,
  initial,
  canEdit,
  labels,
}: {
  id: string | null;
  initial: NewCustomerInput;
  canEdit: boolean;
  labels: Record<MessageKey, string>;
}) {
  const t = (k: MessageKey) => labels[k] ?? k;
  const router = useRouter();
  const [v, setV] = useState(initial);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [pending, start] = useTransition();
  const set = (k: keyof NewCustomerInput, value: string) => {
    setV((prev) => ({ ...prev, [k]: value }));
    setStatus({ kind: "idle" });
  };

  return (
    <Card title={t("clients.details")}>
      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const res = await saveClient(id, v);
            if (!res.ok) return setStatus({ kind: "error", text: res.error });
            if (!id) router.push(`/admin/clients/${res.id}`);
            else setStatus({ kind: "saved" });
          });
        }}
      >
        <Field label={t("common.name")}>
          <Input required value={v.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("clients.company")}>
          <Input value={v.company} onChange={(e) => set("company", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("common.email")}>
          <Input type="email" value={v.email} onChange={(e) => set("email", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("common.phone")}>
          <Input type="tel" value={v.phone} onChange={(e) => set("phone", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("clients.address")}>
          <Textarea rows={3} value={v.address} onChange={(e) => set("address", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("clients.notes")}>
          <Textarea rows={3} value={v.notes} onChange={(e) => set("notes", e.target.value)} disabled={!canEdit} />
        </Field>
        <Field label={t("clients.source")}>
          <Select value={v.source} onChange={(e) => set("source", e.target.value)} disabled={!canEdit}>
            {sources.map((s) => (
              <option key={s} value={s}>
                {t(`source.${s}`)}
              </option>
            ))}
          </Select>
        </Field>
        {canEdit && (
          <div className="flex items-end justify-end gap-3 sm:col-span-2">
            <p aria-live="polite" className="text-sm">
              {status.kind === "saved" && <span className="font-semibold text-admin-green">{t("common.saved")}</span>}
              {status.kind === "error" && <span className="text-red-700">{status.text}</span>}
            </p>
            <Button type="submit" variant="primary" disabled={pending}>
              {pending && <Loader2 className="size-4 animate-spin" />} {t("clients.save")}
            </Button>
          </div>
        )}
      </form>
    </Card>
  );
}
