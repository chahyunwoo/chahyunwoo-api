import { BadRequestException } from '@nestjs/common';
import type { MultipartRequest } from '../../types/fastify.d';

export const ALLOWED_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

/**
 * 업로드 허용 최대 크기.
 *
 * **`main.ts`의 multipart `limits.fileSize`와 반드시 같은 값을 써야 한다.**
 * 예전에는 여기가 10MB, multipart가 5MB였다. multipart가 먼저 걸러버려서
 * 아래 `buffer.length > MAX_FILE_SIZE` 검사는 **어떤 입력으로도 참이 될 수 없는
 * 죽은 코드**였고, "File too large (max 10 MB)" 메시지도 절대 표시되지 않았다.
 * 게다가 multipart가 던지는 에러는 HttpException이 아니라서 413이 아닌 500이
 * 나갔다 — 6MB 이미지를 올린 관리자는 원인 모를 500만 봤다.
 *
 * 그래서 이 상수를 유일한 출처로 삼고 main.ts가 이 값을 가져다 쓴다.
 */
export const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const MIME_TO_EXT: Record<string, string> = {
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/avif': '.avif',
};

export function safeExtension(mimeType: string): string {
  return MIME_TO_EXT[mimeType] ?? '.bin';
}

export async function validateAndReadFile(request: MultipartRequest) {
  // `request.file()` 은 본문이 multipart 가 아니면 **null 을 주는 게 아니라 던진다**
  // (`FastifyError: the request is not multipart`). 그건 HttpException 이 아니라서
  // 예외 필터의 마지막 분기로 떨어져 **400 이 아니라 500** 이 나간다.
  //
  // 그러면 클라이언트 잘못인데 서버 오류로 보고되고, 5xx 를 재시도 대상으로 보는
  // 호출자(무인 발행 파이프라인)가 고칠 수 없는 요청을 백오프하며 반복한다.
  //
  // 위 MAX_FILE_SIZE 주석의 크기 초과 사례와 **같은 형태**다 — multipart 계층이
  // 던지는 에러를 HttpException 으로 바꿔 주지 않으면 전부 500 이 된다.
  let data: Awaited<ReturnType<MultipartRequest['file']>>;
  try {
    data = await request.file();
  } catch {
    throw new BadRequestException('Request must be multipart/form-data');
  }
  if (!data) throw new BadRequestException('No file provided');

  const buffer = await data.toBuffer();

  if (buffer.length > MAX_FILE_SIZE) {
    throw new BadRequestException(`File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`);
  }

  const { fileTypeFromBuffer } = await import('file-type');
  const detected = await fileTypeFromBuffer(buffer);
  if (!detected || !ALLOWED_MIME_TYPES.has(detected.mime)) {
    throw new BadRequestException('Only JPEG, PNG, WebP, GIF, AVIF are allowed');
  }

  return { buffer, mimeType: detected.mime };
}
