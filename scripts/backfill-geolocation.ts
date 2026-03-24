import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface IpApiResponse {
  status: string;
  city?: string;
  regionName?: string;
  countryCode?: string;
}

async function lookup(ip: string): Promise<{ city: string | null; country: string | null }> {
  try {
    const res = await fetch(`http://ip-api.com/json/${ip}?fields=status,city,regionName,countryCode`);
    const data = (await res.json()) as IpApiResponse;
    if (data.status !== 'success') return { city: null, country: null };
    return {
      city: data.regionName && data.city ? `${data.city}, ${data.regionName}` : (data.city ?? null),
      country: data.countryCode ?? null,
    };
  } catch {
    return { city: null, country: null };
  }
}

async function main() {
  const views = await prisma.pageView.findMany({
    where: { city: null, ipAddress: { not: null } },
    select: { id: true, ipAddress: true },
  });

  const uniqueIps = [...new Set(views.map(v => v.ipAddress).filter(Boolean))] as string[];
  console.log(`Found ${views.length} views with ${uniqueIps.length} unique IPs to backfill`);

  const geoCache = new Map<string, { city: string | null; country: string | null }>();

  for (const ip of uniqueIps) {
    const geo = await lookup(ip);
    geoCache.set(ip, geo);
    console.log(`  ${ip} → ${geo.city ?? 'unknown'}, ${geo.country ?? 'unknown'}`);
    await new Promise(r => setTimeout(r, 1400)); // ip-api.com free tier: 45/min
  }

  let updated = 0;
  for (const view of views) {
    const geo = view.ipAddress ? geoCache.get(view.ipAddress) : null;
    if (geo && (geo.city || geo.country)) {
      await prisma.pageView.update({
        where: { id: view.id },
        data: { city: geo.city, country: geo.country },
      });
      updated++;
    }
  }

  console.log(`\nBackfill complete: ${updated}/${views.length} views updated`);
  await prisma.$disconnect();
}

main().catch(console.error);
