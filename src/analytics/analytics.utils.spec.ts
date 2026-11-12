import { isSpamReferrer } from './analytics.utils';
import { PageViewService } from './page-view.service';

describe('isSpamReferrer', () => {
  it('스팸 도메인과 그 서브도메인을 잡는다', () => {
    expect(isSpamReferrer('https://aocr.org/')).toBe(true);
    expect(isSpamReferrer('https://www.aocr.org/some/path')).toBe(true);
    expect(isSpamReferrer('aocr.org')).toBe(true);
    expect(isSpamReferrer('aocr.org/x')).toBe(true);
    expect(isSpamReferrer('https://AOCR.ORG')).toBe(true);
  });

  it('직접 유입과 정상 리퍼러는 통과시킨다', () => {
    expect(isSpamReferrer('')).toBe(false);
    expect(isSpamReferrer(null)).toBe(false);
    expect(isSpamReferrer(undefined)).toBe(false);
    expect(isSpamReferrer('https://www.google.com/')).toBe(false);
    expect(isSpamReferrer('https://notaocr.org/')).toBe(false);
    expect(isSpamReferrer('https://aocr.org.evil.com/')).toBe(false);
    expect(isSpamReferrer('https://example.com/posts/aocr.org')).toBe(false);
  });
});

describe('PageViewService.track', () => {
  const browserUa =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36';

  function setup() {
    const create = jest.fn().mockResolvedValue({ id: 1 });
    const prisma = { pageView: { create, update: jest.fn() } };
    const geo = { lookup: jest.fn().mockResolvedValue({}) };
    const config = { get: jest.fn().mockReturnValue('') };
    const service = new PageViewService(prisma as never, geo as never, config as never);
    return { service, create };
  }

  it('스팸 리퍼러 방문은 저장하지 않는다', async () => {
    const { service, create } = setup();
    await service.track({
      path: '/blog/a',
      appName: 'blog',
      referrer: 'https://aocr.org/',
      userAgent: browserUa,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it('정상 리퍼러 방문은 저장한다', async () => {
    const { service, create } = setup();
    await service.track({
      path: '/blog/a',
      appName: 'blog',
      referrer: 'https://www.google.com/',
      userAgent: browserUa,
    });
    expect(create).toHaveBeenCalledTimes(1);
  });
});
