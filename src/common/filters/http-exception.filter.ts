import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { MAX_FILE_SIZE } from '../utils/file-validation.util';

interface ErrorResponse {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

const HTTP_STATUS_MESSAGES: Record<number, string> = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
  409: 'Conflict',
  413: 'Payload Too Large',
  429: 'Too Many Requests',
  500: 'Internal Server Error',
};

/**
 * @fastify/multipart의 파일 크기 초과 에러인지 판정한다.
 *
 * instanceof로 보지 않는 이유: 이 에러 클래스는 플러그인 내부에서 만들어지고
 * pnpm 구조상 모듈 사본이 갈릴 수 있어 instanceof가 조용히 false가 될 수 있다.
 * `code`는 플러그인이 공개적으로 보장하는 식별자다
 * (@fastify/multipart index.js: createError('FST_REQ_FILE_TOO_LARGE', ..., 413)).
 */
function isFileTooLargeError(exception: unknown): boolean {
  return (
    typeof exception === 'object' &&
    exception !== null &&
    (exception as { code?: unknown }).code === 'FST_REQ_FILE_TOO_LARGE'
  );
}

const PRISMA_ERROR_MAP: Record<string, { status: number; message: string }> = {
  P2002: { status: HttpStatus.CONFLICT, message: 'Resource already exists' },
  P2025: { status: HttpStatus.NOT_FOUND, message: 'Resource not found' },
};

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const reply = ctx.getResponse<FastifyReply>();
    const request = ctx.getRequest<FastifyRequest>();

    const { status, message } = this.resolveException(exception);

    const body: ErrorResponse = {
      statusCode: status,
      error: HTTP_STATUS_MESSAGES[status] ?? 'Unknown Error',
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.message : exception,
        (exception as Error)?.stack,
      );
    }

    void reply.status(status).send(body);
  }

  private resolveException(exception: unknown): { status: number; message: string | string[] } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' && 'message' in response
          ? (response as { message: string | string[] }).message
          : exception.message;
      return { status: exception.getStatus(), message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      const mapped = PRISMA_ERROR_MAP[exception.code];
      if (mapped) return { status: mapped.status, message: mapped.message };
    }

    // @fastify/multipart가 파일 크기 한도를 넘겼을 때 던지는 에러.
    // HttpException이 아니라서 아래 기본 분기로 떨어져 500이 나갔다 —
    // 관리자는 6MB 이미지를 올리고 원인을 알 수 없는 500만 봤다.
    // 위 HTTP_STATUS_MESSAGES에 413 문구가 준비돼 있었는데 그 코드를
    // 만들어 주는 곳이 없었다.
    if (isFileTooLargeError(exception)) {
      return {
        status: HttpStatus.PAYLOAD_TOO_LARGE,
        message: `File too large (max ${MAX_FILE_SIZE / 1024 / 1024} MB)`,
      };
    }

    return { status: HttpStatus.INTERNAL_SERVER_ERROR, message: 'Internal server error' };
  }
}
