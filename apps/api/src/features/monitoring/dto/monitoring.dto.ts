import { AGENT_STATS_MAX_DAYS } from '@pvh/shared';
import { z } from 'zod';

export const listErrorsQuerySchema = z.object({
  resolved: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
});
export type ListErrorsQuery = z.infer<typeof listErrorsQuerySchema>;

export const listAlertsQuerySchema = z.object({
  open: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});
export type ListAlertsQuery = z.infer<typeof listAlertsQuerySchema>;

// Bước 27: thống kê AI Agent trong N ngày gần nhất.
export const agentStatsQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(AGENT_STATS_MAX_DAYS).default(14),
});
export type AgentStatsQuery = z.infer<typeof agentStatsQuerySchema>;
