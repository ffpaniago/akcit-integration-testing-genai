// SAÍDA BRUTA DA LLM — Prompt Tipo 1, versão 1 (prompt vago).
// Mantida sem edição para registro. Ver PROMPTS.md para a análise.
const request = require('supertest');
const app = require('../app');
const paymentService = require('../services/paymentService');
const Order = require('../models/Order');

jest.mock('../services/paymentService');
jest.mock('../models/Order');

describe('POST /api/v1/orders/checkout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('deve criar um pedido com sucesso', async () => {
    paymentService.processPayment.mockResolvedValue({ status: 'approved', transactionId: 'tx_123' });
    Order.create.mockResolvedValue({ id: 'order_1', status: 'paid' });

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .send({
        userId: 'user_1',
        items: [{ id: 'prod_1', qty: 2 }],
        paymentMethod: 'credit_card',
      });

    expect(res.status).toBe(200);
    expect(res.body).toBeDefined();
    expect(res.body.orderId).toBeDefined();
    expect(paymentService.processPayment).toHaveBeenCalled();
  });

  it('deve retornar erro quando o pagamento falha', async () => {
    paymentService.processPayment.mockRejectedValue(new Error('Payment failed'));

    const res = await request(app)
      .post('/api/v1/orders/checkout')
      .send({
        userId: 'user_1',
        items: [{ id: 'prod_1', qty: 1 }],
        paymentMethod: 'credit_card',
      });

    expect(res.status).toBe(500);
    expect(res.body.error).toBeDefined();
  });

  it('deve retornar 400 quando o payload é inválido', async () => {
    const res = await request(app).post('/api/v1/orders/checkout').send({});

    expect(res.status).toBe(400);
  });
});
