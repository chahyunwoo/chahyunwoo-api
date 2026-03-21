import { randomBytes } from 'node:crypto';
import { BadRequestException } from '@nestjs/common';

/**
 * 한글/영어 제목에서 URL-safe slug 생성
 * 중복 방지를 위해 4자리 랜덤 suffix 추가
 */
export function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s가-힣-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);

  if (!base) {
    throw new BadRequestException('Title must contain at least one valid character for slug');
  }

  const suffix = randomBytes(2).toString('hex');
  return `${base}-${suffix}`;
}

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

/**
 * MIME 타입에서 안전한 확장자 추출
 */
export function safeExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? '.bin';
}

/**
 * content 앞부분에서 description 자동 추출
 * MDX 태그/코드블록 제거 후 첫 문장 추출 (최대 100자)
 */
export function extractDescription(content: string, maxLength = 100): string {
  // 코드블록을 안전하게 제거 (ReDoS 방지: 수동 파싱)
  let cleaned = '';
  let inCodeBlock = false;

  for (const line of content.split('\n')) {
    if (line.startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (!inCodeBlock) cleaned += `${line} `;
  }

  cleaned = cleaned
    .replace(/<[^>]{0,1000}>/g, '')
    .replace(/`[^`]+`/g, '')
    .replace(/#{1,6}\s+/g, '')
    .replace(/!\[.*?\]\(.*?\)/g, '')
    .replace(/\[([^\]]+)\]\(.*?\)/g, '$1')
    .replace(/[*_~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length <= maxLength) return cleaned;
  return `${cleaned.slice(0, maxLength).trimEnd()}...`;
}
