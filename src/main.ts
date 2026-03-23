import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';

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
    const swaggerConfig = new DocumentBuilder()
      .setTitle('Hyunwoo API')
      .setDescription('chahyunwoo.dev blog & portfolio API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup('docs', app, document);
  }

  const port = config.get<number>('PORT', 8000);
  await app.listen(port, '0.0.0.0');
}

bootstrap();
