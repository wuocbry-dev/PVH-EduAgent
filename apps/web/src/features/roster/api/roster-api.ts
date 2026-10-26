import { XLSX_MIME } from "@pvh/shared";
import type { AccountSlipDto, RosterConfirmDto, RosterKind, RosterPreviewDto } from "@pvh/shared";
import { api, apiFetch, parseResponse } from "@/shared/lib/api-client";

const kindPath = (kind: RosterKind) => (kind === "STUDENT" ? "student" : "teacher");

// File .xlsx gửi thẳng làm nội dung request (không multipart).
export function previewRoster(kind: RosterKind, file: File) {
  return api<RosterPreviewDto>(`/roster/import/${kindPath(kind)}/preview`, {
    method: "POST",
    body: file,
    headers: { "Content-Type": XLSX_MIME },
  });
}

export function confirmRoster(previewId: string) {
  return api<RosterConfirmDto>(`/roster/import/${previewId}/confirm`, { method: "POST" });
}

export function reissueActivationCode(userId: string) {
  return api<AccountSlipDto>(`/roster/users/${userId}/activation-code`, { method: "POST" });
}

export function issueClassCodes(classId: string) {
  return api<AccountSlipDto[]>(`/roster/classes/${classId}/activation-codes`, { method: "POST" });
}

// Tải file mẫu về máy (cần cookie đăng nhập nên không dùng liên kết thường).
export async function downloadTemplate(kind: RosterKind): Promise<void> {
  const res = await apiFetch(`/roster/templates/${kindPath(kind)}`);
  if (!res.ok) await parseResponse<never>(res);
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = `mau-nhap-${kind === "STUDENT" ? "hoc-sinh" : "giao-vien"}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

