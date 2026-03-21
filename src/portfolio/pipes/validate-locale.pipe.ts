import {
  type ArgumentMetadata,
  BadRequestException,
  Injectable,
  type PipeTransform,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEFAULT_LOCALE } from '../portfolio.constants';

@Injectable()
export class ValidateLocalePipe implements PipeTransform {
  constructor(private readonly prisma: PrismaService) {}

  async transform(value: { locale?: string }, _metadata: ArgumentMetadata) {
    const locale = value?.locale ?? DEFAULT_LOCALE;

    const exists = await this.prisma.locale.findUnique({ where: { code: locale } });
    if (!exists) {
      throw new BadRequestException(`Unsupported locale: ${locale}`);
    }

    return { ...value, locale };
  }
}
