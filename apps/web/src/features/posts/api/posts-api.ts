import type { CreatePostRequest, PostAction, PostDto, PostStatus, UpdatePostRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function listManagePosts(filters: { status: PostStatus | ""; categoryId: string }) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.categoryId) params.set("categoryId", filters.categoryId);
  return api<PostDto[]>(`/posts/manage?${params}`);
}

export function getManagePost(id: string) {
  return api<PostDto>(`/posts/manage/${id}`);
}

export function createPost(body: CreatePostRequest) {
  return api<PostDto>("/posts", { method: "POST", body: JSON.stringify(body) });
}

export function updatePost(id: string, body: UpdatePostRequest) {
  return api<PostDto>(`/posts/${id}`, { method: "PATCH", body: JSON.stringify(body) });
}

// Đường dẫn của từng thao tác chuyển trạng thái (khớp posts.controller.ts).
const ACTION_PATHS: Record<Exclude<PostAction, "edit" | "delete">, string> = {
  submit: "submit",
  approve: "approve",
  reject: "reject",
  reschedule: "reschedule",
  publish: "publish",
  cancel_schedule: "cancel-schedule",
  unpublish: "unpublish",
  restore: "restore",
};

export function runPostAction(
  id: string,
  action: keyof typeof ACTION_PATHS,
  body: { publishAt?: string; reason?: string } = {},
) {
  return api<PostDto>(`/posts/${id}/${ACTION_PATHS[action]}`, { method: "POST", body: JSON.stringify(body) });
}

export function deletePost(id: string) {
  return api<void>(`/posts/${id}`, { method: "DELETE" });
}
