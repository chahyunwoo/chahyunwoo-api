import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpStatus } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { MAX_FILE_SIZE } from '../utils/file-validation.util';
import { HttpExceptionFilter } from './http-exception.filter';

/**
 * 예외 필터가 응답으로 내보내는 **상태 코드**를 검사한다.
 *
 * 특히 파일 크기 초과: @fastify/multipart가 던지는 에러는 HttpException이
 * 아니라서 기본 분기(500)로 떨어지고 있었다. 관리자는 큰 이미지를 올리고
 * "Internal server error"만 봤다. 필터에는 413 문구가 준비돼 있었는데
 * 그 코드를 만들어 주는 곳이 없었다.
 */
describe('HttpExceptionFilter', () => {
  function run(exception: unknown) {
    const sent: { status?: number; body?: Record<string, unknown> } = {};
    const reply = {
      status: (code: number) => {
        sent.status = code;
        return {
          send: (body: Record<string, unknown>) => {
            sent.body = body;
          },
        };
      },
    };
    const host = {
      switchToHttp: () => ({
        getResponse: () => reply,
        getRequest: () => ({ url: '/api/blog/posts/x/thumbnail' }),
      }),
    } as unknown as ArgumentsHost;

    new HttpExceptionFilter().catch(exception, host);
    return sent;
  }

  it('HttpException은 자기 상태 코드를 유지한다', () => {
    const result = run(new BadRequestException('bad input'));
    expect(result.status).toBe(HttpStatus.BAD_REQUEST);
  });

  it('Prisma P2025는 404로 매핑된다', () => {
    const err = new Prisma.PrismaClientKnownRequestError('not found', {
      code: 'P2025',
      clientVersion: '6.0.0',
    });
    expect(run(err).status).toBe(HttpStatus.NOT_FOUND);
  });

  it('파일 크기 초과는 413이다 — 500이면 원인을 알 수 없는 에러가 된다', () => {
    // @fastify/multipart가 실제로 던지는 형태(code로 식별한다).
    const err = Object.assign(new Error('request file too large'), {
      code: 'FST_REQ_FILE_TOO_LARGE',
      statusCode: 413,
    });

    const result = run(err);

    expect(result.status).toBe(HttpStatus.PAYLOAD_TOO_LARGE);
    expect(result.body?.message).toContain(`${MAX_FILE_SIZE / 1024 / 1024} MB`);
  });

  it('알 수 없는 예외는 500이고 내부 정보를 흘리지 않는다', () => {
    const result = run(new Error('DB password is hunter2'));

    expect(result.status).toBe(HttpStatus.INTERNAL_SERVER_ERROR);
    expect(JSON.stringify(result.body)).not.toContain('hunter2');
  });
});
