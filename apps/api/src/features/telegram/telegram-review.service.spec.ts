import { defang, excerptOf, htmlToText, isPublicHttps } from './telegram-review.service.js';

describe('defang – không tạo liên kết/mention giả trong văn bản thuần', () => {
  it('chèn ký tự rộng-không để @ten, http://…, www.… và tên miền không còn được nhận diện', () => {
    const out = defang('Liên hệ @hieutruong tại http://evil.example hoặc www.evil.com/abc, evil.vn');
    expect(out).not.toMatch(/@[A-Za-z]/);
    expect(out).not.toContain('://');
    expect(out).not.toMatch(/www\.[a-z]/i);
    expect(out).not.toMatch(/evil\.(example|com|vn)/);
    // Đọc vẫn nguyên văn khi bỏ ký tự rộng-không.
    expect(out.replaceAll('​', '')).toBe('Liên hệ @hieutruong tại http://evil.example hoặc www.evil.com/abc, evil.vn');
  });

  it('văn bản thường không đổi (dấu chấm cuối câu, số, tiếng Việt)', () => {
    const text = 'Xin chào các em. Hôm nay học Toán lúc 7 giờ. Kết thúc.';
    expect(defang(text)).toBe(text);
    expect(defang('Điểm 8,5 và Đỗ Văn A')).toBe('Điểm 8,5 và Đỗ Văn A');
  });
});

describe('htmlToText / excerptOf', () => {
  it('giữ xuống dòng theo đoạn, danh sách có dấu đầu dòng, giải mã thực thể, bỏ thẻ', () => {
    const html = '<h2>Tiêu đề</h2><p>Dòng một<br>dòng hai &amp; ba</p><ul><li>Mục A</li><li>Mục B</li></ul><p>3 &lt; 5</p>';
    expect(htmlToText(html)).toBe('Tiêu đề\nDòng một\ndòng hai & ba\n• Mục A\n• Mục B\n3 < 5');
  });

  it('cắt ở giới hạn ký tự kèm dấu …, không cắt khi ngắn hơn', () => {
    expect(excerptOf('<p>ngắn</p>')).toBe('ngắn');
    const long = excerptOf(`<p>${'a'.repeat(2000)}</p>`, 700);
    expect(long).toHaveLength(701);
    expect(long.endsWith('…')).toBe(true);
  });

  it('thẻ script/iframe/onerror trong nội dung không lọt ra văn bản', () => {
    const text = htmlToText('<p>An toàn</p><script>alert(1)</script><img src=x onerror=alert(2)>');
    expect(text).not.toMatch(/script|alert|onerror/);
  });
});

describe('isPublicHttps – chỉ dùng nút URL khi Telegram chấp nhận', () => {
  it('https công khai thì có, localhost/IP nội bộ/http thì không', () => {
    expect(isPublicHttps('https://truong.example.vn/admin/bai-viet/1')).toBe(true);
    for (const url of [
      'http://truong.example.vn/x',
      'https://localhost:3000/x',
      'http://localhost:3000/x',
      'https://127.0.0.1/x',
      'https://192.168.1.5/x',
      'https://10.0.0.2/x',
      'https://172.20.1.1/x',
      'https://may-chu.local/x',
      'https://[::1]/x',
      'https://noidia/x',
      'khong-phai-url',
    ]) {
      expect(isPublicHttps(url)).toBe(false);
    }
  });
});
