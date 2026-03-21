/// <reference types="@fastify/multipart" />

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

export interface MultipartRequest extends FastifyRequest {
  file(): Promise<MultipartFile | undefined>;
}

export interface CookieRequest extends FastifyRequest {
  cookies: Record<string, string>;
  user: { username: string };
}
