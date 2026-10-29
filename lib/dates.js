'use strict';

// Horário local de Recife (UTC-3, sem horário de verão). Todos os instantes são
// guardados como "minutos locais desde 1970": Date.UTC(ano, mês, dia, h, min) / 60000.

const TZ = 'America/Recife';

function localMinutes(y, mo, d, h, mi) {
  return Date.UTC(y, mo - 1, d, h || 0, mi || 0) / 60000;
}

function parseYmd(s) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(s || ''));
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { y, mo, d };
}

function fmtYmd(y, mo, d) {
  return `${String(y).padStart(4, '0')}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function addDays(ymd, n) {
  const p = parseYmd(ymd);
  const dt = new Date(Date.UTC(p.y, p.mo - 1, p.d + n));
  return fmtYmd(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

function dayStartMinutes(ymd) {
  const p = parseYmd(ymd);
  return localMinutes(p.y, p.mo, p.d, 0, 0);
}

function minutesToHHMM(t) {
  return new Date(t * 60000).toISOString().slice(11, 16);
}

// Data e hora atuais em Recife.
function nowInRecife(now) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(now || new Date());
  const get = (type) => parts.find((p) => p.type === type).value;
  const hour = +get('hour') % 24;
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    minutes: hour * 60 + +get('minute'),
  };
}

// Dado um mês e dia sem ano, escolhe o ano mais próximo da data de referência.
function inferYear(month, refYmd) {
  const ref = parseYmd(refYmd);
  if (month - ref.mo > 6) return ref.y - 1;
  if (ref.mo - month > 6) return ref.y + 1;
  return ref.y;
}

module.exports = {
  TZ, localMinutes, parseYmd, fmtYmd, addDays, dayStartMinutes,
  minutesToHHMM, nowInRecife, inferYear,
};
