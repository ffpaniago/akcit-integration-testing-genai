// Cliente HTTP do Gateway de Pagamento externo.
const axios = require('axios');

class GatewayError extends Error {
  constructor(code, message, details) {
    super(message);
    this.code = code;
    this.details = details;
  }
}

function createGatewayClient({ baseURL, token, timeoutMs = 5000 }) {
  const http = axios.create({
    baseURL,
    timeout: timeoutMs,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    validateStatus: () => true,
  });

  async function charge({ orderId, amountCents, paymentMethod }) {
    let res;
    try {
      res = await http.post('/v1/charges', {
        reference: orderId,
        amount: amountCents,
        currency: 'BRL',
        method: paymentMethod,
      });
    } catch (err) {
      if (err.code === 'ECONNABORTED' || err.code === 'ETIMEDOUT') {
        throw new GatewayError('GATEWAY_TIMEOUT', 'Gateway de pagamento não respondeu a tempo');
      }
      throw new GatewayError('GATEWAY_UNAVAILABLE', 'Falha de rede ao chamar o gateway');
    }

    if (res.status === 201 && res.data && res.data.status === 'approved') {
      return { gatewayId: res.data.id, status: 'approved' };
    }
    if (res.status === 402 || (res.status === 201 && res.data && res.data.status === 'declined')) {
      throw new GatewayError('PAYMENT_DECLINED', 'Pagamento recusado', {
        reason: res.data && res.data.reason,
      });
    }
    if (res.status === 401 || res.status === 403) {
      throw new GatewayError('GATEWAY_AUTH_FAILED', 'Credenciais do gateway rejeitadas');
    }
    throw new GatewayError('GATEWAY_UNAVAILABLE', `Resposta inesperada do gateway (${res.status})`);
  }

  return { charge };
}

module.exports = { createGatewayClient, GatewayError };
