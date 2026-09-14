import { routeConnection } from './routing';
import { canContain } from './containment';
import { absolutePositions, palette, entityColor, type Project } from './model';
import { shapePath } from './shapes';
import { brandPaths } from './brands';
import { iconPaths } from './library';
const escape = (value: unknown) =>
  String(value).replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
function lines(text: string, width: number, max = 3) {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    if ((line + ' ' + word).length > Math.max(8, Math.floor(width / 7)) && line) {
      result.push(line);
      line = '';
    }
    line += (line ? ' ' : '') + word;
  }
  if (line) result.push(line);
  return result
    .slice(0, max)
    .map((line, i) => `<tspan x="16" dy="${i ? 18 : 0}">${escape(line)}</tspan>`)
    .join('');
}
function connectionText(text: string) {
  const result: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const chunks = word.match(/.{1,34}/gu) || [];
    for (const chunk of chunks) {
      if (line && line.length + chunk.length + 1 > 34) {
        result.push(line);
        line = '';
      }
      line += (line ? ' ' : '') + chunk;
    }
  }
  if (line) result.push(line);
  return result;
}
export function projectSvg(project: Project): { svg: string; width: number; height: number } {
  const positions = absolutePositions(project.items),
    routingNodes = project.items.map((item) => ({
      item,
      ...positions.get(item.id)!,
      width: item.width,
      height: item.height,
    })),
    map = new Map(routingNodes.map((node) => [node.item.id, node]));
  let minX = 0,
    minY = 0,
    maxX = 600,
    maxY = 400;
  for (const item of project.items) {
    const p = positions.get(item.id)!;
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x + item.width);
    maxY = Math.max(maxY, p.y + item.height);
  }
  const shapes = [...project.items]
    .sort((a, b) => Number(canContain(b)) - Number(canContain(a)))
    .map((item) => {
      const p = positions.get(item.id)!;
      const title = `<title>${escape(item.name + '\n' + item.details.description)}</title>`;
      if (item.kind === 'participant')
        return `<g transform="translate(${p.x} ${p.y})">${title}<rect x="1" y="1" width="${item.width - 2}" height="62" rx="7" fill="white" stroke="${entityColor(item)}" stroke-width="2"/><g transform="translate(14 20)" fill="${brandPaths[item.icon] ? entityColor(item) : 'none'}" stroke="${brandPaths[item.icon] ? 'none' : entityColor(item)}" stroke-width="1.6"><path d="${brandPaths[item.icon] || iconPaths[item.icon]}"/></g><text x="${item.width / 2 + 10}" y="37" text-anchor="middle" fill="${palette.navy}" font-size="14" font-weight="600">${escape(item.name)}</text><line x1="${item.width / 2}" x2="${item.width / 2}" y1="64" y2="${item.height}" stroke="${entityColor(item)}" stroke-width="1.5" stroke-dasharray="6 5"/></g>`;
      if (item.kind === 'stroke')
        return `<g transform="translate(${p.x} ${p.y})">${title}<polyline points="${item.points?.map((point) => point.join(',')).join(' ')}" fill="none" stroke="${entityColor(item)}" stroke-width="${item.strokeWidth || 2.5}" stroke-linecap="round" stroke-linejoin="round"/></g>`;
      const path = shapePath(item.shape, item.width, item.height);
      const outline = path
        ? `<path d="${path}" fill="white" stroke="${entityColor(item)}" stroke-width="2"/>`
        : `<rect x="1" y="1" width="${item.width - 2}" height="${item.height - 2}" stroke-width="2" rx="${item.shape === 'terminal' ? item.height / 2 : 8}" fill="${item.kind === 'container' ? '#F1F5F9' : '#FFFFFF'}" stroke="${entityColor(item)}" ${item.kind === 'container' ? 'stroke-dasharray="6 4"' : ''}/>`;

      const centered = item.shape === 'decision' || item.shape === 'terminal';
      const labelWidth = centered ? item.width * 0.55 : item.width - 55;
      const headingX = centered
        ? (item.width - Math.min(labelWidth, item.name.length * 8 + 34)) / 2
        : item.shape === 'input'
          ? item.width * 0.12 + 10
          : 16;
      const headingY = centered ? item.height / 2 - 12 : 16;
      return `<g transform="translate(${p.x} ${p.y})">${title}${outline}${item.shape === 'process' ? `<path d="M8 1V${item.height - 1} M${item.width - 8} 1V${item.height - 1}" stroke="${entityColor(item)}"/>` : ''}<g transform="translate(${headingX} ${headingY})" fill="${brandPaths[item.icon] ? entityColor(item) : 'none'}" stroke="${brandPaths[item.icon] ? 'none' : entityColor(item)}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="${brandPaths[item.icon] || iconPaths[item.icon]}"/></g><text x="${headingX + 34}" y="${headingY + 16}" fill="${palette.navy}" font-size="14" font-weight="600">${escape(item.name.slice(0, Math.floor(labelWidth / 8)))}</text>${centered || item.kind === 'container' || item.kind === 'icon' ? '' : `<text x="16" y="64" fill="${palette.slate}" font-size="12">${lines(item.details.description || item.kind, item.width - 32)}</text>`}</g>`;
    });
  const backgrounds = shapes.slice(0, project.items.filter(canContain).length).join('');
  const cards = shapes.slice(project.items.filter(canContain).length).join('');
  const edges = project.connections
    .map((edge) => {
      const a = map.get(edge.source)!,
        b = map.get(edge.target)!;
      const route = routeConnection(a, b, edge, routingNodes);
      const d = route.path;
      const labelLines = connectionText(
        (edge.direction === 'bidirectional' ? '↔ ' : '→ ') + edge.name,
      );
      const labelY = route.label.y - 8 - (labelLines.length - 1) * 7;
      for (const point of route.points) {
        minX = Math.min(minX, point.x);
        minY = Math.min(minY, point.y);
        maxX = Math.max(maxX, point.x);
        maxY = Math.max(maxY, point.y);
      }
      return `<g><title>${escape(edge.name + '\n' + JSON.stringify(edge.details))}</title><path d="${d}" fill="none" stroke="${entityColor(edge)}" stroke-width="2.2" ${edge.lineStyle === 'dashed' ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#arrow-${edge.color || 'slate'})" ${edge.direction === 'bidirectional' ? `marker-start="url(#arrow-${edge.color || 'slate'})"` : ''}/><text x="${route.label.x}" y="${labelY}" text-anchor="middle" fill="${palette.slate}" font-size="11" stroke="${palette.canvas}" stroke-width="4" paint-order="stroke">${labelLines.map((line, i) => `<tspan x="${route.label.x}" dy="${i ? 14 : 0}">${escape(line)}</tspan>`).join('')}</text></g>`;
    })
    .join('');
  const width = maxX - minX + 80,
    height = maxY - minY + 80;
  return {
    width,
    height,
    svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${minX - 40} ${minY - 40} ${width} ${height}" font-family="system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"><metadata>${escape(JSON.stringify(project))}</metadata><defs>${Object.entries(
      palette,
    )
      .map(
        ([name, color]) =>
          `<marker id="arrow-${name}" markerWidth="8" markerHeight="8" refX="8" refY="4" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="${color}"/></marker>`,
      )
      .join(
        '',
      )}</defs><rect x="${minX - 40}" y="${minY - 40}" width="${width}" height="${height}" fill="${palette.canvas}"/>${backgrounds}${edges}${cards}</svg>`,
  };
}
export function download(data: BlobPart, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportPng(project: Project) {
  const { svg, width, height } = projectSvg(project);
  const scale = Math.min(2, 8192 / width, 8192 / height, Math.sqrt(24_000_000 / (width * height)));
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('PNG canvas unavailable');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG export failed'))), 'image/png'),
    );
    download(blob, 'dedalo.png', 'image/png');
    return `${canvas.width} × ${canvas.height} PNG exported${scale < 1 ? ' (scaled to browser-safe size; use SVG for full resolution)' : ''}`;
  } finally {
    URL.revokeObjectURL(url);
  }
}
