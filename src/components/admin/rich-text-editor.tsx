"use client";

import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Heading2, Heading3, Italic, Link2, List, ListOrdered, Minus, Pilcrow, Redo2, Undo2 } from "lucide-react";
import { cn } from "@/lib/cn";

/** WYSIWYG for descriptions and pages: headings, bold, lists, links — no raw HTML needed. */
export function RichTextEditor({
  value,
  onChange,
  minHeight = 260,
}: {
  value: string;
  onChange: (html: string) => void;
  minHeight?: number;
}) {
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [2, 3] }, link: { openOnClick: false, autolink: true } })],
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: { class: "prose-everglow max-w-none px-4 py-3 outline-none", style: `min-height:${minHeight}px` },
    },
    onUpdate: ({ editor }) => onChange(editor.getHTML()),
  });
  const state = useEditorState({
    editor,
    selector: ({ editor }) =>
      editor
        ? {
            bold: editor.isActive("bold"),
            italic: editor.isActive("italic"),
            h2: editor.isActive("heading", { level: 2 }),
            h3: editor.isActive("heading", { level: 3 }),
            bullet: editor.isActive("bulletList"),
            ordered: editor.isActive("orderedList"),
            link: editor.isActive("link"),
          }
        : null,
  });

  const btn = (
    active: boolean | undefined,
    label: string,
    onClick: () => void,
    Icon: React.ComponentType<{ className?: string }>,
  ) => (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={!!active}
      onClick={onClick}
      className={cn(
        "rounded p-1.5 text-admin-muted hover:bg-admin-bg hover:text-admin-text",
        active && "bg-admin-blue-soft text-admin-blue",
      )}
    >
      <Icon className="size-4" />
    </button>
  );

  return (
    <div className="overflow-hidden rounded-md border border-admin-line bg-white focus-within:border-admin-blue focus-within:ring-2 focus-within:ring-admin-blue/20">
      <div className="flex flex-wrap gap-0.5 border-b border-admin-line bg-admin-bg/50 p-1">
        {btn(false, "Paragraph", () => editor?.chain().focus().setParagraph().run(), Pilcrow)}
        {btn(state?.h2, "Heading", () => editor?.chain().focus().toggleHeading({ level: 2 }).run(), Heading2)}
        {btn(state?.h3, "Subheading", () => editor?.chain().focus().toggleHeading({ level: 3 }).run(), Heading3)}
        {btn(state?.bold, "Bold", () => editor?.chain().focus().toggleBold().run(), Bold)}
        {btn(state?.italic, "Italic", () => editor?.chain().focus().toggleItalic().run(), Italic)}
        {btn(state?.bullet, "Bullet list", () => editor?.chain().focus().toggleBulletList().run(), List)}
        {btn(state?.ordered, "Numbered list", () => editor?.chain().focus().toggleOrderedList().run(), ListOrdered)}
        {btn(
          state?.link,
          "Link",
          () => {
            const prev = editor?.getAttributes("link").href as string | undefined;
            const url = window.prompt("Link URL (leave empty to remove)", prev ?? "https://");
            if (url === null) return;
            if (url === "") editor?.chain().focus().unsetLink().run();
            else editor?.chain().focus().extendMarkRange("link").setLink({ href: url }).run();
          },
          Link2,
        )}
        {btn(false, "Divider", () => editor?.chain().focus().setHorizontalRule().run(), Minus)}
        <span className="mx-1 w-px bg-admin-line" />
        {btn(false, "Undo", () => editor?.chain().focus().undo().run(), Undo2)}
        {btn(false, "Redo", () => editor?.chain().focus().redo().run(), Redo2)}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
