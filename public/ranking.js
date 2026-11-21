/* Emage FLEET — Pojazdy → Ranking: kierowcy i auta z tego, co kierowcy wpisali w aplikacji.
   Km: przejęcie → zdanie auta (liczniki wpisane przez kierowcę; przy obsadzie po połowie).
   Spalanie: tankowania wpisane w aplikacji – litry tankowania / km od poprzedniego tankowania tego auta,
   odcinek należy do kierowcy, który tankował. Karty paliwowe tylko sprawdzają wpisy (powiadomienia „karta”). */
'use strict';
let rkView = 'veh', rkPer = '30', rkSort = {drv: ['diff', 1], veh: ['diff', 1]};   // domyślnie: najoszczędniejsi względem średniej swojej klasy na górze
const rkOn = () => !!P().manage;
function rkRange(){
  const t = today();
  if (rkPer==='mies') return [t.slice(0, 8) + '01', t];
  return [addDays(t, -(Number(rkPer) - 1)), t];
}
/* odcinki spalania z wpisów kierowców: {vid, drv, km, l, date} */
/* Spalanie metodą „do pełna – do pełna”: odcinek zaczyna się od tankowania do pełna albo od przejęcia auta
   (przejmowane z pełnym bakiem – chyba że kierowca zaznaczył inny poziom), kończy na następnym tankowaniu do pełna.
   Litry odcinka = wszystkie tankowania po starcie (też dotankowania) + tankowanie kończące. */
let rkLegMemo = {k: '', m: new Map()};
function rkVehLegs(vid){
  const mk = String(rkStamp);
  if (rkLegMemo.k!==mk) rkLegMemo = {k: mk, m: new Map()};
  if (rkLegMemo.m.has(vid)) return rkLegMemo.m.get(vid);
  const r = rkVehLegsRaw(vid); rkLegMemo.m.set(vid, r); return r;
}
var rkStamp = 0;   // podbijane przy każdym render() – wyniki liczone raz na odświeżenie ekranu
function rkVehLegsRaw(vid){
  // licznik z GPS w chwili wpisu (literówka kierowcy nie psuje odcinka), bez GPS – wpis kierowcy w skali GPS.
  // Odcinek: od tankowania do pełna do tankowania do pełna (dotankowania po drodze wliczone). Przejęcie auta jest
  // początkiem odcinka tylko z zaznaczonym pełnym bakiem (bez wątpliwości). Tankowanie z otwartą flagą „Możliwy duplikat” pomijamy, dopóki nie zatwierdzisz.
  const dup = c => (c.flags || []).some(f => String(f).startsWith('Możliwy duplikat')) && c.flagState!=='ok';
  const fills = appFuel().filter(c => c.vehicleId===vid && Number(c.liters) > 0 && Number(c.odometer) > 0 && !String(c.note || '').startsWith('Karta:') && !dup(c))
    .map(c => ({t: 'f', odo: odoAt('tankowanie', c.id, vid, c.odometer), c, date: c.date}));
  const picks = S.bookings.filter(b => b.vehicleId===vid && b.pickup && Number(b.pickup.km) > 0 && Number(b.pickup.fuel)===100 && !b.pickupFuelDoubt)
    .map(b => ({t: 'p', odo: odoAt('przejecie', b.id, vid, b.pickup.km), date: String(b.pickup.at || b.from).slice(0, 10)}));
  // ten sam km z GPS (auto stało, kierowca wpisał dwa tankowania po kolei) – kolejność wg licznika z wpisu, dotankowanie przed „do pełna”
  const typed = e => e.t==='f' ? Number(e.c.odometer) || 0 : 0;
  const ev = [...fills, ...picks].sort((a, b) => a.odo - b.odo || (a.t===b.t ? 0 : a.t==='f' ? -1 : 1) || typed(a) - typed(b)
    || (a.t==='f' && b.t==='f' ? (a.c.full===false ? 0 : 1) - (b.c.full===false ? 0 : 1) : 0) || String(a.date).localeCompare(b.date)
    || String(a.c && a.c.createdAt || '').localeCompare(String(b.c && b.c.createdAt || '')));
  let anchor = null, aDate = null, acc = 0; const out = [];
  ev.forEach(e => {
    if (e.t==='p'){ anchor = e.odo; aDate = e.date; acc = 0; return; }
    acc += Number(e.c.liters);
    if (e.c.full===false) return;
    if (anchor!=null){ const km = e.odo - anchor, rate = km > 0 ? acc / km * 100 : null;
      if (km >= 50 && km <= 5000 && rate >= 3 && rate <= 40) out.push({vid, drv: fillDriver(e.c) || e.c.driverId || '', km, l: acc, date: e.c.date, d0: aDate || e.c.date, c: e.c, rate, a: anchor, z: e.odo}); }
    anchor = e.odo; aDate = e.c.date; acc = 0;
  });
  return out;
}
function rkLegs(from, to){
  const out = [];
  S.vehicles.forEach(v => rkVehLegs(v.id).forEach(x => { if (x.date >= from && x.date <= to) out.push(x); }));
  return out;
}
/* Spalanie kierowców: każdy odcinek auta dzielimy między kierowców według km, które faktycznie przejechali
   (przejęcie → zdanie, z GPS). Kierowca dostaje swoje km i litry wg spalania auta na odcinku – nie zależy od tego,
   kto akurat tankował. Km odcinka bez przydziału (np. luka w danych) – na kierowcę, który zamknął bak. */
const RK_DRV_MIN_KM = 500;    // wynik kierowcy pokazujemy od 500 km – pojedyncze tankowanie „do pełna” waha się o ±5–10 l
function rkDrvParts(from, to){
  const out = [];
  rkLegs(from, to).forEach(L => {
    if (L.a==null || L.z==null || !(L.z > L.a)){ if (L.drv) out.push({vid: L.vid, drv: L.drv, km: L.km, l: L.l, date: L.date}); return; }
    const bs = S.bookings.filter(b => b.vehicleId===L.vid && b.pickup), seg = new Map(); let done = 0;
    bs.forEach(b => {
      const s = odoAt('przejecie', b.id, b.vehicleId, b.pickup.km), e = b.returned ? odoAt('zdanie', b.id, b.vehicleId, b.returned.km) : L.z;
      if (s==null || e==null) return;
      const ov = Math.min(e, L.z) - Math.max(s, L.a); if (!(ov > 0)) return;
      const crew = crewOf(b); crew.forEach(id => seg.set(id, (seg.get(id) || 0) + ov / crew.length)); done += ov;
    });
    const rest = Math.max(0, (L.z - L.a) - done); if (rest > 0 && L.drv) seg.set(L.drv, (seg.get(L.drv) || 0) + rest);
    const tot = [...seg.values()].reduce((a, x) => a + x, 0) || 1;
    seg.forEach((k, id) => out.push({vid: L.vid, drv: id, km: L.km * k / tot, l: L.l * k / tot, date: L.date}));
  });
  return out;
}
function rkData(){
  const [from, to] = rkRange(), legs = rkLegs(from, to), dparts = rkDrvParts(from, to);
  const fleetKm = legs.reduce((a, x) => a + x.km, 0), fleetL = legs.reduce((a, x) => a + x.l, 0);
  const fleetRate = fleetKm >= 300 ? fleetL / fleetKm * 100 : null;
  // średnia klasy (do 2,5 t / powyżej) – auta i kierowców porównujemy z autami tej samej klasy
  const clsOf = vid => wcls(byId('vehicles', vid)), clsRate = {};
  WCLS.forEach(([k]) => { const xs = legs.filter(x => clsOf(x.vid)===k), km = xs.reduce((a, x) => a + x.km, 0), l = xs.reduce((a, x) => a + x.l, 0);
    clsRate[k] = km >= 300 ? l / km * 100 : null; });
  const cardEv = (S.events || []).filter(e => e.kind==='karta' && String(e.at).slice(0, 10) >= from);
  const drv = S.drivers.filter(d => d.active!==false).map(d => {
    let km = 0; const days = new Set(), veh = new Set();
    S.bookings.forEach(b => { const crew = crewOf(b); if (!crew.includes(d.id)) return;
      bkDays(b, from, to).forEach(x => days.add(x));
      const p = b.pickup, r = b.returned;
      if (p && r && r.at >= from && r.at <= to && bkKm(b) > 0){ const k = bkKm(b); if (k < 20000){ km += k / crew.length; veh.add(b.vehicleId); } } });
    const fills = appFuel().filter(c => (fillDriver(c) || c.driverId)===d.id && c.date >= from && c.date <= to);
    const lg = dparts.filter(x => x.drv===d.id), lkm = lg.reduce((a, x) => a + x.km, 0), ll = lg.reduce((a, x) => a + x.l, 0);
    const rate = lkm >= RK_DRV_MIN_KM ? ll / lkm * 100 : null;
    // ile by spalił „przeciętny” kierowca na tych samych odcinkach (średnia klasy każdego auta) → różnica w %
    const expL = lg.reduce((a, x) => a + x.km * (clsRate[clsOf(x.vid)] || fleetRate || 0) / 100, 0);
    return {d, name: d.name, km: Math.round(km), days: days.size, fills: fills.length, liters: fills.reduce((a, c) => a + Number(c.liters || 0), 0), rate, diff: rate!=null && expL > 0 ? (ll - expL) / expL * 100 : null,
      card: cardEv.filter(e => e.driverId===d.id).length, veh: veh.size};
  }).filter(x => x.km || x.fills || x.days);
  const veh = S.vehicles.filter(v => v.status!=='wycofany').map(v => {
    let km = 0; const days = new Set(), who = new Set();
    S.bookings.forEach(b => { if (b.vehicleId!==v.id) return;
      bkDays(b, from, to).forEach(x => days.add(x));
      const p = b.pickup, r = b.returned;
      if (p && r && r.at >= from && r.at <= to && bkKm(b) > 0 && bkKm(b) < 20000){ km += bkKm(b); crewOf(b).forEach(x => who.add(x)); } });
    const lg = legs.filter(x => x.vid===v.id), lkm = lg.reduce((a, x) => a + x.km, 0), ll = lg.reduce((a, x) => a + x.l, 0);
    const rate = lkm >= 300 ? ll / lkm * 100 : null;
    const cost = S.costs.filter(c => c.vehicleId===v.id && c.date >= from && c.date <= to).reduce((a, c) => a + Number(c.amount || 0), 0);
    const cr = clsRate[wcls(v)];
    return {v, cls: wcls(v), km, days: days.size, rate, diff: rate!=null && cr ? (rate - cr) / cr * 100 : null, who: who.size, card: cardEv.filter(e => e.vehicleId===v.id).length,
      cost, costKm: km >= 100 ? cost / km : null};
  });
  return {from, to, fleetRate, clsRate, drv, veh};
}
function viewRankingDrivers(){ rkView = 'drv'; return viewRankingFleet(true); }
function viewRankingFleet(drvTab){
  if (!drvTab) rkView = 'veh';
  if (!rkOn()) return `<div class="bar"><h2>Ranking</h2></div><div class="panel empty"><p>Ranking widzi kierownik floty.</p></div>`;
  const R = rkData(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const pers = [['30', '30 dni'], ['90', '90 dni'], ['mies', 'Ten miesiąc']];
  const head = `<div class="bar"><h2>${rkView==='drv' ? 'Ranking kierowców' : 'Ranking aut'}</h2><div class="tools">
    <div class="seg">${pers.map(([k, l]) => `<button type="button" class="${rkPer===k ? 'on' : ''}" data-rk-per="${k}">${l}</button>`).join('')}</div></div></div>
    <p class="muted small" style="margin:0 0 12px">Z wpisów kierowców w aplikacji (${fdate(R.from)} – ${fdate(R.to)}): km z przejęć i zdań auta, spalanie z tankowań. Średnia: ${WCLS.map(([k, l]) => `${l.toLowerCase()} <b>${R.clsRate[k]!=null ? f1(R.clsRate[k]) + ' l/100 km' : '—'}</b>`).join(' · ')} – „vs średnia” porównuje z autami tej samej klasy. Karty paliwowe tylko sprawdzają wpisy – niezgodności przychodzą jako powiadomienia.</p>`;
  const [sk, dir] = rkSort[rkView];
  const cmp = (a, b) => { const x = a[sk], y = b[sk]; if (x==null && y==null) return 0; if (x==null) return 1; if (y==null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
  const th = (k, l, r) => `<th class="${r ? 'r' : ''} click" data-rk-sort="${k}">${l}${sk===k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const diffCell = x => x.diff==null ? '<span class="muted">—</span>' : `<span class="pill ${x.diff > 15 ? 'bad' : x.diff > 5 ? 'warn' : x.diff < -5 ? 'ok' : 'off'}">${x.diff > 0 ? '+' : ''}${Math.round(x.diff)}%</span>`;
  const rateCell = x => x.rate==null ? '<span class="muted">—</span>' : `<b class="num ${x.rate > (x.v ? theftOf(x.v.id) : THEFT_RATE) ? 'neg' : ''}">${f1(x.rate)}</b>`;
  if (rkView==='drv'){
    const xs = R.drv.slice().sort(cmp), withRate = xs.filter(x => x.rate!=null);
    const top = new Set(['rate', 'diff'].includes(sk) ? withRate.slice(0, 3).map(x => x.d.id) : []), low = new Set(['rate', 'diff'].includes(sk) && withRate.length > 5 ? withRate.slice(-3).map(x => x.d.id) : []);
    return head + `<div class="panel tablewrap"><table class="rk2-tbl"><thead><tr><th>#</th>${th('name', 'Kierowca')}${th('km', 'Km', 1)}${th('days', 'Dni pracy', 1)}${th('fills', 'Tankowania', 1)}${th('rate', 'Spalanie l/100', 1)}${th('diff', 'vs średnia klasy', 1)}${th('card', 'Niezgodne z kartą', 1)}</tr></thead><tbody>
      ${xs.map((x, i) => `<tr class="click ${top.has(x.d.id) ? 'rk-top' : low.has(x.d.id) ? 'rk-low' : ''}" data-drv-hist="${esc(x.d.id)}"><td class="num">${i + 1}</td><td><b>${esc(x.d.name)}</b>${x.veh ? `<span class="sub">${x.veh} ${isPlural(x.veh, 'auto', 'auta', 'aut')}</span>` : ''}</td>
        <td class="r num">${x.km ? nf.format(x.km) : '—'}</td><td class="r num">${x.days || '—'}</td><td class="r num">${x.fills ? `${x.fills} <span class="muted small">· ${nf.format(Math.round(x.liters))} l</span>` : '—'}</td>
        <td class="r">${rateCell(x)}</td><td class="r">${diffCell(x)}</td><td class="r">${x.card ? `<span class="pill bad">${x.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Brak wpisów kierowców w tym okresie – ranking pojawi się, gdy kierowcy zaczną przejmować auta i wpisywać tankowania.</td></tr>'}</tbody></table></div>
      <p class="muted small">Kliknij kierowcę – historia jego tankowań, przejęć i zdań. Spalanie kierowcy: jego km (przejęcie → zdanie, GPS) × spalanie auta na odcinkach między tankowaniami do pełna – pokazujemy od 500 km.</p>`;
  }
  const xs = R.veh.map(x => ({...x, name: x.v.plate})).sort(cmp), withV = xs.filter(x => x[sk]!=null && sk!=='name');
  const top = new Set(['rate', 'diff', 'costKm'].includes(sk) && dir > 0 ? withV.slice(0, 3).map(x => x.v.id) : []), low = new Set(['rate', 'diff', 'costKm'].includes(sk) && dir > 0 && withV.length > 5 ? withV.slice(-3).map(x => x.v.id) : []);
  const zl2 = x => new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(x);
  return head + `<div class="seg" style="margin:0 0 10px">${[['diff', 'Wg spalania (vs klasa)'], ['rate', 'Wg l/100'], ['costKm', 'Wg kosztu / km'], ['km', 'Wg km']].map(([k, l]) => `<button type="button" class="small ${sk===k ? 'on' : ''}" data-rk-sort-set="${k}">${l}</button>`).join('')}</div>
    <div class="panel tablewrap"><table class="rk2-tbl"><thead><tr><th>#</th>${th('name', 'Auto')}${th('rate', 'Spalanie l/100', 1)}${th('diff', 'vs średnia klasy', 1)}${th('costKm', 'Koszt / km', 1)}${th('cost', 'Koszty', 1)}${th('km', 'Km', 1)}${th('days', 'Dni w grafiku', 1)}${th('card', 'Niezgodne z kartą', 1)}</tr></thead><tbody>
    ${xs.map((x, i) => `<tr class="click ${top.has(x.v.id) ? 'rk-top' : low.has(x.v.id) ? 'rk-low' : ''}" data-rk-veh="${esc(x.v.id)}"><td class="num">${i + 1}</td><td>${plate(x.v.plate)}<span class="sub">${esc([x.v.make, x.v.model].filter(Boolean).join(' '))} · ${wclsName(x.cls).toLowerCase()}</span></td>
      <td class="r">${rateCell(x)}</td><td class="r">${diffCell(x)}</td><td class="r num">${x.costKm!=null ? `<b>${zl2(x.costKm)}</b> <span class="muted small">zł</span>` : '<span class="muted">—</span>'}</td>
      <td class="r num">${x.cost ? zl(x.cost) : '—'}</td><td class="r num">${x.km ? nf.format(x.km) : '—'}</td><td class="r num">${x.days || '—'}</td>
      <td class="r">${x.card ? `<span class="pill bad">${x.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small">Koszt / km = wszystkie koszty auta w okresie (paliwo, naprawy, opłaty…) podzielone przez km z przejęć i zdań. Kliknij auto – ranking kierowców na tym aucie.</p>`;
}
/* Kierowcy na jednym aucie (okno po kliknięciu auta w rankingu) */
function openRkVehicle(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const [from, to] = rkRange(), legs = rkLegs(from, to).filter(x => x.vid===vid), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const vKm = legs.reduce((a, x) => a + x.km, 0), vL = legs.reduce((a, x) => a + x.l, 0), vRate = vKm >= 300 ? vL / vKm * 100 : null;
  const cardEv = (S.events || []).filter(e => e.kind==='karta' && e.vehicleId===vid && String(e.at).slice(0, 10) >= from);
  const m = {}; const g = id => m[id] = m[id] || {id, km: 0, days: new Set(), fills: 0, l: 0, lkm: 0, ll: 0};
  S.bookings.forEach(b => { if (b.vehicleId!==vid) return; const crew = crewOf(b);
    crew.forEach(id => { const o = g(id); bkDays(b, from, to).forEach(x => o.days.add(x)); });
    const p = b.pickup, r = b.returned;
    if (p && r && r.at >= from && r.at <= to && bkKm(b) > 0 && bkKm(b) < 20000) crew.forEach(id => g(id).km += bkKm(b) / crew.length); });
  appFuel().filter(c => c.vehicleId===vid && c.date >= from && c.date <= to && !String(c.note || '').startsWith('Karta:')).forEach(c => { const id = fillDriver(c) || c.driverId; if (!id) return; const o = g(id); o.fills++; o.l += Number(c.liters || 0); });
  rkDrvParts(from, to).filter(x => x.vid===vid).forEach(x => { const o = g(x.drv); o.lkm += x.km; o.ll += x.l; });
  const rows = Object.values(m).filter(o => byId('drivers', o.id) && (o.km || o.fills || o.days.size)).map(o => {
    const rate = o.lkm >= 300 ? o.ll / o.lkm * 100 : null;
    return {...o, name: dName(o.id), rate, diff: rate!=null && vRate ? (rate - vRate) / vRate * 100 : null, card: cardEv.filter(e => e.driverId===o.id).length};
  }).sort((a, b) => (a.rate==null) - (b.rate==null) || (a.rate || 0) - (b.rate || 0) || b.km - a.km);
  editing = {col: 'rk-veh', id: vid, base: {}, special: () => closeForm()};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = `${v.plate} – kierowcy`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0;display:block">${esc([v.make, v.model].filter(Boolean).join(' '))} · ${fdate(from)} – ${fdate(to)} · spalanie auta: <b>${vRate!=null ? f1(vRate) + ' l/100 km' : 'za mało danych'}</b> · z wpisów kierowców w aplikacji.</p>
    <div class="field full tablewrap"><table class="rk2-tbl"><thead><tr><th>#</th><th>Kierowca</th><th class="r">Spalanie l/100</th><th class="r">vs auto</th><th class="r">Km</th><th class="r">Dni</th><th class="r">Tankowania</th><th class="r">Niezgodne z kartą</th></tr></thead><tbody>
    ${rows.map((o, i) => `<tr class="click" data-drv-hist="${esc(o.id)}"><td class="num">${i + 1}</td><td><b>${esc(o.name)}</b></td>
      <td class="r">${o.rate!=null ? `<b class="num ${o.rate > THEFT_RATE ? 'neg' : ''}">${f1(o.rate)}</b>` : '<span class="muted">—</span>'}</td>
      <td class="r">${o.diff==null ? '<span class="muted">—</span>' : `<span class="pill ${o.diff > 15 ? 'bad' : o.diff > 5 ? 'warn' : o.diff < -5 ? 'ok' : 'off'}">${o.diff > 0 ? '+' : ''}${Math.round(o.diff)}%</span>`}</td>
      <td class="r num">${o.km ? nf.format(Math.round(o.km)) : '—'}</td><td class="r num">${o.days.size || '—'}</td>
      <td class="r num">${o.fills ? `${o.fills} <span class="muted small">· ${nf.format(Math.round(o.l))} l</span>` : '—'}</td>
      <td class="r">${o.card ? `<span class="pill bad">${o.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nikt nie jeździł tym autem w tym okresie (brak przejęć, zdań i tankowań w aplikacji).</td></tr>'}</tbody></table></div>
    <p class="muted small field full" style="margin:0">Spalanie kierowcy liczymy od 150 km z jego tankowaniami na tym aucie. Kliknij kierowcę – jego historia.</p>
    <div class="field full" style="display:block"><button type="button" class="small" data-rk-card="${esc(vid)}">${ic('truck')}Karta auta</button></div>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
document.addEventListener('click', e => {
  const rv = e.target.closest('[data-rk-veh]'); if (rv){ openRkVehicle(rv.dataset.rkVeh); return; }
  const rc = e.target.closest('[data-rk-card]'); if (rc){ const id = rc.dataset.rkCard; closeForm(); cardTab = 'paliwo'; pendingCard = id; if (location.hash==='#pojazdy'){ tab = 'pojazdy'; cardId = id; render(); } else location.hash = 'pojazdy'; return; }
  const v = e.target.closest('[data-rk-view]'); if (v){ rkView = v.dataset.rkView; render(); return; }
  const p = e.target.closest('[data-rk-per]'); if (p){ rkPer = p.dataset.rkPer; render(); return; }
  const ss = e.target.closest('[data-rk-sort-set]'); if (ss){ const k = ss.dataset.rkSortSet; rkSort[rkView] = [k, k==='km' ? -1 : 1]; render(); return; }
  const s = e.target.closest('[data-rk-sort]'); if (s){ const k = s.dataset.rkSort, cur = rkSort[rkView];
    rkSort[rkView] = [k, cur[0]===k ? -cur[1] : (k==='rate' || k==='name' || k==='card' || k==='diff' || k==='costKm' ? 1 : -1)]; render(); }
});
