import { PERMISSIONS, ROLES } from '@pvh/shared';
import { z } from 'zod';

export const roleCodeSchema = z.enum(ROLES);

export const updateRolePermissionsSchema = z.object({
  permissions: z.array(z.enum(PERMISSIONS)).transform((v) => [...new Set(v)]),
});
export type UpdateRolePermissionsInput = z.infer<
  typeof updateRolePermissionsSchema
>;
