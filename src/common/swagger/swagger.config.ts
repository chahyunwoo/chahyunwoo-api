import { DocumentBuilder } from '@nestjs/swagger';

/**
 * Swagger 문서 설정 단일 출처.
 *
 * main.ts의 /docs와 scripts/generate-openapi.ts의 openapi.json이 같은 설정을 쓰도록
 * 여기 한 곳에서만 만든다. 양쪽에 DocumentBuilder를 각각 두면 스펙이 조용히 갈라진다.
 */
export function buildSwaggerConfig() {
  return (
    new DocumentBuilder()
      .setTitle('Hyunwoo API')
      .setDescription('chahyunwoo.dev blog & portfolio API')
      .setVersion('1.0')
      .addBearerAuth()
      .addCookieAuth('access_token')
      .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' }, 'api-key')
      // 무인 발행용. 조회용 api-key 와 다른 키다.
      .addApiKey({ type: 'apiKey', name: 'x-machine-key', in: 'header' }, 'machine-key')
      .build()
  );
}
