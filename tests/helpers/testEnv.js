// Monta o ambiente de integração: banco SQLite real (em memória) com dados
// sintéticos, cliente HTTP real do gateway e app Express. Só a rede externa
// (o gateway de pagamento) é simulada, com Nock.
const { createApp } = require('../../src/app');
const { createDb } = require('../../src/db');
const { createGatewayClient } = require('../../src/gatewayClient');

const GATEWAY_URL = 'https://gateway.test';
const GATEWAY_TOKEN = 'gw-test-token';
const API_TOKEN = 'api-test-token';
const GATEWAY_TIMEOUT_MS = 200;

// Catálogo sintético (nenhum dado real).
const PRODUCTS = [
  { id: 'prod-001', name: 'Caneca Teste', price_cents: 4990 },
  { id: 'prod-002', name: 'Camiseta Teste', price_cents: 7900 },
  { id: 'prod-003', name: 'Adesivo Teste', price_cents: 500 },
];

function buildTestEnv() {
  const db = createDb(':memory:');
  const insert = db.prepare('INSERT INTO products (id, name, price_cents) VALUES (?, ?, ?)');
  for (const p of PRODUCTS) insert.run(p.id, p.name, p.price_cents);

  const gateway = createGatewayClient({
    baseURL: GATEWAY_URL,
    token: GATEWAY_TOKEN,
    timeoutMs: GATEWAY_TIMEOUT_MS,
  });
  const app = createApp({ db, gateway, apiToken: API_TOKEN });

  const count = (table) => db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get().n;
  const countAll = () => ({
    orders: count('orders'),
    order_items: count('order_items'),
    payments: count('payments'),
  });

  return { app, db, countAll };
}

const validPayload = (overrides = {}) => ({
  userId: 'user-synthetic-42',
  items: [{ id: 'prod-001', qty: 2 }],
  paymentMethod: 'credit_card',
  ...overrides,
});

module.exports = {
  buildTestEnv,
  validPayload,
  GATEWAY_URL,
  GATEWAY_TOKEN,
  API_TOKEN,
  GATEWAY_TIMEOUT_MS,
};
