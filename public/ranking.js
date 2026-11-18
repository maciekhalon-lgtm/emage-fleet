/* Emage FLEET — Pojazdy → Ranking: kierowcy i auta z tego, co kierowcy wpisali w aplikacji.
   Km: przejęcie → zdanie auta (liczniki wpisane przez kierowcę; przy obsadzie po połowie).
   Spalanie: tankowania wpisane w aplikacji – litry tankowania / km od poprzedniego tankowania tego auta,
   odcinek należy do kierowcy, który tankował. Karty paliwowe tylko sprawdzają wpisy (powiadomienia „karta”). */
'use strict';
let rkView = 'drv', rkPer = '30', rkSort = {drv: ['rate', 1], veh: ['km', -1]};
const rkOn = () => !!P().manage;
function rkRange(){
  const t = today();
  if (rkPer==='mies') return [t.slice(0, 8) + '01', t];
  return [addDays(t, -(Number(rkPer) - 1)), t];
}
/* odcinki spalania z wpisów kierowców: {vid, drv, km, l, date} */
function rkLegs(from, to){
  const out = [], by = {};
  appFuel().filter(c => Number(c.liters) > 0 && Number(c.odometer) > 0 && !String(c.note || '').startsWith('Karta:'))
    .forEach(c => (by[c.vehicleId] = by[c.vehicleId] || []).push(c));
  Object.entries(by).forEach(([vid, xs]) => {
    xs.sort((a, b) => Number(a.odometer) - Number(b.odometer) || String(a.date).localeCompare(b.date));
    for (let i = 1; i < xs.length; i++){
      const c = xs[i], km = Number(c.odometer) - Number(xs[i - 1].odometer);
      if (c.date < from || c.date > to || km < 50 || km > 3000) continue;
      const rate = Number(c.liters) / km * 100; if (rate < 3 || rate > 40) continue;
      out.push({vid, drv: fillDriver(c) || c.driverId || '', km, l: Number(c.liters), date: c.date});
    }
  });
  return out;
}
function rkData(){
  const [from, to] = rkRange(), legs = rkLegs(from, to);
  const fleetKm = legs.reduce((a, x) => a + x.km, 0), fleetL = legs.reduce((a, x) => a + x.l, 0);
  const fleetRate = fleetKm >= 300 ? fleetL / fleetKm * 100 : null;
  const cardEv = (S.events || []).filter(e => e.kind==='karta' && String(e.at).slice(0, 10) >= from);
  const drv = S.drivers.filter(d => d.active!==false).map(d => {
    let km = 0; const days = new Set(), veh = new Set();
    S.bookings.forEach(b => { const crew = crewOf(b); if (!crew.includes(d.id)) return;
      for (let x = b.from > from ? b.from : from; x <= (b.to < to ? b.to : to); x = addDays(x, 1)) days.add(x);
      const p = b.pickup, r = b.returned;
      if (p && r && r.at >= from && r.at <= to && Number(r.km) > Number(p.km)){ const k = Number(r.km) - Number(p.km); if (k < 20000){ km += k / crew.length; veh.add(b.vehicleId); } } });
    const fills = appFuel().filter(c => (fillDriver(c) || c.driverId)===d.id && c.date >= from && c.date <= to);
    const lg = legs.filter(x => x.drv===d.id), lkm = lg.reduce((a, x) => a + x.km, 0), ll = lg.reduce((a, x) => a + x.l, 0);
    const rate = lkm >= 300 ? ll / lkm * 100 : null;
    return {d, name: d.name, km: Math.round(km), days: days.size, fills: fills.length, liters: fills.reduce((a, c) => a + Number(c.liters || 0), 0), rate, diff: rate!=null && fleetRate ? (rate - fleetRate) / fleetRate * 100 : null,
      card: cardEv.filter(e => e.driverId===d.id).length, veh: veh.size};
  }).filter(x => x.km || x.fills || x.days);
  const veh = S.vehicles.filter(v => v.status!=='wycofany').map(v => {
    let km = 0; const days = new Set(), who = new Set();
    S.bookings.forEach(b => { if (b.vehicleId!==v.id) return;
      for (let x = b.from > from ? b.from : from; x <= (b.to < to ? b.to : to); x = addDays(x, 1)) days.add(x);
      const p = b.pickup, r = b.returned;
      if (p && r && r.at >= from && r.at <= to && Number(r.km) > Number(p.km) && Number(r.km) - Number(p.km) < 20000){ km += Number(r.km) - Number(p.km); crewOf(b).forEach(x => who.add(x)); } });
    const lg = legs.filter(x => x.vid===v.id), lkm = lg.reduce((a, x) => a + x.km, 0), ll = lg.reduce((a, x) => a + x.l, 0);
    const rate = lkm >= 300 ? ll / lkm * 100 : null;
    return {v, km, days: days.size, rate, diff: rate!=null && fleetRate ? (rate - fleetRate) / fleetRate * 100 : null, who: who.size, card: cardEv.filter(e => e.vehicleId===v.id).length};
  });
  return {from, to, fleetRate, drv, veh};
}
function viewRankingFleet(){
  if (!rkOn()) return `<div class="bar"><h2>Ranking</h2></div><div class="panel empty"><p>Ranking widzi kierownik floty.</p></div>`;
  const R = rkData(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const pers = [['30', '30 dni'], ['90', '90 dni'], ['mies', 'Ten miesiąc']];
  const head = `<div class="bar"><h2>Ranking</h2><div class="tools"><div class="seg">${[['drv', 'Kierowcy'], ['veh', 'Auta']].map(([k, l]) => `<button type="button" class="${rkView===k ? 'on' : ''}" data-rk-view="${k}">${l}</button>`).join('')}</div>
    <div class="seg">${pers.map(([k, l]) => `<button type="button" class="${rkPer===k ? 'on' : ''}" data-rk-per="${k}">${l}</button>`).join('')}</div></div></div>
    <p class="muted small" style="margin:0 0 12px">Z wpisów kierowców w aplikacji (${fdate(R.from)} – ${fdate(R.to)}): km z przejęć i zdań auta, spalanie z tankowań. Średnia floty: <b>${R.fleetRate!=null ? f1(R.fleetRate) + ' l/100 km' : 'za mało danych'}</b>. Karty paliwowe tylko sprawdzają wpisy – niezgodności przychodzą jako powiadomienia.</p>`;
  const [sk, dir] = rkSort[rkView];
  const cmp = (a, b) => { const x = a[sk], y = b[sk]; if (x==null && y==null) return 0; if (x==null) return 1; if (y==null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
  const th = (k, l, r) => `<th class="${r ? 'r' : ''} click" data-rk-sort="${k}">${l}${sk===k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const diffCell = x => x.diff==null ? '<span class="muted">—</span>' : `<span class="pill ${x.diff > 15 ? 'bad' : x.diff > 5 ? 'warn' : x.diff < -5 ? 'ok' : 'off'}">${x.diff > 0 ? '+' : ''}${Math.round(x.diff)}%</span>`;
  const rateCell = x => x.rate==null ? '<span class="muted">—</span>' : `<b class="num ${x.rate > THEFT_RATE ? 'neg' : ''}">${f1(x.rate)}</b>`;
  if (rkView==='drv'){
    const xs = R.drv.slice().sort(cmp), withRate = xs.filter(x => x.rate!=null);
    const top = new Set(sk==='rate' ? withRate.slice(0, 3).map(x => x.d.id) : []), low = new Set(sk==='rate' && withRate.length > 5 ? withRate.slice(-3).map(x => x.d.id) : []);
    return head + `<div class="panel tablewrap"><table class="rk2-tbl"><thead><tr><th>#</th>${th('name', 'Kierowca')}${th('km', 'Km', 1)}${th('days', 'Dni pracy', 1)}${th('fills', 'Tankowania', 1)}${th('rate', 'Spalanie l/100', 1)}${th('diff', 'vs średnia', 1)}${th('card', 'Niezgodne z kartą', 1)}</tr></thead><tbody>
      ${xs.map((x, i) => `<tr class="click ${top.has(x.d.id) ? 'rk-top' : low.has(x.d.id) ? 'rk-low' : ''}" data-drv-hist="${esc(x.d.id)}"><td class="num">${i + 1}</td><td><b>${esc(x.d.name)}</b>${x.veh ? `<span class="sub">${x.veh} ${isPlural(x.veh, 'auto', 'auta', 'aut')}</span>` : ''}</td>
        <td class="r num">${x.km ? nf.format(x.km) : '—'}</td><td class="r num">${x.days || '—'}</td><td class="r num">${x.fills ? `${x.fills} <span class="muted small">· ${nf.format(Math.round(x.liters))} l</span>` : '—'}</td>
        <td class="r">${rateCell(x)}</td><td class="r">${diffCell(x)}</td><td class="r">${x.card ? `<span class="pill bad">${x.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Brak wpisów kierowców w tym okresie – ranking pojawi się, gdy kierowcy zaczną przejmować auta i wpisywać tankowania.</td></tr>'}</tbody></table></div>
      <p class="muted small">Kliknij kierowcę – historia jego tankowań, przejęć i zdań. Spalanie pokazujemy od 300 km z wpisanymi tankowaniami.</p>`;
  }
  const xs = R.veh.map(x => ({...x, name: x.v.plate})).sort(cmp);
  return head + `<div class="panel tablewrap"><table class="rk2-tbl"><thead><tr>${th('name', 'Auto')}${th('km', 'Km', 1)}${th('days', 'Dni w grafiku', 1)}${th('rate', 'Spalanie l/100', 1)}${th('diff', 'vs średnia', 1)}${th('who', 'Kierowców', 1)}${th('card', 'Niezgodne z kartą', 1)}</tr></thead><tbody>
    ${xs.map(x => `<tr class="click" data-card-go="${esc(x.v.id)}" data-ctab-go="paliwo"><td>${plate(x.v.plate)}<span class="sub">${esc([x.v.make, x.v.model].filter(Boolean).join(' '))}</span></td>
      <td class="r num">${x.km ? nf.format(x.km) : '—'}</td><td class="r num">${x.days || '—'}</td><td class="r">${rateCell(x)}</td><td class="r">${diffCell(x)}</td><td class="r num">${x.who || '—'}</td>
      <td class="r">${x.card ? `<span class="pill bad">${x.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('')}</tbody></table></div>`;
}
document.addEventListener('click', e => {
  const v = e.target.closest('[data-rk-view]'); if (v){ rkView = v.dataset.rkView; render(); return; }
  const p = e.target.closest('[data-rk-per]'); if (p){ rkPer = p.dataset.rkPer; render(); return; }
  const s = e.target.closest('[data-rk-sort]'); if (s){ const k = s.dataset.rkSort, cur = rkSort[rkView];
    rkSort[rkView] = [k, cur[0]===k ? -cur[1] : (k==='rate' || k==='name' || k==='card' || k==='diff' ? 1 : -1)]; render(); }
});
