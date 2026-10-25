import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

// Thông báo tiếng Việt thay cho câu mặc định bằng tiếng Anh của Nest/Express.
const DEFAULT_MESSAGES: Record<number, string> = {
  400: 'Yêu cầu không hợp lệ',
  401: 'Chưa đăng nhập hoặc phiên đã hết hạn',
  403: 'Bạn không có quyền thực hiện thao tác này',
  404: 'Không tìm thấy',
  405: 'Phương thức không được hỗ trợ',
  406: 'Định dạng yêu cầu không được hỗ trợ',
  409: 'Dữ liệu xung đột, vui lòng tải lại',
  413: 'Nội dung gửi lên quá lớn',
  415: 'Kiểu nội dung không được hỗ trợ',
  422: 'Dữ liệu không xử lý được',
  429: 'Bạn thao tác quá nhanh, vui lòng thử lại sau ít phút',
  500: 'Lỗi hệ thống, vui lòng thử lại sau',
  503: 'Dịch vụ tạm thời chưa sẵn sàng',
};
const INTERNAL = DEFAULT_MESSAGES[500];

// Câu mặc định (tiếng Anh) do Nest/Express/throttler sinh ra: sẽ được thay bằng DEFAULT_MESSAGES.
const ENGLISH_DEFAULT =
  /^(Bad Request|Unauthorized|Forbidden( resource)?|Not Found|Method Not Allowed|Not Acceptable|Conflict|Payload Too Large|Unsupported Media Type|Unprocessable Entity|Too Many Requests|ThrottlerException.*|Internal Server Error|Service Unavailable|Cannot (GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS) .*)$/i;

interface ErrorBody {
  statusCode: number;
  message: string;
  error?: string;
  [key: string]: unknown;
}

// Mọi lỗi trả về cùng một dạng { statusCode, message } (lỗi kiểm tra dữ liệu giữ thêm formErrors/fieldErrors).
// Lỗi không lường trước luôn trả câu chung chung (không lộ stack trace hay chi tiết nội bộ, kể cả khi chạy dev);
// chi tiết chỉ ghi vào log phía máy chủ.
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('Exception');

  constructor(private readonly adapterHost: HttpAdapterHost) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const { httpAdapter } = this.adapterHost;
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<{ method?: string; originalUrl?: string; url?: string }>();
    const body = this.toBody(exception);

    if (body.statusCode >= 500) {
      const path = (request.originalUrl ?? request.url ?? '').split('?')[0];
      this.logger.error(
        `${request.method} ${path} → ${body.statusCode}: ${exception instanceof Error ? (exception.stack ?? exception.message) : String(exception)}`,
      );
    }
    httpAdapter.reply(ctx.getResponse(), body, body.statusCode);
  }

  private toBody(exception: unknown): ErrorBody {
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const response = exception.getResponse();
      // Body JSON hỏng: body-parser báo bằng câu tiếng Anh kèm vị trí lỗi; không đưa nguyên văn cho người dùng.
      const cause = exception.cause as { type?: string } | undefined;
      if (status === 400 && (cause?.type === 'entity.parse.failed' || /JSON/.test(exception.message))) {
        return { statusCode: 400, message: 'Dữ liệu JSON không hợp lệ' };
      }
      if (status === 413 || cause?.type === 'entity.too.large') {
        return { statusCode: 413, message: this.translate(413, '') };
      }
      if (typeof response === 'string') return { statusCode: status, message: this.translate(status, response) };
      const obj = response as Record<string, unknown>;
      // Lỗi kiểm tra dữ liệu (zod): giữ nguyên formErrors/fieldErrors để giao diện hiện đúng lỗi từng ô.
      if (obj.formErrors || obj.fieldErrors) return { statusCode: status, message: 'Dữ liệu không hợp lệ', ...obj };
      const raw = obj.message;
      const text = Array.isArray(raw) ? raw.join(', ') : typeof raw === 'string' ? raw : '';
      return { statusCode: status, message: this.translate(status, text) };
    }

    // Lỗi của body-parser/multer... có status 4xx và `type`.
    const err = exception as { status?: number; statusCode?: number; type?: string } | null;
    const status = err?.status ?? err?.statusCode;
    if (typeof status === 'number' && status >= 400 && status < 500) {
      if (err?.type === 'entity.too.large') return { statusCode: 413, message: DEFAULT_MESSAGES[413] };
      if (err?.type === 'entity.parse.failed') return { statusCode: 400, message: 'Dữ liệu JSON không hợp lệ' };
      return { statusCode: status, message: DEFAULT_MESSAGES[status] ?? DEFAULT_MESSAGES[400] };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, message: INTERNAL };
  }

  private translate(status: number, message: string): string {
    if (!message || ENGLISH_DEFAULT.test(message.trim())) {
      return DEFAULT_MESSAGES[status] ?? (status >= 500 ? INTERNAL : DEFAULT_MESSAGES[400]);
    }
    // Lỗi 5xx do nghiệp vụ ném ra có chủ ý (vd. 503 chưa cấu hình) thì giữ thông báo; câu nội bộ thì không lộ.
    return message;
  }
}
