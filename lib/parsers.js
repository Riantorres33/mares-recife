'use strict';

const { localMinutes, parseYmd, inferYear } = require('./dates');

const PT_MONTHS = {
  janeiro: 1, fevereiro: 2, 'março': 3, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
};
const EN_MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
const PT_MONTHS_RE = 'janeiro|fevereiro|mar[çc]o|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro';

// ---------- utilidades ----------

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)));
}

// HTML (ou texto já em markdown) -> texto com uma linha por linha de tabela e
// " | " entre células. Funciona também com a saída em markdown usada nos testes.
function htmlToText(html) {
  let s = String(html);
  s = s.replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, ' ');
  s = s.replace(/<!--[\s\S]*?-->/g, ' ');
  s = s.replace(/<br\s*\/?>|<\/(p|div|li|tr|h[1-6]|table|section|ul|ol)>/gi, '\n');
  s = s.replace(/<\/(td|th)>/gi, ' | ');
  s = s.replace(/<[^>]+>/g, ' ');
  s = decodeEntities(s);
  s = s.replace(/\*/g, '');
  s = s.replace(/[ \t ]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n+/g, '\n');
  return s.trim();
}

function flat(text) {
  return text.replace(/\s+/g, ' ');
}

function num(s) {
  return parseFloat(String(s).replace(',', '.'));
}

// Quando a fonte não diz se é cheia ou baixa, as marés de um dia se alternam.
function classifyByAlternation(items) {
  const sorted = items.slice().sort((a, b) => a.t - b.t);
  if (!sorted.length) return [];
  const firstHigh = sorted.length >= 2 ? sorted[0].h > sorted[1].h : sorted[0].h >= 1.2;
  return sorted.map((e, i) => ({ t: e.t, h: e.h, type: (i % 2 === 0) === firstHigh ? 'high' : 'low' }));
}

function dedupe(list) {
  const seen = new Map();
  for (const e of list) seen.set(`${e.t}|${e.type}`, e);
  return Array.from(seen.values()).sort((a, b) => a.t - b.t);
}

// ---------- 1. TidesAtlas ----------
// Tabela de 10 dias: "Sun 11 Oct | 04:09 (2.39m) 16:25 (2.36m) | 10:13 (0.29m) 22:29 (0.38m)".
function parseTidesAtlas(html, ctx) {
  const text = flat(htmlToText(html));
  const rowRe = /\b(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)[a-z]*\s+(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s*(?:Today)?\s*\|?\s*((?:\d{1,2}:\d{2}\s*\(\s*-?\d+(?:\.\d+)?\s*m\s*\)\s*\|?\s*)+)/gi;
  const itemRe = /(\d{1,2}):(\d{2})\s*\(\s*(-?\d+(?:\.\d+)?)\s*m\s*\)/g;
  const out = [];
  let m;
  while ((m = rowRe.exec(text))) {
    const mo = EN_MONTHS[m[2].toLowerCase()];
    const y = inferYear(mo, ctx.refDate);
    const items = [];
    let it;
    itemRe.lastIndex = 0;
    while ((it = itemRe.exec(m[3]))) {
      items.push({ t: localMinutes(y, mo, +m[1], +it[1], +it[2]), h: parseFloat(it[3]) });
    }
    out.push(...classifyByAlternation(items));
  }
  return dedupe(out);
}

// ---------- 2. Tide-Forecast ----------
// Dois formatos já vistos, com a ordem das unidades invertida:
//   antigo: "High Tide | 3:49 AM(Sun 11 October) | 7.51 ft (2.29 m)"
//   atual:  "High Tide | 5:37 AM (Thu 29 October) | 2.17 m (7.12 ft)"
function parseTideForecast(html, ctx) {
  const text = flat(htmlToText(html));
  const re = /\b(High|Low)\s+Tide\s*\|?\s*(\d{1,2}):(\d{2})\s*(AM|PM)\s*\(\s*[A-Za-z]{3}\s+(\d{1,2})\s+([A-Za-z]+)\s*\)\s*\|?\s*(?:(-?\d+(?:\.\d+)?)\s*m\s*\(\s*-?\d+(?:\.\d+)?\s*ft\s*\)|-?\d+(?:\.\d+)?\s*ft\s*\(\s*(-?\d+(?:\.\d+)?)\s*m\s*\))/gi;
  const out = [];
  let m;
  while ((m = re.exec(text))) {
    const mo = EN_MONTHS[m[6].slice(0, 3).toLowerCase()];
    if (!mo) continue;
    let hour = +m[2];
    const ap = m[4].toUpperCase();
    if (ap === 'PM' && hour < 12) hour += 12;
    if (ap === 'AM' && hour === 12) hour = 0;
    out.push({
      t: localMinutes(inferYear(mo, ctx.refDate), mo, +m[5], hour, +m[3]),
      type: m[1].toLowerCase() === 'high' ? 'high' : 'low',
      h: parseFloat(m[7] || m[8]),
    });
  }
  return dedupe(out);
}

// ---------- 3. Météo Consult ----------
// "jeudi 8 Marée haute 02h01 2.16m Marée basse 08h15 0.13m ..." (mês e ano vêm da URL).
function parseMeteoConsult(html, ctx) {
  const text = flat(htmlToText(html));
  const dayRe = /\b(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)\s+(\d{1,2})\s+((?:Mar[ée]e\s+(?:haute|basse)\s+\d{1,2}h\d{2}\s+-?\d+(?:\.\d+)?\s*m\s*\|?\s*)+)/gi;
  const itemRe = /Mar[ée]e\s+(haute|basse)\s+(\d{1,2})h(\d{2})\s+(-?\d+(?:\.\d+)?)\s*m/gi;
  const out = [];
  let m;
  while ((m = dayRe.exec(text))) {
    let it;
    itemRe.lastIndex = 0;
    while ((it = itemRe.exec(m[2]))) {
      out.push({
        t: localMinutes(ctx.year, ctx.month, +m[1], +it[2], +it[3]),
        type: it[1].toLowerCase() === 'haute' ? 'high' : 'low',
        h: parseFloat(it[4]),
      });
    }
  }
  return dedupe(out);
}

// ---------- 4. Tábua de Marés (tabuademares.com) ----------
// Linhas do mês: "9 Sex 2:24 2,4 m 8:39 0,3 m 14:41 2,3 m 20:49 0,2 m" (a 1a variante
// traz o nascer e o pôr do sol antes das marés). Altura com vírgula e 1 casa decimal.
function parseTabuaDeMares(html, ctx) {
  const text = flat(htmlToText(html).replace(/\|/g, ' '));

  let year = null, month = null;
  const cap = new RegExp(`\\b(${PT_MONTHS_RE})\\s+de\\s+(\\d{4})\\s+DIA\\b`, 'i').exec(text);
  const hoje = new RegExp(`HOJE,[^,]*,\\s*\\d{1,2}\\s+DE\\s+(${PT_MONTHS_RE})\\s+DE\\s+(\\d{4})`, 'i').exec(text);
  const pick = cap || hoje;
  if (pick) {
    month = PT_MONTHS[pick[1].toLowerCase()];
    year = +pick[2];
  } else {
    const p = parseYmd(ctx.refDate);
    year = p.y;
    month = p.mo;
  }

  const rowRe = /(?:^|\s)(\d{1,2})\s+(?:Seg|Ter|Qua|Qui|Sex|S[áa]b|Dom)\s+(?:\d{1,2}:\d{2}\s+\d{1,2}:\d{2}\s+)?((?:\d{1,2}:\d{2}\s+-?\d+,\d+\s*m\s*){2,4})/g;
  const itemRe = /(\d{1,2}):(\d{2})\s+(-?\d+,\d+)\s*m/g;
  const out = [];
  let m;
  while ((m = rowRe.exec(text))) {
    const items = [];
    let it;
    itemRe.lastIndex = 0;
    while ((it = itemRe.exec(m[2]))) {
      items.push({ t: localMinutes(year, month, +m[1], +it[1], +it[2]), h: num(it[3]) });
    }
    out.push(...classifyByAlternation(items));
  }
  return { extremes: dedupe(out), year, month };
}

module.exports = {
  htmlToText, classifyByAlternation, dedupe,
  parseTidesAtlas, parseTideForecast, parseMeteoConsult, parseTabuaDeMares,
};
