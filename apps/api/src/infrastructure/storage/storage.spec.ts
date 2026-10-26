import { ConfigService } from '@nestjs/config';
import { LocalStorageService } from './local-storage.service.js';
import { detectMediaType, kindOfKey, newStorageKey, STORAGE_KEY, mediaTypeByMime } from './media-types.js';
import { R2StorageService } from './r2-storage.service.js';

const ID = '0b9c1d5e-1111-4222-8333-444455556666';
const ftyp = (brand: string) =>
  Buffer.concat([Buffer.from([0, 0, 0, 0x18]), Buffer.from(`ftyp${brand}`, 'latin1'), Buffer.alloc(32)]);
const ebml = (docType: string) =>
  Buffer.concat([Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84]), Buffer.from(docType, 'latin1'), Buffer.alloc(32)]);

const config = (values: Record<string, unknown>) =>
  ({ get: (key: string) => values[key] }) as unknown as ConfigService<never, true>;

const R2_ENV = {
  R2_ACCOUNT_ID: 'a'.repeat(32),
  R2_ACCESS_KEY_ID: 'AKIATESTKEY',
  R2_SECRET_ACCESS_KEY: 'super-secret-value-khong-duoc-lo',
  R2_BUCKET: 'pvh',
  R2_PUBLIC_BASE_URL: 'https://media.pvh.edu.vn',
};

describe('nhận dạng loại file bằng magic bytes', () => {
  it('MP4: chỉ nhận các brand của MP4, không nhận MOV/HEIC', () => {
    for (const brand of ['isom', 'iso2', 'mp42', 'mp41', 'avc1', 'M4V ', 'dash']) {
      expect(detectMediaType(ftyp(brand))?.mime).toBe('video/mp4');
    }
    for (const brand of ['qt  ', 'heic', 'mif1', '3gp4']) expect(detectMediaType(ftyp(brand))).toBeUndefined();
  });

  it('WebM: EBML với DocType webm; Matroska (mkv) bị loại', () => {
    expect(detectMediaType(ebml('webm'))?.mime).toBe('video/webm');
    expect(detectMediaType(ebml('matroska'))).toBeUndefined();
  });

  it('ảnh JPEG/PNG/GIF/WebP được nhận, SVG/HTML/rỗng/quá ngắn không', () => {
    expect(detectMediaType(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0]))?.mime).toBe('image/jpeg');
    expect(detectMediaType(Buffer.from('GIF89a....'))?.mime).toBe('image/gif');
    expect(detectMediaType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WEBPVP8 ')]))?.mime).toBe('image/webp');
    expect(detectMediaType(Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]))).toBeUndefined();
    for (const bad of ['<svg xmlns="http://www.w3.org/2000/svg"/>', '<html><script>1</script>', '', 'ft']) {
      expect(detectMediaType(Buffer.from(bad))).toBeUndefined();
    }
  });
});

describe('khoá object', () => {
  it('sinh ngẫu nhiên: UUID + đuôi theo loại, không chứa tên file người dùng', () => {
    const a = newStorageKey(mediaTypeByMime('video/mp4')!);
    const b = newStorageKey(mediaTypeByMime('video/mp4')!);
    expect(a).toMatch(/^[0-9a-f-]{36}\.mp4$/);
    expect(a).not.toBe(b);
    expect(kindOfKey(a)).toBe('VIDEO');
    expect(kindOfKey(`${ID}.png`)).toBe('IMAGE');
  });

  it('chỉ nhận khoá đúng định dạng (chặn ../, đuôi lạ, svg)', () => {
    for (const bad of ['../x.png', `${ID}xpng`, `${ID}.svg`, `${ID}.png/../a`, 'abc.png', `${ID}.PNG`, `${ID}.mov`, '']) {
      expect(STORAGE_KEY.test(bad)).toBe(false);
      expect(kindOfKey(bad)).toBeNull();
    }
  });
});

describe('LocalStorageService', () => {
  const local = new LocalStorageService(
    config({
      UPLOAD_DIR: 'uploads-test',
      JWT_ACCESS_SECRET: 'x'.repeat(40),
      API_PORT: 4000,
      WEB_ORIGIN: 'http://localhost:3000',
    }),
  );

  it('dựng và nhận lại URL; chỉ nhận origin của hệ thống', () => {
    expect(local.publicUrl(`${ID}.png`)).toBe(`/media/files/${ID}.png`);
    expect(local.keyFromUrl(`/media/files/${ID}.png`)).toBe(`${ID}.png`);
    expect(local.keyFromUrl(`http://localhost:4000/media/files/${ID}.mp4`)).toBe(`${ID}.mp4`);
    expect(local.keyFromUrl(`http://localhost:4000/api/media/files/${ID}.png`)).toBe(`${ID}.png`);
    expect(local.keyFromUrl(`http://localhost:4000/api/api/media/files/${ID}.png`)).toBeNull();
    expect(local.keyFromUrl(`https://evil.example/media/files/${ID}.png`)).toBeNull();
    expect(local.keyFromUrl(`//evil.example/media/files/${ID}.png`)).toBeNull();
    expect(local.keyFromUrl('/media/files/../.env')).toBeNull();
    expect(local.mediaKindOfUrl(`http://localhost:4000/media/files/${ID}.mp4`)).toBe('VIDEO');
    expect(local.mediaKindOfUrl(`/media/files/${ID}.webp`)).toBe('IMAGE');
  });

  it('token tải lên: đúng chữ ký thì nhận, sửa/hết hạn/khoá lạ thì không', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;
    const claims = { id: '7', key: `${ID}.png`, mimeType: 'image/png', size: 10, exp };
    const token = local.signToken(claims);
    expect(local.verifyToken(token)).toEqual(claims);
    expect(local.verifyToken(`${token}x`)).toBeNull();
    expect(local.verifyToken(token.replace(/^./, (c) => (c === 'a' ? 'b' : 'a')))).toBeNull();
    expect(local.verifyToken(local.signToken({ ...claims, exp: exp - 120 }))).toBeNull();
    expect(local.verifyToken(local.signToken({ ...claims, key: '../x.png' }))).toBeNull();
    expect(local.verifyToken('')).toBeNull();
    expect(() => local.path('../x.png')).toThrow();
    // Khoá ký khác thì token không dùng chéo được.
    const other = new LocalStorageService(config({ UPLOAD_DIR: 'x', JWT_ACCESS_SECRET: 'y'.repeat(40), API_PORT: 4000, WEB_ORIGIN: 'http://localhost:3000' }));
    expect(other.verifyToken(token)).toBeNull();
  });
});

describe('R2StorageService (không gọi mạng)', () => {
  const r2 = new R2StorageService(config(R2_ENV));

  it('dựng URL công khai và nhận lại khoá; host khác bị loại', () => {
    expect(r2.publicUrl(`${ID}.mp4`)).toBe(`https://media.pvh.edu.vn/${ID}.mp4`);
    expect(r2.keyFromUrl(`https://media.pvh.edu.vn/${ID}.mp4`)).toBe(`${ID}.mp4`);
    expect(r2.mediaKindOfUrl(`https://media.pvh.edu.vn/${ID}.mp4`)).toBe('VIDEO');
    expect(r2.keyFromUrl(`https://media.pvh.edu.vn.evil.example/${ID}.mp4`)).toBeNull();
    expect(r2.keyFromUrl(`https://evil.example/${ID}.mp4`)).toBeNull();
    expect(r2.keyFromUrl(`https://media.pvh.edu.vn/${ID}.mp4?x=1`)).toBeNull();
    expect(r2.keyFromUrl(`/media/files/${ID}.png`)).toBeNull();
  });

  it('presign: URL của đúng bucket, ký loại và kích thước, hết hạn 10 phút, không lộ bí mật', async () => {
    const out = await r2.presignPut({ id: '1', key: `${ID}.png`, mimeType: 'image/png', size: 1234 });
    const url = new URL(out.uploadUrl);
    expect(url.hostname).toContain(`${'a'.repeat(32)}.r2.cloudflarestorage.com`);
    expect(url.pathname).toContain(`${ID}.png`);
    expect(url.searchParams.get('X-Amz-Expires')).toBe('600');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
    const signed = url.searchParams.get('X-Amz-SignedHeaders') ?? '';
    expect(signed).toContain('content-type');
    expect(signed).toContain('content-length');
    expect(out.headers).toEqual({ 'Content-Type': 'image/png' });
    expect(out.uploadUrl).not.toContain(R2_ENV.R2_SECRET_ACCESS_KEY);
    expect(JSON.stringify(out)).not.toContain(R2_ENV.R2_SECRET_ACCESS_KEY);
  });

  it('thiếu một biến R2 thì không khởi tạo được', () => {
    expect(() => new R2StorageService(config({ ...R2_ENV, R2_PUBLIC_BASE_URL: undefined }))).toThrow(/R2_PUBLIC_BASE_URL/);
  });
});
