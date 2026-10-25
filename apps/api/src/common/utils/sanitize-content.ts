import sanitizeHtml from 'sanitize-html';

// Chống XSS cho nội dung bài viết (HTML từ trình soạn thảo): chỉ giữ thẻ/thuộc tính trong danh sách cho phép.
// Mọi script, thuộc tính sự kiện (onerror...), style, iframe và giao thức javascript:/data: đều bị loại.
const OPTIONS: sanitizeHtml.IOptions = {
  allowedTags: [
    'p', 'br', 'hr', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code',
    'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'img',
  ],
  allowedAttributes: {
    a: ['href', 'title', 'target', 'rel'],
    img: ['src', 'alt', 'title', 'width', 'height'],
  },
  allowedSchemes: ['http', 'https', 'mailto'],
  allowedSchemesByTag: { img: ['http', 'https'] },
  allowProtocolRelative: false,
  // Thẻ không được phép bị bỏ cả nội dung bên trong nếu là script/style.
  disallowedTagsMode: 'discard',
  transformTags: {
    a: sanitizeHtml.simpleTransform('a', {
      rel: 'noopener noreferrer nofollow',
    }),
  },
};

export function sanitizeContent(html: string): string {
  return sanitizeHtml(html, OPTIONS).trim();
}

// Văn bản thuần (tóm tắt, tên chuyên mục): bỏ hết thẻ HTML.
export function stripHtml(text: string): string {
  return sanitizeHtml(text, { allowedTags: [], allowedAttributes: {} })
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .trim();
}

// Bài không có chữ và không có ảnh coi như rỗng.
export function isBlankContent(html: string): boolean {
  return !/<img\b/i.test(html) && stripHtml(html).replace(/\s+/g, '') === '';
}
