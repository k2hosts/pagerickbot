// RickBot Status Proxy
// Sits between your landing page and the Monkey Network API.
// Your API key never reaches the browser.
//
// Setup:
//   1. npm install express cors node-fetch dotenv
//   2. Create a .env file in this folder (see .env.example)
//   3. node proxy.js
//
// The landing page will fetch from: http://localhost:3001/status

import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import 'dotenv/config';

const app = express();
const PORT = process.env.PORT || 3001;

const API_KEY   = process.env.RICKBOT_API_KEY;
const SERVER_ID = process.env.RICKBOT_SERVER_ID;
const BASE_URL  = 'https://dash.monkey-network.xyz/api/client';

if (!API_KEY || !SERVER_ID) {
  console.error('Missing RICKBOT_API_KEY or RICKBOT_SERVER_ID in .env');
  process.exit(1);
}

// Allow requests only from your landing page origin in production.
// During local dev, allow everything.
const allowedOrigins = process.env.ALLOWED_ORIGIN
  ? [process.env.ALLOWED_ORIGIN]
  : ['http://localhost', 'http://127.0.0.1', 'null']; // 'null' covers file:// opened locally

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  }
}));

// Cache the last result for 15 seconds so rapid page reloads don't spam the API.
let cache = { data: null, fetchedAt: 0 };
const CACHE_TTL = 15_000;

app.get('/status', async (req, res) => {
  try {
    const now = Date.now();

    if (cache.data && now - cache.fetchedAt < CACHE_TTL) {
      return res.json(cache.data);
    }

    const response = await fetch(
      `${BASE_URL}/servers/${SERVER_ID}/resources`,
      {
        headers: {
          Authorization: `Bearer ${API_KEY}`,
          Accept: 'application/json',
        },
      }
    );

    if (!response.ok) {
      return res.status(502).json({ error: 'Upstream API error', status: response.status });
    }

    const json = await response.json();
    const attr = json.attributes;

    // Shape the response so the frontend only gets what it needs.
    const payload = {
      state:   attr.current_state,                                          // "running" | "offline" | "starting" | "stopping"
      cpu:     Math.round(attr.resources.cpu_absolute * 10) / 10,          // e.g. 12.5
      ram_mb:  Math.round(attr.resources.memory_bytes / 1024 / 1024),      // e.g. 256
      disk_mb: Math.round(attr.resources.disk_bytes / 1024 / 1024),        // e.g. 100
    };

    cache = { data: payload, fetchedAt: now };
    res.json(payload);

  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Internal proxy error' });
  }
});

app.listen(PORT, () => {
  console.log(`RickBot status proxy running on http://localhost:${PORT}`);
});
