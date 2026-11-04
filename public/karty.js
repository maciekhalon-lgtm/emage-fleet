/* Emage FLEET — karty paliwowe (tylko kierownik floty).
   Import zestawienia z karty (CSV / Excel, dowolny dostawca – kolumny dopasowujemy raz i zapamiętujemy) + faktura PDF.
   Zapisujemy tylko wiersze aut z systemu (po numerze rejestracyjnym) i porównujemy je z tankowaniami wpisanymi
   przez kierowców: litry, kwota, stan licznika. */
'use strict';
const FC_FIELDS = [
  ['date','Data transakcji',1,['data','data transakcji','data tankowania','data operacji','data i godzina','data/godzina','transaction date','date','datum']],
  ['time','Godzina',0,['godzina','czas','godz','time','uhrzeit']],
  ['plate','Nr rejestracyjny',1,['nr rejestracyjny','numer rejestracyjny','rejestracja','nr rej','nr rej.','tablica','numer pojazdu','pojazd','license plate','registration','kennzeichen','kfz-kennzeichen']],
  ['liters','Ilość (litry)',1,['ilosc','ilosc l','ilosc [l]','litry','ilosc litrow','quantity','volume','menge']],
  ['amount','Kwota brutto',1,['wartosc brutto','kwota brutto','brutto','wartosc brutto pln','kwota','gross','gross amount','amount','betrag','wartosc']],
  ['currency','Waluta',0,['waluta','currency','wahrung']],
  ['odometer','Stan licznika',0,['stan licznika','licznik','przebieg','km','odometer','mileage','kilometerstand']],
  ['station','Stacja',0,['stacja','nazwa stacji','miejsce','adres stacji','station','location','tankstelle']],
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
/* Kierowca przy tankowaniu z karty: z wpisu albo z grafiku w tym dniu */
function fcDriver(r, c){
  if (c) return dName(fillDriver(c) || c.driverId) || '';
  const b = S.bookings.find(x => x.vehicleId===r.vehicleId && x.from<=r.txDate && x.to>=r.txDate);
  return b ? crewName(b) : '';
}

/* ---------- widok ---------- */
let fcImportId = '', fcFilter = 'all';
function viewFuelCards(){
  if (!P().manage) return '';
  const imps = S.fuelCardImports.slice().sort((a, b) => (b.periodTo || '').localeCompare(a.periodTo || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const head = `<div class="bar"><h2>Karty paliwowe</h2><div class="tools">${imps.length ? `<select id="fc-imp" style="width:auto" aria-label="Zestawienie">${imps.map(i => `<option value="${esc(i.id)}" ${i.id===(fcImportId || imps[0].id) ? 'selected' : ''}>${esc([i.provider, i.periodFrom ? fdate(i.periodFrom) + '–' + fdate(i.periodTo) : '', i.invoiceNo].filter(Boolean).join(' · '))}</option>`).join('')}</select>` : ''}
    <button class="primary" data-action="fc-import">${ic('plus')}Importuj zestawienie</button></div></div>`;
  if (!imps.length) return head + loadingOr('fuelCardImports', `<div class="panel empty"><h3>Brak zestawień</h3><p>Wgraj plik CSV albo Excel z karty paliwowej (Orlen, UTA lub inny) i fakturę. System weźmie tylko auta z Twojej floty i porówna każde tankowanie z tym, co wpisał kierowca: litry, kwotę i stan licznika.</p><button class="primary" data-action="fc-import">${ic('plus')}Importuj zestawienie</button></div>`);
  const imp = imps.find(i => i.id===fcImportId) || imps[0];
  const rows = S.fuelCardRows.filter(r => r.importId===imp.id);
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
    <div class="fc-meta-act">${imp.invoicePath ? `<a class="btn small" data-file="${esc(imp.invoicePath)}" href="#" target="_blank" rel="noopener">Faktura${imp.invoiceNo ? ' ' + esc(imp.invoiceNo) : ''}</a>` : ''}<button class="small ghost" data-fc-del="${esc(imp.id)}">Usuń zestawienie</button></div></div>`;
  const perV = [...vids].map(vid => { const r = rows.filter(x => x.vehicleId===vid), a = appRows.filter(c => c.vehicleId===vid);
    return {vid, cl: sum(r, x => x.liters), ca: sum(r.filter(x => !x.currency || x.currency==='PLN'), x => x.amount), al: sum(a, c => c.liters), aa: sum(a, c => c.amount)}; })
    .sort((x, y) => Math.abs(y.ca - y.aa) - Math.abs(x.ca - x.aa));
  const vTable = `<div class="panel tablewrap"><table><thead><tr><th>Auto</th><th class="r">Karta</th><th class="r">Kierowcy</th><th class="r">Różnica</th></tr></thead><tbody>${perV.map(x => `<tr><td>${vPlate(x.vid)}</td>
    <td class="r num">${fl(x.cl)}<span class="sub">${fm(x.ca)}</span></td><td class="r num">${fl(x.al)}<span class="sub">${fm(x.aa)}</span></td>
    <td class="r num ${Math.abs(x.ca - x.aa) > 1 ? 'neg' : ''}">${fl(x.cl - x.al)}<span class="sub">${fm(x.ca - x.aa)}</span></td></tr>`).join('')}</tbody></table></div>`;
  const perD = {};
  pairs.forEach(p => { const n = fcDriver(p.row, p.cost) || 'nieustalony'; const x = perD[n] = perD[n] || {cl:0, ca:0, al:0, aa:0, n:0};
    x.n++; x.cl += Number(p.row.liters || 0); if (!p.row.currency || p.row.currency==='PLN') x.ca += Number(p.row.amount || 0);
    if (p.cost){ x.al += Number(p.cost.liters || 0); x.aa += Number(p.cost.amount || 0); } });
  const dTable = `<div class="panel tablewrap"><table><thead><tr><th>Kierowca</th><th class="r">Tankowań</th><th class="r">Karta</th><th class="r">Wpisał</th><th class="r">Różnica</th></tr></thead><tbody>${Object.entries(perD).sort((a, b) => Math.abs(b[1].ca - b[1].aa) - Math.abs(a[1].ca - a[1].aa)).map(([n, x]) => `<tr><td><b>${esc(n)}</b></td><td class="r num">${x.n}</td>
    <td class="r num">${fl(x.cl)}<span class="sub">${fm(x.ca)}</span></td><td class="r num">${fl(x.al)}<span class="sub">${fm(x.aa)}</span></td><td class="r num ${Math.abs(x.ca - x.aa) > 1 ? 'neg' : ''}">${fl(x.cl - x.al)}<span class="sub">${fm(x.ca - x.aa)}</span></td></tr>`).join('')}</tbody></table></div>`;
  const list = fcFilter==='ok' ? ok : fcFilter==='diff' ? dif : fcFilter==='miss' ? miss : fcFilter==='nocard' ? [] : pairs;
  const pairRow = p => { const r = p.row, c = p.cost;
    return `<tr><td class="num"><b>${fdate(r.txDate)}</b>${r.txTime ? `<span class="sub">${esc(r.txTime)}</span>` : ''}</td><td>${vPlate(r.vehicleId)}<span class="sub">${esc(fcDriver(r, c))}</span></td>
      <td class="num">${fl(r.liters)} · <b>${fm(r.amount, r.currency)}</b><span class="sub">${r.odometer ? km(r.odometer) : 'bez licznika'}${r.station ? ' · ' + esc(r.station) : ''}${r.product ? ' · ' + esc(r.product) : ''}</span></td>
      <td class="num ${c ? 'click' : ''}" ${c ? `data-edit="costs" data-id="${esc(c.id)}"` : ''}>${c ? `${fl(c.liters)} · <b>${fm(c.currency && c.currency!=='PLN' ? c.amountOrig : c.amount, c.currency)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'} · ${fdate(c.date)}</span>${photoStrip(c.photos)}` : '<span class="muted">—</span>'}</td>
      <td>${!c ? '<span class="pill bad">brak wpisu</span>' : p.issues.length ? p.issues.map(x => `<span class="pill warn">${esc(x)}</span>`).join(' ') : '<span class="pill ok">zgodne</span>'}</td></tr>`; };
  const ncRow = c => `<tr><td class="num"><b>${fdate(c.date)}</b></td><td>${vPlate(c.vehicleId)}<span class="sub">${esc(dName(fillDriver(c) || c.driverId) || '')}</span></td><td class="muted">nie ma na karcie</td>
      <td class="num click" data-edit="costs" data-id="${esc(c.id)}">${fl(c.liters)} · <b>${fm(c.amount)}</b><span class="sub">${c.odometer ? km(c.odometer) : 'bez licznika'}</span>${photoStrip(c.photos)}</td><td><span class="pill info">bez karty</span></td></tr>`;
  const body = (fcFilter==='nocard' ? noCard.map(ncRow) : list.sort((a, b) => b.row.txDate.localeCompare(a.row.txDate)).map(pairRow).concat(fcFilter==='all' ? noCard.map(ncRow) : [])).join('');
  const table = `<div class="panel tablewrap fc-table"><table><thead><tr><th>Data</th><th>Auto / kierowca</th><th>Karta</th><th>Wpisał kierowca</th><th>Wynik</th></tr></thead><tbody>${body || '<tr><td colspan="5" class="muted">Brak pozycji.</td></tr>'}</tbody></table></div>`;
  return head + meta + tiles + `<div class="grid2 fc-grid"><div class="section">${table}</div><div class="grid2">${vTable}${dTable}</div><div class="section">
    <p class="muted small" style="margin:0">Parujemy tankowanie z karty z wpisem kierowcy tego samego auta (ten sam dzień ±1, litry ±5%). Zgodne: litry ±0,5 l, kwota ±1 zł, licznik ±30 km. Kliknij wpis kierowcy, aby go poprawić.</p></div></div>`;
}
document.addEventListener('change', e => { if (e.target.id==='fc-imp'){ fcImportId = e.target.value; render(); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-fcf],[data-fc-del],[data-action="fc-import"]');
  if (!t || t.closest('#dialog')) return;
  if (t.dataset.fcf){ fcFilter = t.dataset.fcf; render(); return; }
  if (t.dataset.action==='fc-import') return openFcImport();
  if (t.dataset.fcDel){
    if (!t.classList.contains('armed')){ t.classList.add('armed'); t.textContent = 'Na pewno usunąć?'; setTimeout(() => { t.classList.remove('armed'); t.textContent = 'Usuń zestawienie'; }, 4000); return; }
    fcDelete(t.dataset.fcDel);
  }
});
async function fcDelete(id){
  try { const {error} = await sb.from('fuel_card_imports').delete().eq('id', id); if (error) throw dbErr(error);
    fcImportId = ''; await refresh('fuelCardImports'); await refresh('fuelCardRows'); toast('Usunięto zestawienie'); }
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
    <div class="field full"><label for="fc-inv">Faktura (PDF albo zdjęcie)</label><input id="fc-inv" type="file" accept="application/pdf,image/*"></div>
    <div class="field full"><label for="fc-file">Zestawienie transakcji (CSV albo Excel) *</label><input id="fc-file" type="file" accept=".csv,.txt,.xlsx,.xls"></div>
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
function fcGuess(heads){
  const map = {}, hs = heads.map(fcHead);
  FC_FIELDS.forEach(([k, , , syn]) => {
    let i = hs.findIndex((h, j) => syn.includes(h) && !Object.values(map).includes(j));
    if (i < 0) i = hs.findIndex((h, j) => h && syn.some(s => s.length > 3 && h.includes(s)) && !Object.values(map).includes(j));
    if (i >= 0) map[k] = i;
  });
  return map;
}
document.addEventListener('change', async e => {
  if (e.target.id==='fc-file'){
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const box = $('#fc-prev'); box.innerHTML = '<span class="muted">Wczytywanie pliku…</span>';
    try {
      const aoa = (await fcReadFile(f)).filter(r => r.some(c => String(c).trim()!==''));
      // wiersz nagłówków: pierwszy z co najmniej 2 rozpoznanymi kolumnami (zestawienia mają czasem tytuł nad tabelą)
      let hi = aoa.slice(0, 20).findIndex(r => Object.keys(fcGuess(r)).length >= 2); if (hi < 0) hi = 0;
      const heads = aoa[hi].map((h, i) => String(h).trim() || 'Kolumna ' + (i + 1));
      const sig = heads.map(fcHead).join('|');
      const saved = (fcSettings().maps || {})[sig];
      fcParsed = {name: f.name, heads, sig, data: aoa.slice(hi + 1), map: saved ? {...saved} : fcGuess(heads)};
      fcRenderMap();
    } catch(err){ box.innerHTML = '<span class="warnline">Nie udało się odczytać pliku. Zapisz go jako CSV albo .xlsx i spróbuj ponownie.</span>'; fcParsed = null; }
  }
  if (e.target.matches && e.target.matches('[data-fcmap]') && fcParsed){ const v = e.target.value; if (v==='') delete fcParsed.map[e.target.dataset.fcmap]; else fcParsed.map[e.target.dataset.fcmap] = Number(v); fcRenderMap(); }
  if (e.target.matches && e.target.matches('[data-fcprod]') && fcParsed){ fcParsed.prodOff = fcParsed.prodOff || new Set(); e.target.checked ? fcParsed.prodOff.delete(e.target.value) : fcParsed.prodOff.add(e.target.value); fcRenderMap(true); }
});
function fcRows(){
  const P_ = fcParsed, m = P_.map, vByPlate = new Map(S.vehicles.map(v => [normPlate(v.plate), v]));
  const g = (r, k) => m[k]!=null ? r[m[k]] : '';
  const all = [], foreign = new Set();
  P_.data.forEach(r => {
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
  const opts = sel => `<option value="">— brak —</option>` + P_.heads.map((h, i) => `<option value="${i}" ${sel===i ? 'selected' : ''}>${esc(h)}</option>`).join('');
  const maps = `<div class="fc-map">${FC_FIELDS.map(([k, l, req]) => `<label><span class="label">${l}${req ? ' *' : ''}</span><select data-fcmap="${k}">${opts(P_.map[k])}</select></label>`).join('')}</div>`;
  const miss = FC_FIELDS.filter(([k, , req]) => req && P_.map[k]==null).map(x => x[1]);
  let sum = '';
  if (!miss.length){
    const {all, foreign} = fcRows();
    const prods = P_.map.product!=null ? [...new Set(all.map(r => r.product).filter(Boolean))] : [];
    if (!P_.prodOff){ P_.prodOff = new Set(prods.filter(p => !FUEL_LIKE.test(p))); }
    const ours = all.filter(r => r.vehicle && !(r.product && P_.prodOff.has(r.product)));
    const ds = ours.map(r => r.txDate).sort();
    P_.ours = ours;
    sum = `<div class="imp-sum"><span class="pill ok">${ours.length} tankowań naszych aut</span><span class="pill off">${foreign.size} innych tablic – pominięte</span>${ds.length ? `<span class="pill info">${fdate(ds[0])} – ${fdate(ds[ds.length - 1])}</span>` : ''}</div>
      ${prods.length > 1 ? `<div class="fc-prods"><span class="label">Produkty do porównania</span>${prods.map(p => `<label class="check"><input type="checkbox" data-fcprod value="${esc(p)}" ${P_.prodOff.has(p) ? '' : 'checked'}> ${esc(p)}</label>`).join('')}</div>` : ''}
      <div class="tablewrap imp-table"><table><thead><tr><th>Data</th><th>Auto</th><th class="r">Litry</th><th class="r">Kwota</th><th class="r">Licznik</th></tr></thead><tbody>
      ${ours.slice(0, 8).map(r => `<tr><td class="num">${fdate(r.txDate)} ${esc(r.txTime || '')}</td><td>${plate(r.vehicle.plate)}</td><td class="r num">${fl(r.liters)}</td><td class="r num">${fm(r.amount, r.currency)}</td><td class="r num">${r.odometer ? km(r.odometer) : '—'}</td></tr>`).join('')}
      </tbody></table></div>${ours.length > 8 ? `<span class="sub muted">…i ${ours.length - 8} kolejnych</span>` : ''}`;
  } else { P_.ours = []; sum = `<span class="warnline">Wskaż kolumny: ${esc(miss.join(', '))}.</span>`; }
  const y = $('#dlg-body').scrollTop;
  box.innerHTML = `<span class="label">Kolumny w pliku – sprawdź dopasowanie (zapamiętamy je dla tego układu pliku)</span>${maps}${sum}`;
  if (keepScroll) $('#dlg-body').scrollTop = y;
}
async function fcSave(){
  const warn = msg => { const w = $('#dlg-warn'); w.textContent = msg; w.hidden = false; };
  if (!fcParsed) return warn('Wybierz plik z zestawieniem transakcji.');
  if (FC_FIELDS.some(([k, , req]) => req && fcParsed.map[k]==null)) return warn('Wskaż wszystkie wymagane kolumny.');
  const ours = fcParsed.ours || [];
  if (!ours.length) return warn('W pliku nie ma tankowań aut z systemu.');
  const exist = new Set(S.fuelCardRows.map(r => [r.vehicleId, r.txDate, r.txTime || '', Number(r.liters), Number(r.amount)].join('|')));
  const fresh = ours.filter(r => !exist.has([r.vehicle.id, r.txDate, r.txTime || '', Number(r.liters), Number(r.amount)].join('|')));
  if (!fresh.length) return warn('Wszystkie te tankowania są już zaimportowane.');
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const prov = $('#fc-prov').value.trim(), invNo = $('#fc-invno').value.trim();
    const inv = ($('#fc-inv').files || [])[0];
    let invoicePath = null;
    if (inv){ if (!assetsNS) throw {code:'upload', message:'Wgrywanie plików niedostępne'}; invoicePath = (await assetsNS.upload(inv, {type: inv.type})).id; }
    const ds = fresh.map(r => r.txDate).sort();
    const id = crypto.randomUUID();
    let {error} = await sb.from('fuel_card_imports').insert({id, provider: prov || null, invoice_no: invNo || null, invoice_path: invoicePath, file_name: fcParsed.name,
      period_from: ds[0], period_to: ds[ds.length - 1], rows_total: fcParsed.data.length, rows_ours: fresh.length});
    if (error) throw dbErr(error);
    const rows = fresh.map(r => ({import_id: id, vehicle_id: r.vehicle.id, plate: r.plate, tx_date: r.txDate, tx_time: r.txTime, liters: r.liters, amount: r.amount,
      currency: r.currency, odometer: r.odometer, station: r.station, card_no: r.card, product: r.product}));
    for (let i = 0; i < rows.length; i += 500){ ({error} = await sb.from('fuel_card_rows').insert(rows.slice(i, i + 500))); if (error) throw dbErr(error); }
    const st = fcSettings();
    await db.collection('settings').doc('fuelcard').set({provider: prov || st.provider || '', maps: {...(st.maps || {}), [fcParsed.sig]: fcParsed.map}});
    await refresh('fuelCardImports'); await refresh('fuelCardRows');
    fcImportId = id; fcFilter = 'all';
    closeForm();
    toast(`Zaimportowano ${fresh.length} ${isPlural(fresh.length,'tankowanie','tankowania','tankowań')}${ours.length > fresh.length ? ` · ${ours.length - fresh.length} już było` : ''}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
