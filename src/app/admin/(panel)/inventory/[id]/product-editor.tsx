"use client";

import Image from "next/image";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, CheckCircle2, ExternalLink, Loader2, Plus, Trash2, Upload, X } from "lucide-react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import {
  Badge,
  Button,
  buttonClass,
  Card,
  Checkbox,
  Field,
  Input,
  inputClass,
  Select,
  Textarea,
} from "@/components/admin/ui";
import type { MessageKey } from "@/lib/i18n/admin";
import { formatLocal } from "@/lib/format";
import { addDowntime, archiveProduct, deletePhoto, removeDowntime, saveProduct, uploadPhotos } from "../actions";
import type { ProductInput } from "../schema";

type Photo = { id: string; src: string; alt: string | null };
type Downtime = {
  id: string;
  variantId: string;
  quantity: number;
  startsAt: string;
  endsAt: string;
  reason: string | null;
};

const cents = (dollars: string) => Math.round(Number.parseFloat(dollars || "0") * 100);
const dollars = (c: number | null) => (c == null ? "" : (c / 100).toFixed(2));

export function ProductEditor({
  initial,
  photos: initialPhotos,
  collections,
  tiers,
  downtimes: initialDowntimes,
  labels,
  canEdit,
}: {
  initial: ProductInput & { stockToConfirm: boolean };
  photos: Photo[];
  collections: { id: string; name: string; parentName: string | null }[];
  tiers: { code: string; name: string }[];
  downtimes: Downtime[];
  labels: Record<MessageKey, string>;
  canEdit: boolean;
}) {
  const t = (k: MessageKey) => labels[k];
  const [p, setP] = useState<ProductInput>(initial);
  const [photos, setPhotos] = useState(initialPhotos);
  const [downtimeList, setDowntimeList] = useState(initialDowntimes);
  const [status, setStatus] = useState<{ kind: "idle" | "saved" | "error"; text?: string }>({ kind: "idle" });
  const [dirty, setDirty] = useState(false);
  const [pending, start] = useTransition();
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const set = <K extends keyof ProductInput>(key: K, value: ProductInput[K]) => {
    setP((prev) => ({ ...prev, [key]: value }));
    setDirty(true);
  };
  const setVariant = (i: number, patch: Partial<ProductInput["variants"][number]>) => {
    set(
      "variants",
      p.variants.map((v, idx) => (idx === i ? { ...v, ...patch } : v)),
    );
  };

  function save() {
    start(async () => {
      const res = await saveProduct({ ...p, photoOrder: photos.map((ph) => ph.id) });
      if (res.ok) {
        setStatus({ kind: "saved" });
        setDirty(false);
        setP((prev) => ({ ...prev, stockConfirmed: false }));
      } else setStatus({ kind: "error", text: res.error });
    });
  }

  async function onUpload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    const res = await uploadPhotos(p.id, fd);
    setUploading(false);
    if (res.ok && res.photos) setPhotos((prev) => [...prev, ...res.photos!]);
    else setStatus({ kind: "error", text: res.error });
    if (fileRef.current) fileRef.current.value = "";
  }

  function movePhoto(i: number, dir: -1 | 1) {
    const next = [...photos];
    const j = i + dir;
    if (j < 0 || j >= next.length) return;
    [next[i], next[j]] = [next[j], next[i]];
    setPhotos(next);
    setDirty(true);
  }

  const [dt, setDt] = useState({
    variantId: p.variants[0]?.id ?? "",
    quantity: 1,
    startsAt: "",
    endsAt: "",
    reason: "",
  });

  return (
    <div className="grid gap-5 p-4 pb-28 md:p-6 xl:grid-cols-[1fr_340px]">
      <div className="space-y-5">
        <Card title={t("prod.general")}>
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t("common.name")} className="md:col-span-2">
              <Input value={p.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} />
            </Field>
            <Field label={t("prod.slug")} hint={`everglowet.com/products/${p.slug}`}>
              <Input
                value={p.slug}
                onChange={(e) => set("slug", e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-"))}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Type">
              <Select
                value={p.productType}
                onChange={(e) => set("productType", e.target.value as ProductInput["productType"])}
                disabled={!canEdit}
              >
                <option value="rental">{t("inv.rental")}</option>
                <option value="service">{t("inv.service")}</option>
              </Select>
            </Field>
          </div>
          <div className="mt-4">
            <span className="mb-1.5 block text-sm font-semibold">{t("prod.description")}</span>
            <RichTextEditor value={p.descriptionHtml} onChange={(html) => set("descriptionHtml", html)} />
          </div>
        </Card>

        <Card
          title={t("prod.photos")}
          actions={
            canEdit && (
              <label className={buttonClass("secondary") + " cursor-pointer"}>
                {uploading ? <Loader2 className="size-4 animate-spin" /> : <Upload className="size-4" />}{" "}
                {t("prod.uploadPhotos")}
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => onUpload(e.target.files)}
                />
              </label>
            )
          }
        >
          <p className="mb-3 text-xs text-admin-muted">{t("prod.dragHint")}</p>
          {photos.length === 0 ? (
            <p className="text-sm text-admin-muted">—</p>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {photos.map((ph, i) => (
                <li key={ph.id} className="group relative overflow-hidden rounded-md border border-admin-line bg-white">
                  <div className="relative aspect-square">
                    <Image src={ph.src} alt={ph.alt ?? ""} fill sizes="200px" className="object-contain p-2" />
                  </div>
                  {i === 0 && (
                    <span className="absolute left-2 top-2">
                      <Badge tone="blue">Main</Badge>
                    </span>
                  )}
                  {canEdit && (
                    <div className="flex justify-between border-t border-admin-line p-1">
                      <div className="flex">
                        <button
                          type="button"
                          onClick={() => movePhoto(i, -1)}
                          className="rounded p-1.5 hover:bg-admin-bg disabled:opacity-30"
                          disabled={i === 0}
                          aria-label="Move left"
                        >
                          <ArrowUp className="size-4 -rotate-90" />
                        </button>
                        <button
                          type="button"
                          onClick={() => movePhoto(i, 1)}
                          className="rounded p-1.5 hover:bg-admin-bg disabled:opacity-30"
                          disabled={i === photos.length - 1}
                          aria-label="Move right"
                        >
                          <ArrowDown className="size-4 -rotate-90" />
                        </button>
                      </div>
                      <button
                        type="button"
                        aria-label="Delete photo"
                        className="rounded p-1.5 text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm("Delete this photo?")) return;
                          await deletePhoto(ph.id);
                          setPhotos((prev) => prev.filter((x) => x.id !== ph.id));
                        }}
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card title={t("prod.pricing")}>
          <div className="grid gap-4 md:grid-cols-3">
            <Field label={t("prod.priceType")}>
              <Select
                value={p.priceType}
                onChange={(e) => set("priceType", e.target.value as ProductInput["priceType"])}
                disabled={!canEdit}
              >
                <option value="structure">{t("prod.structure")}</option>
                <option value="daily">{t("prod.daily")}</option>
                <option value="fixed">{t("prod.fixed")}</option>
                <option value="free">{t("prod.free")}</option>
              </Select>
            </Field>
            {p.priceType === "structure" && (
              <>
                <Field label={t("prod.periodDays")}>
                  <Input
                    type="number"
                    min={1}
                    value={p.periodDays}
                    onChange={(e) => set("periodDays", Number(e.target.value) || 1)}
                    disabled={!canEdit}
                  />
                </Field>
                <Field label={t("prod.extraDay")}>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    value={dollars(p.extraDayPriceCents)}
                    onChange={(e) => set("extraDayPriceCents", e.target.value === "" ? null : cents(e.target.value))}
                    disabled={!canEdit}
                  />
                </Field>
              </>
            )}
          </div>
        </Card>

        <Card title={t("prod.variants")} padded={false}>
          {p.trackingType === "trackable" && (
            <p className="border-b border-admin-line px-5 py-3 text-xs text-admin-muted">
              Trackable product: stock is counted from individual units.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="border-b border-admin-line text-left">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">{t("prod.variantName")}</th>
                  <th className="px-4 py-2.5 font-semibold">SKU</th>
                  <th className="px-4 py-2.5 font-semibold">{t("prod.price")} ($)</th>
                  <th className="px-4 py-2.5 font-semibold">{t("prod.stockQty")}</th>
                  <th />
                </tr>
              </thead>
              <tbody className="divide-y divide-admin-line">
                {p.variants.map((v, i) => (
                  <tr key={v.id ?? `new-${i}`}>
                    <td className="px-4 py-2">
                      <Input
                        value={v.name}
                        onChange={(e) =>
                          setVariant(i, {
                            name: e.target.value,
                            options: p.variants.length > 1 ? [e.target.value.split(" - ").pop() ?? e.target.value] : [],
                          })
                        }
                        disabled={!canEdit}
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        value={v.sku ?? ""}
                        onChange={(e) => setVariant(i, { sku: e.target.value })}
                        disabled={!canEdit}
                        className="w-32"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        step="0.01"
                        min={0}
                        value={dollars(v.basePriceCents)}
                        onChange={(e) => setVariant(i, { basePriceCents: cents(e.target.value) })}
                        disabled={!canEdit}
                        className="w-28"
                      />
                    </td>
                    <td className="px-4 py-2">
                      <Input
                        type="number"
                        min={0}
                        value={v.stockQuantity}
                        onChange={(e) => setVariant(i, { stockQuantity: Math.max(0, Number(e.target.value) || 0) })}
                        disabled={!canEdit || p.trackingType === "trackable"}
                        className="w-24"
                      />
                    </td>
                    <td className="px-2 py-2 text-right">
                      {canEdit && p.variants.length > 1 && (
                        <button
                          type="button"
                          onClick={() =>
                            set(
                              "variants",
                              p.variants.filter((_, idx) => idx !== i),
                            )
                          }
                          className="rounded p-2 text-red-600 hover:bg-red-50"
                          aria-label="Remove variant"
                        >
                          <X className="size-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-admin-line px-5 py-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() =>
                  set("variants", [
                    ...p.variants,
                    {
                      id: null,
                      name: `${p.name} - New`,
                      options: ["New"],
                      sku: null,
                      basePriceCents: p.variants[0]?.basePriceCents ?? 0,
                      stockQuantity: 0,
                    },
                  ])
                }
              >
                <Plus className="size-4" /> {t("prod.addVariant")}
              </Button>
              {initial.stockToConfirm && (
                <Checkbox
                  label="These quantities are correct"
                  hint="Removes the “stock to confirm” warning."
                  checked={p.stockConfirmed}
                  onChange={(e) => set("stockConfirmed", e.target.checked)}
                />
              )}
            </div>
          )}
        </Card>

        <Card title={t("prod.downtime")} padded={false}>
          <ul className="divide-y divide-admin-line">
            {downtimeList.length === 0 && <li className="px-5 py-3 text-sm text-admin-muted">—</li>}
            {downtimeList.map((d) => (
              <li key={d.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                <span>
                  <strong>{d.quantity}×</strong> {p.variants.find((v) => v.id === d.variantId)?.name} ·{" "}
                  {formatLocal(d.startsAt, "MMM d, h:mm a")} → {formatLocal(d.endsAt, "MMM d, h:mm a")}
                  {d.reason && <span className="text-admin-muted"> · {d.reason}</span>}
                </span>
                {canEdit && (
                  <button
                    type="button"
                    className="rounded p-1.5 text-red-600 hover:bg-red-50"
                    aria-label="Remove downtime"
                    onClick={async () => {
                      await removeDowntime(d.id);
                      setDowntimeList((l) => l.filter((x) => x.id !== d.id));
                    }}
                  >
                    <Trash2 className="size-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
          {canEdit && (
            <div className="grid gap-3 border-t border-admin-line p-5 sm:grid-cols-2 lg:grid-cols-5">
              <Select
                value={dt.variantId}
                onChange={(e) => setDt({ ...dt, variantId: e.target.value })}
                aria-label="Variant"
              >
                {p.variants
                  .filter((v) => v.id)
                  .map((v) => (
                    <option key={v.id} value={v.id!}>
                      {v.name}
                    </option>
                  ))}
              </Select>
              <Input
                type="number"
                min={1}
                value={dt.quantity}
                onChange={(e) => setDt({ ...dt, quantity: Number(e.target.value) || 1 })}
                aria-label="Quantity"
              />
              <Input
                type="datetime-local"
                value={dt.startsAt}
                onChange={(e) => setDt({ ...dt, startsAt: e.target.value })}
                aria-label="From"
              />
              <Input
                type="datetime-local"
                value={dt.endsAt}
                onChange={(e) => setDt({ ...dt, endsAt: e.target.value })}
                aria-label="Until"
              />
              <div className="flex gap-2">
                <Input
                  placeholder="Reason"
                  value={dt.reason}
                  onChange={(e) => setDt({ ...dt, reason: e.target.value })}
                />
                <Button
                  type="button"
                  onClick={async () => {
                    const payload = {
                      ...dt,
                      startsAt: new Date(dt.startsAt).toISOString(),
                      endsAt: new Date(dt.endsAt).toISOString(),
                    };
                    const res = await addDowntime(payload);
                    if (res.ok && res.id)
                      setDowntimeList((l) => [
                        ...l,
                        {
                          id: res.id!,
                          variantId: dt.variantId,
                          quantity: dt.quantity,
                          startsAt: payload.startsAt,
                          endsAt: payload.endsAt,
                          reason: dt.reason || null,
                        },
                      ]);
                    else setStatus({ kind: "error", text: res.error });
                  }}
                  disabled={!dt.startsAt || !dt.endsAt}
                >
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="space-y-5">
        <Card title={t("prod.visibility")}>
          <Checkbox
            label={t("prod.showInStore")}
            checked={p.showInStore}
            onChange={(e) => set("showInStore", e.target.checked)}
            disabled={!canEdit}
          />
          <Checkbox
            label={t("prod.featured")}
            checked={p.featured}
            onChange={(e) => set("featured", e.target.checked)}
            disabled={!canEdit}
          />
          <Field label="Sort order" hint="Lower numbers show first." className="mt-3">
            <Input
              type="number"
              value={p.sortingWeight}
              onChange={(e) => set("sortingWeight", Number(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </Field>
          <a
            href={`/products/${p.slug}`}
            target="_blank"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-admin-blue"
          >
            <ExternalLink className="size-4" /> View on website
          </a>
        </Card>

        <Card title={t("prod.collections")}>
          <div className="max-h-64 space-y-0.5 overflow-y-auto">
            {collections.map((c) => (
              <Checkbox
                key={c.id}
                label={c.parentName ? `${c.parentName} › ${c.name}` : c.name}
                checked={p.collectionIds.includes(c.id)}
                disabled={!canEdit}
                onChange={(e) =>
                  set(
                    "collectionIds",
                    e.target.checked ? [...p.collectionIds, c.id] : p.collectionIds.filter((x) => x !== c.id),
                  )
                }
              />
            ))}
          </div>
        </Card>

        <Card title={t("prod.rules")}>
          <Checkbox
            label={t("prod.requiresDelivery")}
            checked={p.requiresDelivery}
            onChange={(e) => set("requiresDelivery", e.target.checked)}
            disabled={!canEdit}
          />
          <Checkbox
            label={t("prod.damageProtection")}
            checked={p.damageProtection}
            onChange={(e) => set("damageProtection", e.target.checked)}
            disabled={!canEdit}
          />
          <Checkbox
            label={t("prod.allowShortage")}
            checked={p.allowShortage}
            onChange={(e) => set("allowShortage", e.target.checked)}
            disabled={!canEdit}
          />
          <div className="mt-3 grid gap-3">
            <Field label={t("prod.minTier")}>
              <Select
                value={p.minDeliveryTier ?? ""}
                onChange={(e) => set("minDeliveryTier", e.target.value || null)}
                disabled={!canEdit}
              >
                <option value="">—</option>
                {tiers.map((tier) => (
                  <option key={tier.code} value={tier.code}>
                    {tier.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t("prod.points")} hint="1 chair = 1 point. Used to suggest Small / Medium / Large delivery.">
              <Input
                type="number"
                min={0}
                value={p.deliveryPoints}
                onChange={(e) => set("deliveryPoints", Number(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </Field>
            <Field label={t("prod.bufferBefore")}>
              <Input
                type="number"
                min={0}
                value={p.bufferBeforeMinutes}
                onChange={(e) => set("bufferBeforeMinutes", Number(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </Field>
            <Field label={t("prod.bufferAfter")}>
              <Input
                type="number"
                min={0}
                value={p.bufferAfterMinutes}
                onChange={(e) => set("bufferAfterMinutes", Number(e.target.value) || 0)}
                disabled={!canEdit}
              />
            </Field>
            <Field label="Security deposit hold ($)" hint="Optional card authorization, released after return.">
              <Input
                type="number"
                min={0}
                step="0.01"
                value={dollars(p.securityDepositCents)}
                onChange={(e) => set("securityDepositCents", cents(e.target.value))}
                disabled={!canEdit}
              />
            </Field>
          </div>
        </Card>

        <Card title={t("prod.seo")}>
          <Field label={t("prod.seoTitle")} hint={`${(p.seoTitle ?? "").length}/60`}>
            <Input
              value={p.seoTitle ?? ""}
              onChange={(e) => set("seoTitle", e.target.value || null)}
              placeholder={`${p.name} Rental in Winnipeg`}
              disabled={!canEdit}
            />
          </Field>
          <Field label={t("prod.seoDescription")} hint={`${(p.seoDescription ?? "").length}/160`} className="mt-3">
            <Textarea
              value={p.seoDescription ?? ""}
              onChange={(e) => set("seoDescription", e.target.value || null)}
              rows={3}
              disabled={!canEdit}
            />
          </Field>
          <Field label="Tags" hint="Comma separated" className="mt-3">
            <input
              className={inputClass}
              defaultValue={p.tags.join(", ")}
              onBlur={(e) =>
                set(
                  "tags",
                  e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                )
              }
              disabled={!canEdit}
            />
          </Field>
        </Card>

        {canEdit && (
          <form
            action={archiveProduct.bind(null, p.id)}
            onSubmit={(e) => {
              if (!confirm("Archive this product? It disappears from the website; past bookings keep it."))
                e.preventDefault();
            }}
          >
            <Button type="submit" variant="danger" className="w-full">
              <Trash2 className="size-4" /> {t("prod.archive")}
            </Button>
          </form>
        )}
      </div>

      {canEdit && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-admin-line bg-white/95 px-4 py-3 backdrop-blur lg:left-60">
          <div className="flex items-center justify-end gap-3">
            {status.kind === "saved" && !dirty && (
              <span className="flex items-center gap-1.5 text-sm text-green-700">
                <CheckCircle2 className="size-4" /> {t("common.saved")}
              </span>
            )}
            {status.kind === "error" && (
              <span className="max-w-xl truncate text-sm text-red-600" title={status.text}>
                {status.text}
              </span>
            )}
            {dirty && <span className="text-sm text-admin-muted">Unsaved changes</span>}
            <Button type="button" variant="primary" onClick={save} disabled={pending || !dirty}>
              {pending && <Loader2 className="size-4 animate-spin" />} {t("common.save")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
