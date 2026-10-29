'use strict';

const { dayStartMinutes } = require('./dates');

const STEP = 10; // minutos entre pontos da curva
const POINTS = 24 * 60 / STEP + 1; // 145
const HALF_PERIOD = 372; // meio ciclo da maré semidiurna (6h12), usado só para completar as bordas

function avg(xs) {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

// Interpolação cosseno entre cheias e baixas consecutivas: passa exatamente pelos
// extremos informados pela fonte e é suave entre eles.
function dayCurve(extremes, ymd) {
  const start = dayStartMinutes(ymd);
  const end = start + 1440;
  const list = extremes.slice().sort((a, b) => a.t - b.t);
  if (!list.length) return { curve: [], approx: false };

  let approx = false;
  if (list[0].t > start) {
    const first = list[0];
    const opp = first.type === 'high' ? 'low' : 'high';
    const same = list.filter((e) => e.type === opp);
    list.unshift({ t: first.t - HALF_PERIOD, type: opp, h: same.length ? avg(same.map((e) => e.h)) : opp === 'high' ? 2.0 : 0.4 });
    approx = true;
  }
  const last = list[list.length - 1];
  if (last.t < end) {
    const opp = last.type === 'high' ? 'low' : 'high';
    const same = list.filter((e) => e.type === opp);
    list.push({ t: last.t + HALF_PERIOD, type: opp, h: same.length ? avg(same.map((e) => e.h)) : opp === 'high' ? 2.0 : 0.4 });
    approx = true;
  }

  const curve = [];
  let i = 0;
  for (let k = 0; k < POINTS; k++) {
    const t = start + k * STEP;
    while (i < list.length - 2 && list[i + 1].t <= t) i++;
    const a = list[i], b = list[i + 1];
    const f = Math.min(1, Math.max(0, (t - a.t) / (b.t - a.t)));
    const h = a.h + (b.h - a.h) * (1 - Math.cos(Math.PI * f)) / 2;
    curve.push(Math.round(h * 1000) / 1000);
  }
  return { curve, approx };
}

module.exports = { dayCurve, STEP, POINTS };
