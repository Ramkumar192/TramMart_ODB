# ShopKart Oracle Backend

REST API server connecting ShopKart frontend to your Oracle DB.

## Quick Setup (5 steps)

### Step 1 — Install Node.js
Download from https://nodejs.org (LTS version)

### Step 2 — Install dependencies
```bash
cd shopkart-oracle-backend
npm install
```

### Step 3 — Set your Oracle password in .env
Open `.env` and replace `YOUR_PASSWORD_HERE` with your Oracle `admin` password.
Also update `ALLOWED_ORIGINS` with your GitHub Pages URL.

### Step 4 — Create the database tables
Connect to your Oracle DB and run `setup.sql`:
```bash
sqlplus admin@195.34.32.3:1521/cwwpddaz @setup.sql
```
Or paste the contents of setup.sql into SQL Developer / Oracle APEX.

### Step 5 — Start the server
```bash
npm start
```
You should see:
```
✅ Oracle pool created → 195.34.32.3:1521/cwwpddaz
🚀 ShopKart API running on http://localhost:3000
```

Test it: http://localhost:3000/health

## Deploy to production

### Option A — Free (Render.com)
1. Push this folder to a new GitHub repo (without .env!)
2. Go to render.com → New Web Service → connect repo
3. Add environment variables (from .env) in Render dashboard
4. Deploy — you get a URL like https://shopkart-api.onrender.com

### Option B — Your own VPS
```bash
npm install -g pm2
pm2 start server.js --name shopkart-api
pm2 startup
pm2 save
```

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Check DB connection |
| GET | /api/users | All users |
| POST | /api/users | Create/update user |
| GET | /api/users/:phone | Get user by phone |
| POST | /api/sessions | Save login session |
| GET | /api/sessions/:phone | Load session |
| DELETE | /api/sessions/:phone | Logout |
| GET | /api/orders?phone= | Get orders |
| POST | /api/orders | Create order |
| PUT | /api/orders/:id | Update order status |
| GET | /api/cart?phone= | Get cart |
| POST | /api/cart | Save cart |
| GET | /api/wishlist?phone= | Get wishlist |
| POST | /api/wishlist | Save wishlist |
| GET | /api/addresses?phone= | Get addresses |
| POST | /api/addresses | Save addresses |
