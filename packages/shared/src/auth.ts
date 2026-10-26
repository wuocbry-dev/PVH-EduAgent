import type { Permission, Role } from './roles.js';

// GET /api/auth/me, POST /api/auth/login
export interface AuthMeDto {
  id: string;
  email: string | null;
  fullName: string;
  roles: Role[];
  permissions: Permission[];
}

export interface LoginRequest {
  // Email, hoặc mã học sinh / mã giáo viên.
  identifier: string;
  password: string;
}

// POST /api/auth/activate
export interface ActivateRequest {
  identifier: string;
  activationCode: string;
  newPassword: string;
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
