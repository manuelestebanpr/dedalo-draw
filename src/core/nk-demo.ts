import { makeItem, connectionSchema, validateProject, type Item } from './model';
import { createAnalysis, coupling } from './analysis';

export function nkDemo() {
  const node = (
    id: string,
    name: string,
    kind: Item['kind'],
    x: number,
    y: number,
    description: string,
    parentId?: string,
  ) => {
    const i = makeItem(kind, x, y);
    return {
      ...i,
      id,
      name,
      ...(parentId ? { parentId } : {}),
      details: { ...i.details, description },
      ...(kind === 'container' ? { width: 960, height: 330 } : {}),
    };
  };
  const project = validateProject({
    format: 'dedalo-draw',
    version: 1,
    name: 'NK demo · order platform',
    items: [
      node(
        'shop',
        'Storefront',
        'client',
        -360,
        90,
        'Submits orders with an idempotency key. Shows pending payment and fulfillment status.',
      ),
      node(
        'orders',
        'Orders',
        'container',
        0,
        0,
        'Owns order state and the atomic order/outbox invariant. One team and one data ownership boundary.',
      ),
      node(
        'api',
        'Order API',
        'service',
        40,
        90,
        'Commits pending orders and outbox rows atomically. Calls payment provider with a stable idempotency key; reconciles ambiguous timeouts.',
        'orders',
      ),
      node(
        'ledger',
        'Order ledger + outbox',
        'database',
        360,
        90,
        'Private PostgreSQL store. An accepted order and its event intent commit together. No shared writes from other domains.',
        'orders',
      ),
      node(
        'relay',
        'Outbox relay',
        'service',
        680,
        90,
        'Polls pending outbox rows. Marks published after broker acknowledgment. Retries may duplicate events.',
        'orders',
      ),
      node(
        'payment',
        'Payment provider',
        'service',
        40,
        -260,
        'External payment processor. Charges use an order-scoped idempotency key; provider reconciliation resolves ambiguous outcomes.',
      ),
      node(
        'broker',
        'Event broker',
        'queue',
        1120,
        90,
        'Durable OrderAccepted events. At-least-once delivery; retention is finite. Schemas carry version and stable event ID.',
      ),
      node(
        'fulfillment',
        'Fulfillment',
        'container',
        0,
        550,
        'Owns shipment processing. Current callback to Orders couples the two domains.',
      ),
      node(
        'worker',
        'Fulfillment worker',
        'service',
        40,
        90,
        'Consumes accepted orders, checks order status via Orders, and records work with durable deduplication before acknowledging.',
        'fulfillment',
      ),
      node(
        'shipping-db',
        'Shipment ledger',
        'database',
        400,
        90,
        'Unique event ID and shipment records. Carrier effects require stable idempotency keys and reconciliation beyond this database.',
        'fulfillment',
      ),
    ],
    connections: [
      [
        'shop-order',
        'shop',
        'api',
        'Submit order',
        'HTTPS',
        'Return pending or confirmed; retry with same idempotency key.',
      ],
      [
        'order-ledger',
        'api',
        'ledger',
        'Commit order + event',
        'SQL',
        'Atomic transaction; reject acceptance if durable commit fails.',
      ],
      [
        'order-payment',
        'api',
        'payment',
        'Authorize payment',
        'HTTPS',
        'Deadline with reconciliation; never interpret timeout as decline.',
      ],
      [
        'relay-ledger',
        'relay',
        'ledger',
        'Read pending outbox',
        'SQL',
        'Keep pending until broker acknowledgment.',
      ],
      [
        'relay-broker',
        'relay',
        'broker',
        'Publish accepted order',
        'Events',
        'Bounded retry with backoff; monitor oldest pending event.',
      ],
      [
        'broker-worker',
        'broker',
        'worker',
        'Deliver order event',
        'Events',
        'At-least-once delivery; deduplicate stable event ID.',
      ],
      [
        'worker-ledger',
        'worker',
        'shipping-db',
        'Deduplicate + record',
        'SQL',
        'Commit before acknowledging; reconcile external carrier effects.',
      ],
      [
        'worker-order',
        'worker',
        'api',
        'Check order status',
        'HTTPS',
        'If Orders is unavailable, shipment processing stalls.',
      ],
    ].map(([id, source, target, name, protocol, failure]) =>
      connectionSchema.parse({ id, source, target, name, details: { protocol, failure } }),
    ),
  });
  const parent = createAnalysis(project);
  parent.id = 'nk-parent';
  parent.name = '01 · Parent modules · baseline';
  parent.assumptions =
    'Illustrative design review, not a production experiment. Arrows encode interactions, not necessarily dependency direction (broker delivery is one example). Five parent modules include the external payment provider and storefront; notes are excluded. Descendant interactions roll up to their owning module. No fixed K threshold establishes criticality.';
  parent.recommendations =
    'The Orders → broker → Fulfillment → Orders interaction cycle deserves review. A versioned order snapshot in the event could remove the synchronous status callback, trading freshness for availability and adding contract/reconciliation responsibilities. Removing that one arrow gives L=4 and K̄=0.8 instead of L=5 and K̄=1.0, but does not prove resilience or remove semantic coupling. Keep Orders and Fulfillment separate because they own different invariants; do not merge merely to lower N or hide links.';
  const scenarios: [
    string,
    string,
    string,
    'training' | 'holdout',
    Record<string, 'unknown' | 'unaffected' | 'degraded' | 'failed'>,
  ][] = [
    [
      's-broker',
      'Broker unavailable',
      'Broker is unreachable for two hours during peak orders. Observe outbox growth, disk headroom and recovery drain rate.',
      'training',
      {
        shop: 'degraded',
        orders: 'degraded',
        payment: 'unaffected',
        broker: 'failed',
        fulfillment: 'degraded',
      },
    ],
    [
      's-payment',
      'Ambiguous payment timeout',
      'Provider commits a charge but its reply is lost. Repeat the request and later reconcile.',
      'training',
      {
        shop: 'degraded',
        orders: 'degraded',
        payment: 'degraded',
        broker: 'unaffected',
        fulfillment: 'degraded',
      },
    ],
    [
      's-duplicate',
      'Duplicate event after crash',
      'Consumer commits its shipment record then crashes before acknowledgment. Broker redelivers the event.',
      'training',
      {
        shop: 'unaffected',
        orders: 'unaffected',
        payment: 'unaffected',
        broker: 'unaffected',
        fulfillment: 'degraded',
      },
    ],
    [
      's-compound',
      'Region loss + staff absence',
      'Holdout: Orders storage region is lost while the on-call team is unavailable. Evaluate a documented restore and operational handoff without changing the candidate during evaluation.',
      'holdout',
      {},
    ],
  ];
  parent.stressors = scenarios.map(([id, name, scenario, set, states]) => ({
    id,
    name,
    scenario,
    set,
    impacts: coupling(parent).rows.map((n) => ({
      componentId: n.id,
      state: states[n.id] ?? 'unknown',
      evidence:
        set === 'holdout'
          ? 'Unassessed holdout; no observed outcome.'
          : 'Design hypothesis based on the documented contracts; validate through fault injection.',
    })),
  }));
  parent.residues = [
    {
      id: 'r-outbox',
      name: 'Durable acceptance, delayed delivery',
      stressorIds: ['s-broker'],
      componentIds: ['orders', 'broker', 'fulfillment'],
      survives:
        'Committed order intent remains in the private ledger while event publication and shipments wait.',
      adaptation:
        'Preserve atomic order/outbox commit. Add backlog age alerts, capacity budgets and admission control before disk exhaustion. Drain on recovery.',
      remaining:
        'Database/region failure still blocks acceptance. An outage longer than the capacity budget exhausts storage. Recovery throughput and customer expectations remain constraints.',
      evidence:
        'Proposed test: isolate broker for two hours under representative load; prove no accepted event loss and measure backlog drain and disk growth.',
      status: 'hypothesis',
    },
    {
      id: 'r-payment',
      name: 'Pending payment and reconciliation',
      stressorIds: ['s-payment'],
      componentIds: ['orders', 'payment', 'shop'],
      survives:
        'Order intent and stable payment identity survive an ambiguous response; the UI can represent pending status.',
      adaptation:
        'Use provider idempotency and reconciliation; fulfill only after confirmed payment. Bound retries and isolate payment calls.',
      remaining:
        'Provider semantics and retention may limit deduplication. Prolonged outage delays confirmation; manual dispute handling may still be needed.',
      evidence:
        'Proposed test: drop successful charge responses, retry the same key and reconcile; assert a single charge and no unpaid shipment.',
      status: 'hypothesis',
    },
    {
      id: 'r-fulfillment',
      name: 'Replayable fulfillment',
      stressorIds: ['s-duplicate'],
      componentIds: ['fulfillment', 'broker'],
      survives:
        'Durable event identity and shipment intent permit replay without another local shipment record.',
      adaptation:
        'Commit deduplication and shipment intent atomically. Use idempotent carrier requests plus reconciliation. Consider an event projection to remove the Orders callback.',
      remaining:
        'Local deduplication alone cannot guarantee exactly-once external carrier effects. Schema evolution, backlog and stale cancellation information need tests.',
      evidence:
        'Proposed test: crash before/after database commit and carrier response; replay each event and reconcile the carrier ledger.',
      status: 'hypothesis',
    },
    {
      id: 'r-holdout',
      name: 'Unassessed compound stress',
      stressorIds: ['s-compound'],
      componentIds: ['orders', 'fulfillment', 'shop'],
      survives: 'Unknown until a restore and handoff exercise is performed.',
      adaptation:
        'Freeze a candidate after training. Evaluate this holdout separately and record business capability recovery, not just server availability.',
      remaining:
        'Recovery time, recovery point, credential access and operator independence are unverified.',
      evidence: 'No test executed; do not use this scenario to claim generalization.',
      status: 'hypothesis',
    },
  ];
  const order = createAnalysis(project, 'orders');
  order.id = 'nk-orders';
  order.name = '02 · Orders · submodules';
  order.assumptions =
    'Three internal submodules. API → ledger and relay → ledger are the two internal interactions (K̄=0.67). Provider and broker interactions are shown as boundary crossings, not discarded dependencies.';
  order.recommendations =
    'Keep order state and outbox in one transaction and ownership boundary. Splitting them into independently committed stores would break acceptance/event consistency. API and relay may deploy separately for scaling, but share schema evolution and database failure exposure; coordinate migrations. Isolate provider calls from database transactions.';
  order.stressors = [
    {
      id: 's-db',
      name: 'Database unavailable',
      scenario: 'Stop the primary during order acceptance and relay polling.',
      set: 'training',
      impacts: coupling(order).rows.map((n) => ({
        componentId: n.id,
        state: n.id === 'ledger' ? 'failed' : 'degraded',
        evidence: 'Hypothesis: durable acceptance and relay polling require the private ledger.',
      })),
    },
  ];
  order.residues = [
    {
      id: 'r-consistency',
      name: 'Honest rejection and recoverable intent',
      stressorIds: ['s-db'],
      componentIds: ['api', 'ledger', 'relay'],
      survives:
        'Previously committed orders remain recoverable if durable storage and backups survive; new orders are not falsely acknowledged.',
      adaptation:
        'Return a retryable failure for uncommitted requests; retain the idempotency key. Exercise restore and relay restart.',
      remaining:
        'This is consistency preservation, not continuous availability. Corrupt backups or region-wide loss may destroy the assumed residue.',
      evidence:
        'Proposed test: kill database during commit; reconcile acknowledged requests with committed order/outbox records after restore.',
      status: 'hypothesis',
    },
  ];
  const fulfillment = createAnalysis(project, 'fulfillment');
  fulfillment.id = 'nk-fulfillment';
  fulfillment.name = '03 · Fulfillment · submodules';
  fulfillment.assumptions =
    'Two internal submodules; one worker → shipment ledger interaction gives K̄=0.5. Broker and Orders are external crossings.';
  fulfillment.recommendations =
    'Keep deduplication and shipment intent together. Removing the synchronous Orders lookup needs a versioned event contract and an explicit cancellation policy; preserve data ownership. Carrier integration is documented but not separately modeled, so extend the topology before a detailed carrier analysis.';
  fulfillment.stressors = [
    {
      id: 's-replay',
      name: 'Crash and replay',
      scenario: 'Commit local shipment intent, then crash before broker acknowledgment.',
      set: 'training',
      impacts: coupling(fulfillment).rows.map((n) => ({
        componentId: n.id,
        state: n.id === 'worker' ? 'failed' : 'unaffected',
        evidence:
          'Hypothesis: durable ledger survives worker restart; verify transaction boundaries.',
      })),
    },
  ];
  fulfillment.residues = [
    {
      ...parent.residues[2],
      id: 'r-local-replay',
      stressorIds: ['s-replay'],
      componentIds: ['worker', 'shipping-db'],
    },
  ];
  return validateProject({ ...project, analyses: [parent, order, fulfillment] });
}
