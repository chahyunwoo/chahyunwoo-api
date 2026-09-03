import { calculateReadingTime, extractDescription, generateSlug } from './blog.utils';

/**
 * 기대값은 추측이 아니라 현재 구현을 실행해 관측한 값이다.
 * 관측 시점의 구현: KOREAN_CHARS_PER_MINUTE=500, Math.max(1, ceil(len/500)),
 * extractDescription maxLength=100(초과 시 100자 자르고 '...' 붙여 103자).
 */
describe('calculateReadingTime', () => {
  it('빈 content는 0분이다 (1분으로 올리지 않는다)', () => {
    expect(calculateReadingTime('')).toBe(0);
  });

  /**
   * 코드블록만 있는 글은 stripMarkdown 후 남는 텍스트가 없어 0이 된다.
   * "본문이 있으니 최소 1분"이 아니라 0이 나오는 것이 현재 동작이다.
   */
  it('코드블록만 있는 content는 0분이다', () => {
    expect(calculateReadingTime('```ts\nconst a = 1;\nconst b = 2;\n```')).toBe(0);
  });

  it('짧은 본문은 최소 1분으로 올린다', () => {
    expect(calculateReadingTime('# 제목\n\n본문입니다.')).toBe(1);
  });

  // 500자/분 경계. 이 세 값이 함께 있어야 상수를 바꿨을 때 드러난다.
  it.each([
    [250, 1],
    [500, 1],
    [501, 2],
    [1000, 2],
  ])('%i자 → %i분', (chars, expected) => {
    expect(calculateReadingTime('가'.repeat(chars))).toBe(expected);
  });

  it('코드블록은 분량에서 제외한다', () => {
    const withCode = `${'가'.repeat(400)}\n\`\`\`js\n${'x'.repeat(5000)}\n\`\`\``;
    // 코드블록을 세면 5000자가 넘어 11분이 된다. 제외하므로 1분이다.
    expect(calculateReadingTime(withCode)).toBe(1);
  });
});

describe('extractDescription', () => {
  it.each([
    ['헤딩 기호를 제거한다', '# 제목\n\n본문입니다.', '제목 본문입니다.'],
    ['인라인 코드를 내용째 제거한다', '이건 `code` 입니다', '이건 입니다'],
    ['이미지는 alt까지 제거한다', '![alt](http://x.com/a.png) 뒤 텍스트', '뒤 텍스트'],
    ['링크는 라벨만 남긴다', '[라벨](http://x.com) 뒤', '라벨 뒤'],
    ['강조 기호를 제거한다', '**굵게** _기울임_ ~~취소~~', '굵게 기울임 취소'],
    ['HTML 태그를 제거한다', '<div class="x">안녕</div> 밖', '안녕 밖'],
    ['코드블록을 제거하고 앞뒤를 잇는다', '앞\n```js\nlet x=1;\n```\n뒤', '앞 뒤'],
  ])('%s', (_label, input, expected) => {
    expect(extractDescription(input)).toBe(expected);
  });

  /**
   * 코드블록이 닫히지 않으면 그 뒤 전부가 코드로 간주된다.
   * 의도된 동작인지는 불명확하나, 현재 동작을 고정해 변경 시 드러나게 한다.
   */
  it('닫히지 않은 코드블록 이후는 전부 버린다', () => {
    expect(extractDescription('앞\n```js\nlet x=1;')).toBe('앞');
  });

  it('100자 이하는 그대로 반환한다', () => {
    const exact = '나'.repeat(100);
    expect(extractDescription(exact)).toBe(exact);
    expect(extractDescription(exact)).toHaveLength(100);
  });

  it('100자를 넘으면 잘라내고 말줄임을 붙인다', () => {
    const result = extractDescription('나'.repeat(101));
    expect(result).toHaveLength(103);
    expect(result.endsWith('...')).toBe(true);
    expect(result.slice(0, 100)).toBe('나'.repeat(100));
  });

  it('maxLength를 넘겨 자를 길이를 바꿀 수 있다', () => {
    expect(extractDescription('다'.repeat(50), 10)).toBe(`${'다'.repeat(10)}...`);
  });
});

describe('generateSlug', () => {
  it('길이 10의 URL-safe 문자열을 만든다', () => {
    const slug = generateSlug();
    expect(slug).toHaveLength(10);
    expect(slug).toMatch(/^[A-Za-z0-9_-]+$/);
  });

  /**
   * slug는 글의 공개 URL이자 `posts.slug` UNIQUE 키다. 충돌하면
   * create가 P2002로 실패하므로(ConflictException) 유일성이 실제로 중요하다.
   */
  it('300회 생성해도 중복되지 않는다', () => {
    const slugs = new Set(Array.from({ length: 300 }, () => generateSlug()));
    expect(slugs.size).toBe(300);
  });
});
