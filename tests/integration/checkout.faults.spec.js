// Gerado pelo Prompt Tipo 2 (falhas na fronteira / valores-limite), versão 2. Ver PROMPTS.md.
const request = require('supertest');
const nock = require('nock');
const {
  buildTestEnv,
  validPayload,
  GATEWAY_URL,
  API_TOKEN,
  GATEWAY_TIMEOUT_MS,
} = require('../helpers/testEnv');

const EMPTY_DB = { orders: 0, order_items: 0, payments: 0 };

describe('Falhas na fronteira Checkout ↔ Gateway', () => {
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
    nock.abortPendingRequests();
    nock.cleanAll();
  });

  const checkout = (body, token = API_TOKEN) => {
    const req = request(env.app).post('/api/v1/orders/checkout');
    if (token !== null) req.set('Authorization', `Bearer ${token}`);
    return req.send(body);
  };

  describe('Disponibilidade do gateway', () => {
    test('CT-08: timeout do gateway → 504 e nada persistido', async () => {
      nock(GATEWAY_URL)
        .post('/v1/charges')
        .delay(GATEWAY_TIMEOUT_MS + 300)
        .reply(201, { id: 'ch_late', status: 'approved' });

      const started = Date.now();
      const res = await checkout(validPayload());
      const elapsed = Date.now() - started;

      expect(res.status).toBe(504);
      expect(res.body).toEqual({
        error: 'GATEWAY_TIMEOUT',
        message: 'Gateway de pagamento não respondeu a tempo',
      });
      // O checkout respeita o próprio timeout e não espera a resposta atrasada.
      expect(elapsed).toBeLessThan(GATEWAY_TIMEOUT_MS + 250);
      expect(env.countAll()).toEqual(EMPTY_DB);
    });

    test('CT-09: conexão recusada (gateway fora do ar) → 502 e nada persistido', async () => {
      nock(GATEWAY_URL)
        .post('/v1/charges')
        .replyWithError({ code: 'ECONNREFUSED', message: 'connect ECONNREFUSED' });

      const res = await checkout(validPayload());

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('GATEWAY_UNAVAILABLE');
      expect(env.countAll()).toEqual(EMPTY_DB);
    });

    test.each([500, 503])('CT-10: gateway responde %i → 502 e nada persistido', async (status) => {
      nock(GATEWAY_URL).post('/v1/charges').reply(status, { error: 'internal' });

      const res = await checkout(validPayload());

      expect(res.status).toBe(502);
      expect(res.body).toEqual({
        error: 'GATEWAY_UNAVAILABLE',
        message: `Resposta inesperada do gateway (${status})`,
      });
      expect(env.countAll()).toEqual(EMPTY_DB);
    });
  });

  describe('Autenticação nas duas fronteiras', () => {
    test.each([
      ['sem header Authorization', null],
      ['token inválido/expirado', 'expired-token'],
    ])('CT-11: cliente %s → 401 e o gateway NÃO é chamado', async (_label, token) => {
      const gw = nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'x', status: 'approved' });

      const res = await checkout(validPayload(), token);

      expect(res.status).toBe(401);
      expect(res.body).toEqual({ error: 'UNAUTHORIZED', message: 'Token ausente ou inválido' });
      expect(gw.isDone()).toBe(false);
      expect(env.countAll()).toEqual(EMPTY_DB);
    });

    test('CT-12: esquema diferente de Bearer → 401', async () => {
      const res = await request(env.app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Basic ${API_TOKEN}`)
        .send(validPayload());

      expect(res.status).toBe(401);
    });

    test('CT-13: gateway rejeita NOSSAS credenciais (401 dele) → 502, não 401 ao cliente', async () => {
      nock(GATEWAY_URL).post('/v1/charges').reply(401, { error: 'invalid_api_key' });

      const res = await checkout(validPayload());

      expect(res.status).toBe(502);
      expect(res.body.error).toBe('GATEWAY_AUTH_FAILED');
      expect(env.countAll()).toEqual(EMPTY_DB);
    });
  });

  describe('Recusa de pagamento', () => {
    test('CT-14: cartão recusado (402) → 422 com motivo e nada persistido', async () => {
      nock(GATEWAY_URL).post('/v1/charges').reply(402, { status: 'declined', reason: 'insufficient_funds' });

      const res = await checkout(validPayload());

      expect(res.status).toBe(422);
      expect(res.body).toEqual({
        error: 'PAYMENT_DECLINED',
        message: 'Pagamento recusado',
        details: { reason: 'insufficient_funds' },
      });
      expect(env.countAll()).toEqual(EMPTY_DB);
    });

    test('CT-15: recusa sinalizada no corpo (201 + status "declined") → 422', async () => {
      nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'ch_d', status: 'declined', reason: 'suspected_fraud' });

      const res = await checkout(validPayload());

      expect(res.status).toBe(422);
      expect(res.body.details).toEqual({ reason: 'suspected_fraud' });
      expect(env.countAll()).toEqual(EMPTY_DB);
    });
  });

  describe('Validação de payload (partições inválidas e valores-limite)', () => {
    test.each([
      ['qty = 0', { items: [{ id: 'prod-001', qty: 0 }] }, 'items[0].qty deve ser inteiro entre 1 e 99'],
      ['qty negativo', { items: [{ id: 'prod-001', qty: -1 }] }, 'items[0].qty deve ser inteiro entre 1 e 99'],
      ['qty = 100 (acima do limite)', { items: [{ id: 'prod-001', qty: 100 }] }, 'items[0].qty deve ser inteiro entre 1 e 99'],
      ['qty fracionário', { items: [{ id: 'prod-001', qty: 1.5 }] }, 'items[0].qty deve ser inteiro entre 1 e 99'],
      ['qty como string', { items: [{ id: 'prod-001', qty: '2' }] }, 'items[0].qty deve ser inteiro entre 1 e 99'],
      ['items vazio', { items: [] }, 'items deve ser um array não vazio'],
      ['userId vazio', { userId: '' }, 'userId deve ser string não vazia'],
      ['paymentMethod desconhecido', { paymentMethod: 'bitcoin' }, 'paymentMethod deve ser um de: credit_card, pix, boleto'],
    ])('CT-16: %s → 400 e o gateway NÃO é chamado', async (_label, override, expectedDetail) => {
      const gw = nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'x', status: 'approved' });

      const res = await checkout(validPayload(override));

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_PAYLOAD');
      expect(res.body.details).toContain(expectedDetail);
      expect(gw.isDone()).toBe(false);
      expect(env.countAll()).toEqual(EMPTY_DB);
    });

    test('CT-17: produto inexistente no catálogo → 400 UNKNOWN_PRODUCT', async () => {
      const gw = nock(GATEWAY_URL).post('/v1/charges').reply(201, { id: 'x', status: 'approved' });

      const res = await checkout(validPayload({ items: [{ id: 'prod-999', qty: 1 }] }));

      expect(res.status).toBe(400);
      expect(res.body).toEqual({ error: 'UNKNOWN_PRODUCT', details: ['prod-999'] });
      expect(gw.isDone()).toBe(false);
    });

    test('CT-18: JSON malformado → 400', async () => {
      const res = await request(env.app)
        .post('/api/v1/orders/checkout')
        .set('Authorization', `Bearer ${API_TOKEN}`)
        .set('Content-Type', 'application/json')
        .send('{"userId": "u1", "items": [');

      expect(res.status).toBe(400);
      expect(res.body.error).toBe('INVALID_JSON');
      expect(env.countAll()).toEqual(EMPTY_DB);
    });
  });

  describe('Consistência após falha', () => {
    test('CT-19: falha seguida de sucesso → apenas o pedido aprovado fica no banco', async () => {
      nock(GATEWAY_URL)
        .post('/v1/charges')
        .reply(402, { status: 'declined', reason: 'insufficient_funds' })
        .post('/v1/charges')
        .reply(201, { id: 'ch_retry_ok', status: 'approved' });

      const first = await checkout(validPayload());
      const second = await checkout(validPayload());

      expect(first.status).toBe(422);
      expect(second.status).toBe(201);
      expect(env.countAll()).toEqual({ orders: 1, order_items: 1, payments: 1 });
      const row = env.db.prepare('SELECT gateway_id FROM payments').get();
      expect(row.gateway_id).toBe('ch_retry_ok');
    });

    test('CT-20: pedido recusado não pode ser consultado depois → 404', async () => {
      let referenceSent;
      nock(GATEWAY_URL)
        .post('/v1/charges', (body) => {
          referenceSent = body.reference;
          return true;
        })
        .reply(402, { status: 'declined', reason: 'expired_card' });

      await checkout(validPayload());
      const res = await request(env.app)
        .get(`/api/v1/orders/${referenceSent}`)
        .set('Authorization', `Bearer ${API_TOKEN}`);

      expect(referenceSent).toBeTruthy();
      expect(res.status).toBe(404);
      expect(res.body).toEqual({ error: 'ORDER_NOT_FOUND' });
    });
  });
});
