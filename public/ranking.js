/* Emage FLEET — Pojazdy → Ranking: kierowcy i auta z tego, co kierowcy wpisali w aplikacji.
   Km: przejęcie → zdanie auta (liczniki wpisane przez kierowcę; przy obsadzie po połowie).
   Spalanie: tankowania wpisane w aplikacji – litry tankowania / km od poprzedniego tankowania tego auta,
   odcinek należy do kierowcy, który tankował. Karty paliwowe tylko sprawdzają wpisy (powiadomienia „karta”). */
'use strict';
let rkView = 'veh', rkPer = 'mies', rkSort = {drv: ['dL', 1], veh: ['rate', 1]};   // auta: w swojej klasie od najniższego spalania; kierowcy: względem średniej klasy
const rkOn = () => !!P().manage;
function rkRange(){   // ten miesiąc / poprzedni / ogółem od początku rozliczeń
  const t = today(), m0 = t.slice(0, 8) + '01';
  if (rkPer==='prev') return settleClamp(prevMonth(t.slice(0, 7)) + '-01', addDays(m0, -1));
  if (rkPer==='all') return [settleStart(), t];
  return settleClamp(m0, t);
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
const RK_MIN_RATE = 5.5;   // l/100 km – niżej spalanie busa jest nierealne (brakujący wpis tankowania)
function rkVehLegsRaw(vid){
  // licznik z GPS w chwili wpisu (literówka kierowcy nie psuje odcinka), bez GPS – wpis kierowcy w skali GPS.
  // Odcinek: od tankowania do pełna do tankowania do pełna (dotankowania po drodze wliczone). Przejęcie auta jest
  // początkiem odcinka tylko z zaznaczonym pełnym bakiem (bez wątpliwości). Tankowanie z otwartą flagą „Możliwy duplikat” pomijamy, dopóki nie zatwierdzisz.
  const dup = c => (c.flags || []).some(f => String(f).startsWith('Możliwy duplikat')) && c.flagState!=='ok';
  const fills = appFuel().filter(c => c.vehicleId===vid && Number(c.liters) > 0 && Number(c.odometer) > 0 && !String(c.note || '').startsWith('Karta:') && !dup(c))
    .map(c => ({t: 'f', odo: odoAt('tankowanie', c.id, vid, c.odometer), c, date: c.date}));
  // przejęcie z pełnym bakiem „wątpliwym” (poprzedni kierowca nie wpisał tankowania) – zapasowy początek odcinka:
  // używamy go, gdy odcinek od poprzedniego pełnego baku wychodzi nierealnie nisko (brakujący wpis tankowania)
  const picks = S.bookings.filter(b => b.vehicleId===vid && b.pickup && Number(b.pickup.km) > 0 && Number(b.pickup.fuel)===100)
    .map(b => ({t: b.pickupFuelDoubt ? 'pd' : 'p', odo: pickOdo(b), date: String(b.pickup.at || b.from).slice(0, 10)}));
  // ten sam km z GPS (auto stało, kierowca wpisał dwa tankowania po kolei) – kolejność wg licznika z wpisu, dotankowanie przed „do pełna”
  const typed = e => e.t==='f' ? Number(e.c.odometer) || 0 : 0;
  const ev = [...fills, ...picks].sort((a, b) => a.odo - b.odo || (a.t===b.t ? 0 : a.t==='f' ? -1 : 1) || typed(a) - typed(b)
    || (a.t==='f' && b.t==='f' ? (a.c.full===false ? 0 : 1) - (b.c.full===false ? 0 : 1) : 0) || String(a.date).localeCompare(b.date)
    || String(a.c && a.c.createdAt || '').localeCompare(String(b.c && b.c.createdAt || '')));
  let anchor = null, aDate = null, acc = 0, soft = null, sDate = null, sAcc = 0; const out = [];
  ev.forEach(e => {
    if (e.t==='p'){ anchor = e.odo; aDate = e.date; acc = 0; soft = null; return; }
    if (e.t==='pd'){ soft = e.odo; sDate = e.date; sAcc = 0; return; }
    acc += Number(e.c.liters); if (soft!=null) sAcc += Number(e.c.liters);
    if (e.c.full===false) return;
    let a = anchor, d0 = aDate, l = acc, km = a!=null ? e.odo - a : null, rate = km > 0 ? l / km * 100 : null;
    if (soft!=null && (a==null || rate==null || rate < RK_MIN_RATE)){ a = soft; d0 = sDate; l = sAcc; km = e.odo - a; rate = km > 0 ? l / km * 100 : null; }
    // poniżej RK_MIN_RATE l/100 spalanie jest nierealne (brakuje wpisu tankowania) – odcinka nie liczymy
    if (a!=null && km >= 50 && km <= 5000 && rate >= RK_MIN_RATE && rate <= 40) out.push({vid, drv: fillDriver(e.c) || e.c.driverId || '', km, l, date: e.c.date, d0: d0 || e.c.date, c: e.c, rate, a, z: e.odo});
    anchor = e.odo; aDate = e.c.date; acc = 0; soft = null;
  });
  return out;
}
function rkLegs(from, to){
  const out = [];
  const s0 = settleStart();   // odcinek zaczęty przed początkiem rozliczeń, a zamknięty po nim – nie liczy się
  S.vehicles.forEach(v => rkVehLegs(v.id).forEach(x => { if (x.date >= from && x.date <= to && !(x.d0 < s0 && x.date >= s0)) out.push(x); }));
  return out;
}
/* Spalanie kierowców: każdy odcinek auta dzielimy między kierowców według km, które faktycznie przejechali
   (przejęcie → zdanie, z GPS). Kierowca dostaje swoje km i litry wg spalania auta na odcinku – nie zależy od tego,
   kto akurat tankował. Km odcinka bez przydziału (np. luka w danych) – na kierowcę, który zamknął bak. */
const RK_MIN_KM = 500, RK_DRV_MIN_KM = RK_MIN_KM;    // wynik auta i kierowcy pokazujemy od 500 km – pojedyncze tankowanie „do pełna” waha się o ±5–10 l
function rkDrvParts(from, to){
  const out = [];
  rkLegs(from, to).forEach(L => {
    if (L.a==null || L.z==null || !(L.z > L.a)){ if (L.drv) out.push({vid: L.vid, drv: L.drv, km: L.km, l: L.l, date: L.date}); return; }
    const bs = S.bookings.filter(b => b.vehicleId===L.vid && b.pickup), seg = new Map(); let done = 0;
    bs.forEach(b => {
      const s = pickOdo(b), e = b.returned ? odoAt('zdanie', b.id, b.vehicleId, b.returned.km) : L.z;
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
    const norm = lkm > 0 && expL > 0 ? expL / lkm * 100 : null;   // norma = średnie spalanie aut, którymi jeździł (ważone jego km)
    return {d, name: d.name, km: Math.round(km), days: days.size, fills: fills.length, liters: fills.reduce((a, c) => a + Number(c.liters || 0), 0), rate, diff: rate!=null && expL > 0 ? (ll - expL) / expL * 100 : null,
      norm, dL: rate!=null && norm!=null ? rate - norm : null, plates: [...new Set(lg.map(x => x.vid))],
      card: cardEv.filter(e => e.driverId===d.id).length, veh: veh.size, lkm, fullFills: fills.filter(c => c.full!==false).length};
  }).filter(x => x.km || x.fills || x.days);
  const rkSt = settleRange(from, to);   // koszty netto aut – jak w Koszty → Według aut
  const veh = S.vehicles.filter(v => v.status!=='wycofany').map(v => {
    let km = 0; const days = new Set(), who = new Set();
    S.bookings.forEach(b => { if (b.vehicleId!==v.id) return;
      bkDays(b, from, to).forEach(x => days.add(x));
      const p = b.pickup, r = b.returned;
      if (p && r && r.at >= from && r.at <= to && bkKm(b) > 0 && bkKm(b) < 20000){ km += bkKm(b); crewOf(b).forEach(x => who.add(x)); } });
    const lg = legs.filter(x => x.vid===v.id), lkm = lg.reduce((a, x) => a + x.km, 0), ll = lg.reduce((a, x) => a + x.l, 0);
    const rate = lkm >= RK_MIN_KM ? ll / lkm * 100 : null;
    const vf = appFuel().filter(c => c.vehicleId===v.id && c.date >= from && c.date <= to && !String(c.note || '').startsWith('Karta:'));
    const sr = rkSt.rows.find(x => x.v.id===v.id), cost = sr ? sr.total : 0;
    const cr = clsRate[wcls(v)];
    return {v, cls: wcls(v), km, days: days.size, rate, diff: rate!=null && cr ? (rate - cr) / cr * 100 : null, who: who.size, card: cardEv.filter(e => e.vehicleId===v.id).length,
      cost, costKm: sr && sr.perKm!=null ? sr.perKm : km >= 100 ? cost / km : null, lkm, fills: vf.length, fullFills: vf.filter(c => c.full!==false).length};
  });
  return {from, to, fleetRate, clsRate, drv, veh};
}
function viewRankingDrivers(){ rkView = 'drv'; return viewRankingFleet(true); }
/* powód braku wyniku – zamiast samego „—” */
function rkWhy(x){
  const nf = new Intl.NumberFormat('pl-PL');
  if (x.lkm > 0) return `${nf.format(Math.round(x.lkm))} z ${nf.format(RK_MIN_KM)} km od pełnego baku`;
  if (x.fullFills===1) return 'jedno tankowanie do pełna – odcinek zamknie następne tankowanie do pełna';
  if (x.fills) return 'tankowania bez „do pełna” – brak zamkniętego odcinka';
  if (x.km || x.days) return 'brak tankowań w aplikacji';
  return 'nie jeździło w tym okresie';
}
function viewRankingFleet(drvTab){
  if (!drvTab) rkView = 'veh';
  if (!rkOn()) return `<div class="bar"><h2>Ranking</h2></div><div class="panel empty"><p>Ranking widzi kierownik floty.</p></div>`;
  const R = rkData(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const pers = [['mies', 'Ten miesiąc'], ['prev', 'Poprzedni'], ['all', `Ogółem (od ${fdate(settleStart())})`]];
  const isDrv = rkView==='drv';
  const head = `<div class="bar"><h2>Ranking</h2><div class="tools">
      <div class="seg"><button type="button" class="${isDrv ? '' : 'on'}" data-rk-go="ranking">Auta</button><button type="button" class="${isDrv ? 'on' : ''}" data-rk-go="ranking-kierowcy">Kierowcy</button></div>
      <div class="seg">${pers.map(([k, l]) => `<button type="button" class="${rkPer===k ? 'on' : ''}" data-rk-per="${k}">${l}</button>`).join('')}</div></div></div>
    ${rkPer==='all' && today() < settleStart() ? `<div class="notice"><span>Nowy okres rozliczeniowy zaczyna się <b>${fdate(settleStart())}</b>. „Ogółem” policzy się od tego dnia – wcześniejsze tankowania nie wpływają na wyniki (miesiąc można obejrzeć osobno).</span></div>` : ''}
    ${isDrv ? `<p class="rk-line">${fdate(R.from)} – ${fdate(R.to)} · średnie spalanie aut: ${WCLS.filter(([k]) => R.clsRate[k]!=null).map(([k, l]) => `${esc(l.toLowerCase())} <b>${f1(R.clsRate[k])}</b>`).join(', ') || '—'} l/100 km · wynik ma ${R.drv.filter(x => x.rate!=null).length} z ${R.drv.length} kierowców</p>` : `<div class="rk-sum">${WCLS.map(([k, l]) => `<div><span>Średnia ${esc(l.toLowerCase())}</span><b>${R.clsRate[k]!=null ? f1(R.clsRate[k]) : '—'}</b><em>l/100 km</em></div>`).join('')}
      <div><span>Okres</span><b class="rk-per">${fdate(R.from)} – ${fdate(R.to)}</b><em>${R.veh.filter(x => x.rate!=null).length} z ${R.veh.length} aut z wynikiem</em></div></div>`}`;
  const [sk, dir] = rkSort[rkView];
  const cmp = (a, b) => { const x = a[sk], y = b[sk]; if (x==null && y==null) return 0; if (x==null) return 1; if (y==null) return -1; return (x > y ? 1 : x < y ? -1 : 0) * dir; };
  const th = (k, l, r) => `<th class="${r ? 'r' : ''} click" data-rk-sort="${k}">${l}${sk===k ? (dir > 0 ? ' ▲' : ' ▼') : ''}</th>`;
  const diffCell = x => x.diff==null ? '<span class="muted">—</span>' : `<span class="pill ${x.diff > 15 ? 'bad' : x.diff > 5 ? 'warn' : x.diff < -5 ? 'ok' : 'off'}">${x.diff > 0 ? '+' : ''}${Math.round(x.diff)}%</span>`;
  const rateCell = x => `<b class="num ${x.rate > (x.v ? theftOf(x.v.id) : THEFT_RATE) ? 'neg' : ''}">${f1(x.rate)}</b>`;
  const cardCell = x => x.card ? `<span class="pill bad">${x.card}</span>` : '<span class="muted">0</span>';
  const marks = xs => { const by = ['rate', 'diff', 'costKm'].includes(sk) && dir > 0, ids = xs.map(x => x.id);
    return {top: new Set(by ? ids.slice(0, 3) : []), low: new Set(by && ids.length > 5 ? ids.slice(-3) : [])}; };
  const how = `<details class="rk-how"><summary>Jak liczymy</summary><p class="muted small">Spalanie liczymy z tankowań wpisanych w aplikacji, od pełnego baku do pełnego baku. Pełny bak to tankowanie „do pełna” albo przejęcie auta z zaznaczonym pełnym bakiem. Dotankowania po drodze wliczamy. Wynik pokazujemy od ${nf.format(RK_MIN_KM)} km, bo pojedyncze tankowanie „do pełna” waha się o kilka litrów. Kilometry kierowcy liczymy od przejęcia do zdania auta, z GPS. Litry dzielimy według km, więc nie liczy się to, kto akurat tankował. „vs średnia” porównuje z autami tej samej klasy (do 2,5 t albo powyżej 2,5 t). Koszt/km to wszystkie koszty auta w okresie podzielone przez jego km. Karty paliwowe tylko sprawdzają wpisy, a niezgodności przychodzą jako powiadomienia.</p></details>`;
  const noRes = (rows, label, nameOf, attr) => rows.length ? `<div class="panel rk-none"><div class="sec-head"><h3>Bez wyniku – za mało danych <span class="muted">(${rows.length})</span></h3></div>
      ${rows.map(x => `<div class="rk-none-row click" ${attr(x)}><span>${nameOf(x)}</span><span class="muted small">${esc(rkWhy(x))}</span></div>`).join('')}</div>` : '';
  if (isDrv){
    const xs = R.drv.map(x => ({...x, id: x.d.id})), withR = xs.filter(x => x.rate!=null).sort(cmp), none = xs.filter(x => x.rate==null).sort((a, b) => b.lkm - a.lkm || b.km - a.km);
    const verdict = x => x.dL==null ? '' : x.dL <= -0.5 ? '<span class="pill ok">oszczędny</span>' : x.dL < 0.5 ? '<span class="pill off">w normie</span>' : x.dL < 1 ? '<span class="pill warn">trochę za dużo</span>' : '<span class="pill bad">za dużo</span>';
    const dCell = x => x.dL==null ? '<span class="muted">—</span>' : `<b class="num ${x.dL >= 0.5 ? 'neg' : x.dL <= -0.5 ? 'pos' : ''}">${x.dL > 0 ? '+' : x.dL < 0 ? '−' : ''}${f1(Math.abs(x.dL))} l</b>`;
    const plates = x => x.plates.map(id => { const v = byId('vehicles', id); return v ? esc(v.plate) : ''; }).filter(Boolean).join(', ');
    const cardIco = x => x.card ? ` <span class="pill bad" title="Tankowania niezgodne z kartą paliwową">karta: ${x.card}</span>` : '';
    return head + (withR.length ? `<div class="panel tablewrap"><table class="rk2-tbl rk-drv"><thead><tr><th>#</th>${th('name', 'Kierowca')}${th('rate', 'Spalanie', 1)}${th('norm', 'Norma jego aut', 1)}${th('dL', 'Różnica', 1)}<th>Ocena</th>${th('lkm', 'Km do wyniku', 1)}<th>Auta</th></tr></thead><tbody>
      ${withR.map((x, i) => `<tr class="click" data-drv-hist="${esc(x.id)}"><td class="num">${i + 1}</td><td><b>${esc(x.d.name)}</b>${cardIco(x)}</td>
        <td class="r"><span class="num">${f1(x.rate)}</span></td><td class="r"><span class="num muted">${x.norm!=null ? f1(x.norm) : '—'}</span></td><td class="r">${dCell(x)}</td><td>${verdict(x)}</td>
        <td class="r num">${nf.format(Math.round(x.lkm))}</td><td class="small muted">${plates(x)}</td></tr>`).join('')}</tbody></table></div>
      <p class="muted small">Spalanie i norma w litrach na 100 km. Norma to średnie spalanie aut, którymi kierowca jeździł – dlatego kierowcy dużych i małych aut są porównani uczciwie. Kolejność: od najbardziej oszczędnego. Kliknij kierowcę, żeby zobaczyć jego tankowania, przejęcia i zdania.</p>`
      : `<div class="panel empty"><p>Nikt nie ma jeszcze ${nf.format(RK_MIN_KM)} km od pełnego baku w tym okresie.</p></div>`)
      + (none.length ? `<details class="rk-how rk-nores"><summary>Bez wyniku – za mało danych (${none.length}): ${none.map(x => esc(x.d.name)).join(', ')}</summary>
        <div class="panel rk-none">${none.map(x => `<div class="rk-none-row click" data-drv-hist="${esc(x.id)}"><span><b>${esc(x.d.name)}</b></span><span class="muted small">${esc(rkWhy(x))}</span></div>`).join('')}</div></details>` : '')
      + how.replace('</p></details>', ' ' + rkGpsNote().replace(/<\/?p[^>]*>/g, '') + '</p></details>');
  }
  const zl2 = x => new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(x);
  const all = R.veh.map(x => ({...x, id: x.v.id, name: x.v.plate}));
  const sect = ([k, l]) => {
    const xs = all.filter(x => x.cls===k && x.rate!=null).sort(cmp); if (!xs.length) return '';
    const {top, low} = marks(xs);
    return `<div class="panel tablewrap rk2-sect"><div class="sec-head"><h3>${esc(l)} <span class="muted">· średnia ${R.clsRate[k]!=null ? f1(R.clsRate[k]) + ' l/100 km' : '—'}</span></h3></div><table class="rk2-tbl"><thead><tr><th>#</th>${th('name', 'Auto')}${th('rate', 'Spalanie l/100', 1)}${th('diff', 'vs średnia klasy', 1)}${th('km', 'Km', 1)}${th('days', 'Dni w grafiku', 1)}${th('costKm', 'Koszt / km', 1)}${th('cost', 'Koszty', 1)}${th('card', 'Niezgodne z kartą', 1)}</tr></thead><tbody>
    ${xs.map((x, i) => `<tr class="click ${top.has(x.id) ? 'rk-top' : low.has(x.id) ? 'rk-low' : ''}" data-rk-veh="${esc(x.id)}"><td class="num">${i + 1}</td><td>${plate(x.v.plate)}<span class="sub">${esc([x.v.make, x.v.model].filter(Boolean).join(' '))}</span></td>
      <td class="r">${rateCell(x)}</td><td class="r">${diffCell(x)}</td><td class="r num">${x.km ? nf.format(Math.round(x.km)) : '—'}</td><td class="r num">${x.days || '—'}</td>
      <td class="r num">${x.costKm!=null ? `<b>${zl2(x.costKm)}</b> <span class="muted small">zł</span>` : '<span class="muted">—</span>'}</td><td class="r num">${x.cost ? zl(x.cost) : '—'}</td><td class="r">${cardCell(x)}</td></tr>`).join('')}</tbody></table></div>`;
  };
  const none = all.filter(x => x.rate==null).sort((a, b) => b.lkm - a.lkm || b.km - a.km || String(a.v.plate).localeCompare(b.v.plate));
  const body = WCLS.map(sect).join('');
  return head + rkGpsNote() + (body || `<div class="panel empty"><p>Żadne auto nie ma jeszcze ${nf.format(RK_MIN_KM)} km od pełnego baku w tym okresie.</p></div>`)
    + noRes(none, 'aut', x => `${plate(x.v.plate)} <span class="muted small">${esc(wclsName(x.cls).toLowerCase())}</span>`, x => `data-rk-veh="${esc(x.id)}"`)
    + `<p class="muted small">Kliknij auto, żeby zobaczyć, którzy kierowcy nim jeździli i jakie mieli spalanie.</p>` + how;
}
/* Kierowcy na jednym aucie (okno po kliknięciu auta w rankingu) */
function openRkVehicle(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const [from, to] = rkRange(), legs = rkLegs(from, to).filter(x => x.vid===vid), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const vKm = legs.reduce((a, x) => a + x.km, 0), vL = legs.reduce((a, x) => a + x.l, 0), vRate = vKm >= RK_MIN_KM ? vL / vKm * 100 : null;
  const cardEv = (S.events || []).filter(e => e.kind==='karta' && e.vehicleId===vid && String(e.at).slice(0, 10) >= from);
  const m = {}; const g = id => m[id] = m[id] || {id, km: 0, days: new Set(), fills: 0, l: 0, lkm: 0, ll: 0};
  S.bookings.forEach(b => { if (b.vehicleId!==vid) return; const crew = crewOf(b);
    crew.forEach(id => { const o = g(id); bkDays(b, from, to).forEach(x => o.days.add(x)); });
    const p = b.pickup, r = b.returned;
    if (p && r && r.at >= from && r.at <= to && bkKm(b) > 0 && bkKm(b) < 20000) crew.forEach(id => g(id).km += bkKm(b) / crew.length); });
  appFuel().filter(c => c.vehicleId===vid && c.date >= from && c.date <= to && !String(c.note || '').startsWith('Karta:')).forEach(c => { const id = fillDriver(c) || c.driverId; if (!id) return; const o = g(id); o.fills++; o.l += Number(c.liters || 0); });
  rkDrvParts(from, to).filter(x => x.vid===vid).forEach(x => { const o = g(x.drv); o.lkm += x.km; o.ll += x.l; });
  const rows = Object.values(m).filter(o => byId('drivers', o.id) && (o.km || o.fills || o.days.size)).map(o => {
    const rate = o.lkm >= RK_MIN_KM ? o.ll / o.lkm * 100 : null;
    return {...o, name: dName(o.id), rate, diff: rate!=null && vRate ? (rate - vRate) / vRate * 100 : null, card: cardEv.filter(e => e.driverId===o.id).length};
  }).sort((a, b) => (a.rate==null) - (b.rate==null) || (a.rate || 0) - (b.rate || 0) || b.km - a.km);
  editing = {col: 'rk-veh', id: vid, base: {}, special: () => closeForm()};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = `${v.plate} – kierowcy`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0;display:block">${esc([v.make, v.model].filter(Boolean).join(' '))} · ${fdate(from)} – ${fdate(to)} · spalanie auta: <b>${vRate!=null ? f1(vRate) + ' l/100 km' : 'za mało danych (' + nf.format(Math.round(vKm)) + ' z ' + nf.format(RK_MIN_KM) + ' km)'}</b> · z wpisów kierowców w aplikacji.</p>
    <div class="field full tablewrap"><table class="rk2-tbl"><thead><tr><th>#</th><th>Kierowca</th><th class="r">Spalanie l/100</th><th class="r">vs auto</th><th class="r">Km</th><th class="r">Dni</th><th class="r">Tankowania</th><th class="r">Niezgodne z kartą</th></tr></thead><tbody>
    ${rows.map((o, i) => `<tr class="click" data-drv-hist="${esc(o.id)}"><td class="num">${i + 1}</td><td><b>${esc(o.name)}</b></td>
      <td class="r">${o.rate!=null ? `<b class="num ${o.rate > theftOf(v.id) ? 'neg' : ''}">${f1(o.rate)}</b>` : '<span class="muted">—</span>'}</td>
      <td class="r">${o.diff==null ? '<span class="muted">—</span>' : `<span class="pill ${o.diff > 15 ? 'bad' : o.diff > 5 ? 'warn' : o.diff < -5 ? 'ok' : 'off'}">${o.diff > 0 ? '+' : ''}${Math.round(o.diff)}%</span>`}</td>
      <td class="r num">${o.km ? nf.format(Math.round(o.km)) : '—'}</td><td class="r num">${o.days.size || '—'}</td>
      <td class="r num">${o.fills ? `${o.fills} <span class="muted small">· ${nf.format(Math.round(o.l))} l</span>` : '—'}</td>
      <td class="r">${o.card ? `<span class="pill bad">${o.card}</span>` : '<span class="muted">0</span>'}</td></tr>`).join('') || '<tr><td colspan="8" class="muted">Nikt nie jeździł tym autem w tym okresie (brak przejęć, zdań i tankowań w aplikacji).</td></tr>'}</tbody></table></div>
    <p class="muted small field full" style="margin:0">Spalanie kierowcy na tym aucie pokazujemy od ${new Intl.NumberFormat('pl-PL').format(RK_MIN_KM)} km od pełnego baku. Kliknij kierowcę, żeby zobaczyć jego historię.</p>
    <div class="field full" style="display:block"><button type="button" class="small" data-rk-card="${esc(vid)}">${ic('truck')}Karta auta</button></div>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
document.addEventListener('click', e => {
  const rv = e.target.closest('[data-rk-veh]'); if (rv){ openRkVehicle(rv.dataset.rkVeh); return; }
  const rc = e.target.closest('[data-rk-card]'); if (rc){ const id = rc.dataset.rkCard; closeForm(); cardTab = 'paliwo'; pendingCard = id; if (location.hash==='#pojazdy'){ tab = 'pojazdy'; cardId = id; render(); } else location.hash = 'pojazdy'; return; }
  const g = e.target.closest('[data-rk-go]'); if (g){ location.hash = g.dataset.rkGo; return; }
  const p = e.target.closest('[data-rk-per]'); if (p){ rkPer = p.dataset.rkPer; render(); return; }
  const s = e.target.closest('[data-rk-sort]'); if (s){ const k = s.dataset.rkSort, cur = rkSort[rkView];
    rkSort[rkView] = [k, cur[0]===k ? -cur[1] : (k==='rate' || k==='name' || k==='card' || k==='diff' || k==='dL' || k==='norm' || k==='costKm' ? 1 : -1)]; render(); }
});

/* kiedy ostatnio dociągnięto liczniki z GPS (co 15 min) – nowe wpisy liczą się od razu z licznika kierowcy */
function rkGpsNote(){
  const last = (S.odoGps || []).reduce((m, g) => g.checkedAt && g.checkedAt > m ? g.checkedAt : m, '');
  const t = last ? new Date(last).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit'}) : '';
  return `<p class="muted small rk-gps">Ranking liczy się na bieżąco z wpisów kierowców; liczniki z GPS dociągamy co 15 minut${t ? ` (ostatnio ${t})` : ''} i wtedy wynik się doprecyzowuje.</p>`;
}
