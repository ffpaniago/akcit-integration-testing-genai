// SAÍDA BRUTA DA LLM — Prompt Tipo 2, versão 1 (prompt vago).
// Mantida sem edição para registro. Ver PROMPTS.md para a análise.
const request = require('supertest');
const nock = require('nock');
const app = require('../app');

const GATEWAY_URL = 'https://api.paymentgateway.com';

describe('Checkout - cenários de erro', () => {
  afterEach(() => nock.cleanAll());

  it('deve retornar 504 quando o gateway está fora do ar', async () => {
    nock(GATEWAY_URL).post('/payments').delayConnection(10000).reply(200, {});

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .send({ userId: 'u1', items: [{ id: 'p1', qty: 1 }], paymentMethod: 'credit_card' });

    expect(res.status).toBe(504);
  });

  it('deve retornar 401 quando o token está expirado', async () => {
    nock(GATEWAY_URL).post('/payments').reply(401, { error: 'token expired' });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .set('Authorization', 'Bearer expired-token')
      .send({ userId: 'u1', items: [{ id: 'p1', qty: 1 }], paymentMethod: 'credit_card' });

    expect(res.status).toBe(401);
  });

  it('deve retornar 422 quando o cartão é rejeitado', async () => {
    nock(GATEWAY_URL).post('/payments').reply(422, { error: 'card_declined' });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .send({ userId: 'u1', items: [{ id: 'p1', qty: 1 }], paymentMethod: 'credit_card' });

    expect(res.status).toBe(422);
    expect(res.body.error).toBe('card_declined');
  });
});
