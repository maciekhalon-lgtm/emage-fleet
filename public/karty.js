/* Emage FLEET — karty paliwowe (tylko kierownik floty).
   Import zestawienia z karty (CSV / Excel, dowolny dostawca – kolumny dopasowujemy raz i zapamiętujemy) + faktura PDF.
   Zapisujemy tylko wiersze aut z systemu (po numerze rejestracyjnym) i porównujemy je z tankowaniami wpisanymi
   przez kierowców: litry, kwota, stan licznika. */
'use strict';
const FC_FIELDS = [
  ['date','Data transakcji',1,['data transakcji','data realizacji','data tankowania','data operacji','data i godzina','data/godzina','transaction date','data','date','datum']],
  ['time','Godzina',0,['godzina','czas','godz','time','uhrzeit']],
  ['plate','Nr rejestracyjny',1,['nr rejestracyjny','numer rejestracyjny','rejestracja','nr rej','nr rej.','tablica','numer pojazdu','pojazd','license plate','registration','kennzeichen','kfz-kennzeichen']],
  ['liters','Ilość (litry)',1,['ilosc','ilosc l','ilosc [l]','litry','ilosc litrow','quantity','volume','menge']],
  ['amount','Kwota brutto',1,['wartosc brutto','kwota brutto','wartosc brutto pln','brutto','gross amount','gross','kwota','amount','betrag','wartosc']],
  ['currency','Waluta',0,['waluta','currency','wahrung']],
  ['odometer','Stan licznika',0,['stan licznika','licznik','przebieg','km','odometer','mileage','kilometerstand']],
  ['station','Stacja (miejscowość)',0,['miejscowosc','miasto','nazwa stacji','adres stacji','stacja','miejsce','city','ort','station','location','tankstelle']],
  ['card','Nr karty',0,['nr karty','numer karty','karta','card','card number','kartennummer']],
  ['product','Produkt',0,['produkt','towar','nazwa produktu','rodzaj paliwa','paliwo','product','artikel']],
];
const FUEL_LIKE = /\bon\b|diesel|olej nap|ekodiesel|verva|efecta|pb ?95|pb ?98|benz|lpg|gazoil|fuel|kraftstoff|super|dk\b|nafta/i;
const deacc = s => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/Ł/g, 'L');
const fcHead = s => deacc(normHead(s)).replace(/\./g, '').trim();
function fcNum(v){
  if (typeof v==='number') return v;
  let s = String(v || '').replace(/[\s ]/g, '').replace(/[^\d,.-]/g, '');
  if (!s) return null;
  const c = s.lastIndexOf(','), d = s.lastIndexOf('.');
  if (c > d) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? n : null;
}
function fcDate(v){
  if (v instanceof Date && !isNaN(v)) return {d: isoOf(v), t: v.getHours() || v.getMinutes() ? pad(v.getHours()) + ':' + pad(v.getMinutes()) : ''};
  if (typeof v==='number' && v > 20000 && v < 80000){ const ms = Math.round((v - 25569) * 864e5), x = new Date(ms); return {d: x.toISOString().slice(0, 10), t: (v % 1) ? x.toISOString().slice(11, 16) : ''}; }
  const s = String(v || ''), tm = (s.match(/(\d{1,2}):(\d{2})/) || []);
  let m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return {d: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, t: tm[0] ? pad(tm[1]) + ':' + tm[2] : ''};
  m = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m) return {d: `${m[3].length===2 ? '20' + m[3] : m[3]}-${pad(m[2])}-${pad(m[1])}`, t: tm[0] ? pad(tm[1]) + ':' + tm[2] : ''};
  return null;
}
const fcSettings = () => S.settings.find(x => x.id==='fuelcard') || {};

/* ---------- porównanie z wpisami kierowców ---------- */
const appFuel = () => S.costs.filter(c => FUEL_CATS.includes(c.category) && c.vehicleId);
function fcCompare(rows){
  const used = new Set(), out = [];
  const byV = {}; rows.forEach(r => { (byV[r.vehicleId] = byV[r.vehicleId] || []).push(r); });
  for (const [vid, list] of Object.entries(byV)){
    const app = appFuel().filter(c => c.vehicleId===vid);
    list.slice().sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || ''))).forEach(r => {
      let best = null, bs = Infinity;
      app.forEach(c => {
        if (used.has(c.id)) return;
        const dd = Math.abs(diffDays(r.txDate, c.date)); if (dd > 1) return;
        const ld = r.liters!=null && c.liters!=null ? Math.abs(Number(r.liters) - Number(c.liters)) : 0;
        if (ld > Math.max(3, Number(r.liters || 0) * 0.05)) return;
        const sc = ld + dd * 5; if (sc < bs){ bs = sc; best = c; }
      });
      if (best) used.add(best.id);
      out.push({row: r, cost: best, issues: best ? fcIssues(r, best) : ['brak wpisu kierowcy']});
    });
  }
  return {pairs: out, used};
}
function fcIssues(r, c){
  const is = [];
  const foreign = r.currency && r.currency!=='PLN';
  const appAmt = foreign && c.currency===r.currency ? Number(c.amountOrig) : Number(c.amount);
  if (r.liters!=null && c.liters!=null && Math.abs(Number(r.liters) - Number(c.liters)) > 0.5) is.push(`litry ${fl(r.liters)} vs ${fl(c.liters)}`);
  if (r.amount!=null && Number.isFinite(appAmt) && Math.abs(Number(r.amount) - appAmt) > 1) is.push(`kwota ${fm(r.amount, r.currency)} vs ${fm(appAmt, foreign && c.currency===r.currency ? r.currency : 'PLN')}`);
  if (r.odometer && c.odometer && Math.abs(Number(r.odometer) - Number(c.odometer)) > 30) is.push(`licznik ${km(r.odometer)} vs ${km(c.odometer)}`);
  return is;
}
const fl = v => v==null ? '—' : String(Number(v).toFixed(2)).replace(/\.?0+$/, '').replace('.', ',') + ' l';
const fm = (v, cur) => v==null || !Number.isFinite(Number(v)) ? '—' : new Intl.NumberFormat('pl-PL', {style:'currency', currency: cur || 'PLN'}).format(Number(v));
/* Przejechane km i spalanie z liczników – odcinkami między kolejnymi tankowaniami (wg daty i godziny).
   Jeden błędnie wpisany licznik nie psuje wyniku: licznik odbiegający > 20 000 km od mediany auta albo dający odcinek
   ≤ 0 lub > 3000 km jest pomijany (oznaczany „licznik podejrzany”), a jego litry liczą się do następnego dobrego odcinka.
   Spalanie = litry od drugiego tankowania / km × 100; poza 5–25 l/100 km wynik jest „niepewny”. */
const FC_MAX_LEG = 3000;
/* Liczniki po kolei (chronologicznie) dzielone na dobre odcinki.
   1) Pojedynczy błędny licznik (brak cyfry, cofnięty, przeskok) – nie pasuje ani do poprzedniego, ani do następnego,
      a sąsiedzi pasują do siebie – jest pomijany (powtarzane, aż nic się nie zmieni).
   2) Odcinek, który nie pasuje (np. dziura > 3000 km – tankowanie inną kartą albo za gotówkę), tylko przerywa liczenie:
      nie wchodzi ani do km, ani do litrów. Reszta danych auta liczy się normalnie.
   ok(a, b) – czy odcinek a→b jest realny. Zwraca indeksy dobrych liczników, dobre odcinki i liczbę przerw. */
function odoSegments(xs, ok){
  let alive = xs.map((_, i) => i), changed = true;
  while (changed && alive.length > 2){
    changed = false;
    for (let k = 0; k < alive.length; k++){
      const i = alive[k], p = alive[k - 1], n = alive[k + 1], pp = alive[k - 2], nn = alive[k + 2];
      let bad = false;
      if (p!=null && n!=null) bad = !ok(xs[p], xs[i]) && !ok(xs[i], xs[n]) && ok(xs[p], xs[n]);
      else if (p==null && n!=null && nn!=null) bad = !ok(xs[i], xs[n]) && ok(xs[n], xs[nn]) && !ok(xs[i], xs[nn]);
      else if (n==null && p!=null && pp!=null) bad = !ok(xs[p], xs[i]) && ok(xs[pp], xs[p]) && !ok(xs[pp], xs[i]);
      if (bad){ alive.splice(k, 1); changed = true; break; }
    }
  }
  const legs = []; let breaks = 0;
  for (let k = 1; k < alive.length; k++){ if (ok(xs[alive[k - 1]], xs[alive[k]])) legs.push([alive[k - 1], alive[k]]); else breaks++; }
  const aliveSet = new Set(alive), bad = xs.map((_, i) => i).filter(i => !aliveSet.has(i));
  return {alive, legs, bad, breaks};
}
/* „Zmyślony” licznik wpisany na stacji: poniżej 1000 km albo z samych jednakowych cyfr (1, 444, 55555, 555555…) – traktujemy jak brak licznika */
const fakeOdo = o => { const n = Math.round(Number(o)); return !(n > 0) || n < 1000 || /^(\d)\1+$/.test(String(n)); };
const FC_RATE_MIN = 3, FC_RATE_MAX = 40;
/* Przejechane km i spalanie – z dobrych odcinków między prawdziwymi licznikami (wg daty i godziny).
   Litry tankowań bez prawdziwego licznika albo z błędnym licznikiem liczą się do odcinka, w którym były.
   Na przerwie (dziura, nierealny odcinek, spalanie odcinka poza 3–40 l/100 km) nic nie liczymy.
   Spalanie = litry / km × 100 (pierwsze tankowanie odcinka tylko „ustawia” pełny bak); wynik poza 5–25 l/100 km – „niepewne”. */
function fcCons(list){
  const all = list.filter(x => x.l!=null).sort((a, b) => (a.d || '').localeCompare(b.d || '') || (Number(a.odo) || 0) - (Number(b.odo) || 0));
  if (!all.length) return null;
  const fake = new Set(all.filter(x => fakeOdo(x.odo)).map(x => x.id).filter(Boolean));
  const xs = all.filter(x => !fakeOdo(x.odo)), pos = new Map(all.map((x, i) => [x, i]));
  if (!xs.length) return {km: 0, rate: null, bad: new Set(), fake, legs: 0, n: all.length, breaks: 0, parts: []};
  const seg = odoSegments(xs, (a, b) => b.odo - a.odo >= 0 && b.odo - a.odo <= FC_MAX_LEG);
  const bad = new Set(seg.bad.map(i => xs[i].id).filter(Boolean));
  let kmS = 0, lS = 0, breaks = seg.breaks; const parts = [], used = [];
  seg.legs.forEach(([a, b]) => {
    const k = xs[b].odo - xs[a].odo; let l = 0;
    for (let i = pos.get(xs[a]) + 1; i <= pos.get(xs[b]); i++) l += Number(all[i].l || 0);   // także tankowania bez licznika
    if (k > 0){ const r = l / k * 100; if (r < FC_RATE_MIN || r > FC_RATE_MAX){ breaks++; return; } }   // niewiarygodny odcinek
    kmS += k; lS += l; parts.push({id: xs[b].id, km: k, l, d0: (xs[a].d || '').slice(0, 10), d1: (xs[b].d || '').slice(0, 10)}); used.push(a, b);
  });
  if (!kmS) return {km: 0, rate: null, bad, fake, legs: 0, n: all.length, breaks, parts};
  const rate = lS / kmS * 100;
  return {km: kmS, rate, l: lS, from: (xs[Math.min(...used)].d || '').slice(0, 10), to: (xs[Math.max(...used)].d || '').slice(0, 10), n: all.length, bad, fake, legs: parts.length, breaks, parts, unsure: rate < 5 || rate > 25};
}
/* Punkt startowy: ostatnie tankowanie z licznikiem przed okresem (z wcześniejszych zestawień / wpisów) */
const fcAnchorCard = (vid, imp) => S.fuelCardRows.filter(x => x.vehicleId===vid && x.importId!==imp.id && x.txDate < imp.periodFrom && Number(x.odometer) > 0)
  .sort((a, b) => b.txDate.localeCompare(a.txDate)).slice(0, 1);
const fcAnchorApp = (vid, imp) => appFuel().filter(c => c.vehicleId===vid && c.date < imp.periodFrom && Number(c.odometer) > 0)
  .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 1);
/* Kierowca przy tankowaniu z karty: z wpisu albo z grafiku w tym dniu */
function fcDriver(r, c){
  if (c) return dName(fillDriver(c) || c.driverId) || '';
  const b = S.bookings.find(x => x.vehicleId===r.vehicleId && x.from<=r.txDate && x.to>=r.txDate);
  if (b) return crewName(b);
  // brak grafiku tego dnia: jeśli auto ma jednego odpowiedzialnego kierowcę – podpowiadamy go (z dopiskiem)
  const v = byId('vehicles', r.vehicleId), resp = v ? respOf(v) : [];
  return resp.length===1 && byId('drivers', resp[0]) ? dName(resp[0]) + ' (odpowiedzialny)' : '';
}

/* ---------- widok ---------- */
let fcImportId = '', fcFilter = 'all';
const fcOpen = new Set();
const fcImports = () => S.fuelCardImports.slice().sort((a, b) => (b.periodTo || '').localeCompare(a.periodTo || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
function viewFuelCards(){
  if (!P().manage) return '';
  const imps = fcImports();
  const head = `<div class="bar"><h2>Karty paliwowe</h2><div class="tools">${imps.length ? `<select id="fc-imp" style="width:auto" aria-label="Zestawienie">${imps.map(i => `<option value="${esc(i.id)}" ${i.id===(fcImportId || imps[0].id) ? 'selected' : ''}>${esc([i.provider, i.periodFrom ? fdate(i.periodFrom) + '–' + fdate(i.periodTo) : '', i.invoiceNo].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}
    <button class="primary" data-action="fc-import">${ic('plus')}Importuj zestawienie</button></div></div>`;
  if (!imps.length) return head + loadingOr('fuelCardImports', `<div class="panel empty"><h3>Brak zestawień</h3><p>Wgraj plik CSV albo Excel z karty paliwowej (Orlen, UTA lub inny) i fakturę. System weźmie tylko auta z Twojej floty i porówna każde tankowanie z tym, co wpisał kierowca: litry, kwotę i stan licznika.</p><button class="primary" data-action="fc-import">${ic('plus')}Importuj zestawienie</button></div>`);
  const imp = imps.find(i => i.id===fcImportId) || imps[0];
  const rows = S.fuelCardRows.filter(r => r.importId===imp.id && r.kind!=='other');
  const {pairs, used} = fcCompare(rows);
  const vids = new Set(rows.map(r => r.vehicleId));
  const noCard = appFuel().filter(c => vids.has(c.vehicleId) && c.date>=imp.periodFrom && c.date<=imp.periodTo && !used.has(c.id));
  const ok = pairs.filter(p => p.cost && !p.issues.length), dif = pairs.filter(p => p.cost && p.issues.length), miss = pairs.filter(p => !p.cost);
  const sum = (a, f) => a.reduce((s, x) => s + Number(f(x) || 0), 0);
  const cardL = sum(rows, r => r.liters), cardA = sum(rows.filter(r => !r.currency || r.currency==='PLN'), r => r.amount);
  const appRows = pairs.filter(p => p.cost).map(p => p.cost).concat(noCard);
  const appL = sum(appRows, c => c.liters), appA = sum(appRows, c => c.amount);
  const tile = (k, l, n, cls) => `<button class="fc-tile ${cls} ${fcFilter===k ? 'on' : ''}" data-fcf="${k}"><b>${n}</b><span>${l}</span></button>`;
  const tiles = `<div class="fc-tiles">${tile('all','wszystkie', pairs.length, '')}${tile('ok','zgodne', ok.length, 'ok')}${tile('diff','różnice', dif.length, 'warn')}${tile('miss','brak wpisu kierowcy', miss.length, 'bad')}${tile('nocard','wpisy bez karty', noCard.length, 'info')}</div>`;
  const meta = `<div class="panel fc-meta"><div><span class="label">Dostawca</span><b>${esc(imp.provider || '—')}</b></div><div><span class="label">Okres</span><b>${imp.periodFrom ? fdate(imp.periodFrom) + ' – ' + fdate(imp.periodTo) : '—'}</b></div>
    <div><span class="label">Karta (nasze auta)</span><b>${fl(cardL)} · ${fm(cardA)}</b></div><div><span class="label">Wpisy kierowców</span><b>${fl(appL)} · ${fm(appA)}</b></div>
    <div><span class="label">Różnica</span><b class="${Math.abs(cardA - appA) > 1 ? 'neg' : ''}">${fm(cardA - appA)}</b></div>
    <div class="fc-meta-act">${imp.invoicePath ? `<a class="btn small" data-file="${esc(imp.invoicePath)}" href="#" target="_blank" rel="noopener">Faktura${imp.invoiceNo ? ' ' + esc(imp.invoiceNo) : ''}</a>` : ''}<button class="small" data-fc-inv="${esc(imp.id)}">${imp.invoicePath ? 'Zmień fakturę' : 'Dodaj fakturę'}</button><button class="small ghost" data-fc-del="${esc(imp.id)}">Usuń zestawienie</button></div></div>`;
  const perV = [...vids].map(vid => { const r = rows.filter(x => x.vehicleId===vid), a = appRows.filter(c => c.vehicleId===vid);
    return {vid, cl: sum(r, x => x.liters), ca: sum(r.filter(x => !x.currency || x.currency==='PLN'), x => x.amount), al: sum(a, c => c.liters), aa: sum(a, c => c.amount),
      kc: fcCons(r.concat(fcAnchorCard(vid, imp)).map(x => ({id: x.id, odo: Number(x.odometer), l: x.liters, d: x.txDate + ' ' + (x.txTime || '')}))),
      ka: fcCons(a.concat(fcAnchorApp(vid, imp)).map(c => ({id: c.id, odo: Number(c.odometer), l: c.liters, d: c.date + ' ' + (c.createdAt || '')})))}; })
    .sort((x, y) => Math.abs(y.ca - y.aa) - Math.abs(x.ca - x.aa));
  const perD = {};
  pairs.forEach(p => { const n = fcDriver(p.row, p.cost) || 'nieustalony'; const x = perD[n] = perD[n] || {cl:0, ca:0, al:0, aa:0, n:0};
    x.n++; x.cl += Number(p.row.liters || 0); if (!p.row.currency || p.row.currency==='PLN') x.ca += Number(p.row.amount || 0);
    if (p.cost){ x.al += Number(p.cost.liters || 0); x.aa += Number(p.cost.amount || 0); } });
  const dTable = `<div class="panel tablewrap"><table><thead><tr><th>Kierowca</th><th class="r">Tankowań</th><th class="r">Karta</th><th class="r">Wpisał</th><th class="r">Różnica</th></tr></thead><tbody>${Object.entries(perD).sort((a, b) => Math.abs(b[1].ca - b[1].aa) - Math.abs(a[1].ca - a[1].aa)).map(([n, x]) => `<tr><td><b>${esc(n)}</b></td><td class="r num">${x.n}</td>
    <td class="r num">${fl(x.cl)}<span class="sub">${fm(x.ca)}</span></td><td class="r num">${fl(x.al)}<span class="sub">${fm(x.aa)}</span></td><td class="r num ${Math.abs(x.ca - x.aa) > 1 ? 'neg' : ''}">${fl(x.cl - x.al)}<span class="sub">${fm(x.ca - x.aa)}</span></td></tr>`).join('')}</tbody></table></div>`;
  const list = fcFilter==='ok' ? ok : fcFilter==='diff' ? dif : fcFilter==='miss' ? miss : fcFilter==='nocard' ? [] : pairs;
  const badOdo = new Set(); perV.forEach(x => { [x.kc, x.ka].forEach(k => { if (k){ k.bad.forEach(id => badOdo.add(id)); (k.fake || []).forEach(id => badOdo.add(id)); } }); });
  const pairRow = p => { const r = p.row, c = p.cost;
    return `<tr><td class="num"><b>${fdate(r.txDate)}</b>${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</td><td>${esc(fcDriver(r, c)) || '<span class="muted">—</span>'}</td>
      <td class="num">${fl(r.liters)} · <b>${fm(r.amount, r.currency)}</b><span class="sub">${r.odometer ? km(r.odometer) : 'bez licznika'}${badOdo.has(r.id) ? ' <span class="pill off">licznik podejrzany</span>' : ''}${r.station ? ' · ' + esc(r.station) : ''}${r.product ? ' · ' + esc(r.product) : ''}</span></td>
      <td class="num ${c ? 'click' : ''}" ${c ? `data-edit="costs" data-id="${esc(c.id)}"` : ''}>${c ? `${fl(c.liters)} · <b>${fm(c.currency && c.currency!=='PLN' ? c.amountOrig : c.amount, c.currency)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'}${badOdo.has(c.id) ? ' <span class="pill off">licznik podejrzany</span>' : ''} · ${fdate(c.date)}</span>${photoStrip(c.photos)}` : '<span class="muted">—</span>'}</td>
      <td>${!c ? '<span class="pill bad">brak wpisu</span>' : p.issues.length ? p.issues.map(x => `<span class="pill warn">${esc(x)}</span>`).join(' ') : '<span class="pill ok">zgodne</span>'}</td></tr>`; };
  const ncRow = c => `<tr><td class="num"><b>${fdate(c.date)}</b></td><td>${esc(dName(fillDriver(c) || c.driverId) || '') || '<span class="muted">—</span>'}</td><td class="muted">nie ma na karcie</td>
      <td class="num click" data-edit="costs" data-id="${esc(c.id)}">${fl(c.liters)} · <b>${fm(c.amount)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'}</span>${photoStrip(c.photos)}</td><td><span class="pill info">bez karty</span></td></tr>`;
  // filtr kafelków: które pozycje pokazujemy w rozwinięciu auta
  const shown = (fcFilter==='nocard' ? [] : list).map(p => ({key: p.row.txDate + ' ' + (p.row.txTime || ''), vid: p.row.vehicleId, html: pairRow(p)}))
    .concat(fcFilter==='all' || fcFilter==='nocard' ? noCard.map(c => ({key: c.date, vid: c.vehicleId, html: ncRow(c)})) : []);
  const vRows = perV.filter(x => fcFilter==='all' || shown.some(y => y.vid===x.vid)).map(x => {
    const vp = pairs.filter(p => p.row.vehicleId===x.vid), nd = vp.filter(p => p.cost && p.issues.length).length, nm = vp.filter(p => !p.cost).length, nc = noCard.filter(c => c.vehicleId===x.vid).length;
    const open = fcOpen.has(x.vid);
    const det = open ? `<tr class="fc-det"><td colspan="5"><table><thead><tr><th>Data</th><th>Kierowca</th><th>Karta</th><th>Wpisał kierowca</th><th>Wynik</th></tr></thead><tbody>${shown.filter(y => y.vid===x.vid).sort((a, b) => a.key.localeCompare(b.key)).map(y => y.html).join('') || '<tr><td colspan="5" class="muted">Brak pozycji dla tego filtra.</td></tr>'}</tbody></table></td></tr>` : '';
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-fcv="${esc(x.vid)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${vPlate(x.vid)}<span class="sub">${vp.length} ${isPlural(vp.length,'tankowanie','tankowania','tankowań')}</span></td>
      <td class="r num">${fl(x.cl)}<span class="sub">${fm(x.ca)}</span></td><td class="r num">${fl(x.al)}<span class="sub">${fm(x.aa)}</span></td>
      <td class="r num ${Math.abs(x.ca - x.aa) > 1 ? 'neg' : ''}">${fl(x.cl - x.al)}<span class="sub">${fm(x.ca - x.aa)}</span></td>
      <td>${nd ? `<span class="pill warn">${nd} ${isPlural(nd,'różnica','różnice','różnic')}</span> ` : ''}${nm ? `<span class="pill bad">${nm} bez wpisu</span> ` : ''}${nc ? `<span class="pill info">${nc} bez karty</span>` : ''}${!nd && !nm && !nc ? '<span class="pill ok">zgodne</span>' : ''}</td></tr>${det}`;
  }).join('');
  const table = `<div class="panel tablewrap fc-table"><table><thead><tr><th>Auto</th><th class="r">Karta</th><th class="r">Wpisali kierowcy</th><th class="r">Różnica</th><th>Wynik</th></tr></thead><tbody>${vRows || '<tr><td colspan="5" class="muted">Brak aut dla tego filtra.</td></tr>'}</tbody></table></div>`;
  return head + suspPanel() + meta + tiles + `<div class="fc-grid">${table}${dTable}
    <p class="muted small" style="margin:0">Parujemy tankowanie z karty z wpisem kierowcy tego samego auta (ten sam dzień ±1, litry ±5%). Zgodne: litry ±0,5 l, kwota ±1 zł, licznik ±30 km. Kliknij wpis kierowcy, aby go poprawić. Kliknij auto, aby zobaczyć jego tankowania. Spalanie i przebiegi aut – w zakładce „Spalanie i przebiegi”.</p></div>`;
}
document.addEventListener('change', e => { if (e.target.id==='fc-imp'){ fcImportId = e.target.value; render(); } });
document.addEventListener('click', e => {
  if (e.target.closest('[data-edit],a')) return;
  const t = e.target.closest('[data-fcf],[data-fcv],[data-fc-del],[data-fc-inv],[data-action="fc-import"]');
  if (!t || t.closest('#dialog')) return;
  if (t.dataset.fcInv) return openFcInvoice(t.dataset.fcInv);
  if (t.dataset.fcv){ fcOpen.has(t.dataset.fcv) ? fcOpen.delete(t.dataset.fcv) : fcOpen.add(t.dataset.fcv); render(); return; }
  if (t.dataset.fcf){ fcFilter = t.dataset.fcf; if (fcFilter!=='all' && fcFilter!=='ok') S.vehicles.forEach(v => fcOpen.add(v.id)); render(); return; }
  if (t.dataset.action==='fc-import') return openFcImport();
  if (t.dataset.fcDel){
    if (!t.classList.contains('armed')){ t.classList.add('armed'); t.textContent = 'Na pewno usunąć?'; setTimeout(() => { t.classList.remove('armed'); t.textContent = 'Usuń zestawienie'; }, 4000); return; }
    fcDelete(t.dataset.fcDel);
  }
});
async function fcDelete(id){
  try { const {error} = await sb.from('fuel_card_imports').delete().eq('id', id); if (error) throw dbErr(error);
    fcImportId = ''; await refresh('fuelCardImports'); await refresh('fuelCardRows'); await refresh('costs'); toast('Usunięto zestawienie'); }
  catch(err){ handleWriteErr(err); }
}

/* ---------- import ---------- */
let fcParsed = null;
function openFcImport(){
  fcParsed = null;
  editing = {col:'fc-import', id:null, base:{}, special: fcSave};
  $('#dlg-title').textContent = 'Import z karty paliwowej';
  $('#dlg-body').innerHTML = `<div class="field"><label for="fc-prov">Dostawca karty</label><input id="fc-prov" list="fc-provs" value="${esc(fcSettings().provider || '')}" placeholder="np. Orlen, UTA"><datalist id="fc-provs"><option>Orlen</option><option>UTA</option><option>DKV</option><option>Shell</option><option>BP</option></datalist></div>
    <div class="field"><label for="fc-invno">Nr faktury</label><input id="fc-invno" placeholder="np. FV/123/11/2026"></div>
    <div class="field full"><label for="fc-inv">Faktura (PDF albo zdjęcie)</label><input id="fc-inv" type="file" accept="application/pdf,image/*"><span class="muted small">Przy kilku plikach naraz fakturę dołączysz potem przy każdym rozliczeniu.</span></div>
    <div class="field full"><label for="fc-file">Zestawienia transakcji (CSV albo Excel) – można zaznaczyć kilka plików *</label><input id="fc-file" type="file" multiple accept=".csv,.txt,.xlsx,.xls"></div>
    <div class="field full" id="fc-prev"></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Importuj';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
async function fcReadFile(f){
  const X = await loadXLSX();
  const buf = await f.arrayBuffer();
  if (/\.(csv|txt)$/i.test(f.name)){
    let text; try { text = new TextDecoder('utf-8', {fatal:true}).decode(buf); } catch(_){ text = new TextDecoder('windows-1250').decode(buf); }
    text = text.replace(/^﻿/, '');
    const first = text.split(/\r?\n/).slice(0, 5).join('\n'), sep = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ';' : (first.match(/\t/g) || []).length > 2 ? '\t' : ',';
    const wb = X.read(text, {type:'string', raw:true, FS: sep});
    return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:'', raw:true});
  }
  const wb = X.read(buf, {type:'array', cellDates:true});
  return X.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], {header:1, defval:'', raw:true});
}
/* Kolumny, których nie wolno pomylić: kwota tylko brutto (nie netto / VAT / cena), stacja nie z kolumn z wartościami */
const FC_EXCLUDE = {amount: /netto|vat|cena|stawka/, station: /wartosc|vat|netto|brutto|cena|^nr|typ stacji/, liters: /cena|wartosc/, plate: /karty/, date: /ksiegowania/};
function fcGuess(heads){
  const map = {}, hs = heads.map(fcHead), used = () => Object.values(map);
  FC_FIELDS.forEach(([k, , , syn]) => {
    const ok = j => hs[j] && !used().includes(j) && !(FC_EXCLUDE[k] && FC_EXCLUDE[k].test(hs[j]));
    let i = -1;
    for (const sy of syn){ i = hs.findIndex((h, j) => h===sy && ok(j)); if (i >= 0) break; }                         // najpierw dokładna nazwa, wg ważności
    if (i < 0) for (const sy of syn){ if (sy.length <= 3) continue; i = hs.findIndex((h, j) => h.includes(sy) && ok(j)); if (i >= 0) break; }
    if (i >= 0) map[k] = i;
  });
  return map;
}
async function fcParseOne(f){
  const aoa = (await fcReadFile(f)).filter(r => r.some(c => String(c).trim()!==''));
  // wiersz nagłówków: pierwszy z co najmniej 2 rozpoznanymi kolumnami (zestawienia mają czasem tytuł nad tabelą)
  let hi = aoa.slice(0, 20).findIndex(r => Object.keys(fcGuess(r)).length >= 2); if (hi < 0) hi = 0;
  const heads = (aoa[hi] || []).map((h, i) => String(h).trim() || 'Kolumna ' + (i + 1));
  return {name: f.name, heads, sig: heads.map(fcHead).join('|'), data: aoa.slice(hi + 1)};
}
document.addEventListener('change', async e => {
  if (e.target.id==='fc-file'){
    const fs = [...(e.target.files || [])]; if (!fs.length) return;
    const box = $('#fc-prev'); box.innerHTML = `<span class="muted">Wczytywanie ${fs.length > 1 ? fs.length + ' plików' : 'pliku'}…</span>`;
    const files = [], failed = [];
    for (const f of fs){ try { files.push(await fcParseOne(f)); } catch(_){ failed.push(f.name); } }
    if (!files.length){ box.innerHTML = '<span class="warnline">Nie udało się odczytać pliku. Zapisz go jako CSV albo .xlsx i spróbuj ponownie.</span>'; fcParsed = null; return; }
    // układy kolumn: każdy dopasowujemy raz (zapamiętane z poprzednich importów albo zgadnięte)
    const maps = {};
    files.forEach(f => { if (!maps[f.sig]){ const saved = (fcSettings().maps2 || {})[f.sig]; maps[f.sig] = {heads: f.heads, map: saved ? {...saved} : fcGuess(f.heads)}; } });
    fcParsed = {files, failed, maps, sigs: Object.keys(maps)};
    fcRenderMap();
  }
  if (e.target.matches && e.target.matches('[data-fcmap]') && fcParsed){
    const m = fcParsed.maps[e.target.dataset.sig].map, v = e.target.value;
    if (v==='') delete m[e.target.dataset.fcmap]; else m[e.target.dataset.fcmap] = Number(v);
    fcRenderMap(true);
  }
  if (e.target.matches && e.target.matches('[data-fcprod]') && fcParsed){ fcParsed.prodOff = fcParsed.prodOff || new Set(); e.target.checked ? fcParsed.prodOff.delete(e.target.value) : fcParsed.prodOff.add(e.target.value); fcRenderMap(true); }
});
const fcMissing = m => FC_FIELDS.filter(([k, , req]) => req && m[k]==null).map(x => x[1]);
function fcRowsOf(file, m){
  const vByPlate = new Map(S.vehicles.map(v => [normPlate(v.plate), v]));
  const g = (r, k) => m[k]!=null ? r[m[k]] : '';
  const all = [], foreign = new Set();
  file.data.forEach(r => {
    const pRaw = String(g(r, 'plate') || ''); if (!pRaw.trim()) return;
    let v = vByPlate.get(normPlate(pRaw));
    if (!v){ const np = normPlate(pRaw); v = S.vehicles.find(x => np.includes(normPlate(x.plate))); }
    const dt = fcDate(g(r, 'date')); if (!dt) return;
    const time = m.time!=null ? ((String(g(r, 'time')).match(/(\d{1,2}):(\d{2})/) || []).slice(1).map(x => pad(x)).join(':') || dt.t) : dt.t;
    const row = {plate: pRaw.trim(), vehicle: v || null, txDate: dt.d, txTime: time || null, liters: fcNum(g(r, 'liters')), amount: fcNum(g(r, 'amount')),
      currency: (String(g(r, 'currency') || 'PLN').trim().toUpperCase().slice(0, 3)) || 'PLN', odometer: Math.round(fcNum(g(r, 'odometer')) || 0) || null,
      station: String(g(r, 'station') || '').trim() || null, card: String(g(r, 'card') || '').trim() || null, product: String(g(r, 'product') || '').trim() || null};
    if (!v) foreign.add(normPlate(pRaw));
    all.push(row);
  });
  return {all, foreign};
}
function fcRenderMap(keepScroll){
  const P_ = fcParsed, box = $('#fc-prev');
  const mapUi = sig => { const L = P_.maps[sig];
    const opts = sel => `<option value="">— brak —</option>` + L.heads.map((h, i) => `<option value="${i}" ${sel===i ? 'selected' : ''}>${esc(h)}</option>`).join('');
    const used = P_.files.filter(f => f.sig===sig).map(f => f.name);
    return `${P_.sigs.length > 1 ? `<span class="label">Układ kolumn: ${esc(used.join(', '))}</span>` : ''}<div class="fc-map">${FC_FIELDS.map(([k, l, req]) => `<label><span class="label">${l}${req ? ' *' : ''}</span><select data-fcmap="${k}" data-sig="${esc(sig)}">${opts(L.map[k])}</select></label>`).join('')}</div>`; };
  const maps = P_.sigs.map(mapUi).join('');
  const miss = P_.sigs.flatMap(sig => fcMissing(P_.maps[sig].map));
  let sum = '';
  if (!miss.length){
    const per = P_.files.map(f => ({f, ...fcRowsOf(f, P_.maps[f.sig].map)}));
    const allRows = per.flatMap(x => x.all);
    const prods = [...new Set(allRows.map(r => r.product).filter(Boolean))];
    if (!P_.prodOff){ P_.prodOff = new Set(prods.filter(p => !FUEL_LIKE.test(p))); }
    per.forEach(x => { x.ours = x.all.filter(r => r.vehicle); x.ours.forEach(r => { r.kind = (r.product && P_.prodOff.has(r.product)) || !(Number(r.liters) > 0) ? 'other' : 'fuel'; }); });
    P_.per = per;
    const ours = per.flatMap(x => x.ours), foreign = new Set(per.flatMap(x => [...x.foreign]));
    const nF = ours.filter(r => r.kind==='fuel').length, nO = ours.length - nF;
    const ds = ours.map(r => r.txDate).sort();
    const files = P_.files.length > 1 ? `<div class="tablewrap imp-table"><table><thead><tr><th>Plik</th><th>Okres</th><th class="r">Tankowania</th><th class="r">Inne</th></tr></thead><tbody>${per.map(x => { const d = x.ours.map(r => r.txDate).sort();
        return `<tr><td>${esc(x.f.name)}</td><td class="num">${d.length ? fdate(d[0]) + ' – ' + fdate(d[d.length - 1]) : '—'}</td><td class="r num">${x.ours.filter(r => r.kind==='fuel').length}</td><td class="r num">${x.ours.filter(r => r.kind!=='fuel').length}</td></tr>`; }).join('')}</tbody></table></div>` : '';
    sum = `<div class="imp-sum">${P_.files.length > 1 ? `<span class="pill info">${P_.files.length} ${isPlural(P_.files.length,'plik','pliki','plików')} = ${P_.files.length} ${isPlural(P_.files.length,'rozliczenie','rozliczenia','rozliczeń')}</span>` : ''}<span class="pill ok">${nF} tankowań naszych aut</span>${nO ? `<span class="pill info">${nO} przejazdów, parkingów i innych</span>` : ''}<span class="pill off">${foreign.size} innych tablic – pominięte</span>${ds.length ? `<span class="pill info">${fdate(ds[0])} – ${fdate(ds[ds.length - 1])}</span>` : ''}</div>
      ${P_.failed.length ? `<span class="warnline">Nie udało się odczytać: ${esc(P_.failed.join(', '))}</span>` : ''}
      ${prods.length > 1 ? `<div class="fc-prods"><span class="label">Zaznaczone = paliwo (porównanie z kierowcami). Pozostałe trafią do „Przejazdy i parkingi” i do kosztów auta</span>${prods.map(p => `<label class="check"><input type="checkbox" data-fcprod value="${esc(p)}" ${P_.prodOff.has(p) ? '' : 'checked'}> ${esc(p)}</label>`).join('')}</div>` : ''}
      ${files || `<div class="tablewrap imp-table"><table><thead><tr><th>Data</th><th>Auto</th><th class="r">Litry</th><th class="r">Kwota</th><th class="r">Licznik</th></tr></thead><tbody>
      ${ours.slice(0, 8).map(r => `<tr><td class="num">${fdate(r.txDate)} ${esc(r.txTime || '')}</td><td>${plate(r.vehicle.plate)}</td><td class="r num">${fl(r.liters)}</td><td class="r num">${fm(r.amount, r.currency)}</td><td class="r num">${r.kind==='fuel' ? (r.odometer ? km(r.odometer) : '—') : `<span class="pill info">${esc(r.product || 'inne')}</span>`}</td></tr>`).join('')}
      </tbody></table></div>${ours.length > 8 ? `<span class="sub muted">…i ${ours.length - 8} kolejnych</span>` : ''}`}`;
  } else { P_.per = null; sum = `<span class="warnline">Wskaż kolumny: ${esc([...new Set(miss)].join(', '))}.</span>`; }
  const y = $('#dlg-body').scrollTop;
  box.innerHTML = `<span class="label">Kolumny w pliku – sprawdź dopasowanie (zapamiętamy je dla tego układu pliku)</span>${maps}${sum}`;
  if (keepScroll) $('#dlg-body').scrollTop = y;
}
async function fcSave(){
  const warn = msg => { const w = $('#dlg-warn'); w.textContent = msg; w.hidden = false; };
  if (!fcParsed) return warn('Wybierz plik z zestawieniem transakcji.');
  if (!fcParsed.per) return warn('Wskaż wszystkie wymagane kolumny.');
  const key = (vid, r) => [vid, r.txDate, r.txTime || '', Number(r.liters), Number(r.amount), r.product || ''].join('|');
  const exist = new Set(S.fuelCardRows.map(r => key(r.vehicleId, r)));
  const jobs = fcParsed.per.map(x => { const fresh = x.ours.filter(r => { const k = key(r.vehicle.id, r); if (exist.has(k)) return false; exist.add(k); return true; }); return {...x, fresh}; }).filter(x => x.fresh.length);
  const allOurs = fcParsed.per.reduce((s, x) => s + x.ours.length, 0);
  if (!allOurs) return warn('W plikach nie ma pozycji aut z systemu.');
  if (!jobs.length) return warn('Wszystkie te pozycje są już zaimportowane.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const prov = $('#fc-prov').value.trim(), invNo = $('#fc-invno').value.trim();
    const inv = ($('#fc-inv').files || [])[0];
    let invoicePath = null;
    if (inv && jobs.length===1){ if (!assetsNS) throw {code:'upload', message:'Wgrywanie plików niedostępne'}; invoicePath = (await assetsNS.upload(inv, {type: inv.type})).id; }
    let lastId = null, nF = 0, nO = 0, fresh = 0;
    for (const j of jobs){
      const ds = j.fresh.map(r => r.txDate).sort();
      const id = crypto.randomUUID(); lastId = id;
      let {error} = await sb.from('fuel_card_imports').insert({id, provider: prov || null, invoice_no: jobs.length===1 ? invNo || null : null, invoice_path: invoicePath, file_name: j.f.name,
        period_from: ds[0], period_to: ds[ds.length - 1], rows_total: j.f.data.length, rows_ours: j.fresh.length});
      if (error) throw dbErr(error);
      const rows = j.fresh.map(r => ({import_id: id, vehicle_id: r.vehicle.id, plate: r.plate, tx_date: r.txDate, tx_time: r.txTime, liters: r.liters, amount: r.amount,
        currency: r.currency, odometer: r.odometer, station: r.station, card_no: r.card, product: r.product, kind: r.kind}));
      for (let i = 0; i < rows.length; i += 500){ ({error} = await sb.from('fuel_card_rows').insert(rows.slice(i, i + 500))); if (error) throw dbErr(error); }
      nF += j.fresh.filter(r => r.kind==='fuel').length; nO += j.fresh.filter(r => r.kind!=='fuel').length; fresh += j.fresh.length;
    }
    const st = fcSettings(), maps = {...(st.maps2 || {})};
    fcParsed.sigs.forEach(sig => { maps[sig] = fcParsed.maps[sig].map; });
    await db.collection('settings').doc('fuelcard').set({provider: prov || st.provider || '', maps2: maps});
    await refresh('fuelCardImports'); await refresh('fuelCardRows'); if (nO) await refresh('costs');
    fcImportId = lastId; fcFilter = 'all';
    closeForm();
    toast(`Zaimportowano ${jobs.length > 1 ? jobs.length + ' ' + isPlural(jobs.length,'rozliczenie','rozliczenia','rozliczeń') + ': ' : ''}${nF} ${isPlural(nF,'tankowanie','tankowania','tankowań')}${nO ? ` i ${nO} ${isPlural(nO,'przejazd / parking','przejazdy / parkingi','przejazdów / parkingów')}` : ''}${allOurs > fresh ? ` · ${allOurs - fresh} już było` : ''}${inv && jobs.length > 1 ? ' · fakturę dołącz przy rozliczeniu' : ''}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
/* Dołączenie faktury do istniejącego rozliczenia */
function openFcInvoice(id){
  const imp = byId('fuelCardImports', id); if (!imp) return;
  editing = {col:'fc-invoice', id, base:{}, special: async () => {
    const f = ($('#fci-file').files || [])[0], no = $('#fci-no').value.trim();
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      const upd = {invoice_no: no || null};
      if (f){ if (!assetsNS) throw {code:'upload', message:'Wgrywanie plików niedostępne'}; upd.invoice_path = (await assetsNS.upload(f, {type: f.type})).id; }
      const {error} = await sb.from('fuel_card_imports').update(upd).eq('id', id); if (error) throw dbErr(error);
      await refresh('fuelCardImports'); closeForm(); toast('Zapisano fakturę');
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dlg-title').textContent = 'Faktura do rozliczenia';
  $('#dlg-body').innerHTML = `<div class="field full"><span class="muted">${esc([imp.provider, imp.periodFrom ? fdate(imp.periodFrom) + ' – ' + fdate(imp.periodTo) : '', imp.fileName].filter(Boolean).join(' · '))}</span></div>
    <div class="field"><label for="fci-no">Nr faktury</label><input id="fci-no" value="${esc(imp.invoiceNo || '')}"></div>
    <div class="field full"><label for="fci-file">Faktura (PDF albo zdjęcie)</label><input id="fci-file" type="file" accept="application/pdf,image/*"></div><div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}

/* ---------- przejazdy i parkingi z karty (osobna zakładka) ---------- */
const tlOpen = new Set();
function viewTolls(){
  if (!P().manage) return '';
  const imps = fcImports();
  const head = `<div class="bar"><h2>Przejazdy i parkingi</h2><div class="tools">${imps.length ? `<select id="fc-imp" style="width:auto" aria-label="Zestawienie">${imps.map(i => `<option value="${esc(i.id)}" ${i.id===(fcImportId || imps[0].id) ? 'selected' : ''}>${esc([i.provider, i.periodFrom ? fdate(i.periodFrom) + '–' + fdate(i.periodTo) : '', i.invoiceNo].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}
    <button class="primary" data-action="fc-import">${ic('plus')}Importuj zestawienie</button></div></div>`;
  if (!imps.length) return head + loadingOr('fuelCardImports', `<div class="panel empty"><p>Opłaty drogowe, parkingi i inne pozycje (np. myjnia, AdBlue) pojawią się tu po imporcie zestawienia z karty w zakładce Karty paliwowe. Dopisują się same do kosztów auta.</p></div>`);
  const imp = imps.find(i => i.id===fcImportId) || imps[0];
  const rows = S.fuelCardRows.filter(r => r.importId===imp.id && r.kind==='other');
  const sum = a => a.reduce((s, r) => s + (!r.currency || r.currency==='PLN' ? Number(r.amount || 0) : 0), 0);
  const fx = rows.filter(r => r.currency && r.currency!=='PLN');
  const vids = [...new Set(rows.map(r => r.vehicleId))].sort((a, b) => sum(rows.filter(r => r.vehicleId===b)) - sum(rows.filter(r => r.vehicleId===a)));
  const meta = `<div class="panel fc-meta"><div><span class="label">Okres</span><b>${imp.periodFrom ? fdate(imp.periodFrom) + ' – ' + fdate(imp.periodTo) : '—'}</b></div>
    <div><span class="label">Pozycji</span><b>${rows.length}</b></div><div><span class="label">Razem (PLN)</span><b>${fm(sum(rows))}</b></div>
    ${fx.length ? `<div><span class="label">W walutach</span><b>${[...new Set(fx.map(r => r.currency))].map(c => fm(fx.filter(r => r.currency===c).reduce((s, r) => s + Number(r.amount || 0), 0), c)).join(' · ')}</b></div>` : ''}
    <div><span class="label">Koszty auta</span><b>${rows.filter(r => r.costId).length} z ${rows.length} dopisane</b></div></div>`;
  const vRows = vids.map(vid => {
    const list = rows.filter(r => r.vehicleId===vid).sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || ''))), open = tlOpen.has(vid);
    const det = open ? `<tr class="fc-det"><td colspan="3"><table><thead><tr><th>Data</th><th>Pozycja</th><th>Kierowca</th><th class="r">Kwota</th><th></th></tr></thead><tbody>${list.map(r => `<tr>
        <td class="num"><b>${fdate(r.txDate)}</b>${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</td><td>${esc(r.product || 'inne')}<span class="sub">${esc(r.station || '')}</span></td>
        <td>${esc(fcDriver(r, null)) || '<span class="muted">—</span>'}</td><td class="r num"><b>${fm(r.amount, r.currency)}</b></td>
        <td>${r.costId ? '<span class="pill ok">w kosztach</span>' : '<span class="pill warn">nie dopisano – dodaj ręcznie</span>'}</td></tr>`).join('')}</tbody></table></td></tr>` : '';
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-tlv="${esc(vid)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${vPlate(vid)}<span class="sub">${list.length} ${isPlural(list.length,'pozycja','pozycje','pozycji')}</span></td>
      <td class="r num"><b>${fm(sum(list))}</b></td><td class="muted small">${esc([...new Set(list.map(r => r.product).filter(Boolean))].slice(0, 4).join(', '))}</td></tr>${det}`;
  }).join('');
  return head + meta + `<div class="panel tablewrap fc-table"><table><thead><tr><th>Auto</th><th class="r">Razem</th><th>Co</th></tr></thead><tbody>${vRows || '<tr><td colspan="3" class="muted">W tym zestawieniu nie ma przejazdów ani parkingów naszych aut.</td></tr>'}</tbody></table></div>
    <p class="muted small" style="margin:0">Pozycje z karty, które nie są paliwem, dopisują się same do kosztów auta (kategorie Opłaty i parkingi, Myjnia albo Inne). Usunięcie zestawienia usuwa też te koszty. Kliknij auto, aby zobaczyć pozycje.</p>`;
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-tlv]'); if (!t || t.closest('#dialog')) return;
  tlOpen.has(t.dataset.tlv) ? tlOpen.delete(t.dataset.tlv) : tlOpen.add(t.dataset.tlv); render();
});


