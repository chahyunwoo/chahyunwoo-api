/// <reference types="@fastify/multipart" />
/**
 * `@fastify/cookie`의 타입 증강(FastifyReply.setCookie / clearCookie)을 여기서 참조한다.
 *
 * 이 참조가 없으면 증강이 `main.ts`의 `await app.register(import('@fastify/cookie'))`를
 * 경유해서만 들어온다. 그러면 main.ts를 포함하지 않는 컴파일 범위에서는 실제 코드가
 * 멀쩡한데 타입만 깨진다 — ts-node로 다른 엔트리포인트를 돌리거나(스펙 덤프 스크립트),
 * 파일 단위로 컴파일하는 도구를 쓸 때 그렇다.
 *
 * 실측: 이 줄이 없을 때 auth.controller.ts만 단독 컴파일하면
 *   error TS2339: Property 'setCookie' does not exist on type 'FastifyReply<...>'   (4건)
 *   error TS2339: Property 'clearCookie' does not exist on type 'FastifyReply<...>' (1건)
 * `tsc --noEmit`은 전체 파일을 보므로 통과한다. 즉 컴파일 범위에 따라 갈리는 구조였다.
 */
/// <reference types="@fastify/cookie" />

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

export interface MultipartRequest extends FastifyRequest {
  file(): Promise<MultipartFile | undefined>;
}

export interface CookieRequest extends FastifyRequest {
  cookies: Record<string, string>;
  user: { username: string };
}
