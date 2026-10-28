// Nơi nhận lỗi 5xx từ AllExceptionsFilter (bước 26). Trung tâm giám sát (features/monitoring) cung cấp token này;
// thiếu thì filter vẫn chạy bình thường. Chỉ truyền route, mã lỗi và đối tượng lỗi: không bao giờ có body, header, cookie.
export const ERROR_SINK = Symbol('ERROR_SINK');

export interface HttpErrorReport {
  method: string;
  path: string; // đường dẫn thật, đã bỏ query
  route?: string; // mẫu route của Express nếu có (vd. /posts/:id)
  statusCode: number;
  error: unknown;
}

export interface ErrorSink {
  recordHttp(report: HttpErrorReport): void;
}
