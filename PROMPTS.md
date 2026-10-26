# Registro de prompts e saídas da LLM

- **LLM utilizada:** Claude Opus 5.5 (via Claude Code)
- **Data do experimento:** 26/10/2026
- **Cenário:** integração síncrona HTTP entre o Order Service (Checkout) e a API REST de um Gateway de Pagamento, com autenticação Bearer e persistência transacional (SQLite).

Cada tipo de prompt foi executado em duas versões: **v1** (prompt vago, como um primeiro rascunho) e **v2** (prompt ajustado). As saídas da v1 foram guardadas sem edição em [`generated/v1/`](generated/v1/). As saídas da v2 estão em [`tests/integration/`](tests/integration/).

---

## Tipo 1: prompt baseado em especificação/contrato (fluxo feliz)

### v1: prompt vago

> Gere testes de integração em Jest para o endpoint `POST /api/v1/orders/checkout` de um serviço de checkout que usa um gateway de pagamento. O payload tem `userId`, `items` (id e qty) e `paymentMethod`.

**Saída:** [`generated/v1/checkout.contract.v1.spec.js`](generated/v1/checkout.contract.v1.spec.js), com 3 casos de teste.

**Resultado da execução:** 0 de 3 rodaram. A suíte nem carrega ([log](results/execucao-v1-prompts-vagos.txt)).

**Problemas observados:**

| # | Problema | Por que importa |
|---|---|---|
| 1 | Inventou a estrutura do projeto (`../app`, `../services/paymentService`, `../models/Order`) | A LLM não conhecia o código e "alucinou" módulos que não existem |
| 2 | `jest.mock` no serviço de pagamento **e** no model do banco | Com tudo mockado, o teste deixa de ser de integração: não exercita nem HTTP nem banco |
| 3 | Esperava `200`, mas criação de recurso é `201` | Oráculo errado, sem base em especificação |
| 4 | Asserções fracas: `toBeDefined()` | Passam com quase qualquer resposta |
| 5 | Falha de pagamento → esperava `500` | Codifica um comportamento ruim como "correto" |
| 6 | Sem header `Authorization` | Contra o serviço real, todo teste receberia 401 |

### v2: prompt ajustado

> Você é especialista em QA e testes de integração. Gere uma suíte **Jest + Supertest** para `POST /api/v1/orders/checkout` do serviço abaixo.
>
> **Contexto real do sistema** (anexei `src/app.js`, `src/db.js`, `src/gatewayClient.js`):
> - Auth do cliente: `Authorization: Bearer <API_TOKEN>`.
> - Payload: `{ userId: string, items: Array<{ id: string, qty: inteiro 1..99 }>, paymentMethod: 'credit_card' | 'pix' | 'boleto' }`.
> - O serviço calcula o total pelos preços do **banco** e chama o gateway `POST {GATEWAY_URL}/v1/charges` com `{ reference, amount, currency, method }` e `Bearer <GATEWAY_TOKEN>`.
> - Sucesso: `201` com `{ orderId, status, totalCents, currency, paymentId, gatewayTransactionId, items }`. Pedido, itens e pagamento são gravados numa transação.
>
> **Regras para os testes:**
> 1. São testes de **integração**: use o app real e o banco SQLite real em memória (helper `buildTestEnv()`). **Não mocke módulos internos.** Simule **apenas** o gateway externo, com **Nock**.
> 2. Asserções estritas: compare o corpo inteiro com `toEqual`, valores exatos e formato de UUID. Não use `toBeDefined()`.
> 3. Verifique os dois lados da fronteira: o que o checkout **envia** ao gateway (corpo + header) e o que fica **gravado** no banco.
> 4. Inclua valores-limite válidos (qty = 1 e qty = 99), vários itens e uma consulta de ida e volta via `GET /api/v1/orders/:id`.
> 5. Use apenas dados sintéticos.
> 6. Numere os casos (CT-01, CT-02…).

**Saída:** [`tests/integration/checkout.contract.spec.js`](tests/integration/checkout.contract.spec.js), com 7 casos (CT-01 a CT-07) e 8 execuções (o CT-05 é parametrizado).

---

## Tipo 2: prompt de falhas na fronteira e valores-limite

### v1: prompt vago

> Gere testes de integração para os cenários de erro do checkout: gateway fora do ar (504), token expirado (401) e cartão rejeitado (422). Use Nock.

**Saída:** [`generated/v1/checkout.faults.v1.spec.js`](generated/v1/checkout.faults.v1.spec.js), com 3 casos.

**Resultado da execução:** 0 de 3 rodaram, também por causa do módulo `../app` inventado ([log](results/execucao-v1-prompts-vagos.txt)).

**Problemas observados:**

| # | Problema | Por que importa |
|---|---|---|
| 1 | URL e rota do gateway inventadas (`api.paymentgateway.com/payments`) | O Nock nunca interceptaria a chamada real |
| 2 | `delayConnection(10000)` sem configurar o timeout do cliente | O teste esperaria 10 s e estouraria o timeout de 5 s do Jest |
| 3 | **Confunde as duas fronteiras de autenticação**: manda token expirado do cliente **e** faz o gateway responder 401 | Não dá para saber qual 401 está sendo testado. Se o *gateway* rejeitar as *nossas* credenciais, devolver 401 ao cliente é errado: o problema é do servidor (502) |
| 4 | Espera que o erro do gateway (`card_declined`) passe direto para o cliente | Vaza o contrato do fornecedor externo para a API pública |
| 5 | Nenhuma verificação no banco | Não prova que a falha não deixa pedido "pela metade" |
| 6 | Sem casos de validação de entrada nem valores-limite | Baixa diversidade: só 3 caminhos de erro |

### v2: prompt ajustado

> Com base no mesmo serviço e no mesmo helper `buildTestEnv()`, gere testes de integração **focados exclusivamente em falhas** na fronteira Checkout ↔ Gateway e na entrada da API. Simule o gateway só com **Nock**, com `GATEWAY_TIMEOUT_MS = 200` (para os testes serem rápidos).
>
> Cubra, cada um com o status HTTP **e** o corpo de erro exatos:
> - **Disponibilidade:** timeout (resposta atrasada além do limite) → `504 GATEWAY_TIMEOUT`; conexão recusada → `502 GATEWAY_UNAVAILABLE`; gateway responde 500/503 → `502`.
> - **Autenticação, separando as duas fronteiras:** (a) token do **cliente** ausente, inválido ou com esquema diferente de Bearer → `401` e o gateway **não pode ser chamado**; (b) gateway rejeita **as nossas** credenciais (401 dele) → `502 GATEWAY_AUTH_FAILED`, nunca 401 ao cliente.
> - **Recusa:** gateway responde 402, ou 201 com `status: "declined"` → `422 PAYMENT_DECLINED` com o motivo.
> - **Partições inválidas e limites de entrada:** qty 0, negativo, 100, fracionário, string; items vazio; userId vazio; paymentMethod desconhecido; produto inexistente; JSON malformado → `400`, sem chamar o gateway.
> - **Consistência:** em **toda** falha, verifique que `orders`, `order_items` e `payments` continuam vazias. Inclua uma falha seguida de sucesso e confirme que só o pedido aprovado fica gravado.
>
> Use `test.each` nas partições. Numere a partir de CT-08.

**Saída:** [`tests/integration/checkout.faults.spec.js`](tests/integration/checkout.faults.spec.js), com 13 casos (CT-08 a CT-20) e 22 execuções.

---

## Correções manuais necessárias na saída v2

Mesmo com o prompt ajustado, a primeira execução da v2 **não passou**. O que precisou de intervenção humana:

1. **`nock.disableNetConnect()` bloqueou o próprio Supertest.** As 30 execuções falharam com `NetConnectNotAllowedError` para `127.0.0.1`. A LLM bloqueou toda a rede para garantir que nada saísse para a internet, mas esqueceu que o Supertest sobe o app numa porta local. Correção: `nock.enableNetConnect('127.0.0.1')`.
2. **Uso incorreto da API de eventos do Nock no CT-20.** A LLM tentou capturar o corpo enviado com `scope.on('request')` num escopo *sem interceptadores* (o evento nunca dispara). Reescrito para capturar o corpo dentro do matcher do `.post()`, o mesmo padrão já usado no CT-02.
3. **CT-18 encontrou um bug real no serviço.** JSON malformado retornava `500 INTERNAL_ERROR` em vez de `400` ([log da execução](results/execucao-1-bug-encontrado.txt)). O teste estava certo; o código foi corrigido em `src/app.js`. **Este é o melhor argumento a favor do prompt Tipo 2:** o prompt Tipo 1 nunca chegaria nesse caso.

## Resumo quantitativo

| | v1 (vago) | v2 (ajustado) |
|---|---|---|
| Casos gerados, Tipo 1 | 3 | 7 casos / 8 execuções |
| Casos gerados, Tipo 2 | 3 | 13 casos / 22 execuções |
| Executáveis sem correção | 0 de 6 | 0 de 30 (bloqueio de rede) |
| Aprovados após correções | — | **30 de 30** |
| Bugs reais encontrados | 0 | 1 (JSON malformado → 500) |
| Cobertura de linhas (`src/`) | — | 95,3% |

## Limitações do experimento

- A mesma LLM escreveu o sistema sob teste e os testes v2. Isso tende a gerar testes "alinhados" ao código: eles verificam o que o código faz, não necessariamente o que deveria fazer. Numa situação real, o prompt deveria partir de uma especificação independente (OpenAPI, histórias de usuário).
- O gateway é simulado com Nock. Os testes validam o **nosso** lado do contrato, mas não detectam se o gateway real mudar a API. Para isso seria preciso um teste de contrato orientado ao consumidor (ex.: Pact) ou uma suíte contra o sandbox do provedor.
