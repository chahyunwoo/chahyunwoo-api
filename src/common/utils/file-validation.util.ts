import { BadRequestException } from '@nestjs/common';
import type { MultipartRequest } from '../../types/fastify.d';

export const ALLOWED_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

export function safeExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? '.bin';
}

export async function validateAndReadFile(request: MultipartRequest) {
  const data = await request.file();
  if (!data) throw new BadRequestException('No file provided');

  const buffer = await data.toBuffer();

  if (buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
  }

  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new BadRequestException('Only JPEG, PNG, WebP, GIF are allowed');
  }

  return { buffer, mimeType: detected.mime };
}
