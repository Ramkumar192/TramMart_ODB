'use strict';
require('dotenv').config();
const express = require('express');
const cors    = require('cors');
const oracledb = require('oracledb');

const app = express();
app.use(express.json());

// ── CORS: allow your GitHub Pages frontend ──
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '').split(',').map(o => o.trim());
app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (curl, Postman) or matching origins
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
  methods: ['GET','POST','PUT','DELETE','OPTIONS'],
  allowedHeaders: ['Content-Type','Authorization']
}));

// ════════════════════════════════════════════════════════════
//  ORACLE CONNECTION POOL
// ════════════════════════════════════════════════════════════
let pool;

async function initOraclePool() {
  // Use "thin" mode — no Oracle client installation needed on server
  oracledb.initOracleClient(); // comment this line if using thin mode (default in v6+)

  pool = await oracledb.createPool({
    user:             process.env.DB_USER,
    password:         process.env.DB_PASSWORD,
    connectString:    `${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`,
    poolMin:          2,
    poolMax:          10,
    poolIncrement:    1,
    poolTimeout:      60,
  });
  console.log(`✅ Oracle pool created → ${process.env.DB_HOST}:${process.env.DB_PORT}/${process.env.DB_SERVICE}`);
}

// Helper: run a query and return rows as objects
async function query(sql, binds = [], opts = {}) {
  const conn = await pool.getConnection();
  try {
    const result = await conn.execute(sql, binds, {
      outFormat: oracledb.OUT_FORMAT_OBJECT,
      autoCommit: true,
      ...opts
    });
    return result;
  } finally {
    await conn.close();
  }
}

// ════════════════════════════════════════════════════════════
//  HEALTH CHECK
// ════════════════════════════════════════════════════════════
app.get('/health', async (req, res) => {
  try {
    const result = await query('SELECT 1 AS ok FROM DUAL');
    res.json({ status: 'ok', oracle: 'connected', timestamp: new Date().toISOString() });
  } catch (e) {
    res.status(500).json({ status: 'error', message: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  USERS  —  /api/users
// ════════════════════════════════════════════════════════════

// GET /api/users  — list all users
app.get('/api/users', async (req, res) => {
  try {
    const result = await query(
      `SELECT PHONE, NAME, EMAIL, CREATED_AT, UPDATED_AT FROM SK_USERS ORDER BY CREATED_AT DESC`
    );
    res.json({ success: true, data: result.rows, count: result.rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/users/:phone  — get one user
app.get('/api/users/:phone', async (req, res) => {
  try {
    const result = await query(
      `SELECT PHONE, NAME, EMAIL, CREATED_AT FROM SK_USERS WHERE PHONE = :phone`,
      [req.params.phone]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, data: result.rows[0] });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/users  — create or update user (upsert)
app.post('/api/users', async (req, res) => {
  const { phone, name, email } = req.body;
  if (!phone || !name) return res.status(400).json({ success: false, error: 'phone and name required' });
  try {
    await query(
      `MERGE INTO SK_USERS u
       USING (SELECT :phone AS phone FROM DUAL) src ON (u.PHONE = src.phone)
       WHEN MATCHED THEN
         UPDATE SET NAME = :name, EMAIL = :email, UPDATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (PHONE, NAME, EMAIL, CREATED_AT, UPDATED_AT)
         VALUES (:phone, :name, :email, SYSTIMESTAMP, SYSTIMESTAMP)`,
      { phone, name, email: email || null }
    );
    res.json({ success: true, message: 'User saved' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  SESSIONS  —  /api/sessions
// ════════════════════════════════════════════════════════════

// POST /api/sessions  — save session (login)
app.post('/api/sessions', async (req, res) => {
  const { phone, userData } = req.body;
  if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
  try {
    await query(
      `MERGE INTO SK_SESSIONS s
       USING (SELECT :phone AS phone FROM DUAL) src ON (s.PHONE = src.phone)
       WHEN MATCHED THEN
         UPDATE SET USER_DATA = :userData, CREATED_AT = SYSTIMESTAMP
       WHEN NOT MATCHED THEN
         INSERT (PHONE, USER_DATA, CREATED_AT) VALUES (:phone, :userData, SYSTIMESTAMP)`,
      { phone, userData: JSON.stringify(userData || {}) }
    );
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/sessions/:phone  — load session
app.get('/api/sessions/:phone', async (req, res) => {
  try {
    const result = await query(
      `SELECT PHONE, USER_DATA, CREATED_AT FROM SK_SESSIONS WHERE PHONE = :phone`,
      [req.params.phone]
    );
    if (!result.rows.length) return res.json({ success: true, data: null });
    const row = result.rows[0];
    res.json({ success: true, data: { ...row, USER_DATA: JSON.parse(row.USER_DATA || '{}') } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/sessions/:phone  — logout
app.delete('/api/sessions/:phone', async (req, res) => {
  try {
    await query(`DELETE FROM SK_SESSIONS WHERE PHONE = :phone`, [req.params.phone]);
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  ORDERS  —  /api/orders
// ════════════════════════════════════════════════════════════

// GET /api/orders?phone=9876543210  — get orders for user
app.get('/api/orders', async (req, res) => {
  const { phone } = req.query;
  try {
    const sql = phone
      ? `SELECT ORDER_ID, PHONE, ORDER_DATA, STATUS, CREATED_AT FROM SK_ORDERS WHERE PHONE = :phone ORDER BY CREATED_AT DESC`
      : `SELECT ORDER_ID, PHONE, ORDER_DATA, STATUS, CREATED_AT FROM SK_ORDERS ORDER BY CREATED_AT DESC`;
    const result = await query(sql, phone ? [phone] : []);
    const rows = result.rows.map(r => ({
      ...JSON.parse(r.ORDER_DATA || '{}'),
      id: r.ORDER_ID,
      phone: r.PHONE,
      status: r.STATUS,
      createdAt: r.CREATED_AT
    }));
    res.json({ success: true, data: rows, count: rows.length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// GET /api/orders/:id  — get one order
app.get('/api/orders/:id', async (req, res) => {
  try {
    const result = await query(
      `SELECT ORDER_ID, PHONE, ORDER_DATA, STATUS, CREATED_AT FROM SK_ORDERS WHERE ORDER_ID = :id`,
      [req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ success: false, error: 'Order not found' });
    const r = result.rows[0];
    res.json({ success: true, data: { ...JSON.parse(r.ORDER_DATA || '{}'), id: r.ORDER_ID, phone: r.PHONE, status: r.STATUS } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/orders  — create order
app.post('/api/orders', async (req, res) => {
  const order = req.body;
  if (!order.id || !order.phone) return res.status(400).json({ success: false, error: 'id and phone required' });
  try {
    await query(
      `INSERT INTO SK_ORDERS (ORDER_ID, PHONE, ORDER_DATA, STATUS, CREATED_AT)
       VALUES (:id, :phone, :orderData, :status, SYSTIMESTAMP)`,
      { id: order.id, phone: order.phone, orderData: JSON.stringify(order), status: order.status || 'confirmed' }
    );
    res.json({ success: true, message: 'Order created' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// PUT /api/orders/:id  — update order status (seller dashboard)
app.put('/api/orders/:id', async (req, res) => {
  const { status, orderData } = req.body;
  try {
    const updateData = orderData ? JSON.stringify(orderData) : null;
    await query(
      `UPDATE SK_ORDERS SET STATUS = :status ${updateData ? ', ORDER_DATA = :orderData' : ''} WHERE ORDER_ID = :id`,
      updateData ? { status, orderData: updateData, id: req.params.id } : { status, id: req.params.id }
    );
    res.json({ success: true, message: 'Order updated' });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  ADDRESSES  —  /api/addresses
// ════════════════════════════════════════════════════════════

// GET /api/addresses?phone=9876543210
app.get('/api/addresses', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
  try {
    const result = await query(
      `SELECT ADDR_ID, PHONE, ADDR_DATA, IDX FROM SK_ADDRESSES WHERE PHONE = :phone ORDER BY IDX`,
      [phone]
    );
    const rows = result.rows.map(r => ({ ...JSON.parse(r.ADDR_DATA || '{}'), addrId: r.ADDR_ID }));
    res.json({ success: true, data: rows });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/addresses  — save all addresses for a user (replace)
app.post('/api/addresses', async (req, res) => {
  const { phone, addresses } = req.body;
  if (!phone || !Array.isArray(addresses)) return res.status(400).json({ success: false, error: 'phone and addresses[] required' });
  try {
    await query(`DELETE FROM SK_ADDRESSES WHERE PHONE = :phone`, [phone]);
    for (let i = 0; i < addresses.length; i++) {
      const addr = addresses[i];
      await query(
        `INSERT INTO SK_ADDRESSES (ADDR_ID, PHONE, ADDR_DATA, IDX) VALUES (:addrId, :phone, :addrData, :idx)`,
        { addrId: addr.addrId || `${phone}_${i}`, phone, addrData: JSON.stringify(addr), idx: i }
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  CART  —  /api/cart
// ════════════════════════════════════════════════════════════

// GET /api/cart?phone=9876543210
app.get('/api/cart', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
  try {
    const result = await query(
      `SELECT PID, QTY FROM SK_CART WHERE PHONE = :phone`,
      [phone]
    );
    const cart = {};
    result.rows.forEach(r => { cart[r.PID] = r.QTY; });
    res.json({ success: true, data: cart });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/cart  — save cart (replace all)
app.post('/api/cart', async (req, res) => {
  const { phone, cart } = req.body;
  if (!phone || !cart) return res.status(400).json({ success: false, error: 'phone and cart required' });
  try {
    await query(`DELETE FROM SK_CART WHERE PHONE = :phone`, [phone]);
    for (const [pid, qty] of Object.entries(cart)) {
      await query(
        `INSERT INTO SK_CART (CART_KEY, PHONE, PID, QTY) VALUES (:cartKey, :phone, :pid, :qty)`,
        { cartKey: `${phone}_${pid}`, phone, pid: Number(pid), qty }
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  WISHLIST  —  /api/wishlist
// ════════════════════════════════════════════════════════════

// GET /api/wishlist?phone=9876543210
app.get('/api/wishlist', async (req, res) => {
  const { phone } = req.query;
  if (!phone) return res.status(400).json({ success: false, error: 'phone required' });
  try {
    const result = await query(`SELECT PID FROM SK_WISHLIST WHERE PHONE = :phone`, [phone]);
    res.json({ success: true, data: result.rows.map(r => r.PID) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/wishlist  — save wishlist (replace all)
app.post('/api/wishlist', async (req, res) => {
  const { phone, wishlist } = req.body;
  if (!phone || !Array.isArray(wishlist)) return res.status(400).json({ success: false, error: 'phone and wishlist[] required' });
  try {
    await query(`DELETE FROM SK_WISHLIST WHERE PHONE = :phone`, [phone]);
    for (const pid of wishlist) {
      await query(
        `INSERT INTO SK_WISHLIST (WISH_KEY, PHONE, PID) VALUES (:wishKey, :phone, :pid)`,
        { wishKey: `${phone}_${pid}`, phone, pid }
      );
    }
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// ════════════════════════════════════════════════════════════
//  404 fallback
// ════════════════════════════════════════════════════════════
app.use((req, res) => res.status(404).json({ success: false, error: `Route not found: ${req.method} ${req.path}` }));

// ════════════════════════════════════════════════════════════
//  START
// ════════════════════════════════════════════════════════════
const PORT = process.env.PORT || 3000;

initOraclePool()
  .then(() => {
    app.listen(PORT, () => {
      console.log(`🚀 ShopKart API running on http://localhost:${PORT}`);
      console.log(`   Health check: http://localhost:${PORT}/health`);
    });
  })
  .catch(err => {
    console.error('❌ Failed to init Oracle pool:', err.message);
    process.exit(1);
  });
