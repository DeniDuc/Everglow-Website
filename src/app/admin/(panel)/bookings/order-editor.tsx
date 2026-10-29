"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { AlertTriangle, Loader2, Pencil, Plus, Search, Trash2, Truck, UserPlus, X } from "lucide-react";
import { Badge, Button, Card, Checkbox, Field, Input, inputClass, Select, Textarea } from "@/components/admin/ui";
import { cn } from "@/lib/cn";
import { formatLocal, money } from "@/lib/format";
import type { MessageKey } from "@/lib/i18n/admin";
import type { NewCustomerInput, OrderDraft, OrderLineInput } from "@/lib/orders/schema";
import { createOrder, previewOrder, updateOrder, type Preview, type Shortage } from "./actions";

export type PickerItem = {
  variantId: string;
  title: string;
  productName: string;
  service: boolean;
  tracked: boolean;
  hidden: boolean;
  basePriceCents: number;
  priceLabel: string;
};
export type CustomerOption = { id: string; name: string; email: string; phone: string; address: string };

type Line = OrderLineInput & { uid: string };

const emptyCustomer: NewCustomerInput = {
  name: "",
  email: "",
  phone: "",
  company: "",
  address: "",
  notes: "",
  source: "phone",
};
const toCents = (v: string) => Math.round(Number.parseFloat(v.replace(/[$,\s]/g, "") || "0") * 100);
const toDollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));
let uidSeq = 0;
const uid = () => `l${++uidSeq}`;

export function OrderEditor({
  mode,
  orderId,
  initial,
  catalog,
  tiers,
  customers,
  paidCents = 0,
  labels,
  aside,
}: {
  mode: "new" | "edit";
  orderId: string | null;
  initial: OrderDraft;
  catalog: PickerItem[];
  tiers: { id: string; name: string; priceCents: number }[];
  customers: CustomerOption[];
  paidCents?: number;
  labels: Record<MessageKey, string>;
  aside?: React.ReactNode;
}) {
  const t = (k: MessageKey) => labels[k] ?? k;
  const router = useRouter();
  // Lines live in their own state (with stable keys); `draft.lines` is never read.
  const [draft, setDraft] = useState<OrderDraft>(initial);
  const [lines, setLines] = useState<Line[]>(() => initial.lines.map((l) => ({ ...l, uid: uid() })));
  const [newCustomer, setNewCustomer] = useState<NewCustomerInput | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [shortages, setShortages] = useState<Shortage[]>([]);
  const [allowOverbook, setAllowOverbook] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saving, startSaving] = useTransition();
  const requestId = useRef(0);

  const fullDraft: OrderDraft = useMemo(
    () => ({
      ...draft,
      lines: lines.map((l) => ({
        kind: l.kind,
        variantId: l.variantId,
        title: l.title,
        quantity: l.quantity,
        unitCents: l.unitCents,
        overrideReason: l.overrideReason,
      })),
    }),
    [draft, lines],
  );
  const byVariant = useMemo(() => new Map(catalog.map((c) => [c.variantId, c])), [catalog]);

  // Live price and availability: debounced server preview of the current draft.
  useEffect(() => {
    const id = ++requestId.current;
    const timer = setTimeout(async () => {
      setPreviewing(true);
      const res = await previewOrder(fullDraft, orderId).catch(() => null);
      if (id !== requestId.current) return;
      setPreviewing(false);
      if (res?.ok) {
        setPreview(res.preview);
        setError(null);
      } else if (res) setError(res.error);
    }, 300);
    return () => clearTimeout(timer);
  }, [fullDraft, orderId]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const touch = () => {
    setDirty(true);
    setSaved(false);
    setShortages([]);
  };
  const set = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft((d) => ({ ...d, [key]: value }));
    touch();
  };
  const setLine = (id: string, patch: Partial<Line>) => {
    setLines((ls) => ls.map((l) => (l.uid === id ? { ...l, ...patch } : l)));
    touch();
  };
  const addProduct = (item: PickerItem) => {
    setLines((ls) => {
      const same = ls.find((l) => l.variantId === item.variantId && l.unitCents == null);
      if (same) return ls.map((l) => (l === same ? { ...l, quantity: l.quantity + 1 } : l));
      return [
        ...ls,
        {
          uid: uid(),
          kind: item.service ? "service" : "product",
          variantId: item.variantId,
          title: item.title,
          quantity: 1,
          unitCents: null,
          overrideReason: "",
        },
      ];
    });
    touch();
  };
  const addCustom = () => {
    setLines((ls) => [
      ...ls,
      { uid: uid(), kind: "custom", variantId: null, title: "", quantity: 1, unitCents: 0, overrideReason: "" },
    ]);
    touch();
  };

  const customer = customers.find((c) => c.id === draft.customerId) ?? null;
  const pickCustomer = (c: CustomerOption) => {
    setNewCustomer(null);
    setDraft((d) => ({
      ...d,
      customerId: c.id,
      deliveryAddress: d.deliveryAddress || c.address,
    }));
    touch();
  };

  function submit(status?: "draft" | "reserved") {
    setError(null);
    startSaving(async () => {
      const res =
        mode === "new"
          ? await createOrder({ draft: fullDraft, status: status ?? "draft", allowOverbook, newCustomer })
          : await updateOrder({ orderId: orderId!, draft: fullDraft, allowOverbook });
      if (!res.ok) {
        setError(res.error);
        setShortages(res.shortages ?? []);
        return;
      }
      setDirty(false);
      setAllowOverbook(false);
      if (mode === "new" && "id" in res) router.push(`/admin/bookings/${res.id}`);
      else setSaved(true);
    });
  }

  const q = preview?.quote;
  const lineTotals = new Map(q?.lines.map((l) => [Number(l.key), l]) ?? []);
  const shortageIds = new Set([...(preview?.shortages ?? []), ...shortages].map((s) => s.variantId));
  const remaining = q ? q.totalCents - paidCents : 0;

  return (
    <div className="grid gap-5 p-4 pb-0 md:p-6 md:pb-0 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Card title={t("order.period")}>
          <div className="grid gap-4 sm:grid-cols-2">
            <fieldset className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
              <legend className="mb-1.5 text-sm font-semibold">{t("order.pickup")}</legend>
              <Input
                type="date"
                aria-label={`${t("order.pickup")} date`}
                value={draft.startDate}
                onChange={(e) => {
                  const startDate = e.target.value;
                  setDraft((d) => ({ ...d, startDate, endDate: d.endDate < startDate ? startDate : d.endDate }));
                  touch();
                }}
              />
              <Input
                type="time"
                step={900}
                aria-label={`${t("order.pickup")} time`}
                value={draft.startTime}
                onChange={(e) => set("startTime", e.target.value)}
              />
            </fieldset>
            <fieldset className="grid grid-cols-[minmax(0,1fr)_8.5rem] gap-2">
              <legend className="mb-1.5 text-sm font-semibold">{t("order.return")}</legend>
              <Input
                type="date"
                aria-label={`${t("order.return")} date`}
                value={draft.endDate}
                min={draft.startDate}
                onChange={(e) => set("endDate", e.target.value)}
              />
              <Input
                type="time"
                step={900}
                aria-label={`${t("order.return")} time`}
                value={draft.endTime}
                onChange={(e) => set("endTime", e.target.value)}
              />
            </fieldset>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-admin-muted">
            {q && (
              <span>
                {t("order.daysCharged")}: <strong className="text-admin-text">{q.days}</strong>
              </span>
            )}
            {preview?.periodWarnings.map((w) => (
              <Badge key={w} tone="amber">
                {t(`period.${w}` as MessageKey)}
              </Badge>
            ))}
          </div>
        </Card>

        <Card title={t("order.items")} padded={false}>
          <div className="border-b border-admin-line p-4">
            <ProductSearch
              catalog={catalog}
              available={preview?.available ?? {}}
              onPick={addProduct}
              labels={{
                placeholder: t("order.addProduct"),
                available: t("order.available"),
                notTracked: t("order.notTracked"),
                hidden: t("order.hidden"),
              }}
            />
          </div>
          {lines.length === 0 ? (
            <p className="px-5 py-10 text-center text-sm text-admin-muted">{t("order.noItems")}</p>
          ) : (
            <ul className="divide-y divide-admin-line">
              {lines.map((l, i) => {
                const item = l.variantId ? byVariant.get(l.variantId) : undefined;
                const priced = lineTotals.get(i);
                const avail = l.variantId ? preview?.available[l.variantId] : undefined;
                const short = l.variantId != null && shortageIds.has(l.variantId);
                return (
                  <OrderLineRow
                    key={l.uid}
                    line={l}
                    item={item}
                    unitCents={priced?.unitCents}
                    totalCents={priced?.totalCents}
                    available={avail}
                    short={short}
                    onChange={(patch) => setLine(l.uid, patch)}
                    onRemove={() => {
                      setLines((ls) => ls.filter((x) => x.uid !== l.uid));
                      touch();
                    }}
                    t={t}
                  />
                );
              })}
            </ul>
          )}
          <div className="border-t border-admin-line px-4 py-3">
            <Button type="button" variant="ghost" onClick={addCustom}>
              <Plus className="size-4" /> {t("order.addCustom")}
            </Button>
          </div>
        </Card>

        <Card title={t("order.fulfillment")}>
          <div className="flex flex-wrap gap-2" role="radiogroup" aria-label={t("order.fulfillment")}>
            {(["pickup", "delivery"] as const).map((f) => (
              <button
                key={f}
                type="button"
                role="radio"
                aria-checked={draft.fulfillment === f}
                onClick={() => set("fulfillment", f)}
                className={cn(
                  "inline-flex h-10 items-center gap-2 rounded-md border px-4 text-sm font-semibold",
                  draft.fulfillment === f
                    ? "border-admin-blue bg-admin-blue-soft text-admin-blue"
                    : "border-admin-line bg-white text-admin-text hover:bg-admin-bg",
                )}
              >
                {f === "delivery" && <Truck className="size-4" />}
                {f === "pickup" ? t("order.customerPickup") : t("order.delivery")}
              </button>
            ))}
          </div>
          {preview?.requiresDelivery && draft.fulfillment === "pickup" && (
            <p className="mt-3 flex items-center gap-2 text-sm text-amber-800">
              <AlertTriangle className="size-4 shrink-0" /> {t("order.requiresDelivery")}
            </p>
          )}
          {draft.fulfillment === "delivery" && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label={t("order.tier")}>
                <Select
                  value={draft.deliveryTierId ?? ""}
                  onChange={(e) => set("deliveryTierId", e.target.value || null)}
                >
                  <option value="">
                    {t("order.tierAuto")}
                    {preview?.suggestedTierId
                      ? `: ${tiers.find((x) => x.id === preview.suggestedTierId)?.name ?? ""}`
                      : ""}
                  </option>
                  {tiers.map((tier) => (
                    <option key={tier.id} value={tier.id}>
                      {tier.name} · {money(tier.priceCents)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t("order.km")}>
                <Input
                  type="number"
                  min={0}
                  max={2000}
                  inputMode="numeric"
                  value={draft.outOfTownKm}
                  onChange={(e) => set("outOfTownKm", Math.max(0, Math.trunc(Number(e.target.value) || 0)))}
                />
              </Field>
              <Field label={t("order.address")} className="sm:col-span-2">
                <Textarea
                  rows={2}
                  className="min-h-0"
                  value={draft.deliveryAddress}
                  onChange={(e) => set("deliveryAddress", e.target.value)}
                />
              </Field>
              <Field label={t("order.deliveryNotes")} className="sm:col-span-2">
                <Textarea
                  rows={2}
                  className="min-h-0"
                  value={draft.deliveryNotes}
                  onChange={(e) => set("deliveryNotes", e.target.value)}
                />
              </Field>
            </div>
          )}
        </Card>
      </div>

      <div className="min-w-0 space-y-5">
        <Card title={t("order.customer")}>
          {customer && !newCustomer ? (
            <div className="space-y-1 text-sm">
              <p className="text-base font-semibold">{customer.name}</p>
              {customer.email && <p>{customer.email}</p>}
              {customer.phone && <p>{customer.phone}</p>}
              {customer.address && <p className="text-admin-muted">{customer.address}</p>}
              <div className="flex gap-2 pt-2">
                <a href={`/admin/clients/${customer.id}`} className="text-admin-blue hover:underline">
                  {t("clients.details")}
                </a>
                <button
                  type="button"
                  className="ml-auto text-admin-blue hover:underline"
                  onClick={() => set("customerId", null)}
                >
                  {t("order.change")}
                </button>
              </div>
            </div>
          ) : newCustomer ? (
            <NewCustomerForm
              value={newCustomer}
              onChange={(v) => {
                setNewCustomer(v);
                touch();
              }}
              onCancel={() => setNewCustomer(null)}
              t={t}
            />
          ) : (
            <div className="space-y-3">
              <CustomerSearch customers={customers} onPick={pickCustomer} placeholder={t("order.findCustomer")} />
              {mode === "new" && (
                <Button type="button" variant="ghost" onClick={() => setNewCustomer({ ...emptyCustomer })}>
                  <UserPlus className="size-4" /> {t("order.newCustomer")}
                </Button>
              )}
              {mode === "edit" && <p className="text-sm text-admin-muted">{t("order.noCustomer")}</p>}
            </div>
          )}
        </Card>

        <Card
          title={t("order.summary")}
          actions={
            previewing ? (
              <Loader2 className="size-4 animate-spin text-admin-muted" aria-label={t("order.calculating")} />
            ) : null
          }
        >
          <dl className="space-y-2 text-sm">
            <Row label={t("order.subtotal")} value={q && money(q.subtotalCents)} />
            <div className="flex items-center justify-between gap-3">
              <dt>
                <label htmlFor="discount">{t("order.discount")}</label>
              </dt>
              <dd className="flex items-center gap-2">
                {q && q.discountCents > 0 && <span className="text-admin-muted">−{money(q.discountCents)}</span>}
                <input
                  id="discount"
                  type="number"
                  min={0}
                  max={100}
                  step={1}
                  className={cn(inputClass, "h-8 w-20 text-right")}
                  value={draft.discountBp / 100}
                  onChange={(e) =>
                    set("discountBp", Math.min(10000, Math.max(0, Math.round(Number(e.target.value || 0) * 100))))
                  }
                />
              </dd>
            </div>
            <div className="flex items-center justify-between gap-3">
              <dt>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    className="size-4 accent-admin-blue"
                    checked={draft.damageProtection}
                    onChange={(e) => set("damageProtection", e.target.checked)}
                  />
                  {t("order.damageProtection")}
                </label>
              </dt>
              <dd>{q && money(q.damageProtectionCents)}</dd>
            </div>
            {draft.fulfillment === "delivery" && (
              <Row
                label={`${t("order.deliveryCost")}${preview?.tier ? ` · ${preview.tier.name}` : ""}`}
                value={q && money(q.deliveryCents)}
              />
            )}
            {q?.taxes.map((tax) => (
              <Row key={tax.name} label={tax.name} value={money(tax.cents)} />
            ))}
            <div className="flex items-center justify-between border-t border-admin-line pt-3 text-base font-semibold">
              <dt>{t("order.grandTotal")}</dt>
              <dd>{q ? money(q.totalCents) : "—"}</dd>
            </div>
            {q && (
              <>
                <Row label={t("order.deposit")} value={money(q.depositCents)} />
                {q.rush && <p className="text-xs font-semibold text-amber-800">{t("order.rush")}</p>}
                {q.balanceCents > 0 && (
                  <Row
                    label={`${t("order.balance")}${q.balanceDueAt ? ` · ${t("order.balanceDue")} ${formatLocal(q.balanceDueAt, "MMM d")}` : ""}`}
                    value={money(q.balanceCents)}
                  />
                )}
                {mode === "edit" && (
                  <>
                    <Row label={t("order.paid")} value={money(paidCents)} />
                    <div className="flex items-center justify-between font-semibold">
                      <dt>{t("order.remaining")}</dt>
                      <dd className={remaining > 0 ? "text-red-600" : "text-admin-green"}>{money(remaining)}</dd>
                    </div>
                  </>
                )}
              </>
            )}
          </dl>
        </Card>

        <Card title={t("order.notes")}>
          <Textarea
            aria-label={t("order.notes")}
            value={draft.internalNotes}
            onChange={(e) => set("internalNotes", e.target.value)}
          />
          <p className="mt-1 text-xs text-admin-muted">{t("order.notesHint")}</p>
        </Card>
        {aside}
      </div>

      <div
        className={cn(
          "sticky bottom-0 z-30 -mx-4 border-t border-admin-line bg-white/95 backdrop-blur md:-mx-6 lg:col-span-2",
          mode === "edit" && !dirty && !error && !saved && "hidden",
        )}
      >
        <div className="flex flex-wrap items-center gap-3 py-3 pr-4 pl-20 md:pr-6 lg:pl-6">
          <div className="min-w-0 flex-1 text-sm" aria-live="polite">
            {error ? (
              <div className="space-y-1 text-red-700">
                <p className="flex items-center gap-2 font-semibold">
                  <AlertTriangle className="size-4 shrink-0" /> {error}
                </p>
                {shortages.length > 0 && (
                  <>
                    <ul className="text-xs">
                      {shortages.map((s) => (
                        <li key={s.variantId}>
                          {byVariant.get(s.variantId)?.title ?? s.variantId}: {s.requested} / {s.available}{" "}
                          {t("order.available")}
                        </li>
                      ))}
                    </ul>
                    <Checkbox
                      label={t("order.allowOverbook")}
                      checked={allowOverbook}
                      onChange={(e) => setAllowOverbook(e.target.checked)}
                    />
                  </>
                )}
              </div>
            ) : saved ? (
              <span className="font-semibold text-admin-green">{t("order.saved")}</span>
            ) : dirty ? (
              <span className="text-admin-muted">{t("order.unsaved")}</span>
            ) : null}
          </div>
          {mode === "new" ? (
            <>
              <Button type="button" disabled={saving} onClick={() => submit("draft")}>
                {t("order.saveDraft")}
              </Button>
              <Button type="button" variant="primary" disabled={saving} onClick={() => submit("reserved")}>
                {saving && <Loader2 className="size-4 animate-spin" />} {t("order.reserve")}
              </Button>
            </>
          ) : (
            <Button type="button" variant="primary" disabled={saving || !dirty} onClick={() => submit()}>
              {saving && <Loader2 className="size-4 animate-spin" />} {saving ? t("order.saving") : t("order.save")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <dt>{label}</dt>
      <dd>{value ?? "—"}</dd>
    </div>
  );
}

function OrderLineRow({
  line,
  item,
  unitCents,
  totalCents,
  available,
  short,
  onChange,
  onRemove,
  t,
}: {
  line: Line;
  item: PickerItem | undefined;
  unitCents: number | undefined;
  totalCents: number | undefined;
  available: number | null | undefined;
  short: boolean;
  onChange: (patch: Partial<Line>) => void;
  onRemove: () => void;
  t: (k: MessageKey) => string;
}) {
  const custom = line.kind === "custom";
  const [editingPrice, setEditingPrice] = useState(!custom && line.unitCents != null);
  const [priceText, setPriceText] = useState(toDollars(line.unitCents));
  return (
    <li
      className={cn(
        "grid gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_5.5rem_8rem_6.5rem_2.5rem]",
        short && "bg-red-50/60",
      )}
    >
      <div className="min-w-0">
        {custom ? (
          <Input
            aria-label={t("order.customTitle")}
            placeholder={t("order.customTitle")}
            value={line.title}
            onChange={(e) => onChange({ title: e.target.value })}
          />
        ) : (
          <>
            <p className="truncate font-semibold">{line.title}</p>
            <p className="flex flex-wrap items-center gap-2 text-xs text-admin-muted">
              {item?.priceLabel}
              {available === null ? (
                <span>{t("order.notTracked")}</span>
              ) : available !== undefined ? (
                <span className={short ? "font-semibold text-red-700" : undefined}>
                  {available} {t("order.available")}
                </span>
              ) : null}
              {short && <Badge tone="red">{t("order.shortage")}</Badge>}
              {item?.hidden && <Badge>{t("order.hidden")}</Badge>}
            </p>
          </>
        )}
      </div>
      <Input
        type="number"
        min={1}
        aria-label={t("order.qty")}
        value={line.quantity}
        onChange={(e) => onChange({ quantity: Math.max(1, Math.trunc(Number(e.target.value) || 1)) })}
      />
      <div>
        {custom || editingPrice ? (
          <div className="flex items-center gap-1">
            <Input
              inputMode="decimal"
              aria-label={t("order.unitPrice")}
              value={priceText}
              onChange={(e) => {
                setPriceText(e.target.value);
                onChange({ unitCents: toCents(e.target.value) });
              }}
            />
            {!custom && (
              <button
                type="button"
                title={t("order.catalogPrice")}
                aria-label={t("order.catalogPrice")}
                className="rounded p-1 text-admin-muted hover:bg-admin-bg"
                onClick={() => {
                  setEditingPrice(false);
                  onChange({ unitCents: null, overrideReason: "" });
                }}
              >
                <X className="size-4" />
              </button>
            )}
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm hover:bg-admin-bg"
            title={t("order.overridePrice")}
            onClick={() => {
              setEditingPrice(true);
              setPriceText(toDollars(unitCents ?? 0));
              onChange({ unitCents: unitCents ?? 0 });
            }}
          >
            {unitCents != null ? money(unitCents) : "—"} <Pencil className="size-3.5 text-admin-muted" />
          </button>
        )}
      </div>
      <p className="self-center text-right font-semibold">{totalCents != null ? money(totalCents) : "—"}</p>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`${t("order.remove")} ${line.title}`}
        className="justify-self-end rounded p-2 text-admin-muted hover:bg-red-50 hover:text-red-600"
      >
        <Trash2 className="size-4" />
      </button>
      {!custom && editingPrice && (
        <Input
          className="sm:col-span-5"
          placeholder={t("order.overrideReason")}
          aria-label={t("order.overrideReason")}
          value={line.overrideReason}
          onChange={(e) => onChange({ overrideReason: e.target.value })}
        />
      )}
    </li>
  );
}

function ProductSearch({
  catalog,
  available,
  onPick,
  labels,
}: {
  catalog: PickerItem[];
  available: Record<string, number | null>;
  onPick: (item: PickerItem) => void;
  labels: { placeholder: string; available: string; notTracked: string; hidden: string };
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const matches = useMemo(() => {
    const words = q.toLowerCase().split(/\s+/).filter(Boolean);
    return catalog
      .filter((c) => words.every((w) => `${c.title} ${c.productName}`.toLowerCase().includes(w)))
      .slice(0, 10);
  }, [catalog, q]);
  const pick = (item: PickerItem) => {
    onPick(item);
    setQ("");
    setActive(0);
  };
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-admin-muted" />
      <input
        role="combobox"
        aria-expanded={open}
        aria-controls="product-search-list"
        aria-label={labels.placeholder}
        placeholder={labels.placeholder}
        className={cn(inputClass, "pl-9")}
        value={q}
        onChange={(e) => {
          setQ(e.target.value);
          setOpen(true);
          setActive(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") setActive((a) => Math.min(a + 1, matches.length - 1));
          else if (e.key === "ArrowUp") setActive((a) => Math.max(a - 1, 0));
          else if (e.key === "Enter" && matches[active]) {
            e.preventDefault();
            pick(matches[active]);
          } else if (e.key === "Escape") setOpen(false);
          else return;
          e.preventDefault();
        }}
      />
      {open && matches.length > 0 && (
        <ul
          id="product-search-list"
          role="listbox"
          className="absolute z-20 mt-1 max-h-80 w-full overflow-auto rounded-md border border-admin-line bg-white py-1 shadow-lg"
        >
          {matches.map((m, i) => {
            const n = available[m.variantId];
            return (
              <li
                key={m.variantId}
                role="option"
                aria-selected={i === active}
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(m);
                }}
                onMouseEnter={() => setActive(i)}
                className={cn(
                  "flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm",
                  i === active && "bg-admin-blue-soft",
                )}
              >
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{m.title}</span>
                  <span className="text-xs text-admin-muted">
                    {money(m.basePriceCents)} {m.priceLabel}
                    {m.hidden && ` · ${labels.hidden}`}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-xs font-semibold",
                    n === 0 ? "text-red-600" : n == null ? "text-admin-muted" : "text-admin-green",
                  )}
                >
                  {n == null ? labels.notTracked : `${n} ${labels.available}`}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function CustomerSearch({
  customers,
  onPick,
  placeholder,
}: {
  customers: CustomerOption[];
  onPick: (c: CustomerOption) => void;
  placeholder: string;
}) {
  const [q, setQ] = useState("");
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const digits = q.replace(/\D/g, "");
  const matches =
    words.length === 0
      ? []
      : customers
          .filter((c) => {
            const hay = `${c.name} ${c.email}`.toLowerCase();
            return (
              words.every((w) => hay.includes(w)) || (digits.length >= 3 && c.phone.replace(/\D/g, "").includes(digits))
            );
          })
          .slice(0, 8);
  return (
    <div>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label={placeholder} />
      {matches.length > 0 && (
        <ul className="mt-1 divide-y divide-admin-line rounded-md border border-admin-line">
          {matches.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                className="block w-full px-3 py-2 text-left text-sm hover:bg-admin-blue-soft"
                onClick={() => onPick(c)}
              >
                <span className="font-semibold">{c.name}</span>
                <span className="block text-xs text-admin-muted">{[c.email, c.phone].filter(Boolean).join(" · ")}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function NewCustomerForm({
  value,
  onChange,
  onCancel,
  t,
}: {
  value: NewCustomerInput;
  onChange: (v: NewCustomerInput) => void;
  onCancel: () => void;
  t: (k: MessageKey) => string;
}) {
  const set = (k: keyof NewCustomerInput, v: string) => onChange({ ...value, [k]: v });
  return (
    <div className="space-y-3">
      <Field label={t("common.name")}>
        <Input value={value.name} onChange={(e) => set("name", e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t("common.email")}>
        <Input type="email" value={value.email} onChange={(e) => set("email", e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t("common.phone")}>
        <Input type="tel" value={value.phone} onChange={(e) => set("phone", e.target.value)} autoComplete="off" />
      </Field>
      <Field label={t("clients.address")}>
        <Textarea rows={2} className="min-h-0" value={value.address} onChange={(e) => set("address", e.target.value)} />
      </Field>
      <Field label={t("clients.source")}>
        <Select value={value.source} onChange={(e) => set("source", e.target.value)}>
          {(["phone", "facebook_marketplace", "website", "referral", "walk_in", "other"] as const).map((s) => (
            <option key={s} value={s}>
              {t(`source.${s}` as MessageKey)}
            </option>
          ))}
        </Select>
      </Field>
      <Button type="button" variant="ghost" onClick={onCancel}>
        {t("common.cancel")}
      </Button>
    </div>
  );
}
