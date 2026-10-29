"use client";

import Image from "next/image";
import { useState, useTransition } from "react";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { Button, buttonClass, Card, Checkbox, Field, Input, Select, Textarea } from "@/components/admin/ui";
import { saveCollection, uploadCollectionImage, type CollectionInput } from "../actions";

export function CollectionEditor({
  initial,
  image: initialImage,
  parents,
  canEdit,
}: {
  initial: CollectionInput;
  image: string | null;
  parents: { id: string; name: string }[];
  canEdit: boolean;
}) {
  const [c, setC] = useState(initial);
  const [image, setImage] = useState(initialImage);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const set = <K extends keyof CollectionInput>(k: K, v: CollectionInput[K]) => setC((p) => ({ ...p, [k]: v }));

  return (
    <div className="grid gap-5 p-4 md:p-6 xl:grid-cols-[1fr_340px]">
      <Card title="General">
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Name">
            <Input value={c.name} onChange={(e) => set("name", e.target.value)} disabled={!canEdit} />
          </Field>
          <Field label="URL" hint={`/collections/${c.slug}`}>
            <Input value={c.slug} onChange={(e) => set("slug", e.target.value)} disabled={!canEdit} />
          </Field>
        </div>
        <div className="mt-4">
          <span className="mb-1.5 block text-sm font-semibold">Description</span>
          <RichTextEditor value={c.descriptionHtml} onChange={(html) => set("descriptionHtml", html)} minHeight={160} />
        </div>
      </Card>
      <div className="space-y-5">
        <Card title="Image">
          <div className="relative mb-3 aspect-video overflow-hidden rounded bg-admin-bg">
            {image && <Image src={image} alt="" fill sizes="340px" className="object-cover" />}
          </div>
          {canEdit && (
            <label className={buttonClass("secondary") + " w-full cursor-pointer"}>
              <Upload className="size-4" /> Upload image
              <input
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const fd = new FormData();
                  fd.append("file", f);
                  const res = await uploadCollectionImage(c.id, fd);
                  if (res.ok && res.url) setImage(res.url);
                  else setMsg({ ok: false, text: res.error ?? "Upload failed" });
                }}
              />
            </label>
          )}
        </Card>
        <Card title="Settings">
          <Field label="Parent collection">
            <Select
              value={c.parentId ?? ""}
              onChange={(e) => set("parentId", e.target.value || null)}
              disabled={!canEdit}
            >
              <option value="">—</option>
              {parents
                .filter((p) => p.id !== c.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Order" className="mt-3">
            <Input
              type="number"
              value={c.position}
              onChange={(e) => set("position", Number(e.target.value) || 0)}
              disabled={!canEdit}
            />
          </Field>
          <div className="mt-3">
            <Checkbox
              label="Visible on the website"
              checked={c.visible}
              onChange={(e) => set("visible", e.target.checked)}
              disabled={!canEdit}
            />
            <Checkbox
              label="Show as a tile on the home page"
              checked={c.featured}
              onChange={(e) => set("featured", e.target.checked)}
              disabled={!canEdit}
            />
          </div>
        </Card>
        <Card title="SEO">
          <Field label="SEO title">
            <Input
              value={c.seoTitle ?? ""}
              onChange={(e) => set("seoTitle", e.target.value || null)}
              placeholder={`${c.name} Rentals in Winnipeg`}
              disabled={!canEdit}
            />
          </Field>
          <Field label="SEO description" className="mt-3">
            <Textarea
              rows={3}
              value={c.seoDescription ?? ""}
              onChange={(e) => set("seoDescription", e.target.value || null)}
              disabled={!canEdit}
            />
          </Field>
        </Card>
        {canEdit && (
          <div className="flex items-center justify-end gap-3">
            {msg && (
              <span className={msg.ok ? "flex items-center gap-1 text-sm text-green-700" : "text-sm text-red-600"}>
                {msg.ok && <CheckCircle2 className="size-4" />}
                {msg.text}
              </span>
            )}
            <Button
              variant="primary"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await saveCollection(c);
                  setMsg(res.ok ? { ok: true, text: "Saved" } : { ok: false, text: res.error ?? "Error" });
                })
              }
            >
              {pending && <Loader2 className="size-4 animate-spin" />} Save
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
