// Telegram tự biến văn bản thuần thành liên kết (http://…, www.…, a.com) và nhắc tên (@ten). Nội dung do người dùng nhập
// được chèn ký tự rộng-không (U+200B) để các dạng đó không còn được nhận diện, nên không tạo liên kết/mention giả.
export function defang(text: string): string {
  return text
    .replace(/@(?=\S)/g, '@​')
    .replace(/:\/\//g, ':​//')
    .replace(/(\S)\.(?=[A-Za-z0-9])/g, '$1​.')
    .replace(/\bwww​?\./gi, 'www​.');
}
