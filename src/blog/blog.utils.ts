import { randomBytes } from 'node:crypto';

/**
 * 제목에서 URL-safe slug 생성
 * 한글/영문/숫자 허용, 중복 방지 suffix 추가
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣ㄱ-ㅎㅏ-ㅣ-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  const suffix = randomBytes(2).toString('hex');
  return base ? `${base}-${suffix}` : suffix;
}

const KOREAN_CHARS_PER_MINUTE = 500;

function stripMarkdown(content: string): string {
  let text = '';
  let inCodeBlock = false;

  for (const line of content.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) text += `${line} `;
  }

  return text
    .replace(/<[^>]{0,1000}>/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * content에서 읽기 시간(분) 계산
 * 코드블록 제외, 한국어 기준 500자/분
 */
export function calculateReadingTime(content: string): number {
  if (!content) return 0;
  const text = stripMarkdown(content);
  if (!text) return 0;
  return Math.max(1, Math.ceil(text.length / KOREAN_CHARS_PER_MINUTE));
}

/**
 * content 앞부분에서 description 자동 추출
 * MDX 태그/코드블록 제거 후 첫 문장 추출 (최대 100자)
 */
export function extractDescription(content: string, maxLength = 100): string {
  const cleaned = stripMarkdown(content);
  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}...`;
}
