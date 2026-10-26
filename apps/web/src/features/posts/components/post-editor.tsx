"use client";

import type { PostDto } from "@pvh/shared";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { usePortalBase } from "@/shared/lib/use-portal-base";
import { CategorySelect } from "@/features/categories";
import { MediaLibrary } from "@/features/media";
import { mediaSrc } from "@/shared/lib/media-url";
import { buttonClass, errorClass, inputClass } from "@/shared/ui/form-styles";
import { createPost, getManagePost, updatePost } from "../api/posts-api";
import { PostActions } from "./post-actions";
import { PostStatusBadge } from "./post-status-badge";
import { RichTextEditor } from "./rich-text-editor";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const formatTime = (iso: string) => new Date(iso).toLocaleString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh" });

// Trang soạn bài: tạo mới (không có postId) hoặc mở bài để sửa / duyệt / đăng.
export function PostEditor({ postId }: { postId?: string }) {
  const [post, setPost] = useState<PostDto | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!postId) return;
    let current = true;
    getManagePost(postId)
      .then((data) => current && setPost(data))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, [postId]);

  if (postId && !post) {
    return error ? <p className={errorClass}>{error}</p> : <p className="text-sm opacity-60">Đang tải…</p>;
  }
  // key: nạp lại form khi bài đổi (vd. sau khi lưu hoặc chuyển trạng thái).
  return <PostForm key={post ? `${post.id}-${post.status}` : "new"} post={post} onPost={setPost} />;
}

function PostForm({ post, onPost }: { post: PostDto | null; onPost: (post: PostDto) => void }) {
  const base = usePortalBase();
  const router = useRouter();
  const editable = !post || post.actions.includes("edit");
  const [content, setContent] = useState(post?.content ?? "");
  const [categoryId, setCategoryId] = useState(post?.categoryId ?? "");
  const [thumbnailUrl, setThumbnailUrl] = useState(post?.thumbnailUrl ?? null);
  const [pickingThumbnail, setPickingThumbnail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const body = {
      title: String(form.get("title")),
      summary: String(form.get("summary")) || null,
      content,
      categoryId: categoryId || null,
      thumbnailUrl,
    };
    setPending(true);
    setError(null);
    setSaved(false);
    try {
      if (post) {
        onPost(await updatePost(post.id, body));
        setSaved(true);
      } else {
        const created = await createPost(body);
        router.replace(`${base}/bai-viet/${created.id}`);
      }
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-4">
      {post && (
        <div className="space-y-2">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <PostStatusBadge status={post.status} />
            <span className="opacity-70">Tác giả: {post.authorName}</span>
            {post.source === "TELEGRAM" && (
              <span className="rounded bg-sky-200 px-1.5 py-0.5 text-xs text-sky-900">Tạo qua Telegram</span>
            )}
            {post.publishAt && <span>Hẹn đăng: {formatTime(post.publishAt)}</span>}
            {post.publishedAt && <span>Đã đăng: {formatTime(post.publishedAt)}</span>}
          </div>
          {post.status === "REJECTED" && post.rejectReason && (
            <p className="rounded border border-red-300 bg-red-50 p-3 text-sm text-red-900">
              <b>Bị từ chối:</b> {post.rejectReason}
            </p>
          )}
          <PostActions
            post={post}
            onChanged={onPost}
            onDeleted={() => router.replace(`${base}/bai-viet`)}
          />
        </div>
      )}

      {editable ? (
        <form onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1 text-sm">
            <span>Tiêu đề</span>
            <input name="title" defaultValue={post?.title} required minLength={5} maxLength={255} className={inputClass} />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Tóm tắt</span>
            <textarea name="summary" defaultValue={post?.summary ?? ""} rows={2} maxLength={500} className={inputClass} />
          </label>
          <div className="flex flex-wrap items-end gap-6">
            <label className="space-y-1 text-sm">
              <span className="block">Chuyên mục</span>
              <CategorySelect value={categoryId} onChange={setCategoryId} emptyLabel="— Chưa phân loại —" />
            </label>
            <div className="space-y-1 text-sm">
              <span className="block">Ảnh đại diện</span>
              <div className="flex items-center gap-2">
                {thumbnailUrl && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={mediaSrc(thumbnailUrl)} alt="" className="h-12 w-20 rounded object-cover" />
                )}
                <button type="button" className="underline" onClick={() => setPickingThumbnail(true)}>
                  {thumbnailUrl ? "Đổi ảnh" : "Chọn ảnh"}
                </button>
                {thumbnailUrl && (
                  <button type="button" className="underline" onClick={() => setThumbnailUrl(null)}>
                    Bỏ ảnh
                  </button>
                )}
              </div>
            </div>
          </div>
          {pickingThumbnail && (
            <MediaLibrary
              kind="IMAGE"
              onClose={() => setPickingThumbnail(false)}
              onSelect={(media) => {
                setThumbnailUrl(media.url);
                setPickingThumbnail(false);
              }}
            />
          )}
          <div className="space-y-1 text-sm">
            <span>Nội dung</span>
            <RichTextEditor initialHtml={content} onChange={setContent} />
          </div>
          {error && <p className={errorClass}>{error}</p>}
          {saved && <p className="text-sm text-green-700">Đã lưu.</p>}
          <button type="submit" disabled={pending} className={`${buttonClass} w-auto`}>
            {post ? "Lưu thay đổi" : "Lưu nháp"}
          </button>
        </form>
      ) : (
        post && (
          <article className="space-y-3">
            <h1 className="text-2xl font-bold">{post.title}</h1>
            <p className="text-sm opacity-70">
              {post.categoryName ?? "Chưa phân loại"}
              {post.summary ? ` · ${post.summary}` : ""}
            </p>
            {post.thumbnailUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={mediaSrc(post.thumbnailUrl)} alt="" className="max-h-64 rounded" />
            )}
            {/* Nội dung đã được server lọc XSS khi lưu. */}
            <div className="rich-content" dangerouslySetInnerHTML={{ __html: post.content }} />
          </article>
        )
      )}
    </div>
  );
}
