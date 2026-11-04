/* Emage FLEET — spalanie i przebiegi busów w wybranym zakresie dat (jedno miejsce, jedna liczba w całej aplikacji).
   Przebieg: liczniki ze wszystkich źródeł (karta, tankowania kierowców, przejęcie i zdanie auta), odcinkami;
   pojedynczy błędny licznik pomijany, nierealny skok (> 1500 km na dobę) przerywa liczenie.
   Spalanie: z tankowań na karcie (gdy brak – z wpisów kierowców), odcinkami między tankowaniami (patrz fcCons). */
'use strict';
const mStart = d => d.slice(0, 8) + '01';
const mEnd = d => { const x = parse(mStart(d)); x.setMonth(x.getMonth() + 1); x.setDate(0); return isoOf(x); };
const ALL_FROM = '2000-01-01';
let pbFrom = ALL_FROM, pbTo = today(), pbSort = {k:'rate', dir:-1};
const pbOpen = new Set();

/* Wszystkie liczniki auta: {d: data, t: godzina/kolejność, odo, src, id} */
function odoReadings(vid){
  const out = [];
  (S.fuelCardRows || []).forEach(r => { if (r.vehicleId===vid && Number(r.odometer) > 0) out.push({id:'k' + r.id, d: r.txDate, t: r.txTime || '', odo: Number(r.odometer), src:'karta', note: r.station || ''}); });
  S.costs.forEach(c => { if (c.vehicleId===vid && Number(c.odometer) > 0) out.push({id:'c' + c.id, d: c.date, t: '', odo: Number(c.odometer), src: FUEL_CATS.includes(c.category) ? 'tankowanie' : c.category, note: dName(fillDriver(c) || c.driverId) || ''}); });
  S.bookings.forEach(b => {
    if (b.vehicleId!==vid) return;
    if (b.pickup && Number(b.pickup.km) > 0) out.push({id:'p' + b.id, d: b.pickup.at, t: '', odo: Number(b.pickup.km), src:'przejęcie', note: crewName(b)});
    if (b.returned && Number(b.returned.km) > 0) out.push({id:'z' + b.id, d: b.returned.at, t: '', odo: Number(b.returned.km), src:'zdanie', note: crewName(b)});
  });
  // ten sam dzień: kolejność po liczniku (przejęcie rano, tankowania, zdanie wieczorem)
  return out.filter(x => x.d).sort((a, b) => a.d.localeCompare(b.d) || a.odo - b.odo || a.t.localeCompare(b.t));
}
function odoRange(vid, from, to){
  const all = odoReadings(vid);
  const before = all.filter(x => x.d < from), inR = all.filter(x => x.d >= from && x.d <= to);
  // punkt startowy: ostatni licznik sprzed zakresu, jeśli najwyżej 7 dni wcześniej (starszy zawyżyłby wynik)
  const anc = before.length && diffDays(before[before.length - 1].d, from) <= 7 ? before[before.length - 1] : null;
  const xs = (anc ? [anc] : []).concat(inR);
  const bad = new Set();
  if (!inR.length) return {km: null, xs: inR, bad, first: null, last: null};
  const maxLeg = (a, b) => 1500 * (Math.max(0, diffDays(a.d, b.d)) + 1);
  const seg = odoSegments(xs, (a, b) => b.odo - a.odo >= 0 && b.odo - a.odo <= maxLeg(a, b));
  seg.bad.forEach(i => bad.add(xs[i].id));
  const kmS = seg.legs.length ? seg.legs.reduce((s, [a, b]) => s + xs[b].odo - xs[a].odo, 0) : null;
  const ok = seg.alive.map(i => xs[i]);
  return {km: kmS, xs, bad, first: ok[0] || null, last: ok[ok.length - 1] || null, anchor: anc, breaks: seg.breaks};
}

/* Spalanie auta w zakresie: karta (z ostatnim tankowaniem sprzed zakresu, jeśli ≤ 7 dni), a gdy brak – wpisy kierowców */
function consRange(vid, from, to){
  const pick = (list, d) => { const before = list.filter(x => d(x) < from).sort((a, b) => d(a).localeCompare(d(b))), inR = list.filter(x => d(x) >= from && d(x) <= to);
    const anc = before.length && diffDays(d(before[before.length - 1]), from) <= 7 ? [before[before.length - 1]] : []; return anc.concat(inR); };
  const card = fcCons(pick(S.fuelCardRows.filter(r => r.vehicleId===vid && r.kind!=='other'), r => r.txDate).map(r => ({id: r.id, odo: Number(r.odometer), l: r.liters, d: r.txDate + ' ' + (r.txTime || '')})));
  if (card && card.rate!=null) return {...card, src:'karta'};
  const app = fcCons(pick(appFuel().filter(c => c.vehicleId===vid), c => c.date).map(c => ({id: c.id, odo: Number(c.odometer), l: c.liters, d: c.date + ' ' + (c.createdAt || '')})));
  if (app && app.rate!=null) return {...app, src:'kierowcy'};
  return {src: null, n: (card ? card.n : 0) + (app ? app.n : 0), bad: new Set([...(card ? card.bad : []), ...(app ? app.bad : [])]), breaks: (card ? card.breaks || 0 : 0)};
}
/* Średnie spalanie auta z całej historii – ta sama liczba w Pojazdach, karcie auta, kosztach i raportach */
let fcMemo = {key: '', m: new Map()};
function fleetConsumption(vid){
  const key = S.fuelCardRows.length + '|' + S.costs.length + '|' + today();
  if (fcMemo.key!==key) fcMemo = {key, m: new Map()};
  if (!fcMemo.m.has(vid)){ const c = consRange(vid, ALL_FROM, today()); fcMemo.m.set(vid, c && c.rate!=null && !c.unsure ? c : null); }
  return fcMemo.m.get(vid);
}

function viewFuelMileage(){
  if (!P().manage) return '';
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const t = today(), pm = (() => { const x = parse(mStart(t)); x.setDate(0); return isoOf(x); })();
  const quick = [['Całość', ALL_FROM, t], ['Ten miesiąc', mStart(t), t], ['Poprzedni miesiąc', mStart(pm), pm], ['Ostatnie 30 dni', addDays(t, -29), t], ['Od początku roku', t.slice(0, 4) + '-01-01', t]];
  const all = pbFrom===ALL_FROM;
  const head = `<div class="bar"><h2>Spalanie i przebiegi</h2><div class="tools pb-tools">
      <label class="label" for="pb-from">Od</label><input id="pb-from" type="date" value="${all ? '' : pbFrom}" style="width:auto">
      <label class="label" for="pb-to">Do</label><input id="pb-to" type="date" value="${pbTo}" style="width:auto"></div></div>
    <div class="pb-quick">${quick.map(([l, f, e]) => `<button class="small ${f===pbFrom && e===pbTo ? 'primary' : ''}" data-pb="${f}|${e}">${l}</button>`).join('')}</div>`;
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const res = vs.map(v => { const r = odoRange(v.id, pbFrom, pbTo), c = consRange(v.id, pbFrom, pbTo); return {v, r, c, km: r.km, rate: c.rate!=null && !c.unsure ? c.rate : null, l: c.l || 0}; });
  const val = (x, k) => k==='plate' ? x.v.plate : k==='km' ? x.km : k==='l' ? x.l : x.rate;
  const sorted = res.slice().sort((a, b) => { const A = val(a, pbSort.k), B = val(b, pbSort.k);
    if (A==null && B==null) return 0; if (A==null) return 1; if (B==null) return -1;
    return (typeof A==='string' ? A.localeCompare(B) : A - B) * pbSort.dir; });
  const okC = res.filter(x => x.rate!=null), cKm = okC.reduce((s, x) => s + x.c.km, 0), cL = okC.reduce((s, x) => s + x.c.l, 0);
  const totalKm = res.reduce((s, x) => s + (x.km || 0), 0), days = all ? null : diffDays(pbFrom, pbTo) + 1;
  const th = (k, l, r) => `<th class="${r ? 'r ' : ''}sortable" data-pbs="${k}">${l}${pbSort.k===k ? (pbSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const rows = sorted.map(({v, r, c, km: kmV, rate}) => {
    const open = pbOpen.has(v.id);
    const det = open ? `<tr class="fc-det"><td colspan="6"><table><thead><tr><th>Data</th><th>Skąd</th><th>Kto / gdzie</th><th class="r">Licznik</th><th></th></tr></thead><tbody>${
      r.xs.map(x => `<tr><td class="num">${fdate(x.d)}${x.t ? ` <span class="muted small">${esc(x.t)}</span>` : ''}${x===r.anchor ? '<span class="sub">przed zakresem</span>' : ''}</td>
        <td>${esc(x.src)}</td><td>${esc(x.note || '')}</td><td class="r num">${km(x.odo)}</td><td>${r.bad.has(x.id) ? '<span class="pill off">licznik podejrzany – pominięty</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Brak liczników w tym zakresie.</td></tr>'}</tbody></table></td></tr>` : '';
    const notes = [(() => { const n = r.bad.size + (c.bad ? c.bad.size : 0); return n ? `${n} ${isPlural(n,'licznik pominięty','liczniki pominięte','liczników pominiętych')}` : ''; })(), (r.breaks || c.breaks) ? `${(r.breaks || 0) + (c.breaks || 0)} ${isPlural((r.breaks || 0) + (c.breaks || 0),'przerwa','przerwy','przerw')}` : ''].filter(Boolean);
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-pbv="${esc(v.id)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${plate(v.plate)}<span class="sub">${esc(v.make + ' ' + v.model)}</span></td>
      <td class="r num">${rate!=null ? `<b class="fc-big">${rate.toFixed(1).replace('.', ',')}</b> l/100` : c.rate!=null ? `<span class="muted">${c.rate.toFixed(1).replace('.', ',')} l/100</span>` : `<span class="muted">${c.n ? 'za mało danych' : 'brak danych'}</span>`}
        <span class="sub">${c.rate!=null ? (c.unsure ? '<span class="pill off">niepewne – sprawdź liczniki</span>' : levelPill(levelFor(v.id, c.rate)) || '') : ''}</span></td>
      <td class="r num">${kmV!=null ? `<b>${nf(kmV)} km</b>` : '<span class="muted">—</span>'}${kmV && days ? `<span class="sub">${nf(kmV / days)} km / dzień</span>` : ''}</td>
      <td class="r num">${c.l ? fl(c.l) : '—'}</td>
      <td class="muted small">${c.src ? (c.src==='karta' ? 'z kart paliwowych' : 'z wpisów kierowców') : ''}${c.from ? `<span class="sub">${fdate(c.from)} – ${fdate(c.to)}</span>` : ''}</td>
      <td>${notes.map(n => `<span class="pill off">${esc(n)}</span>`).join(' ')}</td></tr>${det}`;
  }).join('');
  return head + `<div class="panel fc-meta"><div><span class="label">Zakres</span><b>${all ? 'całość danych' : fdate(pbFrom) + ' – ' + fdate(pbTo)}</b></div>
      <div><span class="label">Średnie spalanie floty</span><b>${cKm ? (cL / cKm * 100).toFixed(1).replace('.', ',') + ' l/100 km' : '—'}</b></div>
      <div><span class="label">Przebieg floty</span><b>${nf(totalKm)} km</b></div>
      <div><span class="label">Średnio na auto</span><b>${nf(totalKm / Math.max(1, res.filter(x => x.km).length))} km</b></div></div>
    <div class="panel tablewrap fc-table"><table><thead><tr>${th('plate', 'Auto')}${th('rate', 'Spalanie', 1)}${th('km', 'Przebieg', 1)}${th('l', 'Litry', 1)}<th>Dane</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:0">Kliknij nagłówek kolumny, aby posortować (drugi raz – odwrotnie). Przebieg: wszystkie liczniki (karta, tankowania, przejęcie i zdanie auta). Spalanie: tankowania z kart paliwowych, a gdy ich brak – wpisy kierowców; liczone odcinkami, pojedynczy zły licznik pomijany, dziura (np. tankowanie inną kartą) przerywa liczenie. Wynik poza 5–25 l/100 km – „niepewne”, poza średnią floty. Kliknij auto, aby zobaczyć liczniki po kolei.</p>`;
}
document.addEventListener('change', e => {
  if (e.target.id==='pb-from'){ pbFrom = e.target.value || ALL_FROM; if (pbTo < pbFrom) pbTo = pbFrom; render(); }
  if (e.target.id==='pb-to' && e.target.value){ pbTo = e.target.value; if (pbFrom > pbTo) pbFrom = pbTo; render(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pb],[data-pbv],[data-pbs]'); if (!t || t.closest('#dialog')) return;
  if (t.dataset.pb){ [pbFrom, pbTo] = t.dataset.pb.split('|'); render(); return; }
  if (t.dataset.pbs){ const k = t.dataset.pbs; pbSort = pbSort.k===k ? {k, dir: -pbSort.dir} : {k, dir: k==='plate' ? 1 : -1}; render(); return; }
  pbOpen.has(t.dataset.pbv) ? pbOpen.delete(t.dataset.pbv) : pbOpen.add(t.dataset.pbv); render();
});
