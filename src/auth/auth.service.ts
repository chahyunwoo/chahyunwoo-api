import { createHash, randomBytes } from 'node:crypto';
import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';

const ACCESS_TOKEN_EXPIRES = '15m';
const REFRESH_TOKEN_EXPIRES_DAYS = 7;

@Injectable()
export class AuthService {
  constructor(
    private readonly config: ConfigService,
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  async login(username: string, password: string, ipAddress?: string) {
    const adminUsername = this.config.getOrThrow<string>('ADMIN_USERNAME');
    const adminPasswordHash = this.config.getOrThrow<string>('ADMIN_PASSWORD_HASH');

    if (username !== adminUsername) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await bcrypt.compare(password, adminPasswordHash);
    if (!isValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const accessToken = this.generateAccessToken(username);
    const refreshToken = await this.createRefreshToken(username, ipAddress);

    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string, ipAddress?: string) {
    const tokenHash = this.hashToken(refreshToken);

    const stored = await this.prisma.refreshToken.findUnique({ where: { tokenHash } });
    if (!stored) throw new UnauthorizedException('Invalid refresh token');

    if (stored.expiresAt < new Date()) {
      await this.prisma.refreshToken.delete({ where: { id: stored.id } });
      throw new UnauthorizedException('Refresh token expired');
    }

    // IP 변경 감지 → 전체 세션 폐기
    if (stored.ipAddress && stored.ipAddress !== ipAddress) {
      await this.prisma.refreshToken.deleteMany({ where: { username: stored.username } });
      throw new ForbiddenException('Token used from different IP. All sessions revoked.');
    }

    // Token Rotation: 기존 폐기 + 새 발급
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const accessToken = this.generateAccessToken(stored.username);
    const newRefreshToken = await this.createRefreshToken(stored.username, ipAddress);

    return { accessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    await this.prisma.refreshToken.deleteMany({ where: { tokenHash } });
  }

  async logoutAll(username: string): Promise<void> {
    await this.prisma.refreshToken.deleteMany({ where: { username } });
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.prisma.refreshToken.deleteMany({
      where: { expiresAt: { lt: new Date() } },
    });
    return result.count;
  }

  // ─── Private ──────────────────────────────────────────────────────────────

  private generateAccessToken(username: string): string {
    return this.jwtService.sign({ sub: username }, { expiresIn: ACCESS_TOKEN_EXPIRES });
  }

  private async createRefreshToken(username: string, ipAddress?: string): Promise<string> {
    const token = randomBytes(64).toString('hex');
    const tokenHash = this.hashToken(token);

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + REFRESH_TOKEN_EXPIRES_DAYS);

    await this.prisma.refreshToken.create({
      data: { tokenHash, username, ipAddress: ipAddress ?? null, expiresAt },
    });

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
