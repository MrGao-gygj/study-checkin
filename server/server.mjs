// 学习打卡 · 零依赖后端（Node >= 18）
//
// 本地/服务器：node server.mjs
//   → http://0.0.0.0:8787 ，数据保存在同目录 data.json
//
// 云平台（如 Render 免费实例，磁盘不持久）：配置两个环境变量即可
//   把数据持久化到 GitHub Gist：
//   GIST_ID        = 你的 secret gist ID
//   GITHUB_TOKEN   = 有 gist 读写权限的 token
//   GIST_FILE      = 可选，默认 checkins.json
//
// 接口：GET  /api/checkins → {"records":[...]}
//       PUT  /api/checkins {"records":[...]} → 合并保存
//       GET  /health      → {"ok":true}

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');            // 项目根目录
const DATA_FILE = path.join(__dirname, 'data.json');
const PORT = Number(process.env.PORT || 8787);
const HOST = process.env.HOST || '0.0.0.0';
const MAX_BODY = 4 * 1024 * 1024;

// ---- GitHub Gist 持久化（云平台用） ----
const GIST_ID = (process.env.GIST_ID || '').trim();
const GITHUB_TOKEN = (process.env.GITHUB_TOKEN || '').trim();
const GIST_FILE = (process.env.GIST_FILE || 'checkins.json').trim();
const useGist = Boolean(GIST_ID && GITHUB_TOKEN);
let gistReady = false;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

let records = [];
let saveTimer = null;

function loadFromFile() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
    if (Array.isArray(parsed.records)) records = parsed.records;
  } catch (e) {
    console.log('[storage] no local data file, starting fresh');
  }
}

async function loadFromGist() {
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'User-Agent': 'study-checkin'
    }
  });
  if (!res.ok) throw new Error(`gist load failed: HTTP ${res.status}`);
  const data = await res.json();
  const file = data.files?.[GIST_FILE];
  if (!file) {
    console.log(`[storage] gist has no ${GIST_FILE}, starting fresh`);
    return;
  }
  let content = file.content;
  if (file.truncated && file.raw_url) content = await (await fetch(file.raw_url)).text();
  try {
    const parsed = JSON.parse(content || '{}');
    records = Array.isArray(parsed.records) ? parsed.records : [];
    console.log(`[storage] loaded ${records.length} records from gist`);
  } catch (e) {
    console.log('[storage] gist content unreadable, starting fresh');
  }
}

async function saveToGist() {
  const body = {
    files: {
      [GIST_FILE]: {
        content: JSON.stringify({ records, updatedAt: new Date().toISOString() }, null, 2)
      }
    }
  };
  const res = await fetch(`https://api.github.com/gists/${GIST_ID}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${GITHUB_TOKEN}`,
      'Accept': 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'User-Agent': 'study-checkin'
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error(`gist save failed: HTTP ${res.status}`);
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    try {
      if (useGist) {
        await saveToGist();
      } else {
        fs.writeFileSync(DATA_FILE, JSON.stringify({ records, updatedAt: new Date().toISOString() }, null, 2), 'utf8');
      }
    } catch (e) {
      console.error('[save] failed:', e.message);
    }
  }, 400);
}

function mergeRecords(incoming) {
  const map = new Map(records.map((r) => [r.id, r]));
  for (const r of incoming) {
    if (r && typeof r === 'object' && r.id) map.set(r.id, r);
  }
  records = Array.from(map.values());
}

function sendJSON(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(body)
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('body too large')); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); }
      catch (e) { reject(new Error('invalid JSON')); }
    });
    req.on('error', reject);
  });
}

function serveStatic(req, res, pathname) {
  let rel = decodeURIComponent(pathname);
  if (rel === '/' || rel === '') rel = '/index.html';
  const filePath = path.resolve(ROOT, '.' + rel);
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('forbidden'); return; }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('404 not found'); return; }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = url.pathname;

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,PUT,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return;
  }

  if (pathname === '/health') {
    sendJSON(res, 200, { ok: true, records: records.length, storage: useGist ? 'gist' : 'file', gistReady });
    return;
  }

  if (pathname === '/api/checkins') {
    if (req.method === 'GET') {
      if (useGist && !gistReady) {
        try { await loadFromGist(); gistReady = true; } catch (e) { /* keep serving memory */ }
      }
      sendJSON(res, 200, { records, storage: useGist ? 'gist' : 'file' });
      return;
    }
    if (req.method === 'PUT' || req.method === 'POST') {
      try {
        const body = await readBody(req);
        const list = Array.isArray(body) ? body : body.records;
        if (!Array.isArray(list)) { sendJSON(res, 400, { error: 'records must be an array' }); return; }
        mergeRecords(list);
        scheduleSave();
        sendJSON(res, 200, { ok: true, records });
      } catch (e) {
        sendJSON(res, 400, { error: e.message });
      }
      return;
    }
    sendJSON(res, 405, { error: 'method not allowed' });
    return;
  }

  if (req.method === 'GET') { serveStatic(req, res, pathname); return; }
  res.writeHead(405); res.end('method not allowed');
});

async function boot() {
  if (useGist) {
    try {
      await loadFromGist();
      gistReady = true;
      console.log('[storage] using GitHub Gist');
    } catch (e) {
      console.error('[storage] gist unavailable, falling back to file:', e.message);
      loadFromFile();
    }
  } else {
    console.log('[storage] using local data.json (no GIST_ID / GITHUB_TOKEN)');
    loadFromFile();
  }

  server.listen(PORT, HOST, () => {
    console.log('');
    console.log('  学习打卡服务已启动');
    console.log('  ------------------------------------------');
    console.log(`  本机访问:   http://127.0.0.1:${PORT}`);
    const nets = os.networkInterfaces();
    for (const name of Object.keys(nets)) {
      for (const net of nets[name] || []) {
        if (net.family === 'IPv4' && !net.internal) {
          console.log(`  手机访问:   http://${net.address}:${PORT}   (需与电脑同一 WiFi)`);
        }
      }
    }
    console.log('  ------------------------------------------');
    console.log('  按 Ctrl+C 停止');
    console.log('');
  });
}

boot();