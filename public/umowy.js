/* Emage FLEET — leasing, najem i finansowanie aut (Koszty → Leasing i umowy).
   Dane: tabela vehicle_contracts (migracja 029). Prognoza km na koniec umowy z tempa jazdy (liczniki z ostatnich 90 dni),
   koszt nadprzebiegu, przypomnienie o końcu umowy (90 / 30 dni), rata w Rozliczeniu aut. */
'use strict';
const CONTRACT_KINDS = {leasing:'Leasing', najem:'Najem długoterminowy', kredyt:'Kredyt', wlasne:'Własne (bez umowy)'};
const contractsOn = () => typeof optOn==='function' && optOn('contracts') && (P().manage || P().service);
const canContracts = () => canWrite && P().contracts==='rw';
const monthsBetween = (a, b) => (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) + (Number(b.slice(8, 10)) >= Number(a.slice(8, 10)) ? 0 : -1);
/* aktywna umowa auta w dniu d (domyślnie dziś) */
const contractOf = (vid, d = today()) => S.contracts.filter(c => c.vehicleId===vid && (!c.startDate || c.startDate <= d) && (!c.endDate || c.endDate >= d))
  .sort((a, b) => (b.startDate || '').localeCompare(a.startDate || ''))[0] || null;
const monthlyOf = c => Number(c.monthlyGross || c.monthlyNet || 0);   // w walucie umowy
/* ---- waluta umowy: przeliczenie na złote po średnim kursie NBP ----
   Miesiąc m liczymy po kursie z jego ostatniego dnia roboczego (bieżący i przyszłe – najnowszy kurs).
   Kursy pobieramy w tle (rpc nbp_rate, pamiętane w bazie); do czasu pobrania – najbliższy znany kurs. */
const ctCur = c => c && c.currency && c.currency!=='PLN' ? c.currency : 'PLN';
const ctFx = {rates: {}, asked: new Set(), queue: new Set(), t: null};
const ctFxDay = m => { const t = today(); if (!m || m >= t.slice(0, 7)) return t; const d = new Date(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0); return isoOf(d); };
function ctFxLoad(){
  const keys = [...ctFx.queue]; ctFx.queue.clear(); if (!keys.length || typeof sb==='undefined' || !sb) return;
  Promise.all(keys.map(async k => { const [cur, d] = k.split('|');
    try { const {data} = await sb.rpc('nbp_rate', {cur, d}); const r = (data || [])[0]; if (r && Number(r.rate) > 0) ctFx.rates[k] = {rate: Number(r.rate), date: r.eff_date || r.date || d}; } catch(_){} }))
    .then(() => { if (keys.some(k => ctFx.rates[k])) render(); });
}
/* kurs zł za 1 jednostkę waluty umowy na dzień d (null – jeszcze nie znamy żadnego) */
function ctRate(cur, d){
  if (!cur || cur==='PLN') return {rate: 1};
  const k = cur + '|' + d;
  if (ctFx.rates[k]) return ctFx.rates[k];
  if (!ctFx.asked.has(k)){ ctFx.asked.add(k); ctFx.queue.add(k); clearTimeout(ctFx.t); ctFx.t = setTimeout(ctFxLoad, 30); }
  const near = Object.entries(ctFx.rates).filter(([x]) => x.startsWith(cur + '|')).sort((a, b) => Math.abs(new Date(a[0].slice(4)) - new Date(d)) - Math.abs(new Date(b[0].slice(4)) - new Date(d)))[0];
  return near ? {...near[1], approx: true} : null;
}
/* kwota umowy w złotych w miesiącu m (domyślnie bieżący) */
const ctPln = (c, amt, m) => { const r = ctRate(ctCur(c), ctFxDay(m)); return r ? Number(amt || 0) * r.rate : 0; };
const monthlyPln = (c, m) => ctPln(c, monthlyOf(c), m);
/* kwota w walucie umowy, a obok – w złotych */
const ctMoney = (c, amt, m) => { const cur = ctCur(c); if (cur==='PLN') return zl(amt);
  const r = ctRate(cur, ctFxDay(m)), f = new Intl.NumberFormat('pl-PL', {style: 'currency', currency: cur}).format(Number(amt));
  return r ? `${f} <span class="muted">≈ ${zl(Number(amt) * r.rate)}</span>` : f; };
/* tempo jazdy: km / miesiąc z liczników z ostatnich 90 dni (min. 30 dni odczytów), inaczej z całej umowy */
function kmPace(c){
  const v = byId('vehicles', c.vehicleId) || {}, t = today();
  if (typeof odoRange==='function'){ const o = odoRange(c.vehicleId, addDays(t, -90), t);
    if (o.km && o.first && o.last){ const span = diffDays(o.first.d.slice(0, 10), o.last.d.slice(0, 10)); if (span >= 30) return o.km / span * 30; } }
  if (c.startDate && c.kmStart!=null && v.km){ const m = Math.max(1, monthsBetween(c.startDate, t)); return (Number(v.km) - Number(c.kmStart)) / m; }
  return null;
}
function contractInfo(c){
  const v = byId('vehicles', c.vehicleId) || {}, t = today();
  const left = c.endDate ? diffDays(t, c.endDate) : null;
  const used = c.kmStart!=null && v.km ? Number(v.km) - Number(c.kmStart) : null;
  const pace = kmPace(c), mLeft = c.endDate ? Math.max(0, monthsBetween(t, c.endDate)) + (left > 0 ? 1 : 0) : null;
  const forecast = used!=null && pace!=null && mLeft!=null ? used + pace * mLeft : null;
  const over = c.kmLimit && forecast!=null ? forecast - Number(c.kmLimit) : null;
  const overCost = over > 0 && c.kmExcessRate ? over * Number(c.kmExcessRate) : null;
  const total = c.startDate && c.endDate ? Math.max(1, monthsBetween(c.startDate, c.endDate) + 1) : null;
  const allowedNow = c.kmLimit && total && c.startDate ? c.kmLimit * Math.min(1, Math.max(0, monthsBetween(c.startDate, t) + 1) / total) : null;
  const warn = [];
  if (left!=null && left < 0) warn.push(['bad', 'umowa po terminie']);
  else if (left!=null && left <= 30) warn.push(['bad', `koniec za ${left} dni`]);
  else if (left!=null && left <= 90) warn.push(['warn', `koniec za ${left} dni`]);
  if (c.kmLimit && used!=null && used > c.kmLimit) warn.push(['bad', 'limit km przekroczony']);
  else if (over > 0) warn.push(['warn', `prognoza +${new Intl.NumberFormat('pl-PL').format(Math.round(over))} km ponad limit`]);
  return {v, left, used, pace, forecast, over, overCost, allowedNow, warn};
}
function contractProblems(){ return S.contracts.map(c => ({c, i: contractInfo(c)})).filter(x => x.i.v.status!=='wycofany' && x.i.warn.length && (!x.c.endDate || x.i.left >= -60)); }
let ctFilter = 'all';
function viewContracts(){
  if (!contractsOn()) return `<div class="bar"><h2>Leasing i umowy</h2></div><div class="panel empty"><h3>Moduł czeka na bazę</h3><p>Uruchom w Supabase migrację <b>029_umowy.sql</b>.</p></div>`;
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const act = vs.map(v => contractOf(v.id)).filter(Boolean), none = vs.filter(v => !S.contracts.some(c => c.vehicleId===v.id));
  const probs = contractProblems(), ending = probs.filter(x => x.i.warn.some(([, t]) => t.startsWith('koniec') || t.startsWith('umowa'))), km = probs.filter(x => x.i.warn.some(([, t]) => t.includes('km')));
  const rate = act.reduce((s, c) => s + monthlyPln(c), 0);
  const tile = (k, n, l, cls) => `<button class="fc-tile ${cls} ${ctFilter===k ? 'on' : ''}" data-ctf="${k}"><b>${n}</b><span>${l}</span></button>`;
  let list = S.contracts.slice();
  if (ctFilter==='end') list = ending.map(x => x.c); else if (ctFilter==='km') list = km.map(x => x.c); else if (ctFilter==='act') list = act;
  list.sort((a, b) => (a.endDate || '9999').localeCompare(b.endDate || '9999'));
  const row = c => { const i = contractInfo(c), v = i.v;
    return `<tr class="${canContracts() ? 'click' : ''}" ${canContracts() ? `data-edit="contracts" data-id="${esc(c.id)}"` : ''}><td>${plate(v.plate || '?')}<span class="sub">${esc([v.make, v.model].filter(Boolean).join(' '))}</span></td>
      <td data-l="Umowa"><b>${esc(CONTRACT_KINDS[c.kind] || c.kind)}</b><span class="sub">${esc([c.provider, c.contractNo].filter(Boolean).join(' · ') || '—')}</span></td>
      <td class="num" data-l="Okres">${c.startDate ? fdate(c.startDate) : '?'} – ${c.endDate ? fdate(c.endDate) : '?'}<span class="sub">${i.left==null ? '' : i.left < 0 ? 'zakończona' : `zostało ${i.left} dni`}</span></td>
      <td class="r num" data-l="Rata">${c.monthlyNet ? ctMoney(c, c.monthlyNet) + ' netto' : ''}${c.monthlyGross ? `<span class="sub">${ctMoney(c, c.monthlyGross)} brutto</span>` : ''}${ctCur(c)!=='PLN' && (c.monthlyNet || c.monthlyGross) ? `<span class="sub">kurs NBP ${(r => r ? String(r.rate).replace('.', ',') + (r.date ? ' z ' + fdate(r.date) : '') : '…')(ctRate(ctCur(c), today()))}</span>` : ''}${!c.monthlyNet && !c.monthlyGross ? '<span class="muted">—</span>' : ''}</td>
      <td class="r num" data-l="Kilometry">${c.kmLimit ? `${i.used!=null ? nf(i.used) : '?'} / ${nf(c.kmLimit)} km<span class="sub">${i.allowedNow ? 'na dziś wolno ' + nf(i.allowedNow) : ''}${i.pace ? ' · ' + nf(i.pace) + ' km/mies.' : ''}</span>` : '<span class="muted">bez limitu</span>'}</td>
      <td class="r num" data-l="Prognoza na koniec">${i.forecast!=null && c.kmLimit ? `${nf(i.forecast)} km${i.over > 0 ? `<span class="sub neg">+${nf(i.over)} km${i.overCost ? ' ≈ ' + ctMoney(c, i.overCost) : ''}</span>` : '<span class="sub pos">w limicie</span>'}` : '<span class="muted">—</span>'}</td>
      <td>${i.warn.map(([cl, t]) => `<span class="pill ${cl}">${esc(t)}</span>`).join(' ') || '<span class="pill ok">w porządku</span>'}${c.insuranceIn || c.serviceIn ? `<span class="sub">w racie: ${[c.insuranceIn ? 'ubezpieczenie' : '', c.serviceIn ? 'serwis' : ''].filter(Boolean).join(', ')}</span>` : ''}</td></tr>`; };
  return `<div class="bar"><h2>Leasing i umowy</h2><div class="tools">${canContracts() ? `<button class="primary" data-new="contracts">${ic('plus')}Umowa auta</button>` : ''}</div></div>
    <div class="fc-tiles">${tile('all', S.contracts.length, 'umów', '')}${tile('act', act.length, 'aktywnych', 'info')}${tile('end', ending.length, 'kończy się ≤ 90 dni', ending.length ? 'warn' : 'ok')}${tile('km', km.length, 'limit km zagrożony', km.length ? 'bad' : 'ok')}<div class="fc-tile"><b>${zl(rate)}</b><span>raty miesięcznie</span></div>${none.length ? `<div class="fc-tile"><b>${none.length}</b><span>aut bez umowy w systemie</span></div>` : ''}</div>
    <div class="panel tablewrap"><table class="ct-tbl"><thead><tr><th>Auto</th><th>Umowa</th><th>Okres</th><th class="r">Rata</th><th class="r">Kilometry</th><th class="r">Prognoza na koniec</th><th>Stan</th></tr></thead><tbody>
      ${list.map(row).join('') || `<tr><td colspan="7" class="muted">${S.contracts.length ? 'Brak umów dla tego filtra.' : 'Dodaj pierwszą umowę – rata wejdzie do rozliczenia aut, a system przypomni o końcu umowy i limicie km.'}</td></tr>`}
    </tbody></table></div>
    <p class="muted small" style="margin:0;max-width:90ch">Kilometry: przebieg auta minus przebieg na początku umowy. Prognoza: tempo z liczników z ostatnich 90 dni × miesiące do końca. Umowy w EUR przeliczamy na złote po średnim kursie NBP (dla każdego miesiąca – z jego ostatniego dnia roboczego). W Rozliczeniu aut rata (brutto, a gdy brak – netto) liczy się w „Ubezp. i leasing”, jeśli w danym miesiącu nie ma ręcznie wpisanego kosztu „Leasing” dla tego auta.</p>`;
}
/* rata do rozliczenia miesiąca: aktywna w danym miesiącu umowa, gdy brak ręcznego kosztu „Leasing” */
function contractMonthCost(vid, from, to, own){
  if (!(typeof optOn==='function' && optOn('contracts'))) return 0;
  if (own.some(c => c.category==='Leasing')) return 0;
  const c = S.contracts.find(x => x.vehicleId===vid && x.kind!=='wlasne' && (!x.startDate || x.startDate <= to) && (!x.endDate || x.endDate >= from));
  return c ? monthlyPln(c, to.slice(0, 7)) : 0;
}
function contractFact(v){
  if (!contractsOn()) return null;
  const c = contractOf(v.id) || S.contracts.filter(x => x.vehicleId===v.id).sort((a, b) => (b.endDate || '').localeCompare(a.endDate || ''))[0];
  if (!c) return null;
  const i = contractInfo(c);
  return `${esc(CONTRACT_KINDS[c.kind] || c.kind)}${c.provider ? ' · ' + esc(c.provider) : ''}${c.endDate ? ` do ${fdate(c.endDate)}` : ''}${monthlyOf(c) ? ` · ${ctMoney(c, monthlyOf(c))}/mies.` : ''}${i.warn.map(([cl, t]) => ` <span class="pill ${cl}">${esc(t)}</span>`).join('')}`;
}
document.addEventListener('click', e => { const f = e.target.closest('[data-ctf]'); if (f){ ctFilter = f.dataset.ctf===ctFilter ? 'all' : f.dataset.ctf; render(); } });
