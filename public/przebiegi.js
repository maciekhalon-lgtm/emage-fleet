/* Emage FLEET — przebiegi i spalanie busów w zakresie dat (jedna liczba w całej aplikacji).
   Przebieg: GPS, a bez GPS – liczniki z tankowań, przejęć i zdań auta, odcinkami;
   pojedynczy błędny licznik pomijany, nierealny skok (> 1500 km na dobę) przerywa liczenie.
   Spalanie: wpisy kierowców, do pełna – do pełna (rkVehLegs w ranking.js). */
'use strict';
const ALL_FROM = '2000-01-01';

/* Wszystkie liczniki auta: {d: data, t: godzina/kolejność, odo, src, id} */
function odoReadings(vid){
  const out = [];
  (S.fuelCardRows || []).forEach(r => { if (r.vehicleId===vid && !fakeOdo(r.odometer)) out.push({id:'k' + r.id, d: r.txDate, t: r.txTime || '', odo: Number(r.odometer), src:'karta', note: r.station || ''}); });
  S.costs.forEach(c => { if (c.vehicleId===vid && !fakeOdo(c.odometer)) out.push({id:'c' + c.id, d: c.date, t: '', odo: Number(c.odometer), src: FUEL_CATS.includes(c.category) ? 'tankowanie' : c.category, note: dName(fillDriver(c) || c.driverId) || ''}); });
  S.bookings.forEach(b => {
    if (b.vehicleId!==vid) return;
    if (b.pickup && !fakeOdo(b.pickup.km)) out.push({id:'p' + b.id, d: b.pickup.at, t: '', odo: Number(b.pickup.km), src:'przejęcie', note: crewName(b)});
    if (b.returned && !fakeOdo(b.returned.km)) out.push({id:'z' + b.id, d: b.returned.at, t: '', odo: Number(b.returned.km), src:'zdanie', note: crewName(b)});
  });
  (S.gpsOdometer || []).forEach(g => { if (g.vehicleId===vid && Number(g.km) > 0) out.push({id:'g' + g.id, d: g.day, t: '23:59', odo: Number(g.km), src:'GPS', note: 'lokalizator'}); });
  // ten sam dzień: kolejność po liczniku (przejęcie rano, tankowania, zdanie wieczorem)
  return out.filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d) || a.odo - b.odo || a.t.localeCompare(b.t));
}
/* Skąd brać km: zawsze lokalizator GPS. Gdy GPS nie ma danych w zakresie – liczymy ze wszystkich liczników
   (tankowania, przejęcia i zdania auta) i oznaczamy to (fb). Inne źródła (src) zostają tylko do kontroli liczników. */
const ODO_SRCS = [['auto', 'Wszystkie'], ['gps', 'GPS'], ['karty', 'Karty'], ['kierowcy', 'Kierowcy']];
const odoCfg = () => { const s = (S.settings || []).find(x => x.id==='odo_source') || {}; return {def: 'gps', tol: Number(s.tol) > 0 ? Number(s.tol) : 50}; };
const odoSrc = () => 'gps';
const ODO_DRIVER_SRC = ['tankowanie', 'przejęcie', 'zdanie'];
function odoReadingsOf(vid, src){
  const all = odoReadings(vid);
  if (src==='gps') return all.filter(x => x.src==='GPS');
  if (src==='karty') return all.filter(x => x.src==='karta');
  if (src==='kierowcy'){ const fromCard = new Set((S.fuelCardRows || []).map(r => r.costId).filter(Boolean)); return all.filter(x => ODO_DRIVER_SRC.includes(x.src) && !fromCard.has(x.id.slice(1))); }
  return all;
}
function odoRange(vid, from, to, src = odoSrc()){
  if (src!=='auto'){ const r = odoRangeOf(odoReadingsOf(vid, src), from, to); if (r.km!=null) return {...r, src}; return {...odoRangeOf(odoReadings(vid), from, to), src: 'auto', fb: src}; }
  return {...odoRangeOf(odoReadings(vid), from, to), src: 'auto'};
}
function odoRangeOf(all, from, to){
  const before = all.filter(x => x.d < from), inR = all.filter(x => x.d >= from && x.d <= to);
  // punkt startowy: ostatni licznik sprzed zakresu, jeśli najwyżej 7 dni wcześniej (starszy zawyżyłby wynik)
  const anc = before.length && diffDays(before[before.length - 1].d, from) <= 7 ? before[before.length - 1] : null;
  const xs = (anc ? [anc] : []).concat(inR);
  const bad = new Set();
  if (!inR.length) return {km: null, xs: inR, bad, first: null, last: null};
  const maxLeg = (a, b) => 1500 * (Math.max(0, diffDays(a.d, b.d)) + 1);
  const seg = odoSegments(xs, (a, b) => b.odo - a.odo >= 0 && b.odo - a.odo <= maxLeg(a, b));
  seg.bad.forEach(i => bad.add(xs[i].id));
  const kmS = seg.legs.length ? seg.legs.reduce((s, [a, b]) => s + xs[b].odo - xs[a].odo, 0) : null;
  const ok = seg.alive.map(i => xs[i]);
  return {km: kmS, xs, bad, first: ok[0] || null, last: ok[ok.length - 1] || null, anchor: anc, breaks: seg.breaks};
}

/* Przebieg z lokalizatora GPS w zakresie: od ostatniego odczytu sprzed zakresu (≤ 3 dni) do ostatniego w zakresie.
   null, gdy brak pokrycia (lokalizator nie raportował na początku albo na końcu okresu). */
function gpsRange(vid, from, to){
  const xs = (S.gpsOdometer || []).filter(g => g.vehicleId===vid && Number(g.km) > 0).sort((a, b) => a.day.localeCompare(b.day));
  if (xs.length < 2) return null;
  const before = xs.filter(g => g.day < from), inR = xs.filter(g => g.day >= from && g.day <= to);
  const a = before.length && diffDays(before[before.length - 1].day, from) <= 3 ? before[before.length - 1] : (inR[0] && diffDays(from, inR[0].day) <= 3 ? inR[0] : null);
  const b = inR[inR.length - 1];
  if (!a || !b || a===b) return null;
  const endGap = diffDays(b.day, to < today() ? to : today());
  if (endGap > 3) return null;
  const km_ = Number(b.km) - Number(a.km);
  return km_ >= 0 ? {km: km_, from: a.day, to: b.day} : null;
}
/* Spalanie auta w zakresie – jedna metoda w całej aplikacji: wpisy kierowców, „do pełna – do pełna”
   (start: tankowanie do pełna albo przejęcie auta; dotankowania wliczane), patrz rkVehLegs w ranking.js.
   Karty paliwowe tylko sprawdzają wpisy (powiadomienia „karta”). */
function consRange(vid, from, to){
  const lg = typeof rkVehLegs==='function' ? rkVehLegs(vid).filter(x => x.date >= from && x.date <= to) : [];
  const km = lg.reduce((a, x) => a + x.km, 0), l = lg.reduce((a, x) => a + x.l, 0), rate = km >= 300 ? l / km * 100 : null;
  return {km, l, rate, n: lg.length, src: rate!=null ? 'kierowcy' : null, from: lg.length ? lg[0].date : from, to: lg.length ? lg[lg.length - 1].date : to,
    unsure: rate!=null && (rate < 4 || rate > 25), bad: new Set(), breaks: 0,
    parts: lg.map(x => ({id: x.c.id, km: x.km, l: x.l, rate: x.rate, d0: x.d0, d1: x.date, drv: x.drv}))};
}
/* Średnie spalanie auta z całej historii – ta sama liczba w Pojazdach, karcie auta, kosztach i raportach */
let fcMemo = {key: '', m: new Map()};
function fleetConsumption(vid){
  const key = (typeof rkStamp!=='undefined' ? rkStamp : 0) + '|' + today();
  if (fcMemo.key!==key) fcMemo = {key, m: new Map()};
  if (!fcMemo.m.has(vid)){ const c = consRange(vid, ALL_FROM, today()); fcMemo.m.set(vid, c && c.rate!=null && !c.unsure ? c : null); }
  return fcMemo.m.get(vid);
}
