import { createHash } from 'node:crypto';

function hashToHue(title: string): number {
  const hash = createHash('md5').update(title).digest('hex');
  return Number.parseInt(hash.slice(0, 8), 16) % 360;
}

// s: 0-100 (percentage), l: 0-1 (fraction)
function hslToHex(h: number, s: number, l: number): string {
  const a = (s * Math.min(l, 1 - l)) / 100;
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, '0');
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

export function generateGradientColors(title: string, featured: boolean): [string, string] {
  const hue = hashToHue(title);
  const saturation = featured ? 80 : 40;
  const lightness = featured ? 60 : 50;

  const color1 = hslToHex(hue, saturation, lightness / 100);
  const color2 = hslToHex((hue + 30) % 360, saturation, lightness / 100);

  return [color1, color2];
}
