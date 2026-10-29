'use strict';

const dates = require('./dates');
const P = require('./parsers');
const { dayCurve, STEP } = require('./curve');

const FR_MONTHS = ['janvier', 'fevrier', 'mars', 'avril', 'mai', 'juin', 'juillet', 'aout', 'septembre', 'octobre', 'novembre', 'decembre'];

function monthsAround(date) {
  const set = new Map();
  for (const d of [dates.addDays(date, -1), date, dates.addDays(date, 1)]) {
    const p = dates.parseYmd(d);
    set.set(`${p.y}-${p.mo}`, { y: p.y, mo: p.mo });
  }
  return Array.from(set.values());
}

// Cada fonte devolve uma lista de { url, parse(html) -> extremos }.
const SOURCES = [
  {
    id: 'tabuademaresrecife',
    name: 'Tábua de Marés (Recife)',
    place: 'Recife',
    pages: (date, ref) => [{
      url: 'https://tabuademares.com/br/pernambuco/recife',
      parse: (html) => P.parseTabuaDeMares(html, { refDate: ref }).extremes,
    }],
  },
  {
    id: 'tidesatlas',
    name: 'TidesAtlas',
    place: 'Recife (USCGS)',
    pages: (date, ref) => [{
      url: 'https://tidesatlas.com/en/brazil/pernambuco/recife-uscgs',
      parse: (html) => P.parseTidesAtlas(html, { refDate: ref }),
    }],
  },
  {
    id: 'tideforecast',
    name: 'Tide-Forecast',
    place: 'Recife',
    pages: (date, ref) => [{
      url: 'https://www.tide-forecast.com/locations/Recife-Brazil/tides/latest',
      parse: (html) => P.parseTideForecast(html, { refDate: ref }),
    }],
  },
  {
    id: 'meteoconsult',
    name: 'Météo Consult',
    place: 'Recife',
    dashed: true,
    pages: (date) => monthsAround(date).map((m) => ({
      url: `https://marine.meteoconsult.fr/meteo-marine/horaires-des-marees/recife-396/${FR_MONTHS[m.mo - 1]}-${m.y}`,
      parse: (html) => P.parseMeteoConsult(html, { year: m.y, month: m.mo }),
    })),
  },
  {
    id: 'tabuademares',
    name: 'Tábua de Marés',
    place: 'Boa Viagem',
    pages: (date, ref) => [{
      url: 'https://tabuademares.com/br/pernambuco/boa-viagem',
      parse: (html) => P.parseTabuaDeMares(html, { refDate: ref }).extremes,
    }],
  },
];

function mergeExtremes(lists) {
  return P.dedupe([].concat(...lists));
}

async function loadSource(src, date, ref, fetchText) {
  const base = { id: src.id, name: src.name, place: src.place, dashed: !!src.dashed };
  const pages = src.pages(date, ref);
  const settled = await Promise.allSettled(pages.map(async (pg) => {
    const html = await fetchText(pg.url);
    return pg.parse(html);
  }));

  const lists = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') lists.push(r.value);
    else errors.push(`${r.reason && r.reason.message ? r.reason.message : r.reason}`);
    base.url = base.url || pages[i].url;
  });
  base.url = pages[0].url;

  if (!lists.length) return { ...base, ok: false, error: errors[0] || 'sem resposta' };

  const all = mergeExtremes(lists);
  const start = dates.dayStartMinutes(date);
  const inDay = all.filter((e) => e.t >= start && e.t < start + 1440);
  if (!inDay.length) {
    return { ...base, ok: false, error: 'a fonte não trouxe marés para essa data' };
  }
  const { curve, approx } = dayCurve(all, date);
  return {
    ...base,
    ok: true,
    approx,
    extremes: inDay.map((e) => ({ time: dates.minutesToHHMM(e.t), type: e.type, h: e.h })),
    curve,
  };
}

async function buildTides({ date, now, fetchText }) {
  const today = dates.nowInRecife(now);
  const day = date && dates.parseYmd(date) ? date : today.date;
  const sources = await Promise.all(SOURCES.map((s) => loadSource(s, day, today.date, fetchText)));
  return {
    date: day,
    today: today.date,
    nowMinutes: day === today.date ? today.minutes : null,
    step: STEP,
    generatedAt: (now || new Date()).toISOString(),
    allOk: sources.every((s) => s.ok),
    sources,
  };
}

module.exports = { buildTides, SOURCES };
