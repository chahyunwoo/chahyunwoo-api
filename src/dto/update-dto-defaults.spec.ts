import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { UpdatePostDto } from '../blog/dto/update-post.dto';
import { UpdateEducationDto } from '../portfolio/dto/update-education.dto';
import { UpdateExperienceDto } from '../portfolio/dto/update-experience.dto';
import { UpdateProjectDto } from '../portfolio/dto/update-project.dto';
import { UpdateSkillDto } from '../portfolio/dto/update-skill.dto';
import { UpdateWorkDto } from '../portfolio/dto/update-work.dto';

/**
 * `PartialType(CreateXxxDto)` 로 만든 Update DTO 가 **원본의 필드 기본값을
 * 물려받지 않는지** 검사한다 (#131).
 *
 * 고친 버그: `CreatePostDto` 에 `published?: boolean = false` 같은 기본값이
 * 있으면, `PartialType` 으로 상속해도 그 기본값이 살아남는다. class-transformer
 * 가 요청에 없는 필드를 기본값으로 채워 넣으므로, 서비스의
 * `...(dto.published !== undefined && { published: dto.published })` 같은
 * 부분 업데이트 가드가 **뚫린다**.
 *
 * 실제 피해(운영 실측 2026-09-04): 제목만 수정했는데 발행 글이 비공개가 되고
 * 태그가 지워졌다. 포트폴리오에서는 정렬 순서가 0으로, isCurrent/featured 가
 * false 로 리셋된다.
 *
 * 서비스는 create 시 `dto.sortOrder ?? 0` 로 이미 방어하고 있으므로
 * DTO 기본값은 불필요한 중복이었다.
 */
describe('Update DTO 가 기본값을 주입하지 않는다 (#131)', () => {
  const cases: Array<[string, new () => object]> = [
    ['UpdatePostDto', UpdatePostDto],
    ['UpdateEducationDto', UpdateEducationDto],
    ['UpdateSkillDto', UpdateSkillDto],
    ['UpdateExperienceDto', UpdateExperienceDto],
    ['UpdateWorkDto', UpdateWorkDto],
    ['UpdateProjectDto', UpdateProjectDto],
  ];

  it.each(cases)('%s: 빈 body 를 변환해도 아무 필드도 채워지지 않는다', (_name, cls) => {
    const dto = plainToInstance(cls, {}) as Record<string, unknown>;
    const injected = Object.entries(dto).filter(([, v]) => v !== undefined);

    expect(injected).toEqual([]);
  });

  /**
   * 이 케이스가 #131 의 본체다. 부분 업데이트에서 보내지 않은 필드는
   * `undefined` 로 남아야 서비스의 가드가 그 필드를 건너뛴다.
   */
  it('제목만 보내면 published/tags 가 undefined 로 남는다', () => {
    const dto = plainToInstance(UpdatePostDto, { title: '제목만 수정' });

    expect(dto.title).toBe('제목만 수정');
    expect(dto.published).toBeUndefined();
    expect(dto.tags).toBeUndefined();
  });

  /**
   * 기본값을 없앤다고 **명시적으로 보낸 false/0 까지** 무시하면 안 된다.
   * 비공개 전환과 정렬 맨 앞 배치가 실제로 동작해야 한다.
   */
  it('명시적으로 보낸 false/0 은 그대로 보존된다', () => {
    const post = plainToInstance(UpdatePostDto, { published: false, tags: [] });
    expect(post.published).toBe(false);
    expect(post.tags).toEqual([]);

    const work = plainToInstance(UpdateWorkDto, {
      sortOrder: 0,
      isCurrent: false,
      featured: false,
    });
    expect(work.sortOrder).toBe(0);
    expect(work.isCurrent).toBe(false);
    expect(work.featured).toBe(false);
  });
});
