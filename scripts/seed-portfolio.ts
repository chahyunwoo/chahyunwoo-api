/**
 * 포트폴리오 프로필 데이터를 DB에 시드
 *
 * Usage: npx tsx scripts/seed-portfolio.ts
 */
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';

function getEnvOrThrow(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not defined`);
  return value;
}

async function main() {
  const adapter = new PrismaPg({ connectionString: getEnvOrThrow('DATABASE_URL') });
  const prisma = new PrismaClient({ adapter });

  try {
    // ─── Profile ──────────────────────────────────────────────────────────────
    const profile = await prisma.profile.create({
      data: {
        name: 'CHA HYUNWOO',
        location: 'Seoul, Korea',
        socialLinks: JSON.parse(JSON.stringify([
          { name: 'Github', href: 'https://github.com/chahyunwoo', icon: 'Github' },
          { name: 'Instagram', href: 'https://instagram.com/chwzp', icon: 'Instagram' },
          { name: 'Linkedin', href: 'https://www.linkedin.com/in/chahyunwoo', icon: 'Linkedin' },
        ])),
        translations: {
          create: [
            { locale: 'ko', jobTitle: 'Full-Stack Developer', introduction: ['어디서든 잘 녹아드는 유연한 사고와 자세가 제 장점입니다.', '생산성을 높이는 코드를 작성하는 것을 좋아합니다.', '오늘 10분 걸린 코드가, 내일은 5분 걸릴 수 있도록 노력합니다.'] },
            { locale: 'en', jobTitle: 'Full-Stack Developer', introduction: ['I am a developer who is flexible and easy to adapt to any situation.', 'I like to write code that increases productivity.', 'I try to write code that takes 10 minutes today, but takes 5 minutes tomorrow.'] },
            { locale: 'jp', jobTitle: 'Full-Stack Developer', introduction: ['どこでもよく溶け込む柔軟な思考と姿勢が私の長所です。', '生産性を高めるコードを作成するのが好きです。', '今日10分かかったコードが、明日は5分で済むように努力します。'] },
          ],
        },
      },
    });
    console.log(`Profile created: ${profile.name}`);

    // ─── Experiences ──────────────────────────────────────────────────────────
    const experiences = [
      {
        sortOrder: 1, startDate: '2025', endDate: null, isCurrent: true,
        ko: { title: '프리랜서 풀스택 개발자', role: 'Full-Stack Developer / Freelancer', responsibilities: ['금융권 백오피스 시스템 설계 및 프론트엔드 테크 리딩 (React 19 + TanStack)', 'Feature-First Architecture 기반 도메인 중심 모듈화 구조 설계', 'TanStack Router/Query/Table/Virtual 기반 대규모 데이터 처리 시스템 구현', 'SSE 기반 실시간 데이터 스트리밍 및 JWT + 2FA 인증 시스템 개발', 'Next.js 기반 서비스 가이드 UI 개발', '대기업 디자인 시스템 및 공통 컴포넌트 설계/개발'] },
        en: { title: 'Freelance Full-Stack Developer', role: 'Full-Stack Developer / Freelancer', responsibilities: ['Financial back-office system design and frontend tech leading (React 19 + TanStack)', 'Feature-First Architecture based domain-centric modular structure design', 'Large-scale data processing system with TanStack Router/Query/Table/Virtual', 'SSE-based real-time data streaming and JWT + 2FA authentication system', 'Next.js service guide UI development', 'Enterprise design system and shared component design/development'] },
        jp: { title: 'フリーランスフルスタック開発者', role: 'Full-Stack Developer / Freelancer', responsibilities: ['金融バックオフィスシステム設計・フロントエンドテックリーディング (React 19 + TanStack)', 'Feature-First Architectureベースのドメイン中心モジュール化構造設計', 'TanStack Router/Query/Table/Virtualベースの大規模データ処理システム実装', 'SSEベースのリアルタイムデータストリーミング・JWT + 2FA認証システム開発', 'Next.jsサービスガイドUI開発', '大企業デザインシステム・共通コンポーネント設計/開発'] },
      },
      {
        sortOrder: 2, startDate: '2024', endDate: '2025', isCurrent: false,
        ko: { title: '대규모 사용자 IoT 서비스 webOS TV App 개발', role: 'FE Developer / PL', responsibilities: ['webOS TV 앱 아키텍처 설계부터 프로덕션 출시까지 프론트엔드 개발 리드', 'Redux 에코시스템(redux-thunk, redux-saga) 기반 상태 관리 아키텍처 설계', 'Jenkins CI/CD 파이프라인 구축 및 자동화된 빌드/배포 프로세스 최적화', '다국어 지원(미국, 독일, 러시아, 영국) 시스템 구축 및 i18n 통합 관리', 'WCAG 2.1 접근성 표준 준수 및 성능 최적화 (로딩 시간 30% 단축)', 'webOS luna API 분석 및 TV 하드웨어 리소스 최적화 연동 설계'] },
        en: { title: 'Large-Scale IoT Service webOS TV App Development', role: 'FE Developer / PL', responsibilities: ['Led frontend development from webOS TV app architecture design to production release', 'Redux ecosystem (redux-thunk, redux-saga) based state management architecture design', 'Jenkins CI/CD pipeline and automated build/deployment process optimization', 'Multi-language support (US, Germany, Russia, UK) system and i18n integration', 'WCAG 2.1 accessibility compliance and performance optimization (30% loading time reduction)', 'webOS luna API analysis and optimized TV hardware resource integration'] },
        jp: { title: '大規模IoTサービス webOS TV App開発', role: 'FE Developer / PL', responsibilities: ['webOS TVアプリのアーキテクチャ設計からプロダクションリリースまでフロントエンド開発をリード', 'Reduxエコシステム(redux-thunk, redux-saga)ベースの状態管理アーキテクチャ設計', 'Jenkins CI/CDパイプライン構築・自動化ビルド/デプロイプロセス最適化', '多言語対応(米国、ドイツ、ロシア、英国)システム構築・i18n統合管理', 'WCAG 2.1アクセシビリティ標準準拠・パフォーマンス最適化 (ローディング時間30%短縮)', 'webOS luna API分析・TVハードウェアリソース最適化連携設計'] },
      },
      {
        sortOrder: 3, startDate: '2023', endDate: '2023', isCurrent: false,
        ko: { title: '대규모 사용자 IoT 서비스 공통 컴포넌트 개발', role: 'FE Developer', responsibilities: ['React 기반 크로스플랫폼 웹뷰 아키텍처 설계 및 성능 최적화 (로딩 속도 40% 개선)', '엔터프라이즈급 컴포넌트 라이브러리 구축 및 Storybook 인터랙티브 문서화', 'D3.js 기반 실시간 데이터 시각화 대시보드 개발', 'iOS/Android 플랫폼별 브라우저 엔진 차이 분석 및 적응형 렌더링 로직 구현', 'PropTypes + TypeScript 타입 안정성 강화로 런타임 오류 85% 감소', 'FUT(Functional Under Test) 환경 구축으로 컴포넌트 테스트 자동화'] },
        en: { title: 'Large-Scale IoT Service Shared Component Development', role: 'FE Developer', responsibilities: ['React cross-platform webview architecture design and performance optimization (40% loading speed improvement)', 'Enterprise component library development with Storybook interactive documentation', 'D3.js real-time data visualization dashboard development', 'iOS/Android platform browser engine analysis and adaptive rendering implementation', 'PropTypes + TypeScript type safety improvements reducing runtime errors by 85%', 'FUT (Functional Under Test) environment for component test automation'] },
        jp: { title: '大規模IoTサービス共通コンポーネント開発', role: 'FE Developer', responsibilities: ['Reactクロスプラットフォームウェブビューアーキテクチャ設計・パフォーマンス最適化 (ローディング速度40%改善)', 'エンタープライズコンポーネントライブラリ構築・Storybookインタラクティブドキュメンテーション', 'D3.jsリアルタイムデータ可視化ダッシュボード開発', 'iOS/Androidプラットフォーム別ブラウザエンジン分析・適応型レンダリング実装', 'PropTypes + TypeScript型安全性強化によりランタイムエラー85%削減', 'FUT(Functional Under Test)環境構築によるコンポーネントテスト自動化'] },
      },
      {
        sortOrder: 4, startDate: '2021', endDate: '2022', isCurrent: false,
        ko: { title: '채용 플랫폼 서비스 프론트엔드 개발', role: 'FE Developer', responsibilities: ['Vue.js, React 기반 채용 플랫폼 프론트엔드 핵심 기능 설계 및 개발', '초기 스타트업 핵심 멤버로 서비스 고속 성장기 확장 및 안정화 기여', '반응형 웹 UI/UX 설계 및 사용자 경험 최적화', 'REST API 연동 및 클라이언트 상태 관리 아키텍처 설계', '재사용 가능한 컴포넌트 라이브러리 설계 및 개발', '사용자 트래픽 증가에 따른 성능 병목 분석 및 렌더링 최적화'] },
        en: { title: 'Recruitment Platform Frontend Development', role: 'FE Developer', responsibilities: ['Core frontend feature design and development for recruitment platform with Vue.js and React', 'Contributed to service scaling and stabilization during rapid growth as an early startup member', 'Responsive web UI/UX design and user experience optimization', 'REST API integration and client state management architecture design', 'Reusable component library design and development', 'Performance bottleneck analysis and rendering optimization for growing user traffic'] },
        jp: { title: '採用プラットフォームフロントエンド開発', role: 'FE Developer', responsibilities: ['Vue.js、Reactベースの採用プラットフォームのフロントエンドコア機能設計・開発', 'スタートアップ初期メンバーとしてサービス急成長期の拡張・安定化に貢献', 'レスポンシブウェブUI/UX設計・ユーザー体験最適化', 'REST API連携・クライアント状態管理アーキテクチャ設計', '再利用可能なコンポーネントライブラリ設計・開発', 'ユーザートラフィック増加に伴うパフォーマンスボトルネック分析・レンダリング最適化'] },
      },
      {
        sortOrder: 5, startDate: '2021', endDate: '2021', isCurrent: false,
        ko: { title: 'Web3 & 블록체인 기반 금융 서비스 개발', role: 'Full-Stack Developer', responsibilities: ['은행권 모바일 앱 UI 개발 및 사용자 인터페이스 담당', 'NFT 기반 인증 시스템 개발 (OpenSea 연동, 전자지갑 통합)', 'Web3 기술을 활용한 탈중앙화 웹 서비스 개발', '메타마스크 등 전자지갑 연동 로그인 시스템 구축', 'NFT 민팅/거래 인터페이스 설계 및 스마트 컨트랙트 연동', '블록체인 기반 사용자 인증 플로우 설계 및 구현'] },
        en: { title: 'Web3 & Blockchain-Based Financial Service Development', role: 'Full-Stack Developer', responsibilities: ['Banking mobile app UI development and user interface management', 'NFT-based authentication system development (OpenSea integration, digital wallet)', 'Decentralized web service development utilizing Web3 technology', 'MetaMask and digital wallet login system development', 'NFT minting/trading interface design and smart contract integration', 'Blockchain-based user authentication flow design and implementation'] },
        jp: { title: 'Web3・ブロックチェーンベース金融サービス開発', role: 'Full-Stack Developer', responsibilities: ['銀行モバイルアプリUI開発・ユーザーインターフェース担当', 'NFTベース認証システム開発 (OpenSea連携、電子ウォレット統合)', 'Web3技術を活用した分散型ウェブサービス開発', 'メタマスク等電子ウォレット連携ログインシステム構築', 'NFTミンティング/取引インターフェース設計・スマートコントラクト連携', 'ブロックチェーンベースのユーザー認証フロー設計・実装'] },
      },
      {
        sortOrder: 6, startDate: '2017', endDate: '2020', isCurrent: false,
        ko: { title: '금융 서비스 풀스택 개발', role: 'Full-Stack Developer', responsibilities: ['Java Spring 기반 금융 서비스 백엔드 시스템 설계 및 개발', '금융 데이터 처리를 위한 DB 스키마 설계 및 쿼리 최적화', '대용량 금융 트랜잭션 처리 시스템 안정성 확보', '프론트엔드 + 백엔드 풀스택 웹 서비스 구축', 'REST API 설계 및 외부 금융 API 연동 개발', '금융 보안 규정 준수를 위한 인증/인가 시스템 구현'] },
        en: { title: 'Financial Service Full-Stack Development', role: 'Full-Stack Developer', responsibilities: ['Financial service backend system design and development with Java Spring', 'DB schema design and query optimization for financial data processing', 'High-volume financial transaction processing system stability assurance', 'Full-stack web service development (frontend + backend)', 'REST API design and external financial API integration', 'Authentication/authorization system for financial security regulation compliance'] },
        jp: { title: '金融サービスフルスタック開発', role: 'Full-Stack Developer', responsibilities: ['Java Springベースの金融サービスバックエンドシステム設計・開発', '金融データ処理のためのDBスキーマ設計・クエリ最適化', '大容量金融トランザクション処理システムの安定性確保', 'フロントエンド + バックエンドフルスタックウェブサービス構築', 'REST API設計・外部金融API連携開発', '金融セキュリティ規定準拠のための認証/認可システム実装'] },
      },
    ];

    for (const exp of experiences) {
      await prisma.experience.create({
        data: {
          sortOrder: exp.sortOrder,
          startDate: exp.startDate,
          endDate: exp.endDate,
          isCurrent: exp.isCurrent,
          translations: {
            create: [
              { locale: 'ko', ...exp.ko },
              { locale: 'en', ...exp.en },
              { locale: 'jp', ...exp.jp },
            ],
          },
        },
      });
    }
    console.log(`Experiences created: ${experiences.length}`);

    // ─── Projects ─────────────────────────────────────────────────────────────
    const projects = [
      {
        sortOrder: 1, demoUrl: 'https://chahyunwoo.dev', repoUrl: null, techStack: ['Next.js', 'TypeScript', 'Tailwind CSS', 'MDX', 'Vercel'], featured: true,
        ko: { title: 'hyunwoo.dev', description: 'Next.js 16 기반 개인 기술 블로그. MDX 콘텐츠, Cmd+K 검색, SEO 최적화.' },
        en: { title: 'hyunwoo.dev', description: 'Personal tech blog built with Next.js 16. MDX content, Cmd+K search, SEO optimized.' },
        jp: { title: 'hyunwoo.dev', description: 'Next.js 16ベースの個人技術ブログ。MDXコンテンツ、Cmd+K検索、SEO最適化。' },
      },
      {
        sortOrder: 2, demoUrl: null, repoUrl: 'https://github.com/chahyunwoo/github-tier', techStack: ['Hono', 'TypeScript', 'Vercel Edge Functions', 'GitHub API'], featured: true,
        ko: { title: 'GitHub Tier', description: 'GitHub 활동을 분석해 롤 티어 스타일 랭크 카드를 생성하는 오픈소스 위젯.' },
        en: { title: 'GitHub Tier', description: 'Open-source widget that generates LoL-style tier rank cards based on GitHub activity.' },
        jp: { title: 'GitHub Tier', description: 'GitHub活動を分析してLoLスタイルのティアランクカードを生成するオープンソースウィジェット。' },
      },
      {
        sortOrder: 3, demoUrl: 'https://discord.gg/fgwtkprgyg', repoUrl: null, techStack: ['Python', 'discord.py', 'Docker', 'AWS', 'GitHub Actions'], featured: true,
        ko: { title: 'Discord Multi-Bot', description: '열차 예매 보조, 실시간 주유 최저가 알림 등 다기능 디스코드 봇.' },
        en: { title: 'Discord Multi-Bot', description: 'Multi-feature Discord bot with train booking assistance and real-time gas price alerts.' },
        jp: { title: 'Discord Multi-Bot', description: '列車予約補助、リアルタイム給油最安値アラートなど多機能Discordボット。' },
      },
    ];

    for (const proj of projects) {
      await prisma.project.create({
        data: {
          sortOrder: proj.sortOrder,
          demoUrl: proj.demoUrl,
          repoUrl: proj.repoUrl,
          techStack: proj.techStack,
          featured: proj.featured,
          translations: {
            create: [
              { locale: 'ko', title: proj.ko.title, description: proj.ko.description },
              { locale: 'en', title: proj.en.title, description: proj.en.description },
              { locale: 'jp', title: proj.jp.title, description: proj.jp.description },
            ],
          },
        },
      });
    }
    console.log(`Projects created: ${projects.length}`);

    // ─── Skills ───────────────────────────────────────────────────────────────
    const skillData = [
      { category: 'Frontend', items: ['TypeScript', 'React', 'Next.js', 'Vue.js', 'Tailwind CSS', 'Redux', 'Zustand', 'TanStack Query'] },
      { category: 'Backend', items: ['Node.js', 'Python', 'Java Spring', 'FastAPI', 'PostgreSQL', 'Docker'] },
      { category: 'Mobile', items: ['React Native', 'Flutter'] },
      { category: 'DevOps & Tools', items: ['GitHub Actions', 'Jenkins', 'AWS', 'Vercel', 'Docker', 'Figma'] },
    ];

    let skillOrder = 0;
    for (const group of skillData) {
      for (const name of group.items) {
        await prisma.skill.create({
          data: { category: group.category, name, sortOrder: skillOrder++ },
        });
      }
    }
    console.log(`Skills created: ${skillOrder}`);

    // ─── Education ────────────────────────────────────────────────────────────
    const educationData = [
      {
        period: '2011 - 2017', sortOrder: 1,
        ko: { institution: '숭실대학교', degree: '회계학 학사, 컴퓨터공학 부전공' },
        en: { institution: 'Soongsil University', degree: 'Bachelor of Accounting, Computer Science Minor' },
        jp: { institution: 'SOONGSIL UNIVERSITY', degree: '会計学 学士, コンピュータサイエンス 副専攻' },
      },
      {
        period: '2024 - 2025', sortOrder: 2,
        ko: { institution: '학점은행제', degree: '컴퓨터공학 학사' },
        en: { institution: 'ACBS', degree: 'Bachelor of Computer Science' },
        jp: { institution: 'ACBS', degree: 'コンピュータサイエンス 学士' },
      },
    ];

    for (const edu of educationData) {
      await prisma.education.create({
        data: {
          period: edu.period,
          sortOrder: edu.sortOrder,
          translations: {
            create: [
              { locale: 'ko', ...edu.ko },
              { locale: 'en', ...edu.en },
              { locale: 'jp', ...edu.jp },
            ],
          },
        },
      });
    }
    console.log(`Education created: ${educationData.length}`);

    console.log('\nPortfolio seed complete!');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
