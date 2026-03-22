import { Module } from '@nestjs/common';

import { ValidateLocalePipe } from './pipes/validate-locale.pipe';
import { PortfolioController } from './portfolio.controller';
import { PortfolioService } from './portfolio.service';

@Module({
  controllers: [PortfolioController],
  providers: [ValidateLocalePipe, PortfolioService],
})
export class PortfolioModule {}
