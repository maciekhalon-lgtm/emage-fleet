/* Emage FLEET — podejrzane tankowania z kart paliwowych (kierownik floty).
   Każde tankowanie paliwa z karty dostaje powody i poziom:
   PEWNE (bad) – fizycznie niemożliwe dla jednego auta:
     1. więcej litrów niż bak auta (+12% – do baku 90 l wchodzi czasem 95–100 l z wlewem; 5–12% ponad bak = „na granicy”, do sprawdzenia),
     2. po poprzednim tankowaniu weszło więcej, niż mogło się zmieścić: wolne miejsce w baku (bak − poprzednie tankowanie)
        + to, co auto mogło spalić od tamtej chwili (15 l/100 km według licznika albo 13 l na każdą godzinę od poprzedniego tankowania – liczy się większa wartość, więc pomyłka w liczniku nie wywoła alarmu).
   DO SPRAWDZENIA (warn):
     3. drugie tankowanie tego samego auta w ciągu 3 godzin,
     4. cena za litr ponad 15% wyżej niż mediana z tego miesiąca (PLN),
     5. auto nie było tego dnia w grafiku – tylko gdy to auto ma w tygodniu wokół tej daty inne przydziały (grafik jest dla niego prowadzony).
   GPS (Geotab, migracja 034): w chwili tankowania bus był ponad 50 km od stacji i w innej miejscowości → PEWNE.
   Sprawdza to funkcja „powiadomienia” przy synchronizacji Geotab (pola gps_ok / gps_dist_km / gps_place).
   „Sprawdzone” zapisuje się w ustawieniach (settings: fc_checked). Na Pulpicie liczą się tylko PEWNE. */

const fcCheckedIds = () => new Set(((S.settings.find(x => x.id==='fc_checked') || {}).ids) || []);
let suspMemo = {k: '', v: []};
let suspShowChecked = false, suspLevel = 'bad';
const realOdo = r => { const o = Number(r.odometer); return o > 1000 && !(typeof fakeOdo==='function' && fakeOdo(o)) && !/^(\d{3})\1$/.test(String(o)) && o!==555555 && o!==999999 && !/^(\d)\1{3,}$/.test(String(o)); };

function fcSuspicious(){
  const rows = (S.fuelCardRows || []).filter(r => r.kind!=='other' && r.vehicleId && Number(r.liters) > 0);
  const key = rows.length + '|' + S.vehicles.length + '|' + S.bookings.length + '|' + (rows[0] || {}).id + '|' + rows.filter(r => r.gpsCheckedAt).length;
  if (suspMemo.k===key) return suspMemo.v;
  const ts = r => { const t = /^(\d{1,2}):(\d{2})/.exec(r.txTime || ''); return t ? Date.parse(r.txDate + 'T00:00:00') + (Number(t[1]) * 60 + Number(t[2])) * 60e3 : null; };
  const out = new Map(); const add = (r, why, lvl) => { if (!out.has(r.id)) out.set(r.id, {row: r, why: [], lvl: 'warn'}); const o = out.get(r.id); o.why.push(why); if (lvl==='bad') o.lvl = 'bad'; };
  const byV = {}; rows.forEach(r => (byV[r.vehicleId] = byV[r.vehicleId] || []).push(r));
  Object.entries(byV).forEach(([vid, xs]) => {
    const v = byId('vehicles', vid) || {}, tank = Number(v.tankL) || 90;
    xs.sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || '')));
    xs.forEach((r, i) => {
      const l = Number(r.liters);
      if (l > tank * 1.12){ add(r, `Więcej niż bak: ${fl(l)} (bak ${fl(tank)})`, 'bad'); return; }
      if (l > tank * 1.05) add(r, `Na granicy baku: ${fl(l)} (bak ${fl(tank)})`, 'warn');
      const p = xs[i - 1]; if (!p) return;
      const t = ts(r), tp = ts(p), lp = Math.min(Number(p.liters), tank);
      const space = tank - lp;   // po poprzednim tankowaniu w baku jest co najmniej tyle, ile wtedy weszło
      const dk = realOdo(r) && realOdo(p) ? Number(r.odometer) - Number(p.odometer) : null;
      let burn = null, how = '';
      if (dk!=null && dk >= 0 && dk < 3000){ burn = dk * 0.15; how = `${new Intl.NumberFormat('pl-PL').format(dk)} km`; }
      if (t!=null && tp!=null){ const h = (t - tp) / 3600e3; if (h >= 0 && h < 30){ const hb = h * 13; if (burn==null || hb > burn){ burn = hb; how = h < 1 ? `${Math.round(h * 60)} min` : `${String(Math.round(h * 10) / 10).replace('.', ',')} h`; } } else if (burn==null) burn = null; }
      if (burn!=null && l > (space + burn) * 1.05 + 3)
        add(r, `Nie zmieściłoby się: ${fl(lp)} zatankowane ${how} wcześniej, teraz ${fl(l)}`, 'bad');
      else if (t!=null && tp!=null && t - tp < 3 * 3600e3) add(r, `Drugie tankowanie po ${Math.round((t - tp) / 60e3)} min`, 'warn');
    });
  });
  // pozycja busa z GPS w chwili tankowania
  rows.forEach(r => { if (r.gpsOk===false) add(r, `Bus ${r.gpsDistKm!=null ? fl0(r.gpsDistKm) + ' km' : 'daleko'} od stacji${r.gpsPlace ? ' (był: ' + r.gpsPlace + ')' : ''}`, 'bad'); });
  // cena za litr vs mediana miesiąca
  const pln = rows.filter(r => (!r.currency || r.currency==='PLN') && Number(r.amount) > 0);
  const byM = {}; pln.forEach(r => (byM[r.txDate.slice(0, 7)] = byM[r.txDate.slice(0, 7)] || []).push(Number(r.amount) / Number(r.liters)));
  const med = {}; Object.entries(byM).forEach(([m, a]) => { a.sort((x, y) => x - y); med[m] = a[Math.floor(a.length / 2)]; });
  pln.forEach(r => { const pr = Number(r.amount) / Number(r.liters), m = med[r.txDate.slice(0, 7)];
    if (m && byM[r.txDate.slice(0, 7)].length >= 10 && pr > m * 1.15) add(r, `Cena ${pr.toFixed(2).replace('.', ',')} zł/l – mediana ${m.toFixed(2).replace('.', ',')}`, 'warn'); });
  // poza grafikiem – tylko dla aut, dla których grafik w tym tygodniu jest prowadzony
  rows.forEach(r => {
    const bs = S.bookings.filter(b => b.vehicleId===r.vehicleId);
    if (!bs.length || bs.some(b => b.from<=r.txDate && b.to>=r.txDate)) return;
    const a = addDays(r.txDate, -3), z = addDays(r.txDate, 3);
    if (bs.some(b => b.from<=z && b.to>=a)) add(r, 'Auto nie było tego dnia w grafiku', 'warn');
  });
  const v = [...out.values()].sort((a, b) => (b.row.txDate + (b.row.txTime || '')).localeCompare(a.row.txDate + (a.row.txTime || '')));
  suspMemo = {k: key, v};
  return v;
}
const fl0 = n => new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(Number(n));
/* stan sprawdzania GPS: ile tankowań porównano z pozycją busa */
function suspGpsInfo(){
  const rows = (S.fuelCardRows || []).filter(r => r.kind!=='other' && r.vehicleId && Number(r.liters) > 0);
  if (!(S.gpsOdometer || []).length) return '';
  const chk = rows.filter(r => r.gpsCheckedAt), ok = chk.filter(r => r.gpsOk===true).length, far = chk.filter(r => r.gpsOk===false).length;
  return `<span class="muted small sp-gps">GPS: porównano ${chk.length} z ${rows.length} tankowań – ${ok} przy stacji, ${far} daleko, ${chk.length - ok - far} bez pozycji. <button type="button" class="small ghost" data-sp-gps>${ic('route')}Sprawdź z GPS</button></span>`;
}
async function suspGpsRun(btn){
  if (btn){ btn.disabled = true; btn.textContent = 'Sprawdzam…'; }
  try {
    const {data, error} = await sb.functions.invoke('powiadomienia', {body: {geotabSync: true, days: 3, fuel: 600}});
    if (error) throw error;
    if (data && data.ok===false) throw new Error(data.error || 'błąd Geotab');
    toast(`Porównano ${data && data.fuelChecked || 0} tankowań z pozycją GPS${data && data.fuelFar ? ' – daleko od stacji: ' + data.fuelFar : ''}`);
    await Promise.all(['settings', 'gpsOdometer', 'fuelCardRows'].map(c => refresh(c))); render();
  } catch(err){ toast('Nie udało się: ' + (err.message || err)); }
  finally { if (btn && btn.isConnected){ btn.disabled = false; btn.textContent = 'Sprawdź z GPS'; } }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-sp-gps]'); if (!b) return; e.preventDefault(); suspGpsRun(b); });
const suspActiveV = x => (byId('vehicles', x.row.vehicleId) || {}).status!=='wycofany';   // auta wycofane nie liczą się do „do sprawdzenia”
const suspTodoCount = (lvl = 'bad') => { const ch = fcCheckedIds(); return fcSuspicious().filter(x => !ch.has(x.row.id) && suspActiveV(x) && (lvl==='all' || x.lvl===lvl)).length; };

function suspPanel(){
  const all = fcSuspicious(); if (!all.length) return '';
  const ch = fcCheckedIds(), lv = x => suspLevel==='all' || x.lvl==='bad';
  const todo = all.filter(x => !ch.has(x.row.id) && suspActiveV(x) && lv(x)), nBad = all.filter(x => !ch.has(x.row.id) && suspActiveV(x) && x.lvl==='bad').length, nAll = all.filter(x => !ch.has(x.row.id) && suspActiveV(x)).length;
  const list = suspShowChecked ? all.filter(lv) : todo;
  const rows = list.slice(0, 200).map(({row: r, why, lvl}) => `<div class="sp-row ${ch.has(r.id) ? 'done' : ''}">
    <span class="sp-d num"><b>${fdate(r.txDate)}</b><em>${esc(r.txTime || '')}</em></span>
    <span class="sp-v">${vPlate(r.vehicleId)}<span class="sub">${esc(fcDriver(r, null) || 'kierowca nieustalony')}${r.station ? ' · ' + esc(r.station) : ''}</span></span>
    <span class="sp-a num">${fl(r.liters)}<span class="sub">${fm(r.amount, r.currency)}</span></span>
    <span class="sp-w">${why.map(w => `<span class="pill ${lvl==='bad' && /bak|zmieściłoby|od stacji/i.test(w) ? 'bad' : 'warn'}">${esc(w)}</span>`).join('')}</span>
    <button class="small ${ch.has(r.id) ? 'ghost' : ''}" data-sp-ok="${esc(r.id)}">${ch.has(r.id) ? 'Cofnij' : `${ic('check')}Sprawdzone`}</button></div>`).join('');
  return `<details class="panel fold susp" ${nBad ? 'open' : ''}><summary class="sec-head"><h3>Podejrzane tankowania</h3><span class="count ${nBad ? 'bad' : ''}">${nBad}</span></summary>
    <div class="sp-tools"><span class="seg small" role="group" aria-label="Poziom"><button type="button" class="${suspLevel==='bad' ? 'on' : ''}" data-sp-lvl="bad" aria-pressed="${suspLevel==='bad'}">Pewne (${nBad})</button><button type="button" class="${suspLevel==='all' ? 'on' : ''}" data-sp-lvl="all" aria-pressed="${suspLevel==='all'}">Wszystkie (${nAll})</button></span>
      <span class="muted small">${suspLevel==='bad' ? 'Pewne = fizycznie niemożliwe dla jednego auta: więcej niż bak, więcej, niż mogło wejść po poprzednim tankowaniu, albo bus był wtedy daleko od stacji (GPS).' : 'Także do sprawdzenia: dwa tankowania w 3 godziny, wysoka cena za litr, auto poza grafikiem.'}</span>
      ${suspGpsInfo()}<span class="sp-tr">${todo.length > 5 ? `<button class="small ghost" data-sp-allok>Te ${todo.length} jako sprawdzone</button>` : ''}<label class="check small"><input type="checkbox" data-sp-all ${suspShowChecked ? 'checked' : ''}> pokaż sprawdzone</label></span></div>
    ${rows || `<p class="muted sec-empty">${suspLevel==='bad' ? 'Brak pewnych przypadków do sprawdzenia.' : 'Wszystko sprawdzone.'}</p>`}${list.length > 200 ? `<p class="muted small sec-empty">Pokazano 200 z ${list.length}.</p>` : ''}</details>`;
}

async function suspMark(id){
  const set = fcCheckedIds(); let on;
  if (id==='*'){ fcSuspicious().filter(x => suspLevel==='all' || x.lvl==='bad').forEach(x => set.add(x.row.id)); on = true; }
  else { on = !set.has(id); on ? set.add(id) : set.delete(id); }
  try { await db.collection('settings').doc('fc_checked').set({ids: [...set]}); toast(id==='*' ? 'Wszystkie oznaczone jako sprawdzone' : on ? 'Oznaczono jako sprawdzone' : 'Cofnięto'); }
  catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-sp-allok]')){ e.preventDefault(); suspMark('*'); return; }
  const t = e.target.closest('[data-sp-ok]'); if (!t) return; e.preventDefault(); suspMark(t.dataset.spOk); });
document.addEventListener('click', e => { const b = e.target.closest('[data-sp-lvl]'); if (!b) return; e.preventDefault(); suspLevel = b.dataset.spLvl; render(); });
document.addEventListener('change', e => { if (e.target.matches('[data-sp-all]')){ suspShowChecked = e.target.checked; render(); } });

/* Cena paliwa z kart: średnia zł/l w ostatnich 6 miesiącach i stacje najdroższe / najtańsze (min. 5 tankowań) */
function fuelPricePanel(){
  const rows = (S.fuelCardRows || []).filter(r => r.kind!=='other' && (!r.currency || r.currency==='PLN') && Number(r.liters) > 5 && Number(r.amount) > 0);
  if (rows.length < 10) return '';
  const byM = {}; rows.forEach(r => { const m = r.txDate.slice(0, 7); (byM[m] = byM[m] || {l:0, a:0, n:0}); byM[m].l += +r.liters; byM[m].a += +r.amount; byM[m].n++; });
  const ms = Object.keys(byM).sort().slice(-6);
  const pr = m => byM[m].a / byM[m].l;
  const lo = Math.min(...ms.map(pr)) * 0.97, hi = Math.max(...ms.map(pr)) * 1.01;
  const MN = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
  const st = {}; rows.forEach(r => { const k = (r.station || '').trim(); if (!k) return; (st[k] = st[k] || {l:0, a:0, n:0}); st[k].l += +r.liters; st[k].a += +r.amount; st[k].n++; });
  const all = rows.reduce((s, r) => s + +r.amount, 0) / rows.reduce((s, r) => s + +r.liters, 0);
  const sl = Object.entries(st).filter(([, x]) => x.n >= 5).map(([k, x]) => ({k, p: x.a / x.l, n: x.n, l: x.l})).sort((a, b) => b.p - a.p);
  const f2 = x => x.toFixed(2).replace('.', ',');
  const stRow = x => `<div class="mini"><span>${esc(x.k)}</span><span class="muted small">${x.n} tank. · ${fl(x.l)}</span><span class="mini-r num"><b class="${x.p > all * 1.03 ? 'neg' : x.p < all * 0.98 ? 'pos' : ''}">${f2(x.p)} zł/l</b></span></div>`;
  return `<details class="panel fold"><summary class="sec-head"><h3>Cena paliwa</h3><span class="muted small">średnio ${f2(all)} zł/l</span></summary>
    <div class="fp-ch">${ms.map(m => `<div class="fp-c"><b class="num">${f2(pr(m))}</b><div class="fp-b" style="height:${Math.round((pr(m) - lo) / Math.max(0.01, hi - lo) * 100)}%"></div><span>${MN[+m.slice(5) - 1]}</span></div>`).join('')}</div>
    ${sl.length >= 4 ? `<div class="grid2 fp-st"><div><span class="label">Najdroższe stacje</span>${sl.slice(0, Math.min(5, Math.floor(sl.length / 2))).map(stRow).join('')}</div><div><span class="label">Najtańsze stacje</span>${sl.slice(-Math.min(5, Math.floor(sl.length / 2))).reverse().map(stRow).join('')}</div></div>
      <p class="muted small sec-empty">Kwoty brutto z kart, tylko stacje z co najmniej 5 tankowaniami. Warto podpowiedzieć kierowcom tańsze stacje na trasach.</p>` : ''}</details>`;
}
