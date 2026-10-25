import { isBlankContent, sanitizeContent, stripHtml } from './sanitize-content.js';

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
    const out = sanitizeContent(html);
    expect(out).not.toMatch(/<script|<iframe|<object|<embed|<svg|<style|<form|<input|<meta|<base|<link|<math/i);
    expect(out).not.toMatch(/\son\w+\s*=/i);
    expect(out).not.toMatch(/javascript:|vbscript:|data:/i);
    expect(out).not.toMatch(/style\s*=/i);
    expect(out).not.toMatch(/src="\/\//);
  });

  it('giữ định dạng hợp lệ và thêm rel an toàn cho liên kết', () => {
    const out = sanitizeContent(
      '<h2>Tiêu đề</h2><p>Đoạn <strong>đậm</strong> <em>nghiêng</em> <a href="https://pvh.edu.vn" target="_blank">liên kết</a></p>' +
        '<ul><li>Một</li></ul><img src="https://pvh.edu.vn/a.png" alt="ảnh">',
    );
    expect(out).toContain('<h2>Tiêu đề</h2>');
    expect(out).toContain('<strong>đậm</strong>');
    expect(out).toContain('href="https://pvh.edu.vn"');
    expect(out).toContain('rel="noopener noreferrer nofollow"');
    expect(out).toContain('<img src="https://pvh.edu.vn/a.png" alt="ảnh" />');
  });

  it('mailto được giữ, tel và ftp bị bỏ', () => {
    expect(sanitizeContent('<a href="mailto:a@pvh.edu.vn">mail</a>')).toContain('mailto:a@pvh.edu.vn');
    expect(sanitizeContent('<a href="ftp://x.example/f">ftp</a>')).not.toContain('ftp:');
  });
});

describe('stripHtml và isBlankContent', () => {
  it('stripHtml bỏ thẻ, giữ chữ; chuỗi trả về dùng làm văn bản thuần (không phải HTML)', () => {
    expect(stripHtml('<b>Họp</b> <script>alert(1)</script>phụ huynh')).toBe('Họp phụ huynh');
    expect(stripHtml('a &amp; b')).toBe('a & b');
  });

  it('bài chỉ có mã độc hoặc khoảng trắng coi là rỗng, bài có ảnh thì không', () => {
    expect(isBlankContent(sanitizeContent('<script>alert(1)</script>'))).toBe(true);
    expect(isBlankContent('<p> </p>')).toBe(true);
    expect(isBlankContent('<img src="https://pvh.edu.vn/a.png">')).toBe(false);
  });
});
