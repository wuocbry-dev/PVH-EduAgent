import {
  LIBRARY_MAX_BYTES,
  LIBRARY_MIME_TYPES,
  MEDIA_IMAGE_MAX_BYTES,
  MEDIA_IMAGE_MIME_TYPES,
  type LibraryAccessDto,
  type LibraryCategoryDto,
  type LibraryFormOptionsDto,
  type LibraryItemDto,
  type LibraryKind,
  type LibraryMineDto,
  type LibraryStatsDto,
  type LibraryStatus,
  type LibraryUploadDto,
} from "@pvh/shared";
import { api } from "@/shared/lib/api-client";
import { putUpload } from "@/shared/lib/put-upload";

const json = (method: string, body?: unknown): RequestInit => ({ method, body: body === undefined ? undefined : JSON.stringify(body) });

// ── Người đọc ──

// URL đọc/tải hết hạn sau vài phút: xin lại khi hết hạn (trình phát tự làm).
export const accessItem = (id: string, download = false) => api<LibraryAccessDto>(`/library/items/${id}/access`, json("POST", { download }));
export const saveProgress = (id: string, position: number) => api<void>(`/library/items/${id}/progress`, json("PUT", { position }));
export const setFavorite = (id: string, favorite: boolean) => api<void>(`/library/items/${id}/favorite`, { method: favorite ? "PUT" : "DELETE" });
export const getMine = () => api<LibraryMineDto>("/library/me");

// ── Người gửi, người quản lý ──

export interface ItemInput {
  title: string;
  author: string | null;
  publisher: string | null;
  publishYear: number | null;
  description: string | null;
  kind: LibraryKind;
  categoryId: string;
  subjectId: string | null;
  gradeLevel: number | null;
  source: string;
  license: string;
  allowDownload: boolean;
  audience: string;
  gradeLevels: number[];
  classIds: string[];
}

export const getFormOptions = () => api<LibraryFormOptionsDto>("/library/form-options");
export const listSubmissions = ({ scope, status, q }: { scope: "mine" | "all"; status?: LibraryStatus | ""; q?: string }) => {
  const params = new URLSearchParams({ scope });
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  return api<LibraryItemDto[]>(`/library/submissions?${params}`);
};
export const createItem = (input: ItemInput) => api<LibraryItemDto>("/library/items", json("POST", input));
export const updateItem = (id: string, input: ItemInput) => api<LibraryItemDto>(`/library/items/${id}`, json("PATCH", input));
export const deleteItem = (id: string) => api<void>(`/library/items/${id}`, { method: "DELETE" });
export const submitItem = (id: string) => api<LibraryItemDto>(`/library/items/${id}/submit`, { method: "POST" });
export const reviewItem = (id: string, action: "approve" | "reject" | "archive" | "restore", reason?: string) =>
  api<LibraryItemDto>(`/library/items/${id}/review`, json("POST", { action, reason }));

export function fileProblem(kind: LibraryKind, file: File): string | null {
  if (!LIBRARY_MIME_TYPES[kind].includes(file.type)) {
    return kind === "PDF" ? "Hãy chọn file PDF" : kind === "AUDIO" ? "Hãy chọn file MP3" : "Hãy chọn file MP4 hoặc WebM";
  }
  if (file.size > LIBRARY_MAX_BYTES[kind]) return `File quá lớn (tối đa ${LIBRARY_MAX_BYTES[kind] / 1024 / 1024} MB)`;
  if (file.size === 0) return "File rỗng";
  return null;
}

// Tải lên 3 bước: xin URL ký sẵn → trình duyệt PUT thẳng lên kho (riêng tư với file tài liệu, công khai với ảnh bìa)
// → server kiểm tra nội dung (magic bytes). Sai loại thì server xoá file và báo lỗi.
export async function uploadItemFile(
  id: string,
  target: "file" | "cover",
  file: File,
  kind: LibraryKind,
  onProgress?: (percent: number) => void,
): Promise<LibraryItemDto> {
  const problem =
    target === "file"
      ? fileProblem(kind, file)
      : !(MEDIA_IMAGE_MIME_TYPES as readonly string[]).includes(file.type)
        ? "Ảnh bìa phải là JPEG, PNG, WebP hoặc GIF"
        : file.size > MEDIA_IMAGE_MAX_BYTES
          ? "Ảnh bìa quá lớn (tối đa 10 MB)"
          : null;
  if (problem) throw new Error(problem);
  const presign = await api<LibraryUploadDto & { uploadId: string }>(
    `/library/items/${id}/upload`,
    json("POST", { target, mimeType: file.type, size: file.size }),
  );
  await putUpload(file, presign, onProgress);
  return api<LibraryItemDto>(`/library/items/${id}/upload/complete`, json("POST", { target, uploadId: presign.uploadId }));
}

export const listCategories = () => api<LibraryCategoryDto[]>("/library/categories");
export const saveCategory = (id: string | null, input: { name: string; slug?: string; parentId: string | null; sortOrder: number }) =>
  api<void>(id ? `/library/categories/${id}` : "/library/categories", json(id ? "PATCH" : "POST", input));
export const deleteCategory = (id: string) => api<void>(`/library/categories/${id}`, { method: "DELETE" });
export const getStats = () => api<LibraryStatsDto>("/library/stats");
