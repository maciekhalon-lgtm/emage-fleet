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
  ['net','Kwota netto',0,['wartosc netto','kwota netto','wartosc netto pln','netto','net amount','net','nettobetrag']],
  ['vat','Stawka VAT (%)',0,['stawka vat','stawka vat %','vat %','vat [%]','% vat','vat rate','stawka','mwst %','mwst-satz','vat','mwst']],
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
/* Excel zapisuje godzinę z ułamkiem sekundy – 00:05 potrafi wrócić jako 00:04:59. Zaokrąglamy do pełnej minuty. */
const fcMin = d => new Date(Math.round(d.getTime() / 6e4) * 6e4);
function fcDate(v, mdy){
  if (v instanceof Date && !isNaN(v)){ v = fcMin(v); return {d: isoOf(v), t: v.getHours() || v.getMinutes() ? pad(v.getHours()) + ':' + pad(v.getMinutes()) : ''}; }
  if (typeof v==='number' && v > 20000 && v < 80000){ const ms = Math.round((v - 25569) * 1440) * 6e4, x = new Date(ms); return {d: x.toISOString().slice(0, 10), t: x.toISOString().slice(11, 16)!=='00:00' ? x.toISOString().slice(11, 16) : ''}; }
  const s = String(v || ''), tm = (s.match(/(\d{1,2}):(\d{2})/) || []);
  let m = s.match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/);
  if (m) return {d: `${m[1]}-${pad(m[2])}-${pad(m[3])}`, t: tm[0] ? pad(tm[1]) + ':' + tm[2] : ''};
  m = s.match(/(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/);
  if (m){ const [dd, mm] = mdy ? [m[2], m[1]] : [m[1], m[2]]; if (Number(mm) > 12 || Number(dd) > 31) return null;
    return {d: `${m[3].length===2 ? '20' + m[3] : m[3]}-${pad(mm)}-${pad(dd)}`, t: tm[0] ? pad(tm[1]) + ':' + tm[2] : ''}; }
  return null;
}
/* Kolejność dzień/miesiąc w całym pliku: jeśli gdzieś drugi człon > 12 (np. 11/25/2026), plik jest w układzie MM/DD (amerykańskim). */
function fcMdy(vals){
  let dmy = false, mdy = false;
  vals.forEach(v => { if (v instanceof Date || typeof v==='number') return; const m = String(v || '').match(/(?:^|\D)(\d{1,2})[-./](\d{1,2})[-./](\d{2,4})/); if (!m) return;
    if (Number(m[1]) > 12) dmy = true; if (Number(m[2]) > 12) mdy = true; });
  return mdy && !dmy;
}
/* Waluta: „zł”, „€”, „Euro”, „Kč” → kod ISO. Nieznane oznaczenie → null (do wyboru w podglądzie importu). */
const FC_CUR = {PLN: 'PLN', ZL: 'PLN', 'ZŁ': 'PLN', PLZ: 'PLN', EUR: 'EUR', EURO: 'EUR', '€': 'EUR', CZK: 'CZK', 'KČ': 'CZK', KC: 'CZK', USD: 'USD', $: 'USD', GBP: 'GBP', '£': 'GBP', CHF: 'CHF', HUF: 'HUF', FT: 'HUF', SEK: 'SEK', NOK: 'NOK', DKK: 'DKK', RON: 'RON', LEI: 'RON', BGN: 'BGN', LV: 'BGN', UAH: 'UAH', 'ГРН': 'UAH'};
function fcCur(v){
  const s = String(v==null ? '' : v).trim().toUpperCase().replace(/[.\s]/g, '');
  if (!s) return 'PLN';
  return FC_CUR[s] || null;
}
const fcSettings = () => S.settings.find(x => x.id==='fuelcard') || {};

/* ---------- porównanie z wpisami kierowców ---------- */
/* netto wiersza karty: z pliku (kwota netto / stawka VAT), a bez nich – VAT wg daty tankowania (8% w okresie obniżki, inaczej 23%) */
const fcNet = r => Number(r.amountNet) > 0 ? Number(r.amountNet) : Number(r.amount) / (1 + (r.vatRate!=null ? Number(r.vatRate) : fuelVat(r.txDate)) / 100);
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
const fm = (v, cur) => { if (v==null || !Number.isFinite(Number(v))) return '—';
  try { return new Intl.NumberFormat('pl-PL', {style:'currency', currency: cur || 'PLN'}).format(Number(v)); }
  catch(_){ return new Intl.NumberFormat('pl-PL', {minimumFractionDigits: 2, maximumFractionDigits: 2}).format(Number(v)) + ' ' + String(cur); } };   // nieznany kod waluty nie może wywrócić ekranu
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
  return b ? crewName(b) : '';
}
/* tankowanie z karty bez grafiku: „brak w grafiku” + kto odpowiada za auto (to nie znaczy, że tankował) */
function fcNoCrew(r){
  const v = byId('vehicles', r.vehicleId), resp = v ? respOf(v) : [];
  return `<span class="muted">brak w grafiku</span>${resp.length ? `<span class="sub">odpowiada: ${esc(resp.map(dName).join(', '))}</span>` : ''}`;
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
  // porównanie kwot na wspólnej podstawie netto (karta – netto z wyciągu albo z VAT wg daty; wpis kierowcy – brutto z paragonu → netto); tylko złote
  const isPl = x => !x.currency || x.currency==='PLN', cardN = sum(rows.filter(isPl), fcNet), appN = sum(appRows.filter(isPl), costNet);
  const prd = pairs.filter(p => p.cost && isPl(p.row) && isPl(p.cost)), prdDiff = sum(prd, p => fcNet(p.row)) - sum(prd, p => costNet(p.cost));
  const diffBox = !appRows.length
    ? `<div><span class="label">Różnica</span><b class="muted">porównanie niepełne</b><span class="sub">brak wpisów kierowców w tym okresie</span></div>`
    : miss.length
      ? `<div><span class="label">Różnica netto</span><b class="${Math.abs(prdDiff) > 1 ? 'neg' : ''}">${fm(prdDiff)}</b><span class="sub">niepełne – tylko ${prd.length} ${isPlural(prd.length, 'tankowanie', 'tankowania', 'tankowań')} z wpisem kierowcy; ${miss.length} bez wpisu</span></div>`
      : `<div><span class="label">Różnica netto</span><b class="${Math.abs(cardN - appN) > 1 ? 'neg' : ''}">${fm(cardN - appN)}</b><span class="sub">karta ${fm(cardN)} − wpisy ${fm(appN)}</span></div>`;
  const tile = (k, l, n, cls) => `<button class="fc-tile ${cls} ${fcFilter===k ? 'on' : ''}" data-fcf="${k}"><b>${n}</b><span>${l}</span></button>`;
  const tiles = `<div class="fc-tiles">${tile('all','wszystkie', pairs.length, '')}${tile('ok','zgodne', ok.length, 'ok')}${tile('diff','różnice', dif.length, 'warn')}${tile('miss','brak wpisu kierowcy', miss.length, 'bad')}${tile('nocard','wpisy bez karty', noCard.length, 'info')}</div>`;
  const meta = `<div class="panel fc-meta"><div><span class="label">Dostawca</span><b>${esc(imp.provider || '—')}</b></div><div><span class="label">Okres</span><b>${imp.periodFrom ? fdate(imp.periodFrom) + ' – ' + fdate(imp.periodTo) : '—'}</b></div>
    <div><span class="label">Karta (nasze auta)</span><b>${fl(cardL)} · ${fm(cardA)}</b><span class="sub">brutto · netto ${fm(sum(rows.filter(r => !r.currency || r.currency==='PLN'), fcNet))}</span></div><div><span class="label">Wpisy kierowców</span>${appRows.length ? `<b>${fl(appL)} · ${fm(appA)}</b><span class="sub">brutto · netto ${fm(appN)}</span>` : `<b class="muted">brak wpisów</b><span class="sub">${miss.length} ${isPlural(miss.length, 'tankowanie', 'tankowania', 'tankowań')} z karty bez wpisu kierowcy</span>`}</div>
    ${(xs => xs.length ? `<div><span class="label">Wykluczone (nie flota)</span><b>${xs.length} · ${fm(sum(xs.filter(r => !r.currency || r.currency==='PLN'), r => r.amount))}</b></div>` : '')(S.fuelCardRowsAll.filter(r => r.excluded && r.importId===imp.id))}
    ${diffBox}
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
    return `<tr><td class="num"><b>${fdate(r.txDate)}</b>${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</td><td>${esc(fcDriver(r, c)) || fcNoCrew(r)}</td>
      <td class="num">${fl(r.liters)} · <b>${fm(r.amount, r.currency)}</b><span class="sub">${r.odometer ? km(r.odometer) : 'bez licznika'}${badOdo.has(r.id) ? ' <span class="pill off">licznik podejrzany</span>' : ''}${r.station ? ' · ' + esc(r.station) : ''}${r.product ? ' · ' + esc(r.product) : ''}</span></td>
      <td class="num ${c ? 'click' : ''}" ${c ? `data-edit="costs" data-id="${esc(c.id)}"` : ''}>${c ? `${fl(c.liters)} · <b>${fm(c.currency && c.currency!=='PLN' ? c.amountOrig : c.amount, c.currency)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'}${badOdo.has(c.id) ? ' <span class="pill off">licznik podejrzany</span>' : ''} · ${fdate(c.date)}</span>${photoStrip(c.photos)}` : '<span class="muted">—</span>'}</td>
      <td>${!c ? '<span class="pill bad">brak wpisu</span>' : p.issues.length ? p.issues.map(x => `<span class="pill warn">${esc(x)}</span>`).join(' ') : '<span class="pill ok">zgodne</span>'} <button class="small ghost" data-fc-excl="${esc(r.id)}" title="Wyklucz z kosztów floty">Nie flota</button></td></tr>`; };
  const exRow = r => `<tr class="fc-excl"><td class="num"><b>${fdate(r.txDate)}</b>${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</td><td class="muted">—</td>
      <td class="num">${r.liters ? fl(r.liters) + ' · ' : ''}<b>${fm(r.amount, r.currency)}</b><span class="sub">${esc([r.product, r.station].filter(Boolean).join(' · '))}</span></td>
      <td class="muted">wykluczone${r.excludedNote ? ': ' + esc(r.excludedNote) : ''}</td><td><span class="pill off">nie flota</span> <button class="small ghost" data-fc-incl="${esc(r.id)}">Przywróć</button></td></tr>`;
  const excl = S.fuelCardRowsAll.filter(r => r.excluded && r.importId===imp.id && r.kind!=='other');
  const ncRow = c => `<tr><td class="num"><b>${fdate(c.date)}</b></td><td>${esc(dName(fillDriver(c) || c.driverId) || '') || '<span class="muted">—</span>'}</td><td class="muted">nie ma na karcie</td>
      <td class="num click" data-edit="costs" data-id="${esc(c.id)}">${fl(c.liters)} · <b>${fm(c.amount)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'}</span>${photoStrip(c.photos)}</td><td><span class="pill info">bez karty</span></td></tr>`;
  // filtr kafelków: które pozycje pokazujemy w rozwinięciu auta
  const shown = (fcFilter==='nocard' ? [] : list).map(p => ({key: p.row.txDate + ' ' + (p.row.txTime || ''), vid: p.row.vehicleId, html: pairRow(p)}))
    .concat(fcFilter==='all' || fcFilter==='nocard' ? noCard.map(c => ({key: c.date, vid: c.vehicleId, html: ncRow(c)})) : []);
  const vRows = perV.filter(x => fcFilter==='all' || shown.some(y => y.vid===x.vid)).map(x => {
    const vp = pairs.filter(p => p.row.vehicleId===x.vid), nd = vp.filter(p => p.cost && p.issues.length).length, nm = vp.filter(p => !p.cost).length, nc = noCard.filter(c => c.vehicleId===x.vid).length;
    const open = fcOpen.has(x.vid);
    const det = open ? `<tr class="fc-det"><td colspan="5"><table><thead><tr><th>Data</th><th>Kierowca</th><th>Karta</th><th>Wpisał kierowca</th><th>Wynik</th></tr></thead><tbody>${shown.filter(y => y.vid===x.vid).sort((a, b) => a.key.localeCompare(b.key)).map(y => y.html).join('') + excl.filter(r => r.vehicleId===x.vid).map(exRow).join('') || '<tr><td colspan="5" class="muted">Brak pozycji dla tego filtra.</td></tr>'}</tbody></table></td></tr>` : '';
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-fcv="${esc(x.vid)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${vPlate(x.vid)}<span class="sub">${vp.length} ${isPlural(vp.length,'tankowanie','tankowania','tankowań')}</span></td>
      <td class="r num">${fl(x.cl)}<span class="sub">${fm(x.ca)}</span></td><td class="r num">${fl(x.al)}<span class="sub">${fm(x.aa)}</span></td>
      <td class="r num ${Math.abs(x.ca - x.aa) > 1 ? 'neg' : ''}">${fl(x.cl - x.al)}<span class="sub">${fm(x.ca - x.aa)}</span></td>
      <td>${nd ? `<span class="pill warn">${nd} ${isPlural(nd,'różnica','różnice','różnic')}</span> ` : ''}${nm ? `<span class="pill bad">${nm} bez wpisu</span> ` : ''}${nc ? `<span class="pill info">${nc} bez karty</span>` : ''}${!nd && !nm && !nc ? '<span class="pill ok">zgodne</span>' : ''}</td></tr>${det}`;
  }).join('');
  const table = `<div class="panel tablewrap fc-table"><table><thead><tr><th>Auto</th><th class="r">Karta</th><th class="r">Wpisali kierowcy</th><th class="r">Różnica</th><th>Wynik</th></tr></thead><tbody>${vRows || '<tr><td colspan="5" class="muted">Brak aut dla tego filtra.</td></tr>'}</tbody></table></div>`;
  return head + suspPanel() + fuelPricePanel() + meta + fcConsPanel(imp) + tiles + `<div class="fc-grid">${table}${dTable}
    <p class="muted small" style="margin:0">Parujemy tankowanie z karty z wpisem kierowcy tego samego auta (ten sam dzień ±1, litry ±5%). Zgodne: litry ±0,5 l, kwota ±1 zł, licznik ±30 km. Kliknij wpis kierowcy, aby go poprawić. Kliknij auto, aby zobaczyć jego tankowania. Spalanie aut – Paliwo → Spalanie (z wpisów kierowców; karta tylko je sprawdza).</p></div>`;
}
/* ---- Spalanie z karty: litry z karty paliwowej, km z GPS (Geotab) ----
   Auto: od pierwszego do ostatniego tankowania z karty w okresie – litry bez pierwszego tankowania
   (to paliwo spalono wcześniej) / km z GPS między tymi dniami. Porównanie w obrębie klasy (do / powyżej 2,5 t),
   obok średnia auta z kart z ostatnich 6 miesięcy. Bez odczytu GPS – auto trafia do „Bez km z GPS”. */
let fcCsSort = ['diff', -1];
function fcGpsAt(vid, d){
  const xs = (S.gpsOdometer || []).filter(g => g.vehicleId===vid && Number(g.km) > 0 && g.day <= d).sort((a, b) => b.day.localeCompare(a.day));
  return xs[0] && diffDays(xs[0].day, d) <= 3 ? Number(xs[0].km) : null;
}
/* km z GPS w chwili transakcji z karty (Geotab, tabela odo_gps) – a bez niego odczyt z końca dnia (mniej dokładny) */
function fcRowGps(r){
  const g = (S.odoGps || []).find(x => x.source==='karta' && x.refId===r.id && Number(x.gpsKm) > 0);
  if (g) return {km: Number(g.gpsKm), exact: true};
  const k = fcGpsAt(r.vehicleId, r.txDate); return k!=null ? {km: k, exact: false} : null;
}
function fcCardCons(vid, from, to){
  const fs = S.fuelCardRows.filter(r => r.vehicleId===vid && r.kind!=='other' && Number(r.liters) > 0 && r.txDate >= from && r.txDate <= to)
    .sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || '')));
  const L = fs.reduce((a, r) => a + Number(r.liters), 0);
  const net = fs.filter(r => !r.currency || r.currency==='PLN').reduce((a, r) => a + fcNet(r), 0);
  const empty = {n: fs.length, L, net, l: null, km: null, rate: null};
  if (fs.length < 2) return empty;
  // pierwsze i ostatnie tankowanie z odczytem GPS; litry = tankowania po pierwszym aż do ostatniego włącznie
  const g = fs.map(fcRowGps), exact = g.filter(x => x && x.exact).length;
  const pick = g.some(x => x && x.exact) ? (x => x && x.exact) : (x => !!x);   // gdy są dokładne odczyty – tylko one
  const i0 = g.findIndex(pick), i1 = g.length - 1 - g.slice().reverse().findIndex(pick);
  if (i0 < 0 || i1 <= i0) return empty;
  const km_ = g[i1].km - g[i0].km, l = fs.slice(i0 + 1, i1 + 1).reduce((a, r) => a + Number(r.liters), 0);
  if (!(km_ > 0)) return empty;
  const rate = km_ >= 300 ? l / km_ * 100 : null;
  return {n: fs.length, L, net, l, km: km_, exact: exact===fs.length, approx: !g[i0].exact || !g[i1].exact,
    rate: rate!=null && rate >= 3 && rate <= 40 ? rate : null, odd: rate!=null && (rate < 3 || rate > 25)};
}
function fcConsData(from, to){
  const vs = S.vehicles.filter(v => v.status!=='wycofany' && S.fuelCardRows.some(r => r.vehicleId===v.id && r.kind!=='other' && r.txDate >= from && r.txDate <= to));
  const hist = vid => S.fuelCardRows.some(r => r.vehicleId===vid && r.kind!=='other' && r.txDate < from && r.txDate >= addDays(to, -179));
  const rows = vs.map(v => { const c = fcCardCons(v.id, from, to), o = hist(v.id) ? fcCardCons(v.id, addDays(to, -179), to) : {rate: null};
    return {v, cls: wcls(v), ...c, own: o.rate, vsOwn: c.rate!=null && o.rate!=null ? c.rate - o.rate : null}; });
  const ok = rows.filter(r => r.rate!=null), cls = {};
  // do średniej klasy nie wliczamy aut z nierealnym wynikiem (> 25 l/100 – błąd GPS albo cudze tankowania)
  WCLS.forEach(([k]) => { const xs = ok.filter(r => r.cls===k && !r.odd), km_ = xs.reduce((a, r) => a + r.km, 0), l = xs.reduce((a, r) => a + r.l, 0);
    cls[k] = {avg: km_ ? l / km_ * 100 : null, km: km_, l, n: xs.length}; });
  ok.forEach(r => { const a = cls[r.cls].avg; r.diff = a ? (r.rate - a) / a * 100 : null; });
  return {rows, ok, cls, none: rows.filter(r => r.rate==null)};
}
function fcConsPanel(imp){
  if (!imp.periodFrom || !imp.periodTo) return '';
  const D = fcConsData(imp.periodFrom, imp.periodTo), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  if (!D.rows.length) return '';
  const [sk, dir] = fcCsSort, val = r => sk==='own' ? r.vsOwn : r[sk];
  const cmp = (a, b) => { const x = val(a), y = val(b); if (x==null && y==null) return b.rate - a.rate; if (x==null) return 1; if (y==null) return -1; return (x - y) * dir || b.rate - a.rate; };
  const delta = x => x==null ? '<span class="muted">—</span>' : `<span class="num ${x > 0.5 ? 'neg' : x < -0.5 ? 'pos' : 'muted'}">${x > 0 ? '+' : x < 0 ? '−' : ''}${f1(Math.abs(x))}</span>`;
  const row = r => `<tr><td>${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))} · ${r.n} ${isPlural(r.n, 'tankowanie', 'tankowania', 'tankowań')}</span></td>
    <td class="r"><b class="num ${r.rate > theftOf(r.v.id) ? 'neg' : ''}">${f1(r.rate)}</b>${r.odd ? '<span class="sub"><span class="pill bad">sprawdź GPS / kartę</span></span>' : r.approx ? '<span class="sub muted">GPS z końca dnia</span>' : ''}</td>
    <td class="r">${r.diff==null ? '' : `<span class="pill ${r.diff > 15 ? 'bad' : r.diff > 5 ? 'warn' : r.diff < -5 ? 'ok' : 'off'}">${r.diff > 0 ? '+' : ''}${Math.round(r.diff)}%</span>`}</td>
    <td class="r">${r.own!=null ? `<span class="num">${f1(r.own)}</span> ${delta(r.vsOwn)}` : '<span class="muted">—</span>'}</td>
    <td class="r num">${nf.format(Math.round(r.km))}</td><td class="r num">${nf.format(Math.round(r.L))}</td><td class="r num">${zl(r.net)}</td></tr>`;
  const thead = `<thead><tr><th>Auto</th><th class="r">Spalanie l/100</th><th class="r">vs średnia klasy</th><th class="r">Średnia auta z kart (6 mies.)</th><th class="r">Km (GPS)</th><th class="r">Litry</th><th class="r">Paliwo netto</th></tr></thead>`;
  const secs = WCLS.map(([k, l]) => { const xs = D.ok.filter(r => r.cls===k).sort(cmp); if (!xs.length) return '';
    return `<div class="sec-head"><h3>${l}</h3><span class="muted small">średnia klasy <b>${f1(D.cls[k].avg)} l/100 km</b> · ${nf.format(Math.round(D.cls[k].km))} km</span></div>
      <div class="tablewrap"><table class="sp-tbl">${thead}<tbody>${xs.map(row).join('')}</tbody></table></div>`; }).join('');
  const why = r => r.n < 2 ? 'jedno tankowanie' : r.km==null ? 'brak km z GPS' : r.km < 300 ? 'mniej niż 300 km' : 'GPS nie pasuje do litrów';
  const none = D.none.length ? `<details class="fold" style="margin-top:8px"><summary class="sec-head"><h3>Bez wyniku</h3><span class="count">${D.none.length}</span></summary><div class="sp-none">${D.none.map(r => `<span title="${esc(why(r))}">${plate(r.v.plate)} <span class="muted small">${esc(why(r))}</span></span>`).join('')}</div></details>` : '';
  const sorts = `<div class="sp-sort"><span class="muted small">Sortuj:</span><div class="seg">${SP_SORTS.map(([k, l]) => `<button type="button" class="small ${sk===k ? 'on' : ''}" data-fccs-sort="${k}">${l}${sk===k ? (dir < 0 ? ' ▼' : ' ▲') : ''}</button>`).join('')}</div></div>`;
  return `<details class="panel fold" open><summary class="sec-head"><h3>Spalanie z karty</h3><span class="muted small">${fdate(imp.periodFrom)} – ${fdate(imp.periodTo)} · litry z karty, km z GPS</span></summary>
    <div class="sp-kpi" style="margin:4px 0 10px">${WCLS.filter(([k]) => D.cls[k].n).map(([k, l]) => `<div><span class="label">Średnia – ${l.toLowerCase()}</span><b class="num">${f1(D.cls[k].avg)} l/100 km</b><span class="sub">${D.cls[k].n} ${isPlural(D.cls[k].n, 'auto', 'auta', 'aut')}</span></div>`).join('') || '<div><span class="label">Średnia</span><b class="num">—</b></div>'}</div>
    ${D.ok.length ? sorts + secs : '<p class="muted">Za mało danych (potrzebne min. 2 tankowania z karty i km z GPS).</p>'}${none}
    <p class="muted small" style="margin:8px 0 0">Liczone od pierwszego do ostatniego tankowania z karty w okresie: litry bez pierwszego tankowania / km z GPS (Geotab) odczytane w chwili tych tankowań – bez takiego odczytu bierzemy stan z końca dnia (oznaczone). „Średnia auta z kart” – z ostatnich 6 miesięcy. Ranking kierowców dalej liczy się z ich wpisów (Paliwo → Spalanie).</p></details>`;
}
document.addEventListener('change', e => { if (e.target.id==='fc-imp'){ fcImportId = e.target.value; render(); } });
document.addEventListener('click', e => { const o = e.target.closest('[data-fccs-sort]'); if (!o) return; const k = o.dataset.fccsSort;
  fcCsSort = [k, fcCsSort[0]===k ? -fcCsSort[1] : -1]; render(); });
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
const FC_EXCLUDE = {amount: /netto|vat|cena|stawka/, net: /brutto|vat|cena|stawka/, vat: /kwota|wartosc|brutto|netto|cena|nr|numer/, station: /wartosc|vat|netto|brutto|cena|^nr|typ stacji/, liters: /cena|wartosc/, plate: /karty/, date: /ksiegowania/};
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
    files.forEach(f => { if (!maps[f.sig]){ const saved = (fcSettings().maps2 || {})[f.sig], gu = fcGuess(f.heads), m = saved ? {...saved} : gu;
      if (saved) ['net', 'vat'].forEach(k => { if (m[k]==null && gu[k]!=null && !Object.values(m).includes(gu[k])) m[k] = gu[k]; });   // nowe kolumny w zapamiętanym układzie
      maps[f.sig] = {heads: f.heads, map: m}; } });
    fcParsed = {files, failed, maps, sigs: Object.keys(maps)};
    fcRenderMap();
  }
  if (e.target.matches && e.target.matches('[data-fcmap]') && fcParsed){
    const m = fcParsed.maps[e.target.dataset.sig].map, v = e.target.value;
    if (v==='') delete m[e.target.dataset.fcmap]; else m[e.target.dataset.fcmap] = Number(v);
    fcRenderMap(true);
  }
  if (e.target.matches && e.target.matches('[data-fccur]') && fcParsed){ fcParsed.curMap = fcParsed.curMap || {}; if (e.target.value) fcParsed.curMap[e.target.dataset.fccur] = e.target.value; else delete fcParsed.curMap[e.target.dataset.fccur]; fcRenderMap(true); return; }
  if (e.target.matches && e.target.matches('[data-fcprod]') && fcParsed){ fcParsed.prodOff = fcParsed.prodOff || new Set(); e.target.checked ? fcParsed.prodOff.delete(e.target.value) : fcParsed.prodOff.add(e.target.value); fcRenderMap(true); }
});
const fcMissing = m => FC_FIELDS.filter(([k, , req]) => req && m[k]==null).map(x => x[1]);
function fcRowsOf(file, m){
  const vByPlate = new Map(S.vehicles.map(v => [normPlate(v.plate), v]));
  const g = (r, k) => m[k]!=null ? r[m[k]] : '';
  const all = [], foreign = new Set(), mdy = fcMdy(file.data.map(r => g(r, 'date'))), curs = fcParsed && fcParsed.curMap || {};
  // kolumna „VAT”: stawka (23, 8, 0,23, „23%”) albo kwota podatku – sprawdzamy po wartościach w całym pliku
  const RATES = [0, 5, 7, 8, 9, 10, 12, 13, 15, 19, 20, 21, 22, 23, 24, 25, 27];
  const vatVals = m.vat!=null ? file.data.map(r => g(r, 'vat')).filter(x => String(x).trim()!=='') : [];
  const rateLike = n => n!=null && (RATES.includes(n) || (n > 0 && n < 1 && RATES.includes(Math.round(n * 1000) / 10)));
  const vatIsAmt = vatVals.length > 0 && !vatVals.every(x => String(x).includes('%') || rateLike(fcNum(x)));
  file.data.forEach(r => {
    const pRaw = String(g(r, 'plate') || ''); if (!pRaw.trim()) return;
    let v = vByPlate.get(normPlate(pRaw));
    if (!v){ const np = normPlate(pRaw); v = S.vehicles.find(x => np.includes(normPlate(x.plate))); }
    const dt = fcDate(g(r, 'date'), mdy); if (!dt) return;
    const tv = m.time!=null ? g(r, 'time') : '';
    const time = m.time!=null ? (tv instanceof Date && !isNaN(tv) ? (x => pad(x.getHours()) + ':' + pad(x.getMinutes()))(fcMin(tv))
      : typeof tv==='number' && tv >= 0 && tv < 1 ? (x => pad(Math.floor(x / 60) % 24) + ':' + pad(x % 60))(Math.round(tv * 1440))
      : ((String(tv).match(/(\d{1,2}):(\d{2})/) || []).slice(1).map(x => pad(x)).join(':') || dt.t)) : dt.t;
    const curRaw = String(g(r, 'currency') || '').trim(), cur = fcCur(curRaw) || curs[curRaw] || null;
    const row = {plate: pRaw.trim(), vehicle: v || null, txDate: dt.d, txTime: time || null, liters: fcNum(g(r, 'liters')), amount: fcNum(g(r, 'amount')),
      currency: cur, curRaw, odometer: Math.round(fcNum(g(r, 'odometer')) || 0) || null,
      station: String(g(r, 'station') || '').trim() || null, card: String(g(r, 'card') || '').trim() || null, product: String(g(r, 'product') || '').trim() || null};
    // netto i VAT z pliku: stawka wprost, albo wyliczona z brutto/netto; netto ze stawki, gdy w pliku jej brak
    let net = fcNum(g(r, 'net')), vat = fcNum(g(r, 'vat'));
    if (vatIsAmt){ if ((net==null || !(net > 0)) && vat!=null && row.amount > 0) net = Math.round((row.amount - vat) * 100) / 100; vat = null; }
    if (vat!=null && vat > 0 && vat < 1) vat = Math.round(vat * 1000) / 10;
    if (vat==null && net > 0 && row.amount > 0) vat = Math.round((row.amount / net - 1) * 100);
    if ((net==null || !(net > 0)) && vat!=null && vat >= 0 && row.amount > 0) net = Math.round(row.amount / (1 + vat / 100) * 100) / 100;
    row.amountNet = net > 0 ? Math.round(net * 100) / 100 : null; row.vatRate = vat!=null && vat >= 0 && vat <= 30 ? vat : null;
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
    // korekty (storno): wiersz z minusem kasuje swoją pozycję (to samo auto, te same litry i kwota, do 3 dni) – pomijamy obie
    const near = (a, b) => Math.abs(Math.abs(Number(a) || 0) - Math.abs(Number(b) || 0)) < 0.015;
    const dd = (a, b) => Math.abs(new Date(a) - new Date(b)) / 864e5;
    const neg = r => Number(r.amount) < 0 || Number(r.liters) < 0;
    const everyRow = per.flatMap(x => x.ours);
    everyRow.filter(neg).forEach(n => {
      const o = everyRow.find(p => !p.skip && !neg(p) && p.vehicle.id===n.vehicle.id && near(p.amount, n.amount) && near(p.liters, n.liters) && dd(p.txDate, n.txDate) <= 3);
      if (o){ o.skip = n.skip = 'storno'; return; }
      n.skip = 'minus';
      n.old = S.fuelCardRowsAll.find(p => p.vehicleId===n.vehicle.id && Number(p.amount) > 0 && near(p.amount, n.amount) && near(p.liters, n.liters) && dd(p.txDate, n.txDate) <= 3) || null;
    });
    everyRow.forEach(r => { if (r.currency==='-') r.skip = 'waluta'; });
    per.forEach(x => { x.skipped = x.ours.filter(r => r.skip); x.ours = x.ours.filter(r => !r.skip); });
    P_.unk = [...new Set(everyRow.filter(r => !r.currency).map(r => r.curRaw))];
    P_.per = per;
    const ours = per.flatMap(x => x.ours), foreign = new Set(per.flatMap(x => [...x.foreign])), skipped = per.flatMap(x => x.skipped);
    const nSt = skipped.filter(r => r.skip==='storno').length / 2, minus = skipped.filter(r => r.skip==='minus'), nCur = skipped.filter(r => r.skip==='waluta').length;
    const curOpts = ['PLN', 'EUR', 'CZK', 'USD', 'GBP', 'CHF', 'HUF', 'SEK', 'NOK', 'DKK', 'RON', 'BGN', 'UAH'];
    const fixes = (P_.unk.length ? `<div class="warnline fc-cur"><b>Nieznana waluta w pliku – wybierz, co oznacza:</b>${P_.unk.map(u => `<label>„${esc(u)}” <select data-fccur="${esc(u)}"><option value="">— wybierz —</option>${curOpts.map(c => `<option>${c}</option>`).join('')}<option value="-">pomiń te pozycje</option></select></label>`).join('')}</div>` : '')
      + (nSt ? `<span class="pill info">${nSt} ${isPlural(nSt, 'korekta (storno)', 'korekty (storno)', 'korekt (storno)')} – tankowanie i jego anulowanie pominięte</span>` : '')
      + (nCur ? `<span class="pill off">${nCur} ${isPlural(nCur, 'pozycja', 'pozycje', 'pozycji')} w pominiętej walucie</span>` : '')
      + (minus.length ? `<div class="warnline">Korekty bez pary w pliku – nie importujemy ich (sprawdź ręcznie):<ul style="margin:4px 0 0 18px;padding:0">${minus.map(r => `<li>${fdate(r.txDate)} · ${esc(r.vehicle.plate)} · ${fm(r.amount, r.currency || r.curRaw)}${r.liters ? ' · ' + fl(r.liters) : ''}${r.old ? ` – anuluje tankowanie z ${fdate(r.old.txDate)} zaimportowane wcześniej: usuń je w zestawieniu` : ''}</li>`).join('')}</ul></div>` : '');
    const nF = ours.filter(r => r.kind==='fuel').length, nO = ours.length - nF;
    const ds = ours.map(r => r.txDate).sort();
    const files = P_.files.length > 1 ? `<div class="tablewrap imp-table"><table><thead><tr><th>Plik</th><th>Okres</th><th class="r">Tankowania</th><th class="r">Inne</th></tr></thead><tbody>${per.map(x => { const d = x.ours.map(r => r.txDate).sort();
        return `<tr><td>${esc(x.f.name)}</td><td class="num">${d.length ? fdate(d[0]) + ' – ' + fdate(d[d.length - 1]) : '—'}</td><td class="r num">${x.ours.filter(r => r.kind==='fuel').length}</td><td class="r num">${x.ours.filter(r => r.kind!=='fuel').length}</td></tr>`; }).join('')}</tbody></table></div>` : '';
    sum = `<div class="imp-sum">${P_.files.length > 1 ? `<span class="pill info">${P_.files.length} ${isPlural(P_.files.length,'plik','pliki','plików')} = ${P_.files.length} ${isPlural(P_.files.length,'rozliczenie','rozliczenia','rozliczeń')}</span>` : ''}<span class="pill ok">${nF} tankowań naszych aut</span>${nO ? `<span class="pill info">${nO} przejazdów, parkingów i innych</span>` : ''}<span class="pill off">${foreign.size} innych tablic – pominięte</span>${ds.length ? `<span class="pill info">${fdate(ds[0])} – ${fdate(ds[ds.length - 1])}</span>` : ''}</div>
      ${(() => { const fr = per.flatMap(x => x.all.filter(r => !r.vehicle)); if (!fr.length) return '';
        const g = {}; fr.forEach(r => { const key = r.plate || '(bez numeru)'; const o = g[key] = g[key] || {n: 0, l: 0, a: 0}; o.n++; o.l += Number(r.liters || 0); o.a += Number(r.amount || 0); });
        const tot = fr.reduce((s, r) => s + Number(r.amount || 0), 0);
        return `<details class="fc-foreign"><summary><span class="pill off">Pominięte – nie z floty: ${fr.length} ${isPlural(fr.length,'transakcja','transakcje','transakcji')} · ${zl(Math.round(tot))}</span></summary>
          <p class="muted small">Karty i numery spoza floty (np. prywatne, bez numeru auta) nie trafiają do kosztów transportu ani do spalania.</p>
          <div class="tablewrap"><table><thead><tr><th>Karta / numer</th><th class="r">Transakcje</th><th class="r">Litry</th><th class="r">Kwota</th></tr></thead><tbody>${Object.entries(g).sort((a, b) => b[1].a - a[1].a).map(([p, o]) => `<tr><td>${esc(p)}</td><td class="r num">${o.n}</td><td class="r num">${fl(Math.round(o.l))}</td><td class="r num">${zl(Math.round(o.a))}</td></tr>`).join('')}</tbody></table></div></details>`; })()}
      ${(() => { const ret = [...new Set(per.flatMap(x => x.ours.filter(r => r.vehicle.status==='wycofany').map(r => r.vehicle.plate)))]; return ret.length ? `<span class="warnline">Tankowania aut wycofanych z floty: ${esc(ret.join(', '))} – sprawdź, czy to na pewno koszt transportu.</span>` : ''; })()}
      ${fixes}
      ${P_.failed.length ? `<span class="warnline">Nie udało się odczytać: ${esc(P_.failed.join(', '))}</span>` : ''}
      ${prods.length > 1 ? `<div class="fc-prods"><span class="label">Zaznaczone = paliwo (porównanie z kierowcami). Pozostałe trafią do „Przejazdy i parkingi” i do kosztów auta</span>${prods.map(p => `<label class="check"><input type="checkbox" data-fcprod value="${esc(p)}" ${P_.prodOff.has(p) ? '' : 'checked'}> ${esc(p)}</label>`).join('')}</div>` : ''}
      ${files || `<div class="tablewrap imp-table"><table><thead><tr><th>Data</th><th>Auto</th><th class="r">Litry</th><th class="r">Kwota</th><th class="r">Licznik</th></tr></thead><tbody>
      ${ours.slice(0, 8).map(r => `<tr><td class="num">${fdate(r.txDate)} ${esc(r.txTime || '')}</td><td>${plate(r.vehicle.plate)}</td><td class="r num">${fl(r.liters)}</td><td class="r num">${fm(r.amount, r.currency || r.curRaw)}</td><td class="r num">${r.kind==='fuel' ? (r.odometer ? km(r.odometer) : '—') : `<span class="pill info">${esc(r.product || 'inne')}</span>`}</td></tr>`).join('')}
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
  if ((fcParsed.unk || []).length) return warn('Wybierz, co oznacza nieznana waluta w pliku (albo pomiń te pozycje).');
  const key = (vid, r) => [vid, r.txDate, r.txTime || '', Number(r.liters), Number(r.amount), r.product || ''].join('|');
  const exist = new Set(S.fuelCardRowsAll.map(r => key(r.vehicleId, r)));   // też wykluczone – ponowny import ich nie przywróci
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
      const id = newId(); lastId = id;
      let {error} = await sb.from('fuel_card_imports').insert({id, provider: prov || null, invoice_no: jobs.length===1 ? invNo || null : null, invoice_path: invoicePath, file_name: j.f.name,
        period_from: ds[0], period_to: ds[ds.length - 1], rows_total: j.f.data.length, rows_ours: j.fresh.length});
      if (error) throw dbErr(error);
      const rows = j.fresh.map(r => ({import_id: id, vehicle_id: r.vehicle.id, plate: r.plate, tx_date: r.txDate, tx_time: r.txTime, liters: r.liters, amount: r.amount, amount_net: r.amountNet, vat_rate: r.vatRate,
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
  const head = `<div class="bar"><h2>Opłaty drogowe i parkingi</h2><div class="tools">${imps.length ? `<select id="fc-imp" style="width:auto" aria-label="Zestawienie">${imps.map(i => `<option value="${esc(i.id)}" ${i.id===(fcImportId || imps[0].id) ? 'selected' : ''}>${esc([i.provider, i.periodFrom ? fdate(i.periodFrom) + '–' + fdate(i.periodTo) : '', i.invoiceNo].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}
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
        <td>${esc(fcDriver(r, null)) || fcNoCrew(r)}</td><td class="r num"><b>${fm(r.amount, r.currency)}</b></td>
        <td>${r.costId ? '<span class="pill ok">w kosztach</span>' : '<span class="pill warn">nie dopisano – dodaj ręcznie</span>'} <button class="small ghost" data-fc-excl="${esc(r.id)}" title="Wyklucz z kosztów floty">Nie flota</button></td></tr>`).join('')}
        ${S.fuelCardRowsAll.filter(r => r.excluded && r.kind==='other' && r.importId===imp.id && r.vehicleId===vid).map(r => `<tr class="fc-excl"><td class="num"><b>${fdate(r.txDate)}</b></td><td>${esc(r.product || 'inne')}<span class="sub">${esc(r.station || '')}</span></td>
          <td class="muted">wykluczone${r.excludedNote ? ': ' + esc(r.excludedNote) : ''}</td><td class="r num">${fm(r.amount, r.currency)}</td><td><span class="pill off">nie flota</span> <button class="small ghost" data-fc-incl="${esc(r.id)}">Przywróć</button></td></tr>`).join('')}</tbody></table></td></tr>` : '';
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



/* Przypomnienie o imporcie: dla każdego dostawcy – ostatni koniec okresu; jeśli minęło > 20 dni, czekamy na kolejne zestawienie */
function fcImportDue(){
  if (!P().manage) return [];
  const last = {};
  (S.fuelCardImports || []).forEach(i => { const p = (i.provider || 'karty').trim(); if (i.periodTo && (!last[p] || i.periodTo > last[p])) last[p] = i.periodTo; });
  return Object.entries(last).filter(([, d]) => diffDays(d, today()) > 20).map(([provider, d]) => ({provider, last: d, from: addDays(d, 1)}));
}

/* ---- „Nie flota”: wykluczenie pozycji z karty z kosztów floty (migracja 050) ---- */
function fcExclOpen(id){
  const r = S.fuelCardRowsAll.find(x => x.id===id); if (!r) return;
  editing = {col: 'fc-excl', id, base: {}, special: fcExclSave};
  $('#dialog').classList.remove('dlg-wide');
  $('#dlg-title').textContent = 'Wyklucz z kosztów floty';
  $('#dlg-body').innerHTML = `<p class="field full" style="margin:0;display:block"><b>${esc(vPlateTxt(r.vehicleId))}</b> · ${fdate(r.txDate)}${r.txTime ? ' ' + esc(r.txTime) : ''} · ${r.liters ? fl(r.liters) + ' · ' : ''}<b>${fm(r.amount, r.currency)}</b>${r.product ? ' · ' + esc(r.product) : ''}</p>
    <div class="field full"><label for="fc-excl-note">Powód (opcjonalnie)</label><input id="fc-excl-note" maxlength="200" placeholder="np. prywatne, inne auto firmy, kanister"></div>
    <p class="muted small field full" style="margin:0;display:block">Pozycja zostanie w zestawieniu (na szaro), ale nie liczy się do kosztów, spalania ani porównania z kierowcą. ${r.kind==='other' ? 'Jej koszt zniknie z kosztów auta. ' : 'Powiadomienia o niej znikną. '}Możesz ją przywrócić.</p>`;
  $('#dlg-save').textContent = 'Wyklucz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  setTimeout(() => { const i = $('#fc-excl-note'); if (i) i.focus(); }, 30);
}
const vPlateTxt = vid => (byId('vehicles', vid) || {}).plate || '';
async function fcExclSet(id, on, note){
  const {error} = await sb.from('fuel_card_rows').update(on ? {excluded: true, excluded_note: note || null} : {excluded: false}).eq('id', id);
  if (error){ toast('Nie udało się zapisać: ' + error.message); return false; }
  await refresh('fuelCardRows'); await refresh('costs'); if (typeof refresh==='function') refresh('events');
  return true;
}
async function fcExclSave(){
  const id = editing && editing.id, note = ($('#fc-excl-note') || {}).value || '';
  if (!id) return closeForm();
  if (await fcExclSet(id, true, note.trim())){ closeForm(); toast('Wykluczono z kosztów floty'); render(); }
}
document.addEventListener('click', async e => {
  const x = e.target.closest('[data-fc-excl]'); if (x){ e.stopPropagation(); fcExclOpen(x.dataset.fcExcl); return; }
  const y = e.target.closest('[data-fc-incl]'); if (y){ e.stopPropagation(); y.disabled = true; if (await fcExclSet(y.dataset.fcIncl, false)){ toast('Przywrócono do kosztów floty'); render(); } }
});
