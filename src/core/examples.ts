import { nkDemo } from './nk-demo';
import {
  makeItem,
  spaceConnectionLabels,
  connectionSchema,
  validateProject,
  type Item,
  type Project,
  type Connection,
  type Details,
} from './model';
import { sampleProject } from './sample';
type Step = {
  name: string;
  kind?: Item['kind'];
  icon?: Item['icon'];
  x: number;
  y: number;
  description: string;
};
type Link = {
  from: number;
  to: number;
  name: string;
  direction?: Connection['direction'];
  details?: Partial<Details>;
};
function diagram(name: string, steps: Step[], links: Link[]): Project {
  const items = steps.map(({ description, ...s }, i) => {
    const item = makeItem(s.kind || 'service', s.x, s.y);
    return { ...item, ...s, id: `step-${i}`, details: { ...item.details, description } };
  });
  return validateProject({
    format: 'dedalo-draw',
    version: 1,
    name,
    items,
    connections: links.map(({ from, to, ...link }, i) =>
      connectionSchema.parse({
        id: `link-${i}`,
        source: items[from].id,
        target: items[to].id,
        ...link,
      }),
    ),
    library: [],
  });
}
const request = (
  from: number,
  to: number,
  name: string,
  protocol: string,
  input: string,
  response: string,
  extra: Partial<Link> = {},
): Link => ({
  from,
  to,
  name,
  direction: 'bidirectional',
  details: { protocol, request: input, response },
  ...extra,
});
function springExample() {
  return diagram(
    'Spring microservices',
    [
      {
        name: 'Web client',
        kind: 'client',
        icon: 'browser',
        x: 0,
        y: 0,
        description:
          'Lists and displays orders with GET /api/orders/{id}; creates orders with POST /api/orders. Consumes JSON responses through the gateway. Redis is accessed only by the service.',
      },
      {
        name: 'API gateway',
        icon: 'spring',
        x: 380,
        y: 0,
        description:
          'Authenticates the browser request, routes /api/orders to Order service, and forwards the response. Propagates identity and correlation IDs; returns 401/403 for unauthorized access.',
      },
      {
        name: 'Order service',
        icon: 'springboot',
        x: 760,
        y: 0,
        description:
          'Cache-aside reads: GET Redis order:{tenant}:{id}; on a miss, query PostgreSQL, cache the result for 300 seconds, then return JSON to the frontend. Authorize every request. Writes commit the order and an outbox event in one database transaction, then invalidate the order cache. Cache errors fall back to PostgreSQL.',
      },
      {
        name: 'PostgreSQL',
        kind: 'database',
        icon: 'postgresql',
        x: 1140,
        y: 0,
        description:
          'Source of truth for orders. Stores order changes and outbox events atomically. Returns the order on a cache miss; a missing row becomes HTTP 404. The relay marks outbox records published only after Kafka acknowledges them.',
      },
      {
        name: 'Redis cache',
        kind: 'database',
        icon: 'redis',
        x: 760,
        y: 300,
        description:
          'Order read cache. Key: order:{tenant}:{id}. TTL: 300 seconds (5 minutes), an illustrative freshness budget. SET ... EX 300 on cache fill; DEL after committed writes. Cache hits return the order through Order service and gateway to the frontend. TTL bounds stale data if invalidation fails.',
      },
      {
        name: 'Outbox relay',
        icon: 'springboot',
        x: 1140,
        y: 300,
        description:
          'Polls unpublished outbox rows and publishes OrderCreated/OrderUpdated events to Kafka. Retries on failure; duplicate publication is possible, so every event carries a stable eventId.',
      },
      {
        name: 'Kafka · orders',
        kind: 'queue',
        icon: 'apachekafka',
        x: 1140,
        y: 600,
        description:
          'Durable order events keyed by orderId for per-order partition ordering. This example uses 7-day retention. At-least-once delivery requires idempotent consumers; retention is separate from the Redis cache TTL.',
      },
      {
        name: 'Fulfillment worker',
        icon: 'springboot',
        x: 760,
        y: 600,
        description:
          'Consumes orders as group fulfillment-v1, deduplicates eventId in durable storage, and commits offsets after successful processing. Retries transient failures; sends exhausted failures to orders.dlq.',
      },
      {
        name: 'orders.dlq',
        kind: 'queue',
        icon: 'apachekafka',
        x: 380,
        y: 600,
        description:
          'Retains failed events and error context for operator review and controlled replay after the underlying problem is fixed.',
      },
    ],
    [
      request(
        0,
        1,
        'GET / POST orders · JSON response',
        'HTTPS',
        'GET /api/orders/{id} or POST /api/orders',
        '200 order JSON, 201 created, 401/403 unauthorized or 404 missing',
      ),
      request(
        1,
        2,
        'Forward request · return result',
        'HTTP / JSON',
        'Authorized request with tenant and correlation ID',
        'Order representation or mapped error',
      ),
      request(
        2,
        3,
        'Miss: SELECT · writes: order + outbox',
        'PostgreSQL',
        'SELECT scoped by tenant; atomic order + outbox transaction',
        'Order row or committed write',
      ),
      request(
        2,
        4,
        'GET hit/miss · SET EX 300 · DEL',
        'Redis RESP',
        'GET order:{tenant}:{id}; SET on miss; DEL after write',
        'Cached order or nil; service returns JSON to frontend',
        {
          details: {
            protocol: 'Redis RESP',
            request: 'GET order:{tenant}:{id}; on miss SET ... EX 300; DEL after committed writes',
            response: 'Cached order or nil',
            timeout: 'TTL 300 seconds (5 minutes); example cache deadline 50 ms',
            failure:
              'On timeout or cache failure query PostgreSQL. Do not fail the order read solely because Redis is unavailable.',
          },
        },
      ),
      request(
        5,
        3,
        'Poll outbox · mark acknowledged',
        'SQL',
        'Fetch unpublished events; mark only after broker acknowledgment',
        'Pending events',
      ),
      {
        from: 5,
        to: 6,
        name: 'Publish OrderCreated / OrderUpdated',
        details: {
          protocol: 'Kafka',
          encoding: 'JSON event v1: eventId, orderId, tenantId',
          failure: 'Retry publication; duplicate events are possible.',
        },
      },
      {
        from: 6,
        to: 7,
        name: 'Consume · fulfillment-v1',
        details: {
          protocol: 'Kafka',
          timeout: 'Commit offset after processing; at-least-once delivery',
          failure: 'Deduplicate eventId; retry then dead-letter.',
        },
      },
      {
        from: 7,
        to: 8,
        name: 'Exhausted retries',
        details: {
          protocol: 'Kafka',
          description: 'Publish original event and failure context for review.',
        },
      },
    ],
  );
}
function sequenceExample() {
  const names: [string, Item['icon'], string][] = [
    ['Frontend', 'browser', 'Requests an authorized order and renders the returned JSON.'],
    ['Gateway', 'spring', 'Authenticates and routes the request; relays the HTTP response.'],
    [
      'Order service',
      'springboot',
      'Cache-aside order read. This sequence illustrates a cache miss; on a hit, skip SQL and SET and return the cached order.',
    ],
    ['Redis', 'redis', 'Key order:{tenant}:{id}; TTL 300 seconds (5 minutes). A miss returns nil.'],
    ['PostgreSQL', 'postgresql', 'Durable source of truth; returns the tenant-scoped order.'],
  ];
  const items = names.map(([name, icon, description], i) => {
    const item = makeItem('participant', i * 340, 0);
    return {
      ...item,
      id: `actor-${i}`,
      name,
      icon,
      height: 840,
      details: { ...item.details, description },
    };
  });
  const messages: [number, number, string, boolean][] = [
    [0, 1, '1. GET /api/orders/42', false],
    [1, 2, '2. Authorized GET /orders/42', false],
    [2, 3, '3. GET order:tenant:42', false],
    [3, 2, '4. nil · cache miss', true],
    [2, 4, '5. SELECT tenant order', false],
    [4, 2, '6. Order row', true],
    [2, 3, '7. SET order:tenant:42 EX 300', false],
    [3, 2, '8. OK · TTL 5 minutes', true],
    [2, 1, '9. 200 · order JSON', true],
    [1, 0, '10. 200 · render order', true],
  ];
  return validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'Sequence · order cache miss',
    items,
    connections: messages.map(([from, to, name, response], i) =>
      connectionSchema.parse({
        id: `message-${i}`,
        source: items[from].id,
        target: items[to].id,
        name,
        sourceOffset: 120 + i * 66,
        targetOffset: 120 + i * 66,
        lineStyle: response ? 'dashed' : 'solid',
        details: {
          description:
            'Time progresses downward. Solid arrows are requests; dashed arrows are responses. Cache hit: return immediately after Redis GET. Cache unavailable: continue to SQL. Missing order: return 404 without caching it.',
          protocol:
            from === 3 || to === 3 ? 'Redis RESP' : from === 4 || to === 4 ? 'SQL' : 'HTTP / JSON',
        },
      }),
    ),
    library: [],
  });
}
export const examples = [
  {
    title: 'NK residuality analysis',
    description:
      'Order platform with parent and submodule coupling, stressor matrices, residues and proposed validation.',
    create: nkDemo,
  },
  {
    title: 'System context',
    description: 'Client requests, service contracts, an order database and asynchronous events.',
    create: sampleProject,
  },
  {
    title: 'Spring microservices',
    description:
      'Frontend consumption, cache-aside reads with a 5-minute TTL, transactional outbox and consumers.',
    create: springExample,
  },
  {
    title: 'Sequence diagram',
    description:
      'An order cache miss, with five lifelines, ten ordered messages and dashed responses.',
    create: sequenceExample,
  },
  {
    title: 'Process flow',
    description:
      'A report request, validation, generation and delivery with explicit start and end.',
    create: () =>
      diagram(
        'Process flow',
        [
          {
            name: 'Start',
            kind: 'terminal',
            x: 0,
            y: 0,
            description: 'User requests an order report.',
          },
          {
            name: 'Receive filters',
            kind: 'input',
            x: 340,
            y: 0,
            description: 'Read the authorized tenant and requested date range.',
          },
          {
            name: 'Generate report',
            kind: 'process',
            x: 680,
            y: 0,
            description: 'Query orders within the validated date range and format the report.',
          },
          {
            name: 'Order report',
            kind: 'document',
            x: 1020,
            y: 0,
            description: 'Produce a CSV report for the authorized tenant.',
          },
          {
            name: 'Delivered',
            kind: 'terminal',
            x: 1360,
            y: 0,
            description: 'Return the file to the requester; the process is complete.',
          },
        ],
        [
          { from: 0, to: 1, name: 'Request report' },
          { from: 1, to: 2, name: 'Validated filters' },
          { from: 2, to: 3, name: 'CSV output' },
          { from: 3, to: 4, name: 'Download' },
        ],
      ),
  },
  {
    title: 'Decision flow',
    description: 'Validate a request, accept or reject it, and complete both branches.',
    create: () =>
      diagram(
        'Decision flow',
        [
          {
            name: 'Request received',
            kind: 'terminal',
            x: 0,
            y: 0,
            description: 'Receive an order submission.',
          },
          {
            name: 'Valid?',
            kind: 'decision',
            x: 340,
            y: 0,
            description: 'Validate required fields, quantity and tenant access.',
          },
          {
            name: 'Create order',
            kind: 'process',
            x: 720,
            y: 0,
            description: 'Persist the validated order atomically; return HTTP 201.',
          },
          {
            name: 'Validation errors',
            kind: 'document',
            x: 340,
            y: 300,
            description: 'Return HTTP 400 with field errors. No order is created.',
          },
          {
            name: 'Complete',
            kind: 'terminal',
            x: 720,
            y: 300,
            description: 'The caller receives either the created order or validation errors.',
          },
        ],
        [
          { from: 0, to: 1, name: 'Validate' },
          { from: 1, to: 2, name: 'Yes' },
          { from: 1, to: 3, name: 'No' },
          { from: 2, to: 4, name: '201 Created' },
          { from: 3, to: 4, name: '400 Bad Request' },
        ],
      ),
  },
  {
    title: 'Deployment',
    description: 'External traffic, cluster ingress, application replicas and durable storage.',
    create: () => {
      const p = diagram(
        'Deployment',
        [
          {
            name: 'Ingress',
            icon: 'nginx',
            x: 50,
            y: 90,
            description: 'Terminates TLS and routes /api traffic to the application service.',
          },
          {
            name: 'Application · 3 replicas',
            icon: 'docker',
            x: 430,
            y: 90,
            description:
              'Stateless Spring Boot pods behind a ClusterIP service; readiness probes exclude unready replicas. Configuration and credentials are injected at deployment.',
          },
          {
            name: 'PostgreSQL',
            kind: 'database',
            icon: 'postgresql',
            x: 810,
            y: 90,
            description:
              'Stateful database backed by a persistent volume. Automated backups and tested recovery protect durable order data.',
          },
        ],
        [
          request(0, 1, 'Route /api · response', 'HTTP', 'Authorized API request', 'JSON response'),
          request(
            1,
            2,
            'Query / commit',
            'PostgreSQL',
            'Tenant-scoped SQL over TLS',
            'Rows or transaction result',
          ),
        ],
      );
      const boundary = {
        ...makeItem('container'),
        id: 'cluster',
        name: 'Kubernetes cluster',
        icon: 'kubernetes' as const,
        width: 1120,
        height: 300,
      };
      const client = {
        ...makeItem('client', -360, 90),
        id: 'external-client',
        name: 'External client',
        details: {
          ...makeItem('client').details,
          description: 'Connects to the public ingress endpoint over HTTPS.',
        },
      };
      return validateProject({
        ...p,
        items: [boundary, ...p.items.map((i) => ({ ...i, parentId: boundary.id })), client],
        connections: [
          ...p.connections,
          connectionSchema.parse({
            id: 'external-https',
            source: client.id,
            target: p.items[0].id,
            name: 'HTTPS request / response',
            direction: 'bidirectional',
            details: { protocol: 'HTTPS', security: 'TLS at ingress' },
          }),
        ],
      });
    },
  },
].map((example) => ({ ...example, create: () => spaceConnectionLabels(example.create()) }));
