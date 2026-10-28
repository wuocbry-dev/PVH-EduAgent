import { z } from 'zod';

export const listErrorsQuerySchema = z.object({
  resolved: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
export type ListErrorsQuery = z.infer<typeof listErrorsQuerySchema>;

export const listAlertsQuerySchema = z.object({
  open: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;
