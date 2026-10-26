// Gerado pelo Prompt Tipo 1 (contrato / fluxo feliz), versão 2. Ver PROMPTS.md.
const request = require('supertest');
const nock = require('nock');
const {
  buildTestEnv,
  validPayload,
  GATEWAY_URL,
  GATEWAY_TOKEN,
  API_TOKEN,
} = require('../helpers/testEnv');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('Contrato e fluxo feliz — POST /api/v1/orders/checkout', () => {
  let env;

  beforeAll(() => {
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1'); // libera só o Supertest (app local)
  });
  afterAll(() => nock.enableNetConnect());

  beforeEach(() => {
    env = buildTestEnv();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  const checkout = (body) =>
    request(env.app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', `Bearer ${API_TOKEN}`)
      .send(body);

  test('CT-01: retorna 201 com o contrato completo da resposta', async () => {
    const gw = nock(GATEWAY_URL)
      .post('/v1/charges')
      .reply(201, { id: 'ch_synthetic_001', status: 'approved' });

    const res = await checkout(validPayload());

    expect(res.status).toBe(201);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      orderId: expect.stringMatching(UUID),
      status: 'PAID',
      totalCents: 9980,
      currency: 'BRL',
      paymentId: expect.stringMatching(UUID),
      gatewayTransactionId: 'ch_synthetic_001',
      items: [{ productId: 'prod-001', qty: 2, unitPriceCents: 4990 }],
    });
    expect(Object.keys(res.body).sort()).toEqual(
      ['currency', 'gatewayTransactionId', 'items', 'orderId', 'paymentId', 'status', 'totalCents']
    );
    expect(gw.isDone()).toBe(true);
  });

  test('CT-02: envia ao gateway o contrato esperado (corpo e Bearer token)', async () => {
    let captured;
    const gw = nock(GATEWAY_URL, {
      reqheaders: { authorization: `Bearer ${GATEWAY_TOKEN}`, 'content-type': /application\/json/ },
    })
      .post('/v1/charges', (body) => {
        captured = body;
        return true;
      })
      .reply(201, { id: 'ch_synthetic_002', status: 'approved' });

    const res = await checkout(validPayload({ paymentMethod: 'pix' }));

    expect(res.status).toBe(201);
    expect(gw.isDone()).toBe(true);
    expect(captured).toEqual({
      reference: res.body.orderId,
      amount: 9980,
      currency: 'BRL',
      method: 'pix',
    });
  });

  test('CT-03: persiste pedido, itens e pagamento no banco', async () => {
    nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'ch_synthetic_003', status: 'approved' });

    const res = await checkout(validPayload());
    const { orderId, paymentId } = res.body;

    expect(env.countAll()).toEqual({ orders: 1, order_items: 1, payments: 1 });

    const order = env.db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
    expect(order).toMatchObject({
      id: orderId,
      user_id: 'user-synthetic-42',
      status: 'PAID',
      total_cents: 9980,
    });
    expect(new Date(order.created_at).toString()).not.toBe('Invalid Date');

    const payment = env.db.prepare('SELECT * FROM payments WHERE order_id = ?').get(orderId);
    expect(payment).toMatchObject({ id: paymentId, gateway_id: 'ch_synthetic_003', status: 'APPROVED' });
  });

  test('CT-04: calcula o total com vários itens usando o preço do banco, não do cliente', async () => {
    let amountSent;
    nock(GATEWAY_URL)
      .post('/v1/charges', (body) => {
        amountSent = body.amount;
        return true;
      })
      .reply(201, { id: 'ch_synthetic_004', status: 'approved' });

    const res = await checkout(
      validPayload({
        items: [
          { id: 'prod-001', qty: 1, price: 1 }, // campo "price" extra deve ser ignorado
          { id: 'prod-002', qty: 3 },
          { id: 'prod-003', qty: 10 },
        ],
      })
    );

    // 4990 + 3*7900 + 10*500 = 33690
    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(33690);
    expect(amountSent).toBe(33690);
    expect(env.countAll()).toEqual({ orders: 1, order_items: 3, payments: 1 });
  });

  test.each([
    ['limite inferior qty=1', 1, 4990],
    ['limite superior qty=99', 99, 494010],
  ])('CT-05: aceita valores-limite válidos de quantidade (%s)', async (_label, qty, expectedTotal) => {
    nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'ch_limit', status: 'approved' });

    const res = await checkout(validPayload({ items: [{ id: 'prod-001', qty }] }));

    expect(res.status).toBe(201);
    expect(res.body.totalCents).toBe(expectedTotal);
  });

  test('CT-06: GET /orders/:id devolve o pedido persistido pelo checkout (ida e volta)', async () => {
    nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'ch_synthetic_006', status: 'approved' });
    const created = await checkout(validPayload());

    const res = await request(env.app)
      .get(`/api/v1/orders/${created.body.orderId}`)
      .set('Authorization', `Bearer ${API_TOKEN}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      orderId: created.body.orderId,
      userId: 'user-synthetic-42',
      status: 'PAID',
      totalCents: 9980,
      items: [{ productId: 'prod-001', qty: 2, unitPriceCents: 4990 }],
      payment: {
        id: created.body.paymentId,
        gatewayTransactionId: 'ch_synthetic_006',
        status: 'APPROVED',
      },
    });
  });

  test('CT-07: dois checkouts geram pedidos distintos e independentes', async () => {
    nock(GATEWAY_URL)
      .post('/v1/charges')
      .reply(201, { id: 'ch_a', status: 'approved' })
      .post('/v1/charges')
      .reply(201, { id: 'ch_b', status: 'approved' });

    const [a, b] = await Promise.all([checkout(validPayload()), checkout(validPayload())]);

    expect(a.status).toBe(201);
    expect(b.status).toBe(201);
    expect(a.body.orderId).not.toBe(b.body.orderId);
    expect(new Set([a.body.gatewayTransactionId, b.body.gatewayTransactionId])).toEqual(
      new Set(['ch_a', 'ch_b'])
    );
    expect(env.countAll()).toEqual({ orders: 2, order_items: 2, payments: 2 });
  });
});
