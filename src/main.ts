import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { buildSwaggerConfig } from './common/swagger/swagger.config';
import { MAX_FILE_SIZE } from './common/utils/file-validation.util';

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter({ logger: process.env.NODE_ENV !== 'production', trustProxy: true }),
  );

  await app.register(import('@fastify/cookie'));
  await app.register(helmet);
  // 한도는 file-validation.util의 MAX_FILE_SIZE 하나만 쓴다. 두 곳에 따로 적으면
  // 작은 쪽이 먼저 걸러서 큰 쪽 검사가 죽은 코드가 되고, 사용자에게는 표시되지
  // 않는 메시지만 남는다(실제로 그랬다).
  await app.register(multipart, {
    limits: { fileSize: MAX_FILE_SIZE },
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
