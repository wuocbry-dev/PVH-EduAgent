// Lỗi vi phạm ràng buộc duy nhất của Prisma (P2002) hoặc khoá ngoại (P2003).
export function isUniqueViolation(err: unknown): boolean {
  return hasCode(err, 'P2002');
}

export function isForeignKeyViolation(err: unknown): boolean {
  return hasCode(err, 'P2003');
}

function hasCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}
