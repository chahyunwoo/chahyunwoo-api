import { ServiceUnavailableException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';

/**
 * 헬스체크가 **DB까지** 확인하는지 검사한다.
 *
 * 이게 중요한 이유: `deploy.yml`의 헬스체크 루프가 배포의 유일한 게이트다.
 * 정적 객체를 돌려주던 때에는 DATABASE_URL이 틀려도 200이 나가서
 * "배포 성공"으로 끝나고, 실제로는 모든 요청이 실패하는 상태로 서비스가 떴다.
 *
 * 특히 실패 경로는 **HTTP 상태 코드**를 봐야 한다. deploy.yml은 `curl -sf`를
 * 쓰므로 본문이 아니라 상태 코드만 본다 — 200에 status:'error'를 실어 보내면
 * 배포는 그대로 초록으로 끝난다.
 */
describe('HealthController', () => {
  async function build(queryImpl: () => Promise<unknown>) {
    const prisma = { $queryRaw: jest.fn(queryImpl) };
    const moduleRef = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: PrismaService, useValue: prisma }],
    }).compile();
    return { controller: moduleRef.get(HealthController), prisma };
  }

  it('DB가 정상이면 ok를 돌려준다', async () => {
    const { controller, prisma } = await build(async () => [{ '?column?': 1 }]);

    const result = await controller.check();

    expect(result.status).toBe('ok');
    expect(result.database).toBe('ok');
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('실제로 DB에 쿼리를 던진다 — 안 던지면 프로세스 생존만 확인하는 셈이다', async () => {
    const { controller, prisma } = await build(async () => []);

    await controller.check();

    // 호출 자체가 없으면 정적 응답으로 되돌아간 것이다.
    expect(prisma.$queryRaw).toHaveBeenCalled();
  });

  it('DB가 죽으면 503을 던진다 — 200을 내면 curl -sf가 통과해 배포가 초록으로 끝난다', async () => {
    const { controller } = await build(async () => {
      throw new Error('connection refused');
    });

    await expect(controller.check()).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('503 본문에도 원인이 담긴다', async () => {
    const { controller } = await build(async () => {
      throw new Error('connection refused');
    });

    try {
      await controller.check();
      throw new Error('예외가 발생해야 한다');
    } catch (e) {
      const body = (e as ServiceUnavailableException).getResponse() as Record<string, string>;
      expect(body.database).toBe('error');
      expect(body.status).toBe('error');
    }
  });
});
