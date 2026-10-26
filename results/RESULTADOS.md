# Resultados da execução

- **Data:** 2026-10-26T03:43:20.547Z
- **Node:** v22.23.1
- **Suítes:** 2/2 aprovadas
- **Testes:** 30/30 aprovados, 0 falharam

## `tests/integration/checkout.faults.spec.js` (514 ms)

| | Caso de teste | Tempo |
|---|---|---|
| ✅ | Disponibilidade do gateway › CT-08: timeout do gateway → 504 e nada persistido | 39 ms |
| ✅ | Disponibilidade do gateway › CT-09: conexão recusada (gateway fora do ar) → 502 e nada persistido | 6 ms |
| ✅ | Disponibilidade do gateway › CT-10: gateway responde 500 → 502 e nada persistido | 6 ms |
| ✅ | Disponibilidade do gateway › CT-10: gateway responde 503 → 502 e nada persistido | 6 ms |
| ✅ | Autenticação nas duas fronteiras › CT-11: cliente sem header Authorization → 401 e o gateway NÃO é chamado | 2 ms |
| ✅ | Autenticação nas duas fronteiras › CT-11: cliente token inválido/expirado → 401 e o gateway NÃO é chamado | 2 ms |
| ✅ | Autenticação nas duas fronteiras › CT-12: esquema diferente de Bearer → 401 | 1 ms |
| ✅ | Autenticação nas duas fronteiras › CT-13: gateway rejeita NOSSAS credenciais (401 dele) → 502, não 401 ao cliente | 5 ms |
| ✅ | Recusa de pagamento › CT-14: cartão recusado (402) → 422 com motivo e nada persistido | 7 ms |
| ✅ | Recusa de pagamento › CT-15: recusa sinalizada no corpo (201 + status "declined") → 422 | 4 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: qty = 0 → 400 e o gateway NÃO é chamado | 2 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: qty negativo → 400 e o gateway NÃO é chamado | 2 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: qty = 100 (acima do limite) → 400 e o gateway NÃO é chamado | 1 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: qty fracionário → 400 e o gateway NÃO é chamado | 1 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: qty como string → 400 e o gateway NÃO é chamado | 1 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: items vazio → 400 e o gateway NÃO é chamado | 1 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: userId vazio → 400 e o gateway NÃO é chamado | 2 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-16: paymentMethod desconhecido → 400 e o gateway NÃO é chamado | 1 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-17: produto inexistente no catálogo → 400 UNKNOWN_PRODUCT | 2 ms |
| ✅ | Validação de payload (partições inválidas e valores-limite) › CT-18: JSON malformado → 400 | 1 ms |
| ✅ | Consistência após falha › CT-19: falha seguida de sucesso → apenas o pedido aprovado fica no banco | 10 ms |
| ✅ | Consistência após falha › CT-20: pedido recusado não pode ser consultado depois → 404 | 6 ms |

## `tests/integration/checkout.contract.spec.js` (84 ms)

| | Caso de teste | Tempo |
|---|---|---|
| ✅ | CT-01: retorna 201 com o contrato completo da resposta | 8 ms |
| ✅ | CT-02: envia ao gateway o contrato esperado (corpo e Bearer token) | 5 ms |
| ✅ | CT-03: persiste pedido, itens e pagamento no banco | 5 ms |
| ✅ | CT-04: calcula o total com vários itens usando o preço do banco, não do cliente | 5 ms |
| ✅ | CT-05: aceita valores-limite válidos de quantidade (limite inferior qty=1) | 4 ms |
| ✅ | CT-05: aceita valores-limite válidos de quantidade (limite superior qty=99) | 5 ms |
| ✅ | CT-06: GET /orders/:id devolve o pedido persistido pelo checkout (ida e volta) | 6 ms |
| ✅ | CT-07: dois checkouts geram pedidos distintos e independentes | 5 ms |

## Cobertura de código (src/)

| Arquivo | Linhas | Branches | Funções |
|---|---|---|---|
| **Total** | 95.28% | 91.3% | 100% |
| `src/app.js` | 95.16% | 90.9% | 100% |
| `src/db.js` | 91.66% | 66.66% | 100% |
| `src/gatewayClient.js` | 100% | 95.45% | 100% |
