-- ══════════════════════════════════════════════════════════════
--  ShopKart Oracle Schema Setup
--  Run this SQL script once in your Oracle DB (as admin user)
--  Connect using: sqlplus admin@195.34.32.3:1521/cwwpddaz
-- ══════════════════════════════════════════════════════════════

-- 1. USERS table
CREATE TABLE SK_USERS (
  PHONE       VARCHAR2(20)   PRIMARY KEY,
  NAME        VARCHAR2(200)  NOT NULL,
  EMAIL       VARCHAR2(300),
  CREATED_AT  TIMESTAMP      DEFAULT SYSTIMESTAMP,
  UPDATED_AT  TIMESTAMP      DEFAULT SYSTIMESTAMP
);

-- 2. SESSIONS table (one session per user)
CREATE TABLE SK_SESSIONS (
  PHONE       VARCHAR2(20)   PRIMARY KEY,
  USER_DATA   CLOB,
  CREATED_AT  TIMESTAMP      DEFAULT SYSTIMESTAMP
);

-- 3. ORDERS table
CREATE TABLE SK_ORDERS (
  ORDER_ID    VARCHAR2(100)  PRIMARY KEY,
  PHONE       VARCHAR2(20)   NOT NULL,
  ORDER_DATA  CLOB,
  STATUS      VARCHAR2(50)   DEFAULT 'confirmed',
  CREATED_AT  TIMESTAMP      DEFAULT SYSTIMESTAMP
);

CREATE INDEX IDX_ORDERS_PHONE ON SK_ORDERS(PHONE);
CREATE INDEX IDX_ORDERS_STATUS ON SK_ORDERS(STATUS);

-- 4. ADDRESSES table
CREATE TABLE SK_ADDRESSES (
  ADDR_ID     VARCHAR2(100)  PRIMARY KEY,
  PHONE       VARCHAR2(20)   NOT NULL,
  ADDR_DATA   CLOB,
  IDX         NUMBER         DEFAULT 0
);

CREATE INDEX IDX_ADDR_PHONE ON SK_ADDRESSES(PHONE);

-- 5. CART table
CREATE TABLE SK_CART (
  CART_KEY    VARCHAR2(100)  PRIMARY KEY,
  PHONE       VARCHAR2(20)   NOT NULL,
  PID         NUMBER         NOT NULL,
  QTY         NUMBER         DEFAULT 1
);

CREATE INDEX IDX_CART_PHONE ON SK_CART(PHONE);

-- 6. WISHLIST table
CREATE TABLE SK_WISHLIST (
  WISH_KEY    VARCHAR2(100)  PRIMARY KEY,
  PHONE       VARCHAR2(20)   NOT NULL,
  PID         NUMBER         NOT NULL
);

CREATE INDEX IDX_WISH_PHONE ON SK_WISHLIST(PHONE);

-- Verify all tables created
SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME LIKE 'SK_%' ORDER BY 1;

-- ══════════════════════════════════════════════════════════════
--  Expected output:
--  SK_ADDRESSES
--  SK_CART
--  SK_ORDERS
--  SK_SESSIONS
--  SK_USERS
--  SK_WISHLIST
-- ══════════════════════════════════════════════════════════════
