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
  private validCodes: Set<string> | null = null;

  constructor(private readonly prisma: PrismaService) {}

  async transform(value: { locale?: string }, _metadata: ArgumentMetadata) {
    const locale = value?.locale ?? DEFAULT_LOCALE;

    if (!this.validCodes) {
      const locales = await this.prisma.locale.findMany({ select: { code: true } });
      this.validCodes = new Set(locales.map(l => l.code));
    }

    if (!this.validCodes.has(locale)) {
      throw new BadRequestException(`Unsupported locale: ${locale}`);
    }

    return { ...value, locale };
  }

  invalidateCache(): void {
    this.validCodes = null;
  }
}
