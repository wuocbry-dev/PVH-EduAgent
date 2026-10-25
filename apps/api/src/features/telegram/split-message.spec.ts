import { splitMessage, TELEGRAM_MAX_LENGTH } from './split-message.js';

describe('splitMessage', () => {
  it('tin ngắn giữ nguyên, tin rỗng không gửi', () => {
    expect(splitMessage('Xin chào')).toEqual(['Xin chào']);
    expect(splitMessage('   \n ')).toEqual([]);
  });

  it('tin dài quá 4096 ký tự được chia, mỗi phần không vượt giới hạn và không mất nội dung', () => {
    const line = 'Hạn chót nộp kế hoạch tổ chuyên môn tuần này.';
    const text = Array.from({ length: 300 }, (_, i) => `${i}. ${line}`).join('\n');
    const parts = splitMessage(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts) expect(Array.from(p).length).toBeLessThanOrEqual(TELEGRAM_MAX_LENGTH);
    expect(parts.join('\n')).toBe(text);
  });

  it('ưu tiên cắt ở xuống dòng, không có thì cắt ở khoảng trắng hoặc cắt cứng', () => {
    expect(splitMessage('aaaa\nbbbb cc', 6)).toEqual(['aaaa', 'bbbb', 'cc']);
    expect(splitMessage('abcdefghij', 4)).toEqual(['abcd', 'efgh', 'ij']);
  });

  it('không cắt đôi emoji', () => {
    const parts = splitMessage('😀'.repeat(5), 2);
    expect(parts).toEqual(['😀😀', '😀😀', '😀']);
  });
});
