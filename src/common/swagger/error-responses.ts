import { applyDecorators } from '@nestjs/common';
import { ApiResponse } from '@nestjs/swagger';

const errorSchema = (statusCode: number, error: string, message: string) => ({
  schema: {
    properties: {
      statusCode: { type: 'number', example: statusCode },
      error: { type: 'string', example: error },
      message: { type: 'string', example: message },
      path: { type: 'string', example: '/api/...' },
      timestamp: { type: 'string', example: '2026-01-01T00:00:00.000Z' },
    },
  },
});

/**
 * 본문 없이 성공하는 라우트(`@HttpCode(HttpStatus.NO_CONTENT)`)의 204를 선언한다.
 *
 * **에러 응답 데코레이터를 붙이면 반드시 이것도 붙여야 한다.** NestJS Swagger는
 * 데코레이터가 하나도 없을 때만 `@HttpCode`를 보고 성공 응답을 자동 추론한다.
 * `@ApiUnauthorized()` 같은 것이 하나라도 있으면 그 응답만 등록되고 성공 응답은
 * 스펙에서 사라진다 — 프론트가 보기에 "성공하면 무엇이 오는지 알 수 없는" 라우트가 된다.
 *
 * 실측(이 문제를 발견한 경로): 컨트롤러의 NO_CONTENT 라우트 11건 중 스펙에 204가
 * 잡힌 것은 4건뿐이었고, 나머지 7건은 전부 에러 데코레이터가 붙어 있었다.
 */
export const ApiNoContent = (description = 'No Content') =>
  applyDecorators(ApiResponse({ status: 204, description }));

export const ApiBadRequest = (message = 'Validation failed') =>
  applyDecorators(
    ApiResponse({
      status: 400,
      description: 'Bad Request',
      ...errorSchema(400, 'Bad Request', message),
    }),
  );

export const ApiUnauthorized = () =>
  applyDecorators(
    ApiResponse({
      status: 401,
      description: 'Unauthorized',
      ...errorSchema(401, 'Unauthorized', 'Invalid credentials'),
    }),
  );

export const ApiNotFound = (entity = 'Resource') =>
  applyDecorators(
    ApiResponse({
      status: 404,
      description: 'Not Found',
      ...errorSchema(404, 'Not Found', `${entity} not found`),
    }),
  );

export const ApiConflict = (message = 'Resource already exists') =>
  applyDecorators(
    ApiResponse({ status: 409, description: 'Conflict', ...errorSchema(409, 'Conflict', message) }),
  );

export const ApiTooManyRequests = () =>
  applyDecorators(
    ApiResponse({
      status: 429,
      description: 'Too Many Requests',
      ...errorSchema(429, 'Too Many Requests', 'Rate limit exceeded'),
    }),
  );
