import { isBlankContent, sanitizeContent, stripHtml } from './sanitize-content.js';

// Giả lập StorageService.mediaKindOfUrl: chỉ file của kho cdn.pvh.edu.vn là của hệ thống.
const mediaKindOfUrl = (url: string) => {
  const m = /^https:\/\/cdn\.pvh\.edu\.vn\/[0-9a-f-]{36}\.(png|jpg|mp4|webm)$/.exec(url);
  if (!m) return null;
  return m[1] === 'mp4' || m[1] === 'webm' ? ('VIDEO' as const) : ('IMAGE' as const);
};
const ID = '0b9c1d5e-1111-4222-8333-444455556666';
const IMG = `https://cdn.pvh.edu.vn/${ID}.png`;
const VID = `https://cdn.pvh.edu.vn/${ID}.mp4`;
const clean = (html: string) => sanitizeContent(html, mediaKindOfUrl);

// Các kiểu tấn công XSS phổ biến trong nội dung bài viết (HTML từ trình soạn thảo).
const PAYLOADS: [string, string][] = [
  ['thẻ script', '<script>alert(1)</script><p>an toàn</p>'],
  ['script viết hoa và lồng nhau', '<ScRiPt>alert(1)</sCrIpT><scr<script>ipt>alert(2)</scr</script>ipt>'],
  ['onerror trên img', '<img src="x" onerror="alert(1)">'],
  ['onclick trên p', '<p onclick="alert(1)">bấm</p>'],
  ['onmouseover trên a', '<a href="https://a.vn" onmouseover="alert(1)">a</a>'],
  ['javascript: trong href', '<a href="javascript:alert(1)">bấm</a>'],
  ['javascript: có ký tự ẩn', '<a href="java\tscript:alert(1)">bấm</a>'],
  ['javascript: mã hoá thực thể', '<a href="&#106;avascript:alert(1)">bấm</a>'],
  ['data: HTML trong href', '<a href="data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==">bấm</a>'],
  ['data: trong src ảnh', '<img src="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+">'],
  ['vbscript:', '<a href="vbscript:msgbox(1)">bấm</a>'],
  ['iframe', '<iframe src="https://evil.example"></iframe>'],
  ['object/embed', '<object data="x.swf"></object><embed src="x.swf">'],
  ['svg onload', '<svg onload="alert(1)"><circle/></svg>'],
  ['style và thuộc tính style', '<style>body{background:url(javascript:alert(1))}</style><p style="background:url(javascript:alert(1))">x</p>'],
  ['form và input', '<form action="https://evil.example"><input name="pw"></form>'],
  ['meta refresh', '<meta http-equiv="refresh" content="0;url=https://evil.example">'],
  ['base', '<base href="https://evil.example/">'],
  ['link stylesheet', '<link rel="stylesheet" href="https://evil.example/x.css">'],
  ['math/mXSS', '<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>'],
  ['URL tương đối giao thức (//)', '<img src="//evil.example/x.png">'],
];

describe('sanitizeContent – chống XSS', () => {
  it.each(PAYLOADS)('loại bỏ %s', (_name, html) => {
    const out = clean(html);
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|<svg|<style|<form|<input|<meta|<base|<link|<math/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:|vbscript:|data:/i);
    expect(out).not.toMatch(/style\s*=/i);
    expect(out).not.toMatch(/src="\/\//);
  });

  it('giữ định dạng hợp lệ và thêm rel an toàn cho liên kết', () => {
    const out = clean(
      '<h2>Tiêu đề</h2><p>Đoạn <strong>đậm</strong> <em>nghiêng</em> <a href="https://pvh.edu.vn" target="_blank">liên kết</a></p>' +
        '<ul><li>Một</li></ul><img src="' + IMG + '" alt="ảnh">',
    );
    expect(out).toContain('<h2>Tiêu đề</h2>');
    expect(out).toContain('<strong>đậm</strong>');
    expect(out).toContain('href="https://pvh.edu.vn"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain(`<img src="${IMG}" alt="ảnh" loading="lazy" decoding="async" />`);
  });

  it('mailto được giữ, tel và ftp bị bỏ', () => {
    expect(clean('<a href="mailto:a@pvh.edu.vn">mail</a>')).toContain('mailto:a@pvh.edu.vn');
    expect(clean('<a href="ftp://x.example/f">ftp</a>')).not.toContain('ftp:');
  });
});

describe('sanitizeContent – ảnh và video', () => {
  it('ảnh ngoài hệ thống bị loại, ảnh của hệ thống được giữ', () => {
    expect(clean('<img src="https://evil.example/a.png">')).toBe('');
    expect(clean('<img src="https://pvh.edu.vn/a.png">')).toBe('');
    expect(clean(`<img src="${VID}">`)).toBe(''); // video không được chèn bằng thẻ img
    expect(clean(`<img src="${IMG}">`)).toContain(IMG);
  });

  it('video của hệ thống được giữ kèm controls và preload=metadata', () => {
    const out = clean(`<video src="${VID}" autoplay onplay="alert(1)"></video>`);
    expect(out).toContain(`src="${VID}"`);
    expect(out).toContain('controls');
    expect(out).toContain('preload="metadata"');
    expect(out).not.toMatch(/autoplay|onplay/i);
    expect(clean(`<video controls><source src="${VID}" type="video/mp4"></video>`)).toContain(`<source src="${VID}"`);
  });

  it.each([
    ['video từ host lạ', '<video src="https://evil.example/v.mp4"></video>'],
    ['video trỏ tới ảnh của hệ thống', `<video src="${IMG}"></video>`],
    ['source từ host lạ', '<video><source src="https://evil.example/v.mp4"></video>'],
    ['javascript: trong video', '<video src="javascript:alert(1)"></video>'],
    ['data: trong video', '<video src="data:video/mp4;base64,AAAA"></video>'],
    ['onerror trên video', `<video src="${VID}" onerror="alert(1)" onloadstart="alert(2)"></video>`],
    ['onerror trên source', `<video><source src="${VID}" onerror="alert(1)"></video>`],
    ['poster javascript', `<video src="${VID}" poster="javascript:alert(1)"></video>`],
    ['audio', `<audio src="${VID}" onerror="alert(1)"></audio>`],
    ['iframe trỏ tới video', `<iframe src="${VID}"></iframe>`],
    ['video // giao thức tương đối', '<video src="//evil.example/v.mp4"></video>'],
  ])('loại bỏ hoặc vô hiệu: %s', (_name, html) => {
    const out = clean(html);
    expect(out).not.toMatch(/evil\.example|javascript:|data:|<iframe|<audio|poster/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/<video(?![^>]*src=)[^>]*>\s*<\/video>/i); // không để video rỗng
  });

  it('bài chỉ có video không bị coi là rỗng', () => {
    expect(isBlankContent(clean(`<video src="${VID}"></video>`))).toBe(false);
  });
});

describe('stripHtml và isBlankContent', () => {
  it('stripHtml bỏ thẻ, giữ chữ; chuỗi trả về dùng làm văn bản thuần (không phải HTML)', () => {
    expect(stripHtml('<b>Họp</b> <script>alert(1)</script>phụ huynh')).toBe('Họp phụ huynh');
    expect(stripHtml('a &amp; b')).toBe('a & b');
  });

  it('bài chỉ có mã độc hoặc khoảng trắng coi là rỗng, bài có ảnh thì không', () => {
    expect(isBlankContent(clean('<script>alert(1)</script>'))).toBe(true);
    expect(isBlankContent('<p> </p>')).toBe(true);
    expect(isBlankContent('<img src="https://pvh.edu.vn/a.png">')).toBe(false);
  });
});
