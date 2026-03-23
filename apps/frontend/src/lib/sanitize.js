import DOMPurify from 'dompurify'

/**
 * HTML 문자열을 안전하게 sanitize 처리
 * XSS 공격을 방지하기 위해 허용된 태그/속성만 남김
 * @param {string} html - sanitize할 HTML 문자열
 * @returns {string} sanitize된 안전한 HTML 문자열
 */
export const sanitizeHtml = (html) => {
  if (!html) return ''
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'strong', 'i', 'em', 'br', 'p', 'span', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: ['class'],
  })
}
