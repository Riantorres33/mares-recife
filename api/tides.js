'use strict';

const { buildTides } = require('../lib/build');
const { parseYmd } = require('../lib/dates');

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

async function fetchText(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'pt-BR,pt;q=0.9,en;q=0.8,fr;q=0.6',
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } catch (err) {
    if (err && err.name === 'AbortError') throw new Error('tempo esgotado');
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

module.exports = async (req, res) => {
  try {
    const q = req.query || {};
    const date = typeof q.date === 'string' && parseYmd(q.date) ? q.date : undefined;
    const out = await buildTides({ date, now: new Date(), fetchText });

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    if (out.allOk && !q.fresh) {
      res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
    res.status(200).send(JSON.stringify(out));
  } catch (err) {
    res.setHeader('Cache-Control', 'no-store');
    res.status(500).json({ error: String(err && err.message ? err.message : err) });
  }
};
