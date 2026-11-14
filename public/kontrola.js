/* Emage FLEET — kontrola liczników (Paliwo → Spalanie i liczniki → Kontrola liczników, kierownik floty).
   Trzy źródła przebiegu kontrolują się nawzajem: licznik wpisany przez kierowcę (przejęcie, zdanie, tankowanie w aplikacji),
   licznik z karty paliwowej (wpisany na stacji) i licznik z lokalizatora GPS.
   GPS w chwili zdarzenia: tabela odo_gps (migracja 036, uzupełnia ją co rano funkcja „powiadomienia” z Geotab).
   Gdy brak odczytu z tej chwili – przedział z dziennych odczytów GPS (koniec dnia poprzedniego … koniec tego dnia).
   Różnica ponad próg (Ustawienia → Lokalizatory GPS, domyślnie 50 km) = niezgodność; liczy się do oceny kierowcy. */
'use strict';
let ocMode = 'cmp', ocVeh = '', ocDrv = '', ocMonth = '', ocOnlyBad = true;
const OC_SRC = {karta: 'tankowanie z karty', tankowanie: 'tankowanie w aplikacji', przejecie: 'przejęcie auta', zdanie: 'zdanie auta'};
const ocTime = ts => ts ? new Date(ts).toLocaleTimeString('pl-PL', {hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Warsaw'}) : '';
const ocDay = ts => ts ? new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date(ts)) : '';
const ocChecked = () => { const s = odoChecked(); return new Set([...s].filter(k => k.startsWith('x')).map(k => k.slice(1))); };

/* Wszystkie zdarzenia z licznikiem: [{key, src, d, t, vid, who, whoIds, drv, card, gps, gLo, gHi, cmp:[[nazwa, różnica]], diff, bad, fake}] */
let ocMemo = {key: '', list: []};
function odoEvents(){
  const tol = odoCfg().tol;
  const key = [S.fuelCardRows.length, S.costs.length, S.bookings.length, (S.gpsOdometer || []).length, (S.odoGps || []).length, tol].join('|');
  if (ocMemo.key===key) return ocMemo.list;
  const at = new Map((S.odoGps || []).map(g => [g.source + '|' + g.refId, g]));
  const gDay = new Map((S.gpsOdometer || []).filter(g => Number(g.km) >= 50).map(g => [g.vehicleId + '|' + g.day, Number(g.km)]));
  const pairs = fcCompare(S.fuelCardRows.filter(r => r.kind!=='other')).pairs;
  const card2cost = new Map(), usedCost = new Set(), fromCard = new Set(S.fuelCardRows.map(r => r.costId).filter(Boolean));
  pairs.forEach(p => { if (p.cost && !fromCard.has(p.cost.id)){ card2cost.set(p.row.id, p.cost); usedCost.add(p.cost.id); } });
  const crewAt = (vid, d) => { const b = S.bookings.find(x => x.vehicleId===vid && x.from<=d && x.to>=d); return b ? crewOf(b) : []; };
  const costWho = c => { const id = fillDriver(c) || c.driverId; return id ? [id] : []; };
  const ev = [];
  const push = (o) => {
    const g = at.get(o.gsrc + '|' + o.ref), gps = g && g.gpsKm!=null ? Number(g.gpsKm) : null;
    const gLo = gDay.get(o.vid + '|' + addDays(o.d, -1)), gHi = gDay.get(o.vid + '|' + o.d);
    const rng = gps==null && gLo!=null && gHi!=null && gHi >= gLo ? [gLo, gHi] : null;
    const vsG = x => x==null || fakeOdo(x) ? null : gps!=null ? x - gps : rng ? (x < rng[0] ? x - rng[0] : x > rng[1] ? x - rng[1] : 0) : null;
    const cmp = [];
    if (o.drv!=null && vsG(o.drv)!=null) cmp.push(['kierowca – GPS', vsG(o.drv)]);
    if (o.card!=null && vsG(o.card)!=null) cmp.push(['karta – GPS', vsG(o.card)]);
    if (o.drv!=null && o.card!=null && !fakeOdo(o.drv) && !fakeOdo(o.card)) cmp.push(['karta – kierowca', o.card - o.drv]);
    const fake = [o.drv, o.card].some(x => x!=null && fakeOdo(x));
    const diff = cmp.reduce((m, [, x]) => Math.abs(x) > Math.abs(m) ? x : m, 0);
    // kogo obciąża niezgodność: licznik kierowcy (wpis w aplikacji) albo kartę (tankujący z grafiku)
    const blame = [];
    cmp.forEach(([n, x]) => { if (Math.abs(x) > tol) blame.push(n.startsWith('kierowca') ? 'drv' : n==='karta – GPS' ? 'card' : 'both'); });
    ev.push({...o, gps, gpsT: g && g.at ? ocTime(g.at) : '', rng, cmp, diff, fake, bad: fake || cmp.some(([, x]) => Math.abs(x) > tol), blame,
      key: o.gsrc + o.ref, who: o.whoIds.map(dName).filter(Boolean).join(' + ')});
  };
  S.fuelCardRows.forEach(r => { if (r.kind==='other' || r.odometer==null || !r.vehicleId) return;
    const c = card2cost.get(r.id);
    push({gsrc: 'karta', ref: r.id, vid: r.vehicleId, d: r.txDate, t: (r.txTime || '').slice(0, 5), card: Number(r.odometer), drv: c && c.odometer!=null ? Number(c.odometer) : null,
      whoIds: c ? costWho(c) : crewAt(r.vehicleId, r.txDate), note: r.station || '', costId: c ? c.id : null}); });
  appFuel().forEach(c => { if (c.odometer==null || usedCost.has(c.id) || fromCard.has(c.id)) return;
    push({gsrc: 'tankowanie', ref: c.id, vid: c.vehicleId, d: c.date, t: c.createdAt && ocDay(c.createdAt)===c.date ? ocTime(c.createdAt) : '', card: null, drv: Number(c.odometer), whoIds: costWho(c), note: c.station || '', costId: c.id}); });
  S.bookings.forEach(b => {
    if (b.pickup && b.pickup.km!=null && b.pickup.at) push({gsrc: 'przejecie', ref: b.id, vid: b.vehicleId, d: String(b.pickup.at).slice(0, 10), t: ocTime(b.pickupTs), card: null, drv: Number(b.pickup.km), whoIds: crewOf(b), note: '', bookingId: b.id});
    if (b.returned && b.returned.km!=null && b.returned.at) push({gsrc: 'zdanie', ref: b.id, vid: b.vehicleId, d: String(b.returned.at).slice(0, 10), t: ocTime(b.returnTs), card: null, drv: Number(b.returned.km), whoIds: crewOf(b), note: '', bookingId: b.id});
  });
  ev.sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
  ocMemo = {key, list: ev};
  return ev;
}
/* niezgodności do wyjaśnienia (bez oznaczonych jako sprawdzone), od `from` */
const odoCtrlBad = (from = addDays(today(), -30)) => { if (!P().manage) return []; const ch = ocChecked(); return odoEvents().filter(e => e.bad && e.d >= from && !ch.has(e.key)); };
/* ile niezgodności obciąża kierowcę w okresie (do oceny kierowców) */
function odoCtrlForDriver(id, from, to){
  const ch = ocChecked();
  return odoEvents().filter(e => e.bad && e.d >= from && e.d <= to && !ch.has(e.key) && e.whoIds.includes(id)).length;
}

/* licznik przy zakładce: błędne liczniki + niezgodności z ostatnich 30 dni */
const odoAllCount = () => (typeof odoTodoCount==='function' ? odoTodoCount() : 0) + odoCtrlBad().length;
function ocModeSeg(){
  const nBad = typeof odoTodoCount==='function' ? odoTodoCount() : 0;
  return `<div class="seg oc-mode" role="group" aria-label="Widok liczników"><button type="button" class="small ${ocMode==='cmp' ? 'on' : ''}" data-oc-mode="cmp" aria-pressed="${ocMode==='cmp'}">Porównanie: kierowca · karta · GPS</button><button type="button" class="small ${ocMode==='bad' ? 'on' : ''}" data-oc-mode="bad" aria-pressed="${ocMode==='bad'}">Błędne liczniki${nBad ? ` <span class="count bad">${nBad}</span>` : ''}</button></div>`;
}
function viewOdoControl(){
  if (!P().manage) return '';
  return ocMode==='bad' ? viewOdometers().replace('<div class="pb-quick">', ocModeSeg() + '<div class="pb-quick">') : viewOdoCompare();
}
function viewOdoCompare(){
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n)), tol = odoCfg().tol, ch = ocChecked();
  const all = odoEvents();
  const months = [...new Set(all.map(e => e.d.slice(0, 7)))].sort().reverse();
  const scope = all.filter(e => (!ocVeh || e.vid===ocVeh) && (!ocMonth || e.d.slice(0, 7)===ocMonth));
  const list = scope.filter(e => (!ocDrv || e.whoIds.includes(ocDrv)) && (!ocOnlyBad || (e.bad && !ch.has(e.key))));
  const vs = S.vehicles.filter(v => all.some(e => e.vid===v.id)).sort((a, b) => String(a.plate).localeCompare(b.plate));
  const drvIds = [...new Set(all.flatMap(e => e.whoIds))].filter(id => byId('drivers', id)).sort((a, b) => dName(a).localeCompare(dName(b)));
  const head = `<div class="bar"><h2>Kontrola liczników</h2><div class="tools">
      <select id="oc-veh" style="width:auto" aria-label="Auto"><option value="">Wszystkie auta</option>${vs.map(v => `<option value="${esc(v.id)}" ${v.id===ocVeh ? 'selected' : ''}>${esc(v.plate)}</option>`).join('')}</select>
      <select id="oc-drv" style="width:auto" aria-label="Kierowca"><option value="">Wszyscy kierowcy</option>${drvIds.map(id => `<option value="${esc(id)}" ${id===ocDrv ? 'selected' : ''}>${esc(dName(id))}</option>`).join('')}</select>
      <select id="oc-month" style="width:auto" aria-label="Miesiąc"><option value="">Wszystkie miesiące</option>${months.map(m => `<option value="${m}" ${m===ocMonth ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select>
      <label class="check small"><input type="checkbox" id="oc-bad" ${ocOnlyBad ? 'checked' : ''}> tylko niezgodne</label></div></div>${ocModeSeg()}`;
  const withG = scope.filter(e => e.gps!=null || e.rng).length, badN = scope.filter(e => e.bad && !ch.has(e.key)).length;
  const meta = `<div class="panel fc-meta"><div><span class="label">Wpisów z licznikiem</span><b>${scope.length}</b></div>
    <div><span class="label">Porównane z GPS</span><b>${withG}</b>${scope.length ? `<span class="sub">${Math.round(withG / scope.length * 100)}%</span>` : ''}</div>
    <div><span class="label">Niezgodne (ponad ${tol} km)</span><b class="${badN ? 'neg' : ''}">${badN}</b></div>
    <div><span class="label">Dokładny GPS z chwili wpisu</span><b>${scope.filter(e => e.gps!=null).length}</b></div></div>`;
  // podsumowanie na kierowcę (w wybranym aucie i miesiącu)
  const per = {};
  scope.forEach(e => e.whoIds.forEach(id => { const p = per[id] = per[id] || {id, n: 0, bad: 0, max: 0};
    if (e.cmp.length || e.fake) p.n++; if (e.bad && !ch.has(e.key)){ p.bad++; if (Math.abs(e.diff) > Math.abs(p.max)) p.max = e.diff; } }));
  const ps = Object.values(per).filter(p => p.n && byId('drivers', p.id)).sort((a, b) => b.bad - a.bad || b.bad / b.n - a.bad / a.n || dName(a.id).localeCompare(dName(b.id)));
  const drvTbl = ps.length ? `<details class="panel fold" ${ps.some(p => p.bad) ? 'open' : ''}><summary class="sec-head"><h3>Kierowcy</h3><span class="muted small">${ps.filter(p => p.bad).length} z niezgodnościami</span></summary>
    <div class="tablewrap"><table class="oc-drv"><thead><tr><th>Kierowca</th><th class="r">Porównane wpisy</th><th class="r">Niezgodne</th><th class="r">Odsetek</th><th class="r">Największa różnica</th></tr></thead><tbody>
    ${ps.map(p => `<tr class="click ${ocDrv===p.id ? 'sel' : ''}" data-oc-pick="${esc(p.id)}"><td data-l="Kierowca"><b>${esc(dName(p.id))}</b></td><td class="r num" data-l="Porównane">${p.n}</td>
      <td class="r num" data-l="Niezgodne">${p.bad ? `<b class="neg">${p.bad}</b>` : '<span class="muted">0</span>'}</td>
      <td class="r num" data-l="Odsetek">${p.bad ? `<span class="pill ${p.bad / p.n > 0.2 ? 'bad' : 'warn'}">${Math.round(p.bad / p.n * 100)}%</span>` : '<span class="muted">—</span>'}</td>
      <td class="r num" data-l="Największa różnica">${p.bad ? (p.max > 0 ? '+' : '−') + nf(Math.abs(p.max)) + ' km' : '—'}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small sec-empty">Kliknij kierowcę, aby zobaczyć tylko jego wpisy. Niezgodności niewyjaśnione (bez „Sprawdzone”) obniżają ocenę kierowcy.</p></details>` : '';
  const cell = (x, ok) => x==null ? '<span class="muted">—</span>' : fakeOdo(x) ? `<b class="neg">${nf(x)}</b><span class="sub"><span class="pill bad">zmyślony</span></span>` : `<b class="${ok===false ? 'neg' : ''}">${nf(x)}</b>`;
  const gCell = e => e.gps!=null ? `<b>${nf(e.gps)}</b>${e.gpsT ? `<span class="sub">o ${esc(e.gpsT)}</span>` : ''}` : e.rng ? `<span class="num">${nf(e.rng[0])} – ${nf(e.rng[1])}</span><span class="sub">w tym dniu</span>` : '<span class="muted">brak</span>';
  const off = (e, who) => e.cmp.some(([n, x]) => n.startsWith(who) && Math.abs(x) > tol) ? false : undefined;
  const rows = list.slice(0, 400).map(e => {
    const st = e.fake ? '<span class="pill bad">zmyślony licznik</span>' : !e.cmp.length ? '<span class="pill off">brak porównania</span>'
      : e.bad ? e.cmp.filter(([, x]) => Math.abs(x) > tol).map(([n, x]) => `<span class="pill ${Math.abs(x) > tol * 4 ? 'bad' : 'warn'}">${esc(n)}: ${x > 0 ? '+' : '−'}${nf(Math.abs(x))} km</span>`).join(' ')
      : '<span class="pill ok">zgodne</span>';
    const done = ch.has(e.key);
    return `<tr class="${e.bad && !done ? 'oc-bad' : ''}"><td class="num" data-l="Data"><b>${fdate(e.d)}</b>${e.t ? `<span class="sub">${esc(e.t)}</span>` : ''}</td>
      <td data-l="Auto">${vPlate(e.vid)}</td>
      <td data-l="Kierowca">${e.who ? esc(e.who) : '<span class="muted">nieustalony</span>'}<span class="sub">${esc(OC_SRC[e.gsrc])}${e.note ? ' · ' + esc(e.note) : ''}</span></td>
      <td class="r num ${e.costId ? 'click' : ''}" data-l="Kierowca km" ${e.costId ? `data-edit="costs" data-id="${esc(e.costId)}" title="Popraw wpis"` : ''}>${cell(e.drv, off(e, 'kierowca'))}</td>
      <td class="r num" data-l="Karta km">${cell(e.card, off(e, 'karta'))}</td>
      <td class="r num" data-l="GPS km">${gCell(e)}</td>
      <td data-l="Wynik">${st}${done ? ' <span class="pill off">sprawdzone</span>' : ''}</td>
      <td class="odo-act">${e.bad ? (done ? `<button class="small ghost" data-oc-un="${esc(e.key)}">Cofnij</button>` : `<button class="small ghost" data-oc-ok="${esc(e.key)}">Sprawdzone</button>`) : ''}</td></tr>`;
  }).join('');
  const migr = typeof optOn==='function' && !optOn('odoGps') ? '<div class="notice"><span>Dokładny GPS z chwili wpisu wymaga migracji 036 – do tego czasu porównujemy z dziennymi odczytami GPS (przedział z danego dnia).</span></div>' : '';
  return head + migr + meta + drvTbl + `<div class="panel tablewrap fc-table"><table class="oc-tbl"><thead><tr><th>Data</th><th>Auto</th><th>Kto / zdarzenie</th><th class="r">Licznik kierowcy</th><th class="r">Licznik z karty</th><th class="r">GPS</th><th>Wynik</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="8" class="muted">${ocOnlyBad ? 'Brak niezgodnych liczników w wybranym zakresie.' : 'Brak wpisów z licznikiem.'}</td></tr>`}</tbody></table></div>
    ${list.length > 400 ? `<p class="muted small">Pokazano 400 najnowszych z ${list.length}.</p>` : ''}
    <p class="muted small" style="margin:0;max-width:100ch">Każdy wpis licznika porównujemy z pozostałymi źródłami: kierowca (przejęcie, zdanie, tankowanie w aplikacji), karta paliwowa (licznik wpisany na stacji) i lokalizator GPS. GPS „o godz.” – stan licznika z Geotab dokładnie w chwili wpisu (pobierany co rano; dla tankowania w aplikacji tylko, gdy wpisano je tego samego dnia). Bez tego – przedział z GPS z końca dnia poprzedniego i końca tego dnia. Niezgodne = różnica ponad ${tol} km (zmienisz w Ustawienia → Lokalizatory GPS). Kierowca przy karcie – z wpisu w aplikacji, a bez niego z grafiku.</p>`;
}
/* Karta auta: kto jechał i przy jakim przebiegu (ostatnie przejęcia, zdania i tankowania) */
function vehOdoWhoHtml(vid){
  if (!P().manage) return '';
  const tol = odoCfg().tol, nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const xs = odoEvents().filter(e => e.vid===vid).slice(0, 12); if (!xs.length) return '';
  return `<div class="panel"><div class="sec-head"><h3>Kto jechał i przy jakim przebiegu</h3><button class="small" data-oc-veh-go="${esc(vid)}">Kontrola liczników</button></div>
    ${xs.map(e => { const k = e.drv!=null ? e.drv : e.card, g = e.gps!=null ? e.gps : null;
      return `<div class="mini"><span class="num">${fdate(e.d).slice(0, 5)}${e.t ? ' ' + esc(e.t) : ''}<span class="sub">${esc(OC_SRC[e.gsrc])}</span></span>
        <span>${e.who ? esc(e.who) : '<span class="muted">nieustalony</span>'}<span class="sub">${e.drv!=null ? 'kierowca ' + nf(e.drv) : ''}${e.drv!=null && e.card!=null ? ' · ' : ''}${e.card!=null ? 'karta ' + nf(e.card) : ''}${g!=null ? ' · GPS ' + nf(g) : e.rng ? ` · GPS ${nf(e.rng[0])}–${nf(e.rng[1])}` : ''}</span></span>
        <span class="mini-r num"><b>${nf(k)} km</b>${e.bad ? `<span class="sub"><span class="pill ${e.fake ? 'bad' : 'warn'}">${e.fake ? 'zmyślony' : `różnica ${nf(Math.abs(e.diff))} km`}</span></span>` : e.cmp.length ? `<span class="sub"><span class="pill ok">zgodne ±${tol}</span></span>` : ''}</span></div>`; }).join('')}</div>`;
}
async function ocMark(key, on){
  const set = odoChecked(); on ? set.add('x' + key) : set.delete('x' + key);
  try { await db.collection('settings').doc('odo_checked').set({ids: [...set]}); toast(on ? 'Oznaczono jako sprawdzone' : 'Cofnięto'); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('change', e => {
  const id = e.target.id;
  if (id==='oc-veh'){ ocVeh = e.target.value; render(); } else if (id==='oc-drv'){ ocDrv = e.target.value; render(); }
  else if (id==='oc-month'){ ocMonth = e.target.value; render(); } else if (id==='oc-bad'){ ocOnlyBad = e.target.checked; render(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-oc-mode],[data-oc-pick],[data-oc-ok],[data-oc-un],[data-oc-veh-go]'); if (!t || t.closest('#dialog')) return;
  if (t.dataset.ocMode){ ocMode = t.dataset.ocMode; render(); return; }
  if (t.dataset.ocPick){ ocDrv = ocDrv===t.dataset.ocPick ? '' : t.dataset.ocPick; render(); return; }
  if (t.dataset.ocOk) return ocMark(t.dataset.ocOk, true);
  if (t.dataset.ocUn) return ocMark(t.dataset.ocUn, false);
  if (t.dataset.ocVehGo){ e.preventDefault(); ocVeh = t.dataset.ocVehGo; ocMode = 'cmp'; ocOnlyBad = false; cardId = null; location.hash = 'liczniki'; render(); }
});
