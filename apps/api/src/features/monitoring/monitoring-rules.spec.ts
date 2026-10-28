import { deviceOf } from '../../common/utils/device.js';
import {
  crossesThreshold,
  errorFingerprint,
  formatBytes,
  healthTransition,
  routePattern,
  sanitizeErrorMessage,
  statusFromProbe,
  storagePercent,
} from './monitoring-rules.js';

describe('trung tâm giám sát – hàm thuần (bước 26)', () => {
  it('làm sạch thông điệp lỗi: bỏ chuỗi kết nối có mật khẩu, URL ký sẵn, JWT, token bot, email, chuỗi giống khoá', () => {
    const raw = [
      'connect ECONNREFUSED postgresql://pvh:matkhau-bi-mat@db:5432/pvh',
      'GET https://acc.r2.cloudflarestorage.com/lib-1.pdf?X-Amz-Signature=abc123&X-Amz-Credential=KEY',
      'jwt eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.c2lnbmF0dXJl',
      'bot 123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsawQ',
      'user admin@pvh.edu.vn',
      'key sk-ant-api03-abcdefghijklmnopqrstuvwxyz0123456789',
    ].join(' | ');
    const clean = sanitizeErrorMessage(raw);
    for (const secret of ['matkhau-bi-mat', 'X-Amz-Signature', 'abc123', 'eyJhbGci', 'AAHdqTcv', 'admin@pvh.edu.vn', 'sk-ant-api03']) {
      expect(clean).not.toContain(secret);
    }
    expect(clean).toContain('ECONNREFUSED');
    expect(clean).toContain('<url>');
  });

  it('thông điệp chỉ giữ dòng đầu (không stack), tối đa 300 ký tự, rỗng thì có câu mặc định', () => {
    expect(sanitizeErrorMessage('Lỗi A\n    at foo (file.ts:1:1)')).toBe('Lỗi A');
    expect(sanitizeErrorMessage('x '.repeat(400)).length).toBeLessThanOrEqual(300);
    expect(sanitizeErrorMessage('')).toBe('Lỗi không có mô tả');
  });

  it('mẫu route: id số, uuid, chuỗi hex dài → :id; bỏ query', () => {
    expect(routePattern('get', '/api/posts/123/approve?x=1')).toBe('GET /api/posts/:id/approve');
    expect(routePattern('POST', '/api/scores/import/0b7c1d2e-3f40-4a5b-8c6d-7e8f9a0b1c2d/confirm')).toBe('POST /api/scores/import/:id/confirm');
    expect(routePattern('GET', '/api/media/files/abcdef0123456789abcd')).toBe('GET /api/media/files/:id');
  });

  it('dấu vân tay: cùng lỗi khác số (id, cổng) chung một nhóm; khác route hay mã thì khác nhóm', () => {
    const a = errorFingerprint('HTTP', 'GET /posts/:id', 500, 'Không tìm thấy bản ghi 12');
    const b = errorFingerprint('HTTP', 'GET /posts/:id', 500, 'Không tìm thấy bản ghi 98');
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(errorFingerprint('HTTP', 'GET /tasks/:id', 500, 'Không tìm thấy bản ghi 12')).not.toBe(a);
    expect(errorFingerprint('HTTP', 'GET /posts/:id', 503, 'Không tìm thấy bản ghi 12')).not.toBe(a);
    expect(errorFingerprint('JOB', 'GET /posts/:id', 500, 'Không tìm thấy bản ghi 12')).not.toBe(a);
  });

  it('trạng thái từ kết quả kiểm tra: lỗi → DOWN, chậm quá ngưỡng → DEGRADED', () => {
    expect(statusFromProbe(false, 10)).toBe('DOWN');
    expect(statusFromProbe(true, 100)).toBe('OK');
    expect(statusFromProbe(true, 2500)).toBe('DEGRADED');
  });

  it('chuyển trạng thái: chỉ báo khi vừa ngừng hoặc vừa hồi phục; không đổi thì không báo lại; OFF không bao giờ báo', () => {
    expect(healthTransition('OK', 'DOWN')).toBe('down');
    expect(healthTransition(null, 'DOWN')).toBe('down');
    expect(healthTransition('DEGRADED', 'DOWN')).toBe('down');
    expect(healthTransition('DOWN', 'DOWN')).toBeNull();
    expect(healthTransition('DOWN', 'OK')).toBe('recovered');
    expect(healthTransition('DOWN', 'DEGRADED')).toBe('recovered');
    expect(healthTransition('OK', 'OK')).toBeNull();
    expect(healthTransition('OK', 'DEGRADED')).toBeNull();
    expect(healthTransition('DOWN', 'OFF')).toBeNull();
    expect(healthTransition('OFF', 'OK')).toBeNull();
  });

  it('chống báo trùng theo ngưỡng: chỉ đúng lần chạm ngưỡng mới báo, vượt tiếp không báo lại', () => {
    const fired = Array.from({ length: 30 }, (_, i) => crossesThreshold(i + 1, 10)).filter(Boolean);
    expect(fired).toHaveLength(1);
    expect(crossesThreshold(10, 10)).toBe(true);
    expect(crossesThreshold(11, 10)).toBe(false);
    expect(crossesThreshold(1, 0)).toBe(false);
  });

  it('phần trăm dung lượng và định dạng byte', () => {
    expect(storagePercent(8 * 1024 ** 3, 10 * 1024 ** 3)).toBe(80);
    expect(storagePercent(1, 0)).toBe(0);
    expect(formatBytes(1536)).toBe('2 KB');
    expect(formatBytes(5 * 1024 ** 2)).toBe('5.0 MB');
    expect(formatBytes(2.5 * 1024 ** 3)).toBe('2.50 GB');
  });

  it('thiết bị từ User-Agent: bỏ số phiên bản để cập nhật trình duyệt không bị coi là lạ', () => {
    const chrome130 = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
    const chrome131 = chrome130.replace('130.0.0.0', '131.0.0.0');
    expect(deviceOf(chrome130)).toBe('Chrome trên Windows');
    expect(deviceOf(chrome131)).toBe(deviceOf(chrome130));
    expect(deviceOf('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1')).toBe('Safari trên iOS');
    expect(deviceOf(undefined)).toBe('không rõ');
  });
});
