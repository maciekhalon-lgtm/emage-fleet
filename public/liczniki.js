/* Emage FLEET — liczniki „z czapy” (tylko kierownik floty) i alarm spalania (możliwa kradzież paliwa).
   Liczniki: z kart paliwowych, z tankowań i z przejęć / zdań aut. Zły licznik:
   – zmyślony: poniżej 1000 km albo z samych jednakowych cyfr (1, 444, 555555),
   – nie pasuje do sąsiednich (literówka, brak cyfry, cofnięty, nierealny skok > 1500 km na dobę).
   „Sprawdzone” zapisuje się w ustawieniach (settings: odo_checked).
   Gdy auto ma lokalizator GPS: licznik spoza przedziału [GPS koniec dnia poprzedniego, GPS koniec tego dnia] ± 100 km = „niezgodny z GPS”.
   Zmyślone nie liczą się do „Do sprawdzenia” – mają własny filtr; do sprawdzenia zostają literówki i cofnięte liczniki. */
'use strict';
const THEFT_RATE = 13;   // l/100 km – powyżej: podejrzane spalanie, możliwa kradzież paliwa
let odoFilter = 'todo', odoVeh = '', odoMonth = '';
/* Zmyślone liczniki (1, 444, 555555…) nie wymagają sprawdzania – poprawić się ich nie da; liczą się osobno */
const odoIsFake = x => x.kind==='zmyślony';
const odoChecked = () => new Set(((S.settings.find(x => x.id==='odo_checked') || {}).ids) || []);

/* Wszystkie złe liczniki floty: [{key, d, t, vid, src, who, odo, kind, lo, hi}] */
let odoMemo = {key: '', list: []};
function badOdometers(){
  const key = S.fuelCardRows.length + '|' + S.costs.length + '|' + S.bookings.length + '|' + (S.gpsOdometer || []).length;
  if (odoMemo.key===key) return odoMemo.list;
  const card2cost = new Map();
  fcCompare(S.fuelCardRows.filter(r => r.kind!=='other')).pairs.forEach(p => { if (p.cost) card2cost.set(p.row.id, p.cost); });
  const out = [];
  S.vehicles.forEach(v => {
    const xs = [];
    S.fuelCardRows.forEach(r => { if (r.vehicleId===v.id && r.kind!=='other' && r.odometer!=null) xs.push({key:'k' + r.id, d: r.txDate, t: r.txTime || '', odo: Number(r.odometer), src:'karta (stacja)' + (r.station ? ' · ' + r.station : ''), who: fcDriver(r, card2cost.get(r.id)), edit: null, cardRow: r.id}); });
    appFuel().forEach(c => { if (c.vehicleId===v.id && c.odometer!=null) xs.push({key:'c' + c.id, d: c.date, t: '', odo: Number(c.odometer), src:'tankowanie w aplikacji', who: dName(fillDriver(c) || c.driverId) || '', edit: c.id}); });
    S.bookings.forEach(b => {
      if (b.vehicleId!==v.id) return;
      if (b.pickup && b.pickup.km!=null) xs.push({key:'p' + b.id, d: b.pickup.at, t: '', odo: Number(b.pickup.km), src:'przejęcie auta', who: crewName(b), edit: null});
      if (b.returned && b.returned.km!=null) xs.push({key:'z' + b.id, d: b.returned.at, t: '', odo: Number(b.returned.km), src:'zdanie auta', who: crewName(b), edit: null});
    });
    const all = xs.filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d) || (a.t || '').localeCompare(b.t || '') || a.odo - b.odo);
    const real = all.filter(x => !fakeOdo(x.odo));
    const seg = odoSegments(real, (a, b) => b.odo - a.odo >= 0 && b.odo - a.odo <= 1500 * (Math.max(0, diffDays(a.d, b.d)) + 1));
    const alive = seg.alive.map(i => real[i]), badSet = new Set(seg.bad.map(i => real[i]));
    const near = x => { let lo = null, hi = null; for (const y of alive){ if (y.d < x.d || (y.d===x.d && y.odo <= x.odo && y!==x)) lo = y; else if (y.d > x.d && !hi){ hi = y; break; } } return {lo, hi}; };
    const gps = new Map((S.gpsOdometer || []).filter(g => g.vehicleId===v.id && Number(g.km) >= 50).map(g => [g.day, Number(g.km)]));
    all.forEach(x => {
      // licznik z dnia D musi się mieścić między GPS z końca dnia D-1 a GPS z końca dnia D (± 100 km tolerancji)
      const fake = fakeOdo(x.odo), dd = String(x.d).slice(0, 10), gLo = gps.get(addDays(dd, -1)), gHi = gps.get(dd);
      if (!fake && gLo!=null && gHi!=null && gHi >= gLo && (x.odo < gLo - 100 || x.odo > gHi + 100)){ out.push({...x, vid: v.id, kind: 'niezgodny z GPS', lo: Math.round(gLo), hi: Math.round(gHi)}); return; }
      if (!fake && !badSet.has(x)) return;
      const {lo, hi} = near(x);
      const kind = fake ? 'zmyślony' : lo && x.odo < lo.odo ? 'cofnięty / za mały' : hi && x.odo > hi.odo ? 'za duży (literówka?)' : 'nierealny skok';
      out.push({...x, vid: v.id, kind, lo: lo ? lo.odo : null, hi: hi ? hi.odo : null});
    });
  });
  out.sort((a, b) => (b.d + b.t).localeCompare(a.d + a.t));
  odoMemo = {key, list: out};
  return out;
}
const odoTodoCount = () => { if (!P().manage) return 0; const ch = odoChecked(); return badOdometers().filter(x => !ch.has(x.key) && !odoIsFake(x)).length; };

function viewOdometers(){
  if (!P().manage) return '';
  const ch = odoChecked(), all = badOdometers();
  const nf = n => new Intl.NumberFormat('pl-PL').format(n);
  const byF = {todo: all.filter(x => !ch.has(x.key) && !odoIsFake(x)), fake: all.filter(x => !ch.has(x.key) && odoIsFake(x)), done: all.filter(x => ch.has(x.key)), all};
  const inScope = x => (!odoVeh || x.vid===odoVeh) && (!odoMonth || String(x.d).slice(0, 7)===odoMonth);
  const list = byF[odoFilter].filter(inScope);
  const months = [...new Set(all.map(x => String(x.d).slice(0, 7)))].sort().reverse();
  const vs = [...new Set(all.map(x => x.vid))].map(id => byId('vehicles', id)).filter(Boolean).sort((a, b) => String(a.plate).localeCompare(b.plate));
  const head = `<div class="bar"><h2>Liczniki do sprawdzenia</h2><div class="tools"><select id="odo-veh" style="width:auto" aria-label="Auto"><option value="">Wszystkie auta</option>${vs.map(v => `<option value="${esc(v.id)}" ${v.id===odoVeh ? 'selected' : ''}>${esc(v.plate)} (${all.filter(x => x.vid===v.id && !ch.has(x.key)).length})</option>`).join('')}</select>
<select id="odo-month" style="width:auto" aria-label="Miesiąc"><option value="">Wszystkie miesiące</option>${months.map(m => `<option value="${m}" ${m===odoMonth ? 'selected' : ''}>${esc(monthName(m))}</option>`).join('')}</select>
    ${odoFilter!=='done' && list.length ? `<button class="small" data-odo-all>Oznacz widoczne (${list.length}) jako sprawdzone</button>` : ''}</div></div>
    <div class="pb-quick">${[['todo','Do sprawdzenia'], ['fake','Zmyślone (1, 555555…)'], ['done','Sprawdzone'], ['all','Wszystkie']].map(([k, l]) => `<button class="small ${odoFilter===k ? 'primary' : ''}" data-odof="${k}">${l} <span class="count ${k==='todo' && byF.todo.length ? 'bad' : ''}">${byF[k].length}</span></button>`).join('')}</div>`;
  const kinds = {}; byF.todo.forEach(x => { kinds[x.kind] = (kinds[x.kind] || 0) + 1; });
  const perVeh = {}; byF.todo.forEach(x => { perVeh[x.vid] = (perVeh[x.vid] || 0) + 1; });
  const worst = Object.entries(perVeh).sort((a, b) => b[1] - a[1]).slice(0, 3);
  const meta = `<div class="panel fc-meta"><div><span class="label">Do sprawdzenia</span><b>${byF.todo.length}</b></div><div><span class="label">Zmyślone – pominięte</span><b>${byF.fake.length}</b></div>
    ${Object.entries(kinds).map(([k, n]) => `<div><span class="label">${esc(k)}</span><b>${n}</b></div>`).join('')}
    ${worst.length ? `<div><span class="label">Najwięcej</span><b>${worst.map(([v, n]) => esc((byId('vehicles', v) || {}).plate || '') + ' (' + n + ')').join(', ')}</b></div>` : ''}</div>`;
  const rows = list.slice(0, 400).map(x => `<tr><td class="num"><b>${fdate(x.d)}</b>${x.t ? `<span class="sub">${esc(x.t)}</span>` : ''}</td><td>${vPlate(x.vid)}</td>
      <td>${esc(x.who || '') || '<span class="muted">nieustalony</span>'}<span class="sub">${esc(x.src)}</span></td>
      <td class="r num ${x.edit ? 'click' : ''}" ${x.edit ? `data-edit="costs" data-id="${esc(x.edit)}" title="Popraw wpis"` : ''}><b class="neg">${nf(x.odo)} km</b></td>
      <td class="r num muted">${x.lo!=null || x.hi!=null ? `${x.lo!=null ? nf(x.lo) : '?'} – ${x.hi!=null ? nf(x.hi) : '?'} km` : '—'}</td>
      <td><span class="pill ${x.kind==='zmyślony' ? 'bad' : 'warn'}">${esc(x.kind)}</span></td>
      <td class="odo-act">${x.cardRow ? `<button class="small" data-odo-fix="${esc(x.key)}">Popraw</button>` : ''}${ch.has(x.key) ? `<button class="small ghost" data-odo-un="${esc(x.key)}">Cofnij</button>` : `<button class="small ghost" data-odo-ok="${esc(x.key)}">Sprawdzone</button>`}</td></tr>`).join('');
  return head + meta + `<div class="panel tablewrap fc-table"><table><thead><tr><th>Data</th><th>Auto</th><th>Kto / skąd</th><th class="r">Wpisany licznik</th><th class="r">Powinien być ok.</th><th>Rodzaj</th><th></th></tr></thead>
    <tbody>${rows || `<tr><td colspan="7" class="muted">${odoFilter==='todo' ? 'Nic do sprawdzenia.' : 'Brak pozycji.'}</td></tr>`}</tbody></table></div>
    ${list.length > 400 ? `<p class="muted small">Pokazano 400 najnowszych z ${list.length}.</p>` : ''}
    <p class="muted small" style="margin:0">Zły licznik: zmyślony (poniżej 1000 km albo z samych jednakowych cyfr: 1, 444, 555555) albo niepasujący do sąsiednich (literówka, cofnięty, skok ponad 1500 km na dobę). „Powinien być ok.” – między poprzednim a następnym dobrym licznikiem tego auta. Złe liczniki nie psują spalania ani przebiegów – są pomijane. Kierowca z wpisu w aplikacji, a dla karty – z grafiku. Licznik z karty poprawisz przyciskiem „Popraw” (z podpowiedzią), wpisany w aplikacji – klikając w niego. Od teraz kierowca w aplikacji nie wpisze zmyślonego ani cofniętego licznika.</p>`;
}
async function odoMark(keys, on){
  const set = odoChecked(); keys.forEach(k => on ? set.add(k) : set.delete(k));
  try { await db.collection('settings').doc('odo_checked').set({ids: [...set]}); toast(on ? `Oznaczono jako sprawdzone: ${keys.length}` : 'Cofnięto'); }
  catch(err){ handleWriteErr(err); }
}
document.addEventListener('change', e => { if (e.target.id==='odo-veh'){ odoVeh = e.target.value; render(); } if (e.target.id==='odo-month'){ odoMonth = e.target.value; render(); } });
document.addEventListener('click', e => {
  const t = e.target.closest('[data-odof],[data-odo-ok],[data-odo-un],[data-odo-all],[data-odo-fix]'); if (!t || t.closest('#dialog')) return;
  if (t.dataset.odoFix) return openOdoFix(t.dataset.odoFix);
  if (t.dataset.odof){ odoFilter = t.dataset.odof; render(); return; }
  if (t.dataset.odoOk) return odoMark([t.dataset.odoOk], true);
  if (t.dataset.odoUn) return odoMark([t.dataset.odoUn], false);
  if (t.dataset.odoAll!==undefined){ const ch = odoChecked();
    const keys = badOdometers().filter(x => !ch.has(x.key) && (odoFilter==='fake' ? odoIsFake(x) : odoFilter==='todo' ? !odoIsFake(x) : true) && (!odoVeh || x.vid===odoVeh) && (!odoMonth || String(x.d).slice(0, 7)===odoMonth)).map(x => x.key);
    if (keys.length) odoMark(keys, true); }
});

/* ---------- walidacja licznika wpisywanego przez kierowcę ---------- */
/* Zwraca błąd (nie da się zapisać) albo ostrzeżenie {soft} o dużym skoku. last – ostatni prawdziwy licznik auta. */
function odoInputCheck(odo, last){
  const n = Math.round(Number(odo)), nf = x => new Intl.NumberFormat('pl-PL').format(x);
  if (!(n > 0)) return {hard: 'Wpisz stan licznika.'};
  if (last >= 1000 && n < 1000) return {hard: `Wpisz pełny stan licznika z deski rozdzielczej (ostatni zapis: ${nf(last)} km).`};
  if (/^(\d)\1+$/.test(String(n)) && !(n >= last && n - last <= 2000)) return {hard: `Licznik ${nf(n)} km wygląda na wpisany „z głowy”. Wpisz prawdziwy stan z deski rozdzielczej (ostatni zapis: ${nf(last)} km).`};
  if (last && n < last) return {hard: `Stan licznika ${nf(n)} km jest niższy niż ostatni zapis (${nf(last)} km). Sprawdź licznik.`};
  if (last && n - last > 2000) return {soft: `To ${nf(n - last)} km więcej niż ostatni zapis (${nf(last)} km). Jeśli to prawda, kliknij jeszcze raz „Zapisz”.`};
  return null;
}

/* ---------- alarm spalania ---------- */
const theftRate = c => c && c.rate!=null && !c.unsure && c.rate > THEFT_RATE;
function theftVehicles(){
  if (!P().manage || typeof fleetConsumption!=='function') return [];
  return S.vehicles.filter(v => v.status!=='wycofany').map(v => ({v, c: fleetConsumption(v.id)})).filter(x => theftRate(x.c)).sort((a, b) => b.c.rate - a.c.rate);
}

/* Ostatni wiarygodny licznik auta do dnia `date` (bez zmyślonych i niepasujących) – do sprawdzania nowego wpisu */
function lastRealKm(vid, date, selfId){
  const xs = [];
  appFuel().forEach(c => { if (c.vehicleId===vid && c.id!==selfId && c.date <= date && !fakeOdo(c.odometer)) xs.push({d: c.date, odo: Number(c.odometer)}); });
  S.bookings.forEach(b => { if (b.vehicleId!==vid) return;
    if (b.pickup && b.pickup.at <= date && !fakeOdo(b.pickup.km)) xs.push({d: b.pickup.at, odo: Number(b.pickup.km)});
    if (b.returned && b.returned.at <= date && !fakeOdo(b.returned.km)) xs.push({d: b.returned.at, odo: Number(b.returned.km)}); });
  (S.fuelCardRows || []).forEach(r => { if (r.vehicleId===vid && r.kind!=='other' && r.txDate <= date && !fakeOdo(r.odometer)) xs.push({d: r.txDate, odo: Number(r.odometer)}); });
  if (!xs.length){ const v = byId('vehicles', vid); return v && v.km ? Number(v.km) : 0; }
  xs.sort((a, b) => a.d.localeCompare(b.d) || a.odo - b.odo);
  const seg = odoSegments(xs, (a, b) => b.odo - a.odo >= 0 && b.odo - a.odo <= 1500 * (Math.max(0, diffDays(a.d, b.d)) + 1));
  return seg.alive.length ? xs[seg.alive[seg.alive.length - 1]].odo : 0;
}

/* ---------- poprawa licznika z karty ---------- */
/* Podpowiedź: wariant wpisanego licznika (bez jednej cyfry, z zamienionymi sąsiednimi cyframi, z dopisaną albo zmienioną cyfrą)
   mieszczący się między poprzednim a następnym dobrym licznikiem; najbliższy środka. */
function odoSuggest(odo, lo, hi){
  const s = String(Math.round(odo)), c = new Set();
  for (let i = 0; i < s.length; i++) c.add(s.slice(0, i) + s.slice(i + 1));
  for (let i = 0; i < s.length - 1; i++) c.add(s.slice(0, i) + s[i + 1] + s[i] + s.slice(i + 2));
  for (let i = 0; i <= s.length; i++) for (let d = 0; d <= 9; d++) c.add(s.slice(0, i) + d + s.slice(i));
  for (let i = 0; i < s.length; i++) for (let d = 0; d <= 9; d++) c.add(s.slice(0, i) + d + s.slice(i + 1));   // jedna zła cyfra
  const L = lo!=null ? lo : (hi!=null ? hi - 3000 : null), H = hi!=null ? hi : (lo!=null ? lo + 3000 : null);
  if (L==null) return null;
  const mid = (L + H) / 2;
  const ok = [...c].map(Number).filter(n => n >= L && n <= H && !/^0/.test(String(n)));
  ok.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
  return ok[0] || null;
}
function openOdoFix(key){
  const x = badOdometers().find(y => y.key===key); if (!x || !x.cardRow) return;
  const sug = odoSuggest(x.odo, x.lo, x.hi), nf = n => new Intl.NumberFormat('pl-PL').format(n);
  editing = {col:'odo-fix', id: x.cardRow, base:{}, special: async () => {
    const n = Math.round(Number(String($('#odo-new').value).replace(/[\s.]/g, '').replace(',', '.')));
    const w = $('#dlg-warn');
    if (!(n > 0)){ w.textContent = 'Wpisz poprawny stan licznika.'; w.hidden = false; return; }
    if ((x.lo!=null && n < x.lo) || (x.hi!=null && n > x.hi)){ if (w.dataset.fix!==String(n)){ w.dataset.fix = String(n); w.textContent = `${nf(n)} km nie mieści się między sąsiednimi licznikami (${x.lo!=null ? nf(x.lo) : '?'} – ${x.hi!=null ? nf(x.hi) : '?'} km). Jeśli to prawda, kliknij jeszcze raz.`; w.hidden = false; return; } }
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      const {error} = await sb.from('fuel_card_rows').update({odometer: n}).eq('id', x.cardRow); if (error) throw dbErr(error);
      await refresh('fuelCardRows'); closeForm(); toast(`Poprawiono licznik: ${nf(x.odo)} → ${nf(n)} km`);
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dlg-title').textContent = 'Popraw licznik z karty';
  $('#dlg-body').innerHTML = `<div class="field full"><span class="ho-car">${vPlate(x.vid)} <span class="muted">${fdate(x.d)} ${esc(x.t || '')} · ${esc(x.src)}</span></span></div>
    <div class="field"><span class="label">Wpisano na stacji</span><b class="neg">${nf(x.odo)} km</b></div>
    <div class="field"><span class="label">Sąsiednie liczniki</span><b>${x.lo!=null ? nf(x.lo) : '?'} – ${x.hi!=null ? nf(x.hi) : '?'} km</b></div>
    <div class="field full"><label for="odo-new">Prawidłowy stan licznika (km)</label><input id="odo-new" type="text" inputmode="numeric" value="${sug ? sug : ''}" placeholder="np. ${x.lo!=null ? x.lo + 500 : ''}">
      ${sug ? `<span class="muted small">Podpowiedź: ${nf(sug)} km – wpisany licznik z poprawioną jedną cyfrą, pasuje do sąsiednich. Sprawdź i zapisz.</span>` : '<span class="muted small">Brak podpowiedzi – wpisz stan z innego źródła (np. zdanie auta) albo zostaw i oznacz jako sprawdzone.</span>'}</div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  setTimeout(() => $('#odo-new')?.focus(), 20);
}
