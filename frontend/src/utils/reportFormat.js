/**
 * Convert Markdown to sanitized HTML for medical reports.
 * Uses marked for parsing and DOMPurify for XSS-safe output.
 * Enhances output with section cards and keyword-based tinting.
 */
import { marked } from 'marked'
import DOMPurify from 'dompurify'

const ABNORMAL_KEYWORDS = /\b(bulge|bulging|herniation|herniated|stenosis|narrowing|compression|compressed|effacement|impingement|extrusion|sequestration|degenerative|tear|tearing|abnormal|pathology|lesion)\b/i
const NORMAL_KEYWORDS = /\b(normal|unremarkable|no (evidence of|acute|significant)|intact|preserved|mild)\b/i

// Configure marked for clean, simple medical report output (no GFM quirks)
marked.setOptions({
  gfm: false,
  breaks: true,
  headerIds: false,
  mangle: false,
})

/**
 * Convert markdown or existing HTML to safe HTML for display.
 * @param {string} content - Markdown or HTML string from API
 * @returns {Promise<string>} Sanitized HTML
 */
export async function markdownToHtmlAsync(content) {
  if (typeof content !== 'string' || !content.trim()) return ''
  const trimmed = content.trim()
  let raw
  if (trimmed.startsWith('<')) {
    raw = trimmed
  } else {
    raw = await marked.parse(trimmed)
  }
  const sanitized = DOMPurify.sanitize(raw, {
    ALLOWED_TAGS: [
      'h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u',
      'ul', 'ol', 'li', 'span', 'div', 'blockquote', 'hr',
    ],
    ALLOWED_ATTR: ['class'],
  })
  return enhanceReportHtml(sanitized)
}

/**
 * Wrap major sections (FINDINGS, IMPRESSION) in cards and add keyword-based tinting for level blocks.
 * Safe to run on already-sanitized HTML.
 */
export function enhanceReportHtml(html) {
  if (typeof html !== 'string' || !html.trim()) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const body = doc.body

  // Wrap content between h2s in section cards (FINDINGS / IMPRESSION)
  const h2s = Array.from(body.querySelectorAll('h2'))
  h2s.forEach((h2) => {
    const title = (h2.textContent || '').trim().toUpperCase()
    let wrapperClass = null
    if (title.includes('IMPRESSION') || title.includes('CONCLUSION')) wrapperClass = 'report-section-impression'
    else if (title.includes('FINDINGS') || title.includes('FINDING')) wrapperClass = 'report-section-findings'
    if (!wrapperClass) return
    const wrapper = doc.createElement('div')
    wrapper.className = wrapperClass
    const parent = h2.parentNode
    const toMove = []
    let next = h2.nextElementSibling
    while (next) {
      if (next.tagName === 'H2') break
      toMove.push(next)
      next = next.nextElementSibling
    }
    parent.insertBefore(wrapper, h2)
    wrapper.appendChild(h2)
    toMove.forEach((el) => wrapper.appendChild(el))
  })

  // Add level tinting: paragraphs/lists that look like level findings (contain L1-L2 etc.)
  const levelPattern = /\b(L[1-5]-L[2-5]|L[1-5]-S1)\b/i
  const walk = (node) => {
    if (!node) return
    if (node.nodeType === Node.ELEMENT_NODE) {
      const tag = node.tagName?.toLowerCase()
      const text = (node.textContent || '').trim()
      if ((tag === 'p' || tag === 'div') && levelPattern.test(text) && text.length < 800) {
        const hasAbnormal = ABNORMAL_KEYWORDS.test(text)
        const hasNormal = NORMAL_KEYWORDS.test(text)
        if (hasAbnormal && !hasNormal) node.classList.add('report-level-abnormal')
        else if (hasNormal || !hasAbnormal) node.classList.add('report-level-normal')
      }
      node.childNodes.forEach(walk)
    }
  }
  walk(body)

  return body.innerHTML
}

/** Sync version when content is already HTML (no markdown parse). */
export function markdownToHtml(content) {
  if (typeof content !== 'string' || !content.trim()) return ''
  const trimmed = content.trim()
  if (trimmed.startsWith('<')) {
    return DOMPurify.sanitize(trimmed, {
      ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'span', 'div', 'blockquote', 'hr'],
      ALLOWED_ATTR: ['class'],
    })
  }
  try {
    const raw = typeof marked.parseSync === 'function' ? marked.parseSync(trimmed) : marked.parse(trimmed)
    if (typeof raw === 'string') {
      return DOMPurify.sanitize(raw, {
        ALLOWED_TAGS: ['h1', 'h2', 'h3', 'h4', 'p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'span', 'div', 'blockquote', 'hr'],
        ALLOWED_ATTR: ['class'],
      })
    }
  } catch (_) {}
  return DOMPurify.sanitize(trimmed.replace(/\n/g, '<br>'), {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li'],
    ALLOWED_ATTR: [],
  })
}

/**
 * Strip all HTML to plain text (preserve paragraph/line breaks).
 */
export function htmlToPlainText(html) {
  if (typeof html !== 'string') return ''
  let s = html
    .replace(/<\/p>|<\/div>|<\/h[1-6]>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
  s = s.replace(/[ \t]+/g, ' ').replace(/\n /g, '\n').replace(/ \n/g, '\n').replace(/\n{3,}/g, '\n\n')
  return s.trim()
}

/**
 * Convert HTML to formatted plain text (preserve structure, no tags).
 */
export function htmlToFormattedText(html) {
  if (typeof html !== 'string') return ''
  const div = document.createElement('div')
  div.innerHTML = html
  const walk = (node, lines = []) => {
    if (!node) return lines
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent || '').trim()
      if (t) lines.push(t)
      return lines
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return lines
    const tag = node.tagName?.toLowerCase()
    if (tag === 'h1') {
      lines.push('')
      lines.push((node.textContent || '').trim().toUpperCase())
      lines.push('')
      return lines
    }
    if (tag === 'h2' || tag === 'h3') {
      lines.push('')
      lines.push((node.textContent || '').trim())
      lines.push('')
      return lines
    }
    if (tag === 'p' || tag === 'div') {
      for (const child of node.childNodes) walk(child, lines)
      lines.push('')
      return lines
    }
    if (tag === 'li') {
      lines.push('  • ' + (node.textContent || '').trim())
      return lines
    }
    if (tag === 'br') {
      lines.push('')
      return lines
    }
    for (const child of node.childNodes) walk(child, lines)
    return lines
  }
  const lines = walk(div)
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
