// Ponto de entrada para rodar o serviço localmente (não é usado pelos testes).
const { createApp } = require('./app');
const { createDb } = require('./db');
const { createGatewayClient } = require('./gatewayClient');

const db = createDb(process.env.DB_FILE || ':memory:');
const gateway = createGatewayClient({
  baseURL: process.env.GATEWAY_URL || 'http://localhost:9090',
  token: process.env.GATEWAY_TOKEN || 'gateway-dev-token',
  timeoutMs: Number(process.env.GATEWAY_TIMEOUT_MS || 5000),
});
const app = createApp({ db, gateway, apiToken: process.env.API_TOKEN || 'dev-token' });

const port = Number(process.env.PORT || 3000);
app.listen(port, () => console.log(`Order Service ouvindo em http://localhost:${port}`));
