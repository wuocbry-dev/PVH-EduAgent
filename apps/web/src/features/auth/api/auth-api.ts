import type { AuthMeDto, ChangePasswordRequest, LoginRequest, ResetPasswordRequest } from "@pvh/shared";
import { api } from "@/shared/lib/api-client";

export function login(body: LoginRequest) {
  return api<AuthMeDto>("/auth/login", { method: "POST", body: JSON.stringify(body) });
}

export function logout() {
  return api<void>("/auth/logout", { method: "POST" });
}

export function changePassword(body: ChangePasswordRequest) {
  return api<void>("/auth/change-password", { method: "POST", body: JSON.stringify(body) });
}

export function forgotPassword(email: string) {
  return api<{ message: string }>("/auth/forgot-password", { method: "POST", body: JSON.stringify({ email }) });
}

export function resetPassword(body: ResetPasswordRequest) {
  return api<void>("/auth/reset-password", { method: "POST", body: JSON.stringify(body) });
}
