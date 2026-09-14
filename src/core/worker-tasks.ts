import { itemSchema, connectionSchema, validateProject, type Project } from './model';
export function benchmarkProject(count: number): Project {
  if (![1000, 5000, 10000].includes(count)) throw new Error('Unsupported fixture size');
  const items: Project['items'] = [],
    connections: Project['connections'] = [];
  for (let g = 0; g < count / 100; g++) {
    const group = `Domain ${String(g + 1).padStart(3, '0')}`;
    items.push(
      itemSchema.parse({
        id: `g${g}`,
        kind: 'container',
        name: group,
        x: (g % 10) * 3100,
        y: Math.floor(g / 10) * 2000,
        width: 2950,
        height: 1840,
        groups: [group],
        icon: 'box',
      }),
    );
    for (let n = 0; n < 100; n++) {
      const id = `n${g}-${n}`;
      items.push(
        itemSchema.parse({
          id,
          kind: n % 5 === 0 ? 'database' : 'service',
          name: `Component ${g * 100 + n + 1}`,
          parentId: `g${g}`,
          x: 40 + (n % 10) * 290,
          y: 80 + Math.floor(n / 10) * 172,
          groups: [group, n % 5 === 0 ? 'Data' : 'Services'],
          icon: n % 5 === 0 ? 'database' : 'server',
          details: {
            description: 'Generated benchmark component with representative technical metadata.',
          },
        }),
      );
      if (n % 10 > 0)
        connections.push(
          connectionSchema.parse({
            id: `e${g}-${n}`,
            source: `n${g}-${n - 1}`,
            target: id,
            name: 'Call',
            groups: [group],
            details: {
              protocol: 'HTTP',
              encoding: 'JSON',
              request: 'GET /resource',
              response: '200 · Resource',
              timeout: '2 seconds',
            },
          }),
        );
    }
  }
  return validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: `${count.toLocaleString()} component benchmark`,
    revision: 0,
    items,
    connections,
    library: [],
  });
}
