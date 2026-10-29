"use client";

import { useActionState, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Badge, Button, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/admin/ui";
import type { Settings, SettingsKey } from "@/lib/settings-schema";
import { addStaff, saveDeliveryTiers, saveFaq, savePage, saveSettings, saveTaxRates, updateStaff } from "./actions";

type Status = { ok: boolean; error?: string } | null;

function SaveBar({
  pending,
  status,
  onSave,
  disabled,
}: {
  pending: boolean;
  status: Status;
  onSave: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-5 flex items-center justify-end gap-3 border-t border-admin-line pt-4">
      {status?.ok && (
        <span className="flex items-center gap-1 text-sm text-green-700">
          <CheckCircle2 className="size-4" /> Saved
        </span>
      )}
      {status && !status.ok && <span className="text-sm text-red-600">{status.error}</span>}
      <Button variant="primary" onClick={onSave} disabled={pending || disabled}>
        {pending && <Loader2 className="size-4 animate-spin" />} Save
      </Button>
    </div>
  );
}

export type FieldSpec = {
  name: string;
  label: string;
  hint?: string;
  type: "text" | "email" | "number" | "percent" | "money" | "time" | "bool" | "days-list" | "textarea";
  wide?: boolean;
};

/** Generic form for one settings group. Percent fields store basis points, money fields cents. */
export function SettingsForm<K extends SettingsKey>({
  settingsKey,
  initial,
  fields,
  canEdit,
  title,
  description,
}: {
  settingsKey: K;
  initial: Settings[K];
  fields: FieldSpec[];
  canEdit: boolean;
  title: string;
  description?: string;
}) {
  const [value, setValue] = useState<Record<string, unknown>>(initial as Record<string, unknown>);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const set = (name: string, v: unknown) => {
    setValue((prev) => ({ ...prev, [name]: v }));
    setStatus(null);
  };

  return (
    <Card title={title}>
      {description && <p className="-mt-1 mb-4 text-sm text-admin-muted">{description}</p>}
      <div className="grid gap-4 md:grid-cols-2">
        {fields.map((f) => {
          const v = value[f.name];
          if (f.type === "bool") {
            return (
              <div key={f.name} className="md:col-span-2">
                <Checkbox
                  label={f.label}
                  hint={f.hint}
                  checked={Boolean(v)}
                  onChange={(e) => set(f.name, e.target.checked)}
                  disabled={!canEdit}
                />
              </div>
            );
          }
          let input: React.ReactNode;
          if (f.type === "percent")
            input = (
              <Input
                type="number"
                step="0.01"
                min={0}
                max={100}
                value={Number(v) / 100}
                onChange={(e) => set(f.name, Math.round(Number(e.target.value) * 100))}
                disabled={!canEdit}
              />
            );
          else if (f.type === "money")
            input = (
              <Input
                type="number"
                step="0.01"
                min={0}
                value={(Number(v) / 100).toFixed(2)}
                onChange={(e) => set(f.name, Math.round(Number(e.target.value) * 100))}
                disabled={!canEdit}
              />
            );
          else if (f.type === "number")
            input = (
              <Input
                type="number"
                value={Number(v)}
                onChange={(e) => set(f.name, Math.trunc(Number(e.target.value)))}
                disabled={!canEdit}
              />
            );
          else if (f.type === "time")
            input = (
              <Input type="time" value={String(v)} onChange={(e) => set(f.name, e.target.value)} disabled={!canEdit} />
            );
          else if (f.type === "days-list")
            input = (
              <Input
                value={(v as number[]).join(", ")}
                onChange={(e) =>
                  set(
                    f.name,
                    e.target.value
                      .split(",")
                      .map((s) => Number.parseInt(s.trim(), 10))
                      .filter((n) => Number.isFinite(n) && n >= 0),
                  )
                }
                disabled={!canEdit}
              />
            );
          else if (f.type === "textarea")
            input = (
              <Textarea
                rows={3}
                value={String(v ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                disabled={!canEdit}
              />
            );
          else
            input = (
              <Input
                type={f.type}
                value={String(v ?? "")}
                onChange={(e) => set(f.name, e.target.value)}
                disabled={!canEdit}
              />
            );
          return (
            <Field
              key={f.name}
              label={f.label + (f.type === "percent" ? " (%)" : f.type === "money" ? " ($)" : "")}
              hint={f.hint}
              className={f.wide ? "md:col-span-2" : undefined}
            >
              {input}
            </Field>
          );
        })}
      </div>
      {canEdit && (
        <SaveBar
          pending={pending}
          status={status}
          onSave={() => start(async () => setStatus(await saveSettings(settingsKey, value as Settings[K])))}
        />
      )}
    </Card>
  );
}

type Tier = {
  id: string | null;
  code: string;
  name: string;
  description: string | null;
  priceCents: number;
  maxPoints: number | null;
  position: number;
  active: boolean;
};

export function DeliveryTiersEditor({ initial, canEdit }: { initial: Tier[]; canEdit: boolean }) {
  const [tiers, setTiers] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const patch = (i: number, p: Partial<Tier>) =>
    setTiers((list) => list.map((t, idx) => (idx === i ? { ...t, ...p } : t)));
  return (
    <Card title="Delivery tiers" padded={false}>
      <p className="px-5 pt-4 text-sm text-admin-muted">
        The cart suggests the smallest tier whose point limit fits the order (1 chair = 1 point; set points per
        product). Staff can always change it on the order.
      </p>
      <div className="overflow-x-auto p-5">
        <table className="w-full min-w-[720px] text-sm">
          <thead className="text-left">
            <tr>
              <th className="pb-2 font-semibold">Name</th>
              <th className="pb-2 font-semibold">Code</th>
              <th className="pb-2 font-semibold">Price ($)</th>
              <th className="pb-2 font-semibold">Max points</th>
              <th className="pb-2 font-semibold">Description</th>
              <th className="pb-2 font-semibold">Active</th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((t, i) => (
              <tr key={t.id ?? i} className="align-top">
                <td className="py-1 pr-2">
                  <Input value={t.name} onChange={(e) => patch(i, { name: e.target.value })} disabled={!canEdit} />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    value={t.code}
                    onChange={(e) => patch(i, { code: e.target.value })}
                    disabled={!canEdit}
                    className="w-24"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={(t.priceCents / 100).toFixed(2)}
                    onChange={(e) => patch(i, { priceCents: Math.round(Number(e.target.value) * 100) })}
                    disabled={!canEdit}
                    className="w-24"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Input
                    type="number"
                    value={t.maxPoints ?? ""}
                    placeholder="no limit"
                    onChange={(e) => patch(i, { maxPoints: e.target.value === "" ? null : Number(e.target.value) })}
                    disabled={!canEdit}
                    className="w-24"
                  />
                </td>
                <td className="py-1 pr-2">
                  <Textarea
                    rows={2}
                    value={t.description ?? ""}
                    onChange={(e) => patch(i, { description: e.target.value || null })}
                    disabled={!canEdit}
                  />
                </td>
                <td className="py-1 text-center">
                  <input
                    type="checkbox"
                    className="mt-3 size-4 accent-admin-blue"
                    checked={t.active}
                    onChange={(e) => patch(i, { active: e.target.checked })}
                    disabled={!canEdit}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {canEdit && (
          <>
            <Button
              variant="ghost"
              onClick={() =>
                setTiers((l) => [
                  ...l,
                  {
                    id: null,
                    code: `tier-${l.length + 1}`,
                    name: "New tier",
                    description: null,
                    priceCents: 0,
                    maxPoints: null,
                    position: l.length + 1,
                    active: true,
                  },
                ])
              }
            >
              <Plus className="size-4" /> Add tier
            </Button>
            <SaveBar
              pending={pending}
              status={status}
              onSave={() => start(async () => setStatus(await saveDeliveryTiers(tiers)))}
            />
          </>
        )}
      </div>
    </Card>
  );
}

type Tax = { id: string | null; name: string; rateBp: number; active: boolean; position: number };

export function TaxRatesEditor({ initial, canEdit, enabled }: { initial: Tax[]; canEdit: boolean; enabled: boolean }) {
  const [rates, setRates] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  return (
    <Card title="Tax rates">
      <p className="mb-4 text-sm text-admin-muted">
        {enabled
          ? "Taxes are ON: active rates are added to orders and shown on documents."
          : "Taxes are OFF in Pricing settings, so no tax is charged. Confirm GST/PST with your accountant before turning them on."}
      </p>
      <div className="space-y-2">
        {rates.map((r, i) => (
          <div key={r.id ?? i} className="flex flex-wrap items-center gap-2">
            <Input
              value={r.name}
              onChange={(e) => setRates((l) => l.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
              className="w-40"
              disabled={!canEdit}
            />
            <Input
              type="number"
              step="0.01"
              value={r.rateBp / 100}
              onChange={(e) =>
                setRates((l) =>
                  l.map((x, idx) => (idx === i ? { ...x, rateBp: Math.round(Number(e.target.value) * 100) } : x)),
                )
              }
              className="w-24"
              disabled={!canEdit}
            />
            <span className="text-sm">%</span>
            <Checkbox
              label="Active"
              checked={r.active}
              onChange={(e) => setRates((l) => l.map((x, idx) => (idx === i ? { ...x, active: e.target.checked } : x)))}
              disabled={!canEdit}
            />
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() =>
              setRates((l) => [...l, { id: null, name: "Tax", rateBp: 0, active: false, position: l.length + 1 }])
            }
          >
            <Plus className="size-4" /> Add rate
          </Button>
          <SaveBar
            pending={pending}
            status={status}
            onSave={() => start(async () => setStatus(await saveTaxRates(rates)))}
          />
        </>
      )}
    </Card>
  );
}

type Tiers = Settings["cancellation"]["tiers"];

export function CancellationEditor({ initial, canEdit }: { initial: Tiers; canEdit: boolean }) {
  const [tiers, setTiers] = useState(initial);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  return (
    <Card title="Cancellation refunds">
      <p className="mb-4 text-sm text-admin-muted">
        Refund share of what the customer paid, by how many days before the event they cancel. The non-refundable part
        of the order (Payments settings) is always kept. Staff confirm every refund. Update to match Terms &amp;
        Conditions section 13.
      </p>
      <div className="space-y-2">
        {tiers.map((t, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
            <span>From</span>
            <Input
              type="number"
              min={0}
              value={t.minDaysBefore}
              onChange={(e) =>
                setTiers((l) => l.map((x, idx) => (idx === i ? { ...x, minDaysBefore: Number(e.target.value) } : x)))
              }
              className="w-20"
              disabled={!canEdit}
            />
            <span>days before → refund</span>
            <Input
              type="number"
              min={0}
              max={100}
              value={t.refundBp / 100}
              onChange={(e) =>
                setTiers((l) =>
                  l.map((x, idx) => (idx === i ? { ...x, refundBp: Math.round(Number(e.target.value) * 100) } : x)),
                )
              }
              className="w-20"
              disabled={!canEdit}
            />
            <span>%</span>
            <Input
              value={t.label}
              onChange={(e) => setTiers((l) => l.map((x, idx) => (idx === i ? { ...x, label: e.target.value } : x)))}
              className="w-64"
              disabled={!canEdit}
            />
            {canEdit && (
              <button
                type="button"
                onClick={() => setTiers((l) => l.filter((_, idx) => idx !== i))}
                className="rounded p-2 text-red-600 hover:bg-red-50"
                aria-label="Remove tier"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </div>
        ))}
      </div>
      {canEdit && (
        <>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => setTiers((l) => [...l, { minDaysBefore: 0, refundBp: 0, label: "New tier" }])}
          >
            <Plus className="size-4" /> Add tier
          </Button>
          <SaveBar
            pending={pending}
            status={status}
            onSave={() => start(async () => setStatus(await saveSettings("cancellation", { tiers })))}
          />
        </>
      )}
    </Card>
  );
}

export function PageContentEditor({
  page,
  canEdit,
}: {
  page: {
    slug: string;
    title: string;
    bodyHtml: string;
    version: number;
    seoTitle: string | null;
    seoDescription: string | null;
  };
  canEdit: boolean;
}) {
  const [p, setP] = useState(page);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  return (
    <Card
      title={
        <span>
          {page.title} <Badge>v{page.version}</Badge>
        </span>
      }
    >
      <Field label="Title">
        <Input value={p.title} onChange={(e) => setP({ ...p, title: e.target.value })} disabled={!canEdit} />
      </Field>
      <div className="mt-4">
        <RichTextEditor value={p.bodyHtml} onChange={(html) => setP({ ...p, bodyHtml: html })} minHeight={200} />
      </div>
      {canEdit && (
        <SaveBar pending={pending} status={status} onSave={() => start(async () => setStatus(await savePage(p)))} />
      )}
    </Card>
  );
}

type Faq = { id: string | null; question: string; answerHtml: string; visible: boolean };

export function FaqEditor({ initial, canEdit }: { initial: Faq[]; canEdit: boolean }) {
  const [items, setItems] = useState(initial);
  const [removed, setRemoved] = useState<string[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [status, setStatus] = useState<Status>(null);
  const [pending, start] = useTransition();
  const move = (i: number, d: -1 | 1) =>
    setItems((l) => {
      const n = [...l];
      const j = i + d;
      if (j < 0 || j >= n.length) return l;
      [n[i], n[j]] = [n[j], n[i]];
      return n;
    });
  return (
    <Card title="FAQ (home page)">
      <ul className="space-y-2">
        {items.map((f, i) => (
          <li key={f.id ?? `new-${i}`} className="rounded-md border border-admin-line">
            <div className="flex items-center gap-2 p-2">
              <button
                type="button"
                className="flex-1 truncate px-2 text-left text-sm font-semibold"
                onClick={() => setOpen(open === i ? null : i)}
              >
                {f.question || "New question"} {!f.visible && <Badge>Hidden</Badge>}
              </button>
              {canEdit && (
                <>
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    className="rounded p-1.5 hover:bg-admin-bg"
                    aria-label="Move up"
                  >
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    className="rounded p-1.5 hover:bg-admin-bg"
                    aria-label="Move down"
                  >
                    <ArrowDown className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (f.id) setRemoved((r) => [...r, f.id!]);
                      setItems((l) => l.filter((_, idx) => idx !== i));
                    }}
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    aria-label="Delete question"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </>
              )}
            </div>
            {open === i && (
              <div className="space-y-3 border-t border-admin-line p-3">
                <Field label="Question">
                  <Input
                    value={f.question}
                    onChange={(e) =>
                      setItems((l) => l.map((x, idx) => (idx === i ? { ...x, question: e.target.value } : x)))
                    }
                    disabled={!canEdit}
                  />
                </Field>
                <RichTextEditor
                  value={f.answerHtml}
                  onChange={(html) => setItems((l) => l.map((x, idx) => (idx === i ? { ...x, answerHtml: html } : x)))}
                  minHeight={140}
                />
                <Checkbox
                  label="Visible on the website"
                  checked={f.visible}
                  onChange={(e) =>
                    setItems((l) => l.map((x, idx) => (idx === i ? { ...x, visible: e.target.checked } : x)))
                  }
                  disabled={!canEdit}
                />
              </div>
            )}
          </li>
        ))}
      </ul>
      {canEdit && (
        <>
          <Button
            variant="ghost"
            className="mt-2"
            onClick={() => {
              setItems((l) => [...l, { id: null, question: "", answerHtml: "", visible: true }]);
              setOpen(items.length);
            }}
          >
            <Plus className="size-4" /> Add question
          </Button>
          <SaveBar
            pending={pending}
            status={status}
            onSave={() =>
              start(async () => {
                const res = await saveFaq(items, removed);
                setStatus(res);
                if (res.ok) setRemoved([]);
              })
            }
          />
        </>
      )}
    </Card>
  );
}

type Staff = {
  id: string;
  name: string;
  email: string;
  role: "owner" | "staff" | "readonly";
  disabled: boolean;
  totpEnabled: boolean;
  lastLoginAt: string | null;
};

export function StaffManager({
  staff,
  currentUserId,
  canManage,
}: {
  staff: Staff[];
  currentUserId: string;
  canManage: boolean;
}) {
  const [state, action, pending] = useActionState(addStaff, { ok: false } as { ok: boolean; error?: string });
  const [busy, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <Card title="Staff & roles" padded={false}>
      <p className="px-5 pt-4 text-sm text-admin-muted">
        Owner: everything. Staff: products, orders and payments, no settings or reports. Read-only: can look, can&apos;t
        change.
      </p>
      <ul className="divide-y divide-admin-line">
        {staff.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm">
            <span className="min-w-48 flex-1">
              <strong>{s.name}</strong> <span className="text-admin-muted">{s.email}</span>
              <span className="ml-2">
                {s.totpEnabled ? <Badge tone="green">2FA</Badge> : <Badge tone="amber">No 2FA</Badge>}
              </span>
              {s.disabled && (
                <span className="ml-1">
                  <Badge tone="red">Disabled</Badge>
                </span>
              )}
            </span>
            <Select
              value={s.role}
              disabled={!canManage || s.id === currentUserId || busy}
              onChange={(e) =>
                start(async () => {
                  const r = await updateStaff(s.id, { role: e.target.value as Staff["role"] });
                  setError(r.error ?? null);
                })
              }
              className="w-32"
              aria-label={`Role of ${s.name}`}
            >
              <option value="owner">Owner</option>
              <option value="staff">Staff</option>
              <option value="readonly">Read-only</option>
            </Select>
            {canManage && s.id !== currentUserId && (
              <Button
                onClick={() =>
                  start(async () => {
                    const r = await updateStaff(s.id, { disabled: !s.disabled });
                    setError(r.error ?? null);
                  })
                }
                disabled={busy}
              >
                {s.disabled ? "Enable" : "Disable"}
              </Button>
            )}
          </li>
        ))}
      </ul>
      {error && <p className="px-5 pb-2 text-sm text-red-600">{error}</p>}
      {canManage && (
        <form action={action} className="grid gap-3 border-t border-admin-line p-5 md:grid-cols-5">
          <Input name="name" placeholder="Name" required />
          <Input name="email" type="email" placeholder="Email" required />
          <Select name="role" defaultValue="staff">
            <option value="staff">Staff</option>
            <option value="readonly">Read-only</option>
            <option value="owner">Owner</option>
          </Select>
          <Input
            name="password"
            type="text"
            placeholder="Temporary password (12+)"
            required
            autoComplete="new-password"
          />
          <Button type="submit" variant="primary" disabled={pending}>
            <Plus className="size-4" /> Add staff
          </Button>
          {state.error && <p className="text-sm text-red-600 md:col-span-5">{state.error}</p>}
          {state.ok && (
            <p className="text-sm text-green-700 md:col-span-5">
              Account created. Share the temporary password privately; they should change it and turn on 2FA.
            </p>
          )}
        </form>
      )}
    </Card>
  );
}
