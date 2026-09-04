/**
 * OpenAPI 스펙을 openapi.json으로 덤프한다.
 *
 * Usage:
 *   pnpm openapi:generate
 *
 * 왜 서버를 띄우지 않는가:
 *   main.ts의 SwaggerModule.setup은 NODE_ENV !== 'production' 게이트 안에 있어서
 *   프로덕션 빌드에선 /docs 자체가 없다. 여기선 문서만 만들면 되므로 앱을 만들되
 *   listen하지 않는다. NestFactory.create()는 app.init()/listen()을 부르지 않으면
 *   onModuleInit / onApplicationBootstrap을 실행하지 않으므로 DB 접속도, 스케줄러
 *   기동도 일어나지 않는다.
 *
 * 주의: provider 생성자에서 config.getOrThrow(...)를 호출하는 곳들이 있어
 *   (auth.service, auth.module, jwt.strategy, prisma.service, storage.service, blog.service)
 *   env 값 자체는 존재해야 한다. 로컬은 .env, CI는 더미 값을 주입한다.
 *   API_KEY는 api-key.guard가 canActivate에서 지연 조회하므로 필요 없다(실측 확인).
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { FastifyAdapter } from '@nestjs/platform-fastify';
import { SwaggerModule } from '@nestjs/swagger';

import { AppModule } from '../src/app.module';
import { buildSwaggerConfig } from '../src/common/swagger/swagger.config';

const OUTPUT_PATH = join(__dirname, '..', 'openapi.json');

async function main() {
  // abortOnError: false 가 없으면 모듈 생성 실패 시 Nest가 예외를 삼키고 프로세스를
  // 그냥 죽여서, logger가 꺼진 상태에서는 CI 로그에 아무 단서도 안 남는다.
  const app = await NestFactory.create(AppModule, new FastifyAdapter(), {
    logger: false,
    abortOnError: false,
  });
  const document = SwaggerModule.createDocument(app, buildSwaggerConfig());

  // 개행으로 끝내야 git diff --exit-code 게이트가 개행 차이로 흔들리지 않는다.
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');

  const routeCount = Object.values(document.paths ?? {}).reduce(
    (acc, item) => acc + Object.keys(item as object).length,
    0,
  );
  const schemaCount = Object.keys(document.components?.schemas ?? {}).length;
  process.stdout.write(`openapi.json written: ${routeCount} operations, ${schemaCount} schemas\n`);

  // listen하지 않았으므로 열린 핸들은 없지만, 캐시/스케줄러 모듈이 타이머를 잡는
  // 경우를 대비해 명시적으로 끝낸다.
  process.exit(0);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
