import { BadRequestException } from '@nestjs/common';
import type { MultipartRequest } from '../../types/fastify.d';
import { validateAndReadFile } from './file-validation.util';

/**
 * multipart 계층이 던지는 에러가 400 으로 변환되는지 검사한다 (#142).
 *
 * 고친 버그: `request.file()` 은 본문이 multipart 가 아니면 null 을 주는 게 아니라
 * `FastifyError` 를 **던진다.** 그건 HttpException 이 아니라서 예외 필터의 마지막
 * 분기로 떨어져 **400 이 아니라 500** 이 나갔다.
 *
 * 왜 중요한가: 클라이언트 잘못인데 서버 오류로 보고되면, 5xx 를 재시도 대상으로
 * 보는 호출자(무인 발행 파이프라인)가 고칠 수 없는 요청을 백오프하며 반복한다.
 *
 * 같은 파일 MAX_FILE_SIZE 주석의 크기 초과 사례와 **같은 형태**다 — multipart 가
 * 던지는 에러를 감싸 주지 않으면 전부 500 이 된다. 그래서 "던지는 경우"를 여기서
 * 고정해 둔다.
 */
describe('validateAndReadFile — multipart 아닌 요청', () => {
  /** file() 이 주어진 동작을 하는 최소 요청 객체 */
  function makeRequest(fileImpl: () => Promise<unknown>): MultipartRequest {
    return { file: fileImpl } as unknown as MultipartRequest;
  }

  it('file() 이 던지면 500 이 아니라 BadRequest 로 바꾼다 — 이것이 #142 의 본체다', async () => {
    // fastify-multipart 가 실제로 던지는 형태
    const req = makeRequest(() => Promise.reject(new Error('the request is not multipart')));

    await expect(validateAndReadFile(req)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('file() 이 null 을 주면 BadRequest 다 (기존 경로 회귀 방지)', async () => {
    const req = makeRequest(() => Promise.resolve(null));

    await expect(validateAndReadFile(req)).rejects.toBeInstanceOf(BadRequestException);
  });

  /**
   * 던지는 것을 전부 400 으로 바꾸면 안 된다. 파일을 읽는 도중의 실패(디스크·네트워크)는
   * 클라이언트 잘못이 아니므로 500 이 맞다. try 범위가 `file()` 하나여야 하는 이유다.
   */
  it('toBuffer() 단계의 실패는 400 으로 삼키지 않는다', async () => {
    const req = makeRequest(() =>
      Promise.resolve({ toBuffer: () => Promise.reject(new Error('disk read failed')) }),
    );

    await expect(validateAndReadFile(req)).rejects.not.toBeInstanceOf(BadRequestException);
  });

  // 내용 검증(file-type) 경로는 여기서 다루지 않는다. `await import('file-type')` 이
  // ESM 동적 import 라 jest 가 --experimental-vm-modules 없이는 TypeError 를 낸다 —
  // 제품 코드 문제가 아니라 러너 제약이고, #142 의 검사 대상도 아니다.
  // 그 경로는 운영에서 실제 multipart 업로드로 400 이 나오는 것을 확인했다.
});
