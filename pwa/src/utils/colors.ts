/**
 * Dynamic Theme Engine for PAW
 * Generates a professional OKLCH color palette based on a single HEX input.
 */

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

function rgbToHsl(r: number, g: number, b: number) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let h = 0, s = 0, l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h /= 6;
  }
  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

/**
 * Generates CSS variables based on a hex color.
 * Uses OKLCH for consistent perceived lightness and saturation.
 */
export function generateThemeVariables(hexColor: string): Record<string, string> {
  const rgb = hexToRgb(hexColor);
  if (!rgb) return {};

  const hsl = rgbToHsl(rgb.r, rgb.g, rgb.b);
  const hue = hsl.h;

  // Accessibility: Determine if we need dark or light text on the primary-500 color
  // YIQ formula for perceived brightness
  const yiq = (rgb.r * 299 + rgb.g * 587 + rgb.b * 114) / 1000;
  const primaryForeground = yiq >= 128 ? 'oklch(20% 0.02 240)' : '#ffffff';

  return {
    '--primary-50':  `oklch(97% 0.03 ${hue})`,
    '--primary-100': `oklch(92% 0.06 ${hue})`,
    '--primary-200': `oklch(84% 0.10 ${hue})`,
    '--primary-300': `oklch(72% 0.14 ${hue})`,
    '--primary-400': `oklch(60% 0.18 ${hue})`,
    '--primary-500': `oklch(50% 0.20 ${hue})`,
    '--primary-600': `oklch(42% 0.18 ${hue})`,
    '--primary-700': `oklch(35% 0.16 ${hue})`,
    '--primary-800': `oklch(26% 0.12 ${hue})`,
    '--primary-900': `oklch(18% 0.08 ${hue})`,
    '--tw-primary': hexColor,
    '--primary-fg': primaryForeground,
    '--shadow-primary': `0 4px 14px oklch(50% 0.20 ${hue} / 0.35)`,
    };

}

export function applyTheme(variables: Record<string, string>) {
  const root = document.documentElement;
  Object.entries(variables).forEach(([key, value]) => {
    root.style.setProperty(key, value);
  });
}
