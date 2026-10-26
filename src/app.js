// Order Service (Checkout): API REST que integra banco de dados e Gateway de Pagamento.
const crypto = require('node:crypto');
const express = require('express');
const { findProducts, saveOrder, getOrder } = require('./db');
const { GatewayError } = require('./gatewayClient');

const PAYMENT_METHODS = ['credit_card', 'pix', 'boleto'];

// Erros do gateway viram códigos HTTP do Checkout. Uma falha de credencial
// do gateway (401 dele) é problema nosso, não do cliente: vira 502.
const GATEWAY_ERROR_STATUS = {
  PAYMENT_DECLINED: 422,
  GATEWAY_TIMEOUT: 504,
  GATEWAY_AUTH_FAILED: 502,
  GATEWAY_UNAVAILABLE: 502,
};

function validatePayload(body) {
  const errors = [];
  if (!body || typeof body !== 'object') return ['body deve ser um objeto JSON'];
  if (typeof body.userId !== 'string' || body.userId.trim() === '') {
    errors.push('userId deve ser string não vazia');
  }
  if (!Array.isArray(body.items) || body.items.length === 0) {
    errors.push('items deve ser um array não vazio');
  } else {
    body.items.forEach((item, i) => {
      if (!item || typeof item.id !== 'string' || item.id === '') {
        errors.push(`items[${i}].id deve ser string não vazia`);
      }
      if (!item || !Number.isInteger(item.qty) || item.qty < 1 || item.qty > 99) {
        errors.push(`items[${i}].qty deve ser inteiro entre 1 e 99`);
      }
    });
  }
  if (!PAYMENT_METHODS.includes(body.paymentMethod)) {
    errors.push(`paymentMethod deve ser um de: ${PAYMENT_METHODS.join(', ')}`);
  }
  return errors;
}

function createApp({ db, gateway, apiToken }) {
  const app = express();
  app.use(express.json());

  app.use('/api', (req, res, next) => {
    const header = req.get('Authorization') || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token || token !== apiToken) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Token ausente ou inválido' });
    }
    next();
  });

  app.post('/api/v1/orders/checkout', async (req, res) => {
    const errors = validatePayload(req.body);
    if (errors.length) {
      return res.status(400).json({ error: 'INVALID_PAYLOAD', details: errors });
    }

    const { userId, items, paymentMethod } = req.body;
    const products = findProducts(db, items.map((i) => i.id));
    const byId = new Map(products.map((p) => [p.id, p]));
    const unknown = items.filter((i) => !byId.has(i.id)).map((i) => i.id);
    if (unknown.length) {
      return res.status(400).json({ error: 'UNKNOWN_PRODUCT', details: unknown });
    }

    const orderItems = items.map((i) => ({
      productId: i.id,
      qty: i.qty,
      unitPriceCents: byId.get(i.id).price_cents,
    }));
    const totalCents = orderItems.reduce((sum, i) => sum + i.qty * i.unitPriceCents, 0);
    const orderId = crypto.randomUUID();

    let charge;
    try {
      charge = await gateway.charge({ orderId, amountCents: totalCents, paymentMethod });
    } catch (err) {
      if (err instanceof GatewayError) {
        return res
          .status(GATEWAY_ERROR_STATUS[err.code])
          .json({ error: err.code, message: err.message, ...(err.details && { details: err.details }) });
      }
      throw err;
    }

    const order = {
      id: orderId,
      userId,
      status: 'PAID',
      totalCents,
      createdAt: new Date().toISOString(),
    };
    const payment = { id: crypto.randomUUID(), gatewayId: charge.gatewayId, status: 'APPROVED' };
    saveOrder(db, { order, items: orderItems, payment });

    return res.status(201).json({
      orderId,
      status: order.status,
      totalCents,
      currency: 'BRL',
      paymentId: payment.id,
      gatewayTransactionId: charge.gatewayId,
      items: orderItems,
    });
  });

  app.get('/api/v1/orders/:id', (req, res) => {
    const found = getOrder(db, req.params.id);
    if (!found) return res.status(404).json({ error: 'ORDER_NOT_FOUND' });
    const { order, items, payment } = found;
    return res.json({
      orderId: order.id,
      userId: order.user_id,
      status: order.status,
      totalCents: order.total_cents,
      items: items.map((i) => ({ productId: i.product_id, qty: i.qty, unitPriceCents: i.unit_price_cents })),
      payment: { id: payment.id, gatewayTransactionId: payment.gateway_id, status: payment.status },
    });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    // Bug encontrado pelo CT-18: JSON malformado caía aqui e virava 500.
    if (err.type === 'entity.parse.failed') {
      return res.status(400).json({ error: 'INVALID_JSON', message: 'Corpo da requisição não é JSON válido' });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR' });
  });

  return app;
}

module.exports = { createApp, validatePayload };
