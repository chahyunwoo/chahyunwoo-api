// AuthService 는 otplib(ESM)을 끌어와 이 스펙의 트랜스폼을 깨뜨린다. 여기서
// 보는 것은 컨트롤러의 메타데이터뿐이라 실제 구현이 필요 없다.
jest.mock('../auth/auth.service', () => ({ AuthService: class {} }));

import { Reflector } from '@nestjs/core';
import { MACHINE_KEY } from '../common/decorators/machine-key.decorator';
import { BlogController } from './blog.controller';

/**
 * 어느 라우트가 머신 키를 받는가.
 *
 * 가드 자체의 동작은 jwt-auth.guard.spec.ts 가 검사한다. 여기서 보는 것은
 * **배선**이다 — `@MachineKey()` 가 의도한 라우트에만 붙어 있는지.
 *
 * 이 테스트가 필요한 이유: 데코레이터는 붙이거나 빼기가 한 줄이라, 나중에
 * "수정도 되는데 삭제는 왜 안 되지"라며 DELETE 에 무심코 붙일 수 있다.
 * 무인 발행이 글을 지울 이유는 없고, 지우는 것은 사람이 판단할 일이다.
 * 열린 것뿐 아니라 **닫힌 것도** 검사해야 그 경계가 지켜진다.
 */
describe('BlogController 머신 키 배선', () => {
  const reflector = new Reflector();

  /** 라우트 핸들러에 @MachineKey() 가 붙어 있는가 */
  function allowsMachineKey(method: keyof BlogController): boolean {
    const handler = BlogController.prototype[method];
    return reflector.get<boolean>(MACHINE_KEY, handler) === true;
  }

  describe('머신 키로 열려 있어야 하는 것', () => {
    it('create — 무인 발행의 본체다', () => {
      expect(allowsMachineKey('create')).toBe(true);
    });

    it('update — 발행한 글을 파이프라인이 고칠 수 있어야 한다', () => {
      // 이게 닫혀 있어서 운영 DB 를 직접 UPDATE 하는 일이 실제로 있었다.
      expect(allowsMachineKey('update')).toBe(true);
    });

    it('uploadImage — 파이프라인은 R2 자격증명을 갖지 않는다', () => {
      expect(allowsMachineKey('uploadImage')).toBe(true);
    });
  });

  describe('머신 키로 닫혀 있어야 하는 것', () => {
    it('remove — 삭제는 사람이 판단한다', () => {
      expect(allowsMachineKey('remove')).toBe(false);
    });
  });
});
