// Camada de persistência: SQLite nativo do Node (node:sqlite).
// process.getBuiltinModule evita que o resolver do Jest tente resolver o módulo.
const { DatabaseSync } = process.getBuiltinModule('node:sqlite');

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS products (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    price_cents INTEGER NOT NULL CHECK (price_cents > 0)
  );
  CREATE TABLE IF NOT EXISTS orders (
    id          TEXT PRIMARY KEY,
    user_id     TEXT NOT NULL,
    status      TEXT NOT NULL,
    total_cents INTEGER NOT NULL,
    created_at  TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS order_items (
    order_id         TEXT NOT NULL REFERENCES orders(id),
    product_id       TEXT NOT NULL REFERENCES products(id),
    qty              INTEGER NOT NULL CHECK (qty > 0),
    unit_price_cents INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS payments (
    id         TEXT PRIMARY KEY,
    order_id   TEXT NOT NULL REFERENCES orders(id),
    gateway_id TEXT NOT NULL,
    status     TEXT NOT NULL
  );
`;

function createDb(filename = ':memory:') {
  const db = new DatabaseSync(filename);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(SCHEMA);
  return db;
}

function findProducts(db, ids) {
  const stmt = db.prepare('SELECT id, name, price_cents FROM products WHERE id = ?');
  return ids.map((id) => stmt.get(id)).filter(Boolean);
}

// Grava pedido + itens + pagamento de forma atômica.
function saveOrder(db, { order, items, payment }) {
  db.exec('BEGIN');
  try {
    db.prepare(
      'INSERT INTO orders (id, user_id, status, total_cents, created_at) VALUES (?, ?, ?, ?, ?)'
    ).run(order.id, order.userId, order.status, order.totalCents, order.createdAt);

    const insertItem = db.prepare(
      'INSERT INTO order_items (order_id, product_id, qty, unit_price_cents) VALUES (?, ?, ?, ?)'
    );
    for (const item of items) {
      insertItem.run(order.id, item.productId, item.qty, item.unitPriceCents);
    }

    db.prepare(
      'INSERT INTO payments (id, order_id, gateway_id, status) VALUES (?, ?, ?, ?)'
    ).run(payment.id, order.id, payment.gatewayId, payment.status);

    db.exec('COMMIT');
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}

function getOrder(db, id) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return null;
  const items = db
    .prepare('SELECT product_id, qty, unit_price_cents FROM order_items WHERE order_id = ?')
    .all(id);
  const payment = db.prepare('SELECT * FROM payments WHERE order_id = ?').get(id);
  return { order, items, payment };
}

module.exports = { createDb, findProducts, saveOrder, getOrder };
