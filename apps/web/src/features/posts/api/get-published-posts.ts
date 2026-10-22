import type { PostDto } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function getPublishedPosts() {
  return api<PostDto[]>("/posts");
}
