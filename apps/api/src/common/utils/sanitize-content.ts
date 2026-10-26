import sanitizeHtml from 'sanitize-html';

// Cho biết một URL có phải ảnh/video do hệ thống lưu (StorageService.mediaKindOfUrl) và thuộc loại nào.
export type MediaKindOfUrl = (url: string) => 'IMAGE' | 'VIDEO' | null;

// Chống XSS cho nội dung bài viết (HTML từ trình soạn thảo): chỉ giữ thẻ/thuộc tính trong danh sách cho phép.
// Mọi script, thuộc tính sự kiện (onerror...), style, iframe và giao thức javascript:/data: đều bị loại.
// <img> chỉ nhận ảnh, <video>/<source> chỉ nhận video của chính hệ thống (đúng host R2 hoặc API local).
function options(mediaKindOfUrl: MediaKindOfUrl): sanitizeHtml.IOptions {
  const owns = (src: string | undefined, kind: 'IMAGE' | 'VIDEO') => !!src && mediaKindOfUrl(src) === kind;
  return {
    allowedTags: [
      'p', 'br', 'hr', 'h2', 'h3', 'h4', 'blockquote', 'pre', 'code',
      'strong', 'b', 'em', 'i', 'u', 's', 'ul', 'ol', 'li', 'a', 'img', 'video', 'source',
    ],
    allowedAttributes: {
      a: ['href', 'title', 'target', 'rel'],
      img: ['src', 'alt', 'title', 'width', 'height', 'loading', 'decoding'],
      video: ['src', 'controls', 'preload', 'width', 'height', 'playsinline'],
      source: ['src', 'type'],
    },
    allowedSchemes: ['http', 'https', 'mailto'],
    allowedSchemesByTag: { img: ['http', 'https'], video: ['http', 'https'], source: ['http', 'https'] },
    allowProtocolRelative: false,
    // Thẻ không được phép bị bỏ cả nội dung bên trong nếu là script/style.
    disallowedTagsMode: 'discard',
    transformTags: {
      a: sanitizeHtml.simpleTransform('a', {
        rel: 'noopener noreferrer nofollow',
      }),
      // Ảnh tải lười để trang bài có nhiều ảnh không nặng trên điện thoại.
      img: sanitizeHtml.simpleTransform('img', { loading: 'lazy', decoding: 'async' }),
      // Video luôn có nút điều khiển và chỉ tải phần đầu (siêu dữ liệu) cho tới khi người xem bấm phát.
      video: sanitizeHtml.simpleTransform('video', { controls: '', preload: 'metadata', playsinline: '' }),
    },
    exclusiveFilter: (frame) => {
      if (frame.tag === 'img') return !owns(frame.attribs.src, 'IMAGE');
      if (frame.tag === 'source') return !owns(frame.attribs.src, 'VIDEO');
      // <video src> phải trỏ tới video của hệ thống; <video> không có src thì dựa vào các <source> bên trong.
      if (frame.tag === 'video') return !!frame.attribs.src && !owns(frame.attribs.src, 'VIDEO');
      return false;
    },
  };
}

export function sanitizeContent(html: string, mediaKindOfUrl: MediaKindOfUrl): string {
  const out = sanitizeHtml(html, options(mediaKindOfUrl)).trim();
  // <video> không còn nguồn nào (src hoặc <source> đều bị loại) thì bỏ hẳn.
  return out.replace(/<video\b(?![^>]*\bsrc=)[^>]*>\s*<\/video>/gi, '');
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
  return !/<(img|video)\b/i.test(html) && stripHtml(html).replace(/\s+/g, '') === '';
}
