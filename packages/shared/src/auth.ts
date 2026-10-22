import type { Permission, Role } from './roles.js';

// GET /api/auth/me, POST /api/auth/login
export interface AuthMeDto {
  id: string;
  email: string;
  fullName: string;
  roles: Role[];
  permissions: Permission[];
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface ChangePasswordRequest {
  currentPassword: string;
  newPassword: string;
}

export interface ResetPasswordRequest {
  token: string;
  newPassword: string;
}

export const PASSWORD_MIN_LENGTH = 8;
