import { DEFAULT_SCORE_FORMULA, type ScoreFormula } from '@pvh/shared';
import { z } from 'zod';

const weight = z.number().int('Hệ số phải là số nguyên').min(1, 'Hệ số tối thiểu là 1').max(10, 'Hệ số tối đa là 10');

// Công thức điểm trung bình (khoá system_settings `scores.formula`, bước 19). Mặc định theo Thông tư 22/2021.
export const formulaSchema = z
  .object({
    weights: z.object({ THUONG_XUYEN: weight, GIUA_KY: weight, CUOI_KY: weight }),
    regularMin: z
      .array(
        z.object({
          maxPeriodsPerWeek: z.number().int().min(1).max(20),
          count: z.number().int().min(0).max(10),
        }),
      )
      .max(5),
    regularMinOther: z.number().int().min(0).max(10),
    yearWeights: z.tuple([weight, weight]),
    decimals: z.union([z.literal(1), z.literal(2)]),
  })
  .refine(
    (f) => f.regularMin.every((s, i, all) => i === 0 || s.maxPeriodsPerWeek > all[i - 1]!.maxPeriodsPerWeek),
    'Các mốc số tiết/tuần phải tăng dần và không trùng',
  );
export type FormulaInput = z.infer<typeof formulaSchema>;

// Giá trị lưu hỏng (sửa tay CSDL…) thì dùng mặc định thay vì làm hỏng mọi trang xem điểm.
export function parseFormula(value: string | null | undefined): ScoreFormula {
  if (!value) return DEFAULT_SCORE_FORMULA;
  try {
    const parsed = formulaSchema.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : DEFAULT_SCORE_FORMULA;
  } catch {
    return DEFAULT_SCORE_FORMULA;
  }
}
