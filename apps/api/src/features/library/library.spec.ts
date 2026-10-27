import { ConfigService } from '@nestjs/config';
import { libraryAudienceLabel, normalizeSearch } from '@pvh/shared';
import { LocalPrivateStorageService } from '../../infrastructure/storage/local-private-storage.service.js';
import { contentDisposition } from '../../infrastructure/storage/private-storage.service.js';
import { detectPrivateType, newPrivateKey, PRIVATE_KEY, privateTypeByMime } from '../../infrastructure/storage/private-types.js';
import { R2PrivateStorageService } from '../../infrastructure/storage/r2-private-storage.service.js';
import { audienceWhere, canRead, GUEST, type AudienceFacts, type LibraryViewer } from './library-audience.js';

const config = (values: Record<string, unknown>) => ({ get: (key: string) => values[key] }) as unknown as ConfigService<never, true>;

describe('thư viện số: nhận dạng file của kho riêng tư', () => {
  it('PDF, MP3 (ID3 hoặc khung MPEG), MP4, WebM nhận đúng; file khác bị từ chối', () => {
    expect(detectPrivateType(Buffer.from('%PDF-1.7\n%âãÏÓ', 'latin1'))?.mime).toBe('application/pdf');
    expect(detectPrivateType(Buffer.from('ID3\u0004\u0000', 'latin1'))?.mime).toBe('audio/mpeg');
    expect(detectPrivateType(Buffer.from([0xff, 0xfb, 0x90, 0x64]))?.mime).toBe('audio/mpeg');
    expect(detectPrivateType(Buffer.from([0xff, 0xf3, 0x90, 0x64]))?.mime).toBe('audio/mpeg');
    const ftyp = Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'latin1'), Buffer.alloc(16)]);
    expect(detectPrivateType(ftyp)?.mime).toBe('video/mp4');
    // File thực thi, HTML, ZIP (docx) giả đuôi .pdf đều không được nhận.
    for (const fake of ['MZ\u0090\u0000', '<html><script>', 'PK\u0003\u0004']) {
      expect(detectPrivateType(Buffer.from(fake, 'latin1'))).toBeUndefined();
    }
    // Khung ADTS của AAC (layer 00) không phải MP3.
    expect(detectPrivateType(Buffer.from([0xff, 0xf1, 0x50, 0x80]))).toBeUndefined();
  });

  it('khoá object sinh ngẫu nhiên, có tiền tố riêng, không chấp nhận ../ hay tên người dùng', () => {
    const key = newPrivateKey(privateTypeByMime('application/pdf')!);
    expect(key).toMatch(PRIVATE_KEY);
    for (const bad of ['../etc/passwd', 'lib-x.pdf', 'bai-giang.pdf', `${key}/..`, key.replace('lib-', '')]) expect(bad).not.toMatch(PRIVATE_KEY);
  });
});

describe('thư viện số: URL đọc của driver local', () => {
  const store = new LocalPrivateStorageService(config({ PRIVATE_UPLOAD_DIR: 'uploads-private-test', JWT_ACCESS_SECRET: 'x'.repeat(40) }));
  const key = newPrivateKey(privateTypeByMime('audio/mpeg')!);

  it('token đọc đúng chữ ký, đúng thao tác; sửa một ký tự hay dùng token tải lên để đọc đều bị từ chối', async () => {
    const { url, expiresAt } = await store.presignGet({ id: '7', key, mimeType: 'audio/mpeg', download: false, filename: 'Sách nói.mp3' });
    expect(url).toMatch(/^\/library\/files\/7\?token=/);
    expect(expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    const token = new URL(url, 'http://x').searchParams.get('token')!;
    expect(store.verifyToken(token, 'get')).toMatchObject({ id: '7', key, mimeType: 'audio/mpeg' });
    expect(store.verifyToken(token, 'put')).toBeNull();
    expect(store.verifyToken(`${token.slice(0, -1)}${token.endsWith('A') ? 'B' : 'A'}`, 'get')).toBeNull();
    const put = new URL((await store.presignPut({ id: '7', key, mimeType: 'audio/mpeg', size: 10 })).uploadUrl, 'http://x');
    expect(store.verifyToken(put.searchParams.get('token')!, 'get')).toBeNull();
  });

  it('token hết hạn bị từ chối', () => {
    const token = store.signToken({ op: 'get', id: '7', key, mimeType: 'audio/mpeg', exp: Math.floor(Date.now() / 1000) - 1 });
    expect(store.verifyToken(token, 'get')).toBeNull();
  });

  it('tên file tải về an toàn trong header (không chèn được dấu ngoặc kép hay xuống dòng)', () => {
    expect(contentDisposition(false, 'x')).toBe('inline');
    const header = contentDisposition(true, 'Toán 10 "đề"\r\nX-Evil: 1.pdf');
    expect(header).not.toMatch(/[\r\n]/);
    expect(header).toContain(`filename*=UTF-8''${encodeURIComponent('Toán 10 "đề"\r\nX-Evil: 1.pdf')}`);
    expect(header.split('filename="')[1].split('"')[0]).not.toContain('"');
  });

  it('R2: URL đọc là URL GET ký sẵn hết hạn 5 phút, không lộ khoá bí mật', async () => {
    const r2 = new R2PrivateStorageService(
      config({ R2_ACCOUNT_ID: 'a'.repeat(32), R2_ACCESS_KEY_ID: 'AKIATESTKEY', R2_SECRET_ACCESS_KEY: 'bi-mat-khong-duoc-lo' }),
      'pvh-library',
    );
    const { url } = await r2.presignGet({ id: '1', key, mimeType: 'audio/mpeg', download: true, filename: 'a.mp3' });
    const u = new URL(url);
    expect(u.hostname).toBe(`pvh-library.${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    expect(u.searchParams.get('X-Amz-Expires')).toBe('300');
    expect(u.searchParams.get('response-content-disposition')).toMatch(/^attachment;/);
    expect(url).not.toContain('bi-mat-khong-duoc-lo');
  });
});

describe('thư viện số: đối tượng xem', () => {
  const student = (gradeLevel: number, classId: bigint): LibraryViewer => ({ userId: '50', manage: false, staff: false, student: { classId, gradeLevel } });
  const teacher: LibraryViewer = { userId: '60', manage: false, staff: true, student: null };
  const librarian: LibraryViewer = { userId: '70', manage: true, staff: true, student: null };
  const item = (over: Partial<AudienceFacts>): AudienceFacts => ({
    status: 'PUBLISHED',
    audience: 'ALL',
    gradeLevels: [],
    classIds: [],
    submittedBy: 1n,
    ...over,
  });

  it('khách không đọc được gì (phải đăng nhập), dù tài liệu toàn trường', () => {
    expect(canRead(GUEST, item({}))).toBe(false);
    expect(audienceWhere(GUEST)).toEqual({ OR: [{ audience: 'ALL' }] });
  });

  it('học sinh khối 11 không đọc được tài liệu khối 10, lớp khác, hay "chỉ giáo viên"', () => {
    const hs11 = student(11, 5n);
    expect(canRead(hs11, item({}))).toBe(true);
    expect(canRead(hs11, item({ audience: 'GRADE', gradeLevels: [10] }))).toBe(false);
    expect(canRead(hs11, item({ audience: 'GRADE', gradeLevels: [10, 11] }))).toBe(true);
    expect(canRead(hs11, item({ audience: 'CLASS', classIds: [4n] }))).toBe(false);
    expect(canRead(hs11, item({ audience: 'CLASS', classIds: [4n, 5n] }))).toBe(true);
    expect(canRead(hs11, item({ audience: 'TEACHERS_ONLY' }))).toBe(false);
    // Học sinh chưa được xếp lớp: chỉ toàn trường.
    const noClass: LibraryViewer = { ...hs11, student: null };
    expect(canRead(noClass, item({ audience: 'GRADE', gradeLevels: [11] }))).toBe(false);
    expect(JSON.stringify(audienceWhere(hs11), (_k, v: unknown) => (typeof v === 'bigint' ? v.toString() : v))).not.toContain('TEACHERS_ONLY');
  });

  it('nhân sự đọc mọi tài liệu đã đăng; chưa đăng/bị ẩn thì chỉ người gửi và người quản lý', () => {
    expect(canRead(teacher, item({ audience: 'TEACHERS_ONLY' }))).toBe(true);
    expect(canRead(teacher, item({ audience: 'CLASS', classIds: [9n] }))).toBe(true);
    for (const status of ['DRAFT', 'PENDING_REVIEW', 'REJECTED', 'ARCHIVED']) {
      expect(canRead(teacher, item({ status }))).toBe(false);
      expect(canRead(teacher, item({ status, submittedBy: 60n }))).toBe(true);
      expect(canRead(librarian, item({ status }))).toBe(true);
      expect(canRead(student(10, 1n), item({ status }))).toBe(false);
    }
  });
});

describe('thư viện số: tìm không dấu', () => {
  it('bỏ dấu tiếng Việt, đ → d, chữ thường, gộp khoảng trắng', () => {
    expect(normalizeSearch('  Toán   Hình học 10 ')).toBe('toan hinh hoc 10');
    expect(normalizeSearch('Đề ôn tập ĐỊA LÝ')).toBe('de on tap dia ly');
    expect(normalizeSearch('Truyện Kiều – Nguyễn Du')).toBe('truyen kieu – nguyen du');
    expect(normalizeSearch('toan')).toBe(normalizeSearch('Toán'));
  });

  it('nhãn đối tượng xem', () => {
    expect(libraryAudienceLabel('GRADE', [10, 11], [])).toBe('Khối 10, 11');
    expect(libraryAudienceLabel('CLASS', [], ['10A1'])).toBe('Lớp 10A1');
    expect(libraryAudienceLabel('TEACHERS_ONLY', [], [])).toBe('Chỉ giáo viên, nhân sự');
  });
});
