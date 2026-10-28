// Trình duyệt/thiết bị từ User-Agent, đủ để so "đã từng thấy" (bỏ số phiên bản nhỏ để cập nhật trình duyệt không bị coi là lạ).
export function deviceOf(userAgent: string | null | undefined): string {
  if (!userAgent) return 'không rõ';
  const os = /Windows/i.test(userAgent)
    ? 'Windows'
    : /Android/i.test(userAgent)
      ? 'Android'
      : /iPhone|iPad|iOS/i.test(userAgent)
        ? 'iOS'
        : /Mac OS X|Macintosh/i.test(userAgent)
          ? 'macOS'
          : /Linux/i.test(userAgent)
            ? 'Linux'
            : 'khác';
  const browser = /Edg\//.test(userAgent)
    ? 'Edge'
    : /OPR\//.test(userAgent)
      ? 'Opera'
      : /Firefox\//.test(userAgent)
        ? 'Firefox'
        : /Chrome\//.test(userAgent)
          ? 'Chrome'
          : /Safari\//.test(userAgent)
            ? 'Safari'
            : 'khác';
  return `${browser} trên ${os}`;
}
