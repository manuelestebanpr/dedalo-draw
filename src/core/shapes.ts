import type { Item } from './model';
export function shapePath(shape: Item['shape'], w: number, h: number) {
  if (shape === 'decision') return `M${w / 2} 1 L${w - 1} ${h / 2} ${w / 2} ${h - 1} 1 ${h / 2} Z`;
  if (shape === 'input') return `M${w * 0.12} 1 H${w - 1} L${w * 0.88} ${h - 1} H1 Z`;
  if (shape === 'document')
    return `M1 1 H${w - 1} V${h - 18} C${w * 0.65} ${h - 42} ${w * 0.35} ${h + 12} 1 ${h - 18} Z`;
  return '';
}
