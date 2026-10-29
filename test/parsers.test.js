'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const P = require('../lib/parsers');
const D = require('../lib/dates');
const { dayCurve } = require('../lib/curve');
const { buildTides } = require('../lib/build');

const hhmm = (t) => D.minutesToHHMM(t);
const d11 = (e) => e.filter((x) => hhmm(x.t) && D.minutesToHHMM(x.t) && x.t >= D.dayStartMinutes('2026-10-11') && x.t < D.dayStartMinutes('2026-10-12'));

const ATLAS = `
| **Sun 11 Oct** Today | 04:09 (2.39m)    16:25 (2.36m) | 10:13 (0.29m)    22:29 (0.38m) |
| **Mon 12 Oct** | 04:55 (2.35m)    17:10 (2.30m) | 10:58 (0.33m)    23:14 (0.42m) |
`;

const TF = `
| High Tide | **3:49 AM**(Sun 11 October) | **7.51 ft** (2.29 m) |
| Low Tide | **9:58 AM**(Sun 11 October) | **0.36 ft** (0.11 m) |
| High Tide | **4:01 PM**(Sun 11 October) | **7.05 ft** (2.15 m) |
| Low Tide | **10:10 PM**(Sun 11 October) | **0.13 ft** (0.04 m) |
`;

// Formato atual do site (metros primeiro), copiado da página real de 29/10/2026.
const TF_NOVO = `
Today's tide times for Recife: Thursday 29 October 2026
Tide | Time (-03) & Date | Height |
High Tide | 5:37 AM (Thu 29 October) | 2.17 m (7.12 ft) |
Low Tide | 11:47 AM (Thu 29 October) | 0.27 m (0.87 ft) |
High Tide | 5:52 PM (Thu 29 October) | 2.02 m (6.62 ft) |
Low Tide | 12:05 AM (Sun 1 November) | -0.05 m (-0.16 ft) |
`;

const MC = `
dimanche 11
Marée haute 03h50 2.29m
Marée basse 09h59 0.11m
Marée haute 16h01 2.15m
Marée basse 22h10 0.04m
lundi 12
Marée haute 04h35 2.27m
`;

const TAB = `
Outubro de 2026 DIA Sol Marés
- 11 Dom 5:12 17:20 3:55 2,3 m 10:05 0,2 m 16:10 2,2 m 22:15 0,1 m 90 muito alto
`;

test('TidesAtlas classifica por alternância', () => {
  const e = P.parseTidesAtlas(ATLAS, { refDate: '2026-10-11' });
  const day = d11(e);
  assert.deepEqual(day.map((x) => hhmm(x.t)), ['04:09', '10:13', '16:25', '22:29']);
  assert.deepEqual(day.map((x) => x.type), ['high', 'low', 'high', 'low']);
});

test('Tide-Forecast com AM/PM', () => {
  const e = P.parseTideForecast(TF, { refDate: '2026-10-11' });
  assert.deepEqual(e.map((x) => hhmm(x.t)), ['03:49', '09:58', '16:01', '22:10']);
  assert.deepEqual(e.map((x) => x.h), [2.29, 0.11, 2.15, 0.04]);
});

test('Tide-Forecast com a ordem atual (m antes de ft)', () => {
  const e = P.parseTideForecast(TF_NOVO, { refDate: '2026-10-29' });
  assert.deepEqual(e.map((x) => hhmm(x.t)), ['05:37', '11:47', '17:52', '00:05']);
  assert.deepEqual(e.map((x) => x.h), [2.17, 0.27, 2.02, -0.05]);
  assert.deepEqual(e.map((x) => x.type), ['high', 'low', 'high', 'low']);
});

test('Tide-Forecast aceita altura negativa e virada de mês', () => {
  const e = P.parseTideForecast(TF_NOVO, { refDate: '2026-10-29' });
  const virada = e.find((x) => x.t >= D.dayStartMinutes('2026-11-01') && x.t < D.dayStartMinutes('2026-11-02'));
  assert.equal(hhmm(virada.t), '00:05');
  assert.equal(virada.h, -0.05);
});

test('Météo Consult', () => {
  const e = P.parseMeteoConsult(MC, { year: 2026, month: 10 });
  assert.equal(d11(e).length, 4);
  assert.equal(hhmm(e[0].t), '03:50');
  assert.equal(e[0].type, 'high');
});

test('Tábua de Marés', () => {
  const r = P.parseTabuaDeMares(TAB, { refDate: '2026-10-11' });
  assert.equal(r.month, 10);
  const day = d11(r.extremes);
  assert.deepEqual(day.map((x) => hhmm(x.t)), ['03:55', '10:05', '16:10', '22:15']);
  assert.equal(day[0].h, 2.3);
  assert.equal(day[0].type, 'high');
});

test('curva passa pelos extremos', () => {
  const e = P.parseTideForecast(TF, { refDate: '2026-10-11' });
  const { curve, approx } = dayCurve(e, '2026-10-11');
  assert.equal(curve.length, 145);
  assert.ok(approx);
  const idx = (3 * 60 + 50) / 10;
  assert.ok(Math.abs(curve[idx] - 2.29) < 0.02);
  assert.ok(Math.max(...curve) <= 2.29 + 1e-9);
});

test('buildTides com falha parcial', async () => {
  const pages = {
    tidesatlas: ATLAS, 'tide-forecast': TF, meteoconsult: MC, 'tabuademares.com/br/pernambuco/boa': TAB,
  };
  const fetchText = async (url) => {
    if (url.endsWith('tabuademares.com/br/pernambuco/recife')) return TAB;
    if (url.includes('meteoconsult')) throw new Error('HTTP 403');
    const key = Object.keys(pages).find((k) => url.includes(k));
    return pages[key];
  };
  const out = await buildTides({ date: '2026-10-11', now: new Date('2026-10-11T15:00:00Z'), fetchText });
  assert.equal(out.sources.length, 5);
  assert.equal(out.allOk, false);
  assert.equal(out.sources.filter((s) => s.ok).length, 4);
  const meteo = out.sources.find((s) => s.id === 'meteoconsult');
  assert.equal(meteo.ok, false);
  assert.equal(meteo.error, 'HTTP 403');
  assert.equal(out.sources[0].curve.length, 145);
  assert.equal(out.nowMinutes, 12 * 60);
});
