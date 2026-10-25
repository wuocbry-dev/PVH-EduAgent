"use client";

import Image from "@tiptap/extension-image";
import StarterKit from "@tiptap/starter-kit";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";
import { useState, type ReactNode } from "react";
import { MediaLibrary } from "@/features/media";
import { mediaSrc } from "@/shared/lib/media-url";

interface Props {
  // HTML ban đầu; chỉ đọc một lần, sau đó trình soạn thảo tự giữ nội dung.
  initialHtml: string;
  onChange: (html: string) => void;
}

// Trình soạn thảo rich text (Tiptap). HTML xuất ra luôn được server lọc lại trước khi lưu.
export function RichTextEditor({ initialHtml, onChange }: Props) {
  const [pickingImage, setPickingImage] = useState(false);

  const editor = useEditor({
    extensions: [StarterKit.configure({ link: { openOnClick: false } }), Image],
    content: initialHtml,
    // Next.js render phía server: chỉ dựng editor sau khi hydrate.
    immediatelyRender: false,
    editorProps: { attributes: { class: "rich-content min-h-64 rounded-b border border-black/20 p-3 outline-none dark:border-white/20" } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? "" : editor.getHTML()),
  });

  const active = useEditorState({
    editor,
    selector: ({ editor }) => ({
      bold: editor?.isActive("bold") ?? false,
      italic: editor?.isActive("italic") ?? false,
      underline: editor?.isActive("underline") ?? false,
      h2: editor?.isActive("heading", { level: 2 }) ?? false,
      h3: editor?.isActive("heading", { level: 3 }) ?? false,
      bullet: editor?.isActive("bulletList") ?? false,
      ordered: editor?.isActive("orderedList") ?? false,
      quote: editor?.isActive("blockquote") ?? false,
      link: editor?.isActive("link") ?? false,
    }),
  });

  if (!editor) return <p className="text-sm opacity-60">Đang tải trình soạn thảo…</p>;
  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = (editor?.getAttributes("link").href as string | undefined) ?? "";
    const href = prompt("Địa chỉ liên kết (để trống để bỏ liên kết):", previous);
    if (href === null) return;
    if (href === "") chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href }).run();
  }

  const button = (label: ReactNode, on: boolean, run: () => void, title: string) => (
    <button
      type="button"
      title={title}
      onClick={run}
      className={`rounded px-2 py-1 text-sm ${on ? "bg-foreground text-background" : "border border-black/20 dark:border-white/20"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-2">
      <div>
        <div className="flex flex-wrap gap-1 rounded-t border border-b-0 border-black/20 p-2 dark:border-white/20">
          {button(<b>B</b>, (active?.bold ?? false), () => chain().toggleBold().run(), "In đậm")}
          {button(<i>I</i>, (active?.italic ?? false), () => chain().toggleItalic().run(), "In nghiêng")}
          {button(<u>U</u>, (active?.underline ?? false), () => chain().toggleUnderline().run(), "Gạch chân")}
          {button("H2", (active?.h2 ?? false), () => chain().toggleHeading({ level: 2 }).run(), "Tiêu đề lớn")}
          {button("H3", (active?.h3 ?? false), () => chain().toggleHeading({ level: 3 }).run(), "Tiêu đề nhỏ")}
          {button("• Danh sách", (active?.bullet ?? false), () => chain().toggleBulletList().run(), "Danh sách chấm")}
          {button("1. Danh sách", (active?.ordered ?? false), () => chain().toggleOrderedList().run(), "Danh sách số")}
          {button("❝", (active?.quote ?? false), () => chain().toggleBlockquote().run(), "Trích dẫn")}
          {button("Liên kết", (active?.link ?? false), setLink, "Chèn liên kết")}
          {button("Ảnh", false, () => setPickingImage(true), "Chèn ảnh từ thư viện")}
          {button("↶", false, () => chain().undo().run(), "Hoàn tác")}
          {button("↷", false, () => chain().redo().run(), "Làm lại")}
        </div>
        <EditorContent editor={editor} />
      </div>
      {pickingImage && (
        <MediaLibrary
          onClose={() => setPickingImage(false)}
          onSelect={(media) => {
            chain().setImage({ src: mediaSrc(media.url) }).run();
            setPickingImage(false);
          }}
        />
      )}
    </div>
  );
}
