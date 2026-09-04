import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * 커밋된 `openapi.json`의 portfolio 응답 스키마를 고정한다.
 *
 * 이 도메인은 i18n 구조라 **같은 리소스라도 라우트마다 shape이 다르다**:
 *
 *   GET /experiences?locale=  → 번역을 평탄화 (title, role, responsibilities)
 *   GET /experiences/{id}     → Prisma 레코드 그대로 (translations 배열)
 *   POST/PUT /experiences     → Prisma 레코드 그대로
 *
 * 하나로 묶으면 어느 쪽이든 거짓말이 된다. 실제 응답과 대조하며 잡은 어긋남이
 * 세 건 있었고(아래), 그 형태를 여기에 고정한다.
 */
describe('portfolio 응답 스키마', () => {
  const spec = JSON.parse(readFileSync(join(__dirname, '../../../openapi.json'), 'utf8'));

  type Schema = {
    $ref?: string;
    type?: string;
    items?: Schema;
    properties?: Record<string, unknown>;
    allOf?: Schema[];
  };

  function propsOf(schema: Schema): Set<string> {
    let s = schema;
    if (s.$ref) s = spec.components.schemas[s.$ref.split('/').pop() as string];
    if (s.type === 'array' && s.items) return propsOf(s.items);
    const props: Record<string, unknown> = { ...(s.properties ?? {}) };
    for (const sub of s.allOf ?? []) {
      const parent: Schema = sub.$ref
        ? spec.components.schemas[sub.$ref.split('/').pop() as string]
        : sub;
      Object.assign(props, parent.properties ?? {}, s.properties ?? {});
    }
    return new Set(Object.keys(props));
  }

  function successSchema(path: string, method: string) {
    const res = spec.paths?.[path]?.[method]?.responses ?? {};
    return (
      res['200']?.content?.['application/json']?.schema ??
      res['201']?.content?.['application/json']?.schema
    );
  }

  describe('스키마가 선언되어 있다', () => {
    it.each([
      ['/api/portfolio/locales', 'get'],
      ['/api/portfolio/locales', 'post'],
      ['/api/portfolio/profile', 'get'],
      ['/api/portfolio/profile', 'put'],
      ['/api/portfolio/profile/all', 'get'],
      ['/api/portfolio/profile/image', 'post'],
      ['/api/portfolio/profile/icon', 'post'],
      ['/api/portfolio/experiences', 'get'],
      ['/api/portfolio/experiences', 'post'],
      ['/api/portfolio/experiences/{id}', 'get'],
      ['/api/portfolio/experiences/{id}', 'put'],
      ['/api/portfolio/projects', 'get'],
      ['/api/portfolio/projects', 'post'],
      ['/api/portfolio/projects/{id}', 'get'],
      ['/api/portfolio/projects/{id}', 'put'],
      ['/api/portfolio/works', 'get'],
      ['/api/portfolio/works', 'post'],
      ['/api/portfolio/works/{id}', 'get'],
      ['/api/portfolio/works/{id}', 'put'],
      ['/api/portfolio/skills', 'get'],
      ['/api/portfolio/skills', 'post'],
      ['/api/portfolio/skills/{id}', 'put'],
      ['/api/portfolio/education', 'get'],
      ['/api/portfolio/education', 'post'],
      ['/api/portfolio/education/{id}', 'get'],
      ['/api/portfolio/education/{id}', 'put'],
      ['/api/portfolio/contact', 'post'],
      ['/api/portfolio/contacts', 'get'],
      ['/api/portfolio/contacts/{id}/read', 'put'],
    ])('%s %s', (path, method) => {
      expect(successSchema(path, method)).toBeDefined();
    });
  });

  describe('204 라우트는 204를 선언한다', () => {
    it.each([
      ['/api/portfolio/locales/{id}', 'delete'],
      ['/api/portfolio/experiences/{id}', 'delete'],
      ['/api/portfolio/projects/{id}', 'delete'],
      ['/api/portfolio/works/{id}', 'delete'],
      ['/api/portfolio/skills/{id}', 'delete'],
      ['/api/portfolio/education/{id}', 'delete'],
      ['/api/portfolio/contacts/{id}', 'delete'],
    ])('%s %s', (path, method) => {
      expect(spec.paths?.[path]?.[method]?.responses?.['204']).toBeDefined();
    });
  });

  describe('평탄화 조회와 레코드 조회를 구분한다', () => {
    it('목록은 번역을 평탄화한다 (translations 배열이 없다)', () => {
      const flat = propsOf(spec.components.schemas.ExperienceDto);
      expect(flat).toEqual(
        new Set(['id', 'startDate', 'endDate', 'isCurrent', 'title', 'role', 'responsibilities']),
      );
      expect(flat.has('translations')).toBe(false);
    });

    it('단건/CRUD는 레코드 그대로다 (translations 배열이 있다)', () => {
      const rec = propsOf(spec.components.schemas.ExperienceRecordDto);
      expect(rec.has('translations')).toBe(true);
      expect(rec.has('title')).toBe(false);
    });
  });

  /**
   * 아래 셋은 실제 응답과 대조하다 잡은 어긋남이다. 코드가 바뀌면 다시 어긋나므로 고정한다.
   */
  describe('실측으로 잡은 어긋남', () => {
    it('GET /profile/all은 id를 돌려주지 않는다', () => {
      expect(propsOf(spec.components.schemas.ProfileWithTranslationsDto).has('id')).toBe(false);
    });

    it('GET /works/{id}만 gradientColors를 붙인다 (create/update에는 없다)', () => {
      expect(propsOf(spec.components.schemas.WorkDetailDto).has('gradientColors')).toBe(true);
      expect(propsOf(spec.components.schemas.WorkRecordDto).has('gradientColors')).toBe(false);
    });

    it('ContactMessageDto에 subject가 있다', () => {
      expect(propsOf(spec.components.schemas.ContactMessageDto)).toEqual(
        new Set(['id', 'name', 'email', 'subject', 'message', 'read', 'createdAt']),
      );
    });
  });

  describe('필드 집합', () => {
    it.each([
      [
        'ProfileDto',
        ['name', 'location', 'imageUrl', 'iconUrl', 'socialLinks', 'jobTitle', 'introduction'],
      ],
      ['ProjectDto', ['id', 'demoUrl', 'repoUrl', 'techStack', 'featured', 'title', 'description']],
      ['EducationDto', ['id', 'period', 'institution', 'degree']],
      ['SkillGroupDto', ['category', 'items']],
      ['SkillItemDto', ['id', 'name', 'proficiency', 'description']],
      ['LocaleDto', ['id', 'code', 'label']],
      ['ContactResultDto', ['success', 'message']],
      // icon이 빠지면 포트폴리오 연락처 섹션이 아이콘을 고르지 못한다
      ['SocialLinkDto', ['name', 'href', 'icon']],
      ['UploadUrlResponseDto', ['url']],
    ])('%s', (name, fields) => {
      expect([...propsOf(spec.components.schemas[name])].sort()).toEqual([...fields].sort());
    });
  });
});
