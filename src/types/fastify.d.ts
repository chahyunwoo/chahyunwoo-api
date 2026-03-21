/// <reference types="@fastify/multipart" />

import type { MultipartFile } from '@fastify/multipart';
import type { FastifyRequest } from 'fastify';

export interface MultipartRequest extends FastifyRequest {
  file(): Promise<MultipartFile | undefined>;
}
