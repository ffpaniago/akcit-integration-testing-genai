# Testes de integração com GenAI: Checkout ↔ Gateway de Pagamento

Atividade da Unidade III (fórum): uso de diferentes tipos de prompt para gerar, com uma LLM, casos de teste de integração entre serviços REST.

## Cenário

```
Cliente ──HTTP/Bearer──▶ Order Service (Checkout) ──HTTP/Bearer──▶ Gateway de Pagamento (externo)
                                 │
                                 ▼
                        SQLite (orders, order_items, payments)
```

- `POST /api/v1/orders/checkout` valida o payload, calcula o total pelos preços do banco, cobra no gateway e grava pedido, itens e pagamento numa única transação.
- `GET /api/v1/orders/:id` consulta o pedido gravado.

| Situação | Resposta |
|---|---|
| Pedido aprovado | `201` |
| Payload inválido / JSON malformado / produto inexistente | `400` |
| Token do cliente ausente ou inválido | `401` |
| Pagamento recusado | `422` |
| Gateway fora do ar, com erro 5xx ou rejeitando nossas credenciais | `502` |
| Gateway não respondeu dentro do timeout | `504` |

## Estrutura

| Caminho | Conteúdo |
|---|---|
| [`src/`](src/) | Sistema sob teste (Express + `node:sqlite` + cliente axios do gateway) |
| [`tests/integration/checkout.contract.spec.js`](tests/integration/checkout.contract.spec.js) | Testes do **Prompt Tipo 1**: contrato e fluxo feliz (CT-01 a CT-07) |
| [`tests/integration/checkout.faults.spec.js`](tests/integration/checkout.faults.spec.js) | Testes do **Prompt Tipo 2**: falhas na fronteira e valores-limite (CT-08 a CT-20) |
| [`tests/helpers/testEnv.js`](tests/helpers/testEnv.js) | Ambiente de integração: banco real em memória com dados sintéticos |
| [`generated/v1/`](generated/v1/) | Saídas brutas dos prompts vagos (v1), mantidas para comparação |
| [`PROMPTS.md`](PROMPTS.md) | **Prompts v1 e v2, análise das saídas e ajustes necessários** |
| [`results/`](results/) | **Resultados das execuções** |

## Resultados

Último resultado: **30/30 testes aprovados**, com 95,3% de cobertura de linhas em `src/`. Detalhes em [`results/RESULTADOS.md`](results/RESULTADOS.md).

| Arquivo | O que mostra |
|---|---|
| [`results/RESULTADOS.md`](results/RESULTADOS.md) | Tabela de cada caso de teste e da cobertura |
| [`results/resultados.json`](results/resultados.json) | Saída completa do Jest em JSON |
| [`results/execucao-final.txt`](results/execucao-final.txt) | Log da execução final |
| [`results/execucao-1-bug-encontrado.txt`](results/execucao-1-bug-encontrado.txt) | Execução em que o CT-18 encontrou um bug real (JSON malformado → 500) |
| [`results/execucao-v1-prompts-vagos.txt`](results/execucao-v1-prompts-vagos.txt) | Execução dos testes v1: nenhum chega a rodar |

## Como rodar

Requer Node.js 22.5 ou superior (usa o módulo nativo `node:sqlite`, sem Docker).

```bash
npm install
npm test              # roda a suíte
npm run test:report   # roda e regenera os arquivos em results/
```

Nenhum dado real é usado: produtos, usuários e tokens são sintéticos, e o gateway é simulado com Nock (nenhuma chamada sai para a internet).
