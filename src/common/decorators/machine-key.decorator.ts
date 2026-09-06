import { SetMetadata } from '@nestjs/common';

/**
 * 머신(스케줄러)이 사람 로그인 없이 호출할 수 있는 라우트.
 *
 * 포트폴리오 파이프라인이 블로그 글을 무인 발행한다. JWT 는 로그인 + 2FA 로
 * 발급되므로 스케줄러가 쓸 수 없어, 이 라우트들만 전용 키(`x-machine-key`)를
 * 받는다.
 *
 * ⚠️ 공개 조회용 `API_KEY` 와 **다른 키**(`BLOG_MACHINE_KEY`)를 쓴다.
 * 조회 키는 프런트가 들고 다니므로 새어도 발행까지 뚫리면 안 된다.
 *
 * 어드민 JWT 경로는 그대로 열려 있다 — 이 데코레이터는 인증 수단을
 * 하나 **더** 허용할 뿐이고, 아무 인증 없이 통과시키지 않는다.
 */
export const MACHINE_KEY = 'machineKey';
export const MachineKey = () => SetMetadata(MACHINE_KEY, true);
