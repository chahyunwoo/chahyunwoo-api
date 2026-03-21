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
