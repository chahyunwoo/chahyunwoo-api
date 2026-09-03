import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { buildSwaggerConfig } from './common/swagger/swagger.config';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'production', trustProxy: true }),
  );

  await app.register(import('@fastify/cookie'));
  await app.register(helmet);
  await app.register(multipart, {
    limits: { fileSize: 5 * 1024 * 1024 },
  });

  const config = app.get(ConfigService);

  app.enableCors({
    origin: config
      .get<string>('ALLOWED_ORIGINS', '')
      .split(',')
      .map(s => s.trim())
      .filter(Boolean),
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  if (config.get('NODE_ENV') !== 'production') {
    const document = SwaggerModule.createDocument(app, buildSwaggerConfig());
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 4000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
