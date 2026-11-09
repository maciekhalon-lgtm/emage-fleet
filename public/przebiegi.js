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
  (S.fuelCardRows || []).forEach(r => { if (r.vehicleId===vid && !fakeOdo(r.odometer)) out.push({id:'k' + r.id, d: r.txDate, t: r.txTime || '', odo: Number(r.odometer), src:'karta', note: r.station || ''}); });
  S.costs.forEach(c => { if (c.vehicleId===vid && !fakeOdo(c.odometer)) out.push({id:'c' + c.id, d: c.date, t: '', odo: Number(c.odometer), src: FUEL_CATS.includes(c.category) ? 'tankowanie' : c.category, note: dName(fillDriver(c) || c.driverId) || ''}); });
  S.bookings.forEach(b => {
    if (b.vehicleId!==vid) return;
    if (b.pickup && !fakeOdo(b.pickup.km)) out.push({id:'p' + b.id, d: b.pickup.at, t: '', odo: Number(b.pickup.km), src:'przejęcie', note: crewName(b)});
    if (b.returned && !fakeOdo(b.returned.km)) out.push({id:'z' + b.id, d: b.returned.at, t: '', odo: Number(b.returned.km), src:'zdanie', note: crewName(b)});
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

/* „Dlaczego tak dużo?” – rozbicie wysokiego spalania auta na przyczyny w danych (tankowania bez licznika,
   tankowania niemożliwe dla jednego auta, pominięte liczniki, brak grafiku) i szacunek nadwyżki w litrach i złotych */
function consWhy(v, c, fleetRate){
  if (!c || c.rate==null || !c.km || c.src!=='karta' || !fleetRate || c.rate < Math.max(fleetRate * 1.2, fleetRate + 2)) return '';
  const from = c.from, to = c.to;
  const rows = S.fuelCardRows.filter(r => r.vehicleId===v.id && r.kind!=='other' && r.txDate > from && r.txDate <= to);
  const fake = rows.filter(r => c.fake && c.fake.has(r.id)), fakeL = fake.reduce((s, r) => s + Number(r.liters || 0), 0);
  const imp = typeof fcSuspicious==='function' ? fcSuspicious().filter(x => x.lvl==='bad' && x.row.vehicleId===v.id && x.row.txDate >= from && x.row.txDate <= to) : [];
  const impL = imp.reduce((s, x) => s + Number(x.row.liters || 0), 0);
  const tank = Number(v.tankL) || 90;
  const overL = imp.reduce((s, x) => s + Math.max(0, Number(x.row.liters) - tank), 0);
  const badOdo = rows.filter(r => c.bad && c.bad.has(r.id));
  const bk = S.bookings.filter(b => b.vehicleId===v.id && b.from <= to && b.to >= from).length;
  const pricey = rows.filter(r => (!r.currency || r.currency==='PLN') && Number(r.amount) > 0 && Number(r.liters) > 0);
  const price = pricey.length ? pricey.reduce((s, r) => s + Number(r.amount), 0) / pricey.reduce((s, r) => s + Number(r.liters), 0) : 0;
  const extra = c.km * (c.rate - fleetRate) / 100;
  const r1 = x => x.toFixed(1).replace('.', ',');
  const noFake = c.km ? (c.l - fakeL) / c.km * 100 : null;
  const items = [
    fake.length ? ['warn', `<b>${fake.length} ${isPlural(fake.length,'tankowanie','tankowania','tankowań')} bez licznika</b> (${fl(fakeL)}) – nie wiadomo, ile auto przy nich przejechało. Bez nich spalanie wyszłoby <b>${r1(noFake)} l/100 km</b>.`, fake.slice().sort((a, b) => (a.txDate + (a.txTime || '')).localeCompare(b.txDate + (b.txTime || ''))).slice(-6).map(r => `${fdate(r.txDate).slice(0, 5)} ${esc(r.station || '')} ${fl(r.liters)}`).join(' · ')] : null,
    imp.length ? ['bad', `<b>${imp.length} ${isPlural(imp.length,'tankowanie niemożliwe','tankowania niemożliwe','tankowań niemożliwych')} dla jednego auta</b> (${fl(impL)})${overL ? `, w tym ${fl(overL)} ponad pojemność baku` : ''} – tankowany drugi pojazd albo kanister.`, imp.slice().sort((a, b) => a.row.txDate.localeCompare(b.row.txDate)).slice(-6).map(x => `${fdate(x.row.txDate).slice(0, 5)} ${esc(x.row.station || '')} ${fl(x.row.liters)}`).join(' · ')] : null,
    badOdo.length ? ['off', `<b>${badOdo.length} ${isPlural(badOdo.length,'pomylony licznik','pomylone liczniki','pomylonych liczników')}</b> – pominięte, ale przerywają odcinki.`, badOdo.slice(0, 6).map(r => `${fdate(r.txDate).slice(0, 5)}: ${esc(String(r.odometer))}`).join(' · ')] : null,
    !bk ? ['off', '<b>Auto nie ma przydziałów w grafiku</b> w tym okresie – nie da się ustalić, kto tankował. Wpisuj je w grafik, a tankowania trafią do kierowców.', ''] : null,
  ].filter(Boolean);
  return `<div class="cw"><div class="cw-head"><b>Dlaczego tak dużo?</b><span>${r1(c.rate)} l/100 km przy średniej floty ${r1(fleetRate)} – to ok. <b>${fl(Math.round(extra))}</b>${price ? ` (≈ ${zl(Math.round(extra * price))})` : ''} więcej na ${new Intl.NumberFormat('pl-PL').format(Math.round(c.km))} km.</span></div>
    ${items.length ? `<ul>${items.map(([cls, t, d]) => `<li><span class="dot ${cls}"></span><span>${t}${d ? `<span class="sub">${d}</span>` : ''}</span></li>`).join('')}</ul>`
      : '<p class="muted small">W danych nie widać błędów – tankowania mają liczniki i mieszczą się w baku. Warto sprawdzić auto (wtryskiwacze, DPF, opony, obciążenie) i styl jazdy.</p>'}
    ${imp.length || fake.length ? `<p class="muted small">Najpierw sprawdź, kto miał kartę w dniach tankowań niemożliwych. U dostawcy kart można ustawić limit litrów na transakcję i obowiązek wpisania licznika.</p>` : ''}</div>`;
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
  const totalKm = res.reduce((s, x) => s + (x.km || 0), 0), days = all ? null : diffDays(pbFrom, pbTo) + 1;
  const okC = res.filter(x => x.rate!=null), cKm = okC.reduce((s, x) => s + x.c.km, 0), cL = okC.reduce((s, x) => s + x.c.l, 0);
  const fleetRate = cKm ? cL / cKm * 100 : null;
  const th = (k, l, r) => `<th class="${r ? 'r ' : ''}sortable" data-pbs="${k}">${l}${pbSort.k===k ? (pbSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const rows = sorted.map(({v, r, c, km: kmV, rate}) => {
    const open = pbOpen.has(v.id);
    const det = open ? `<tr class="fc-det"><td colspan="6">${consWhy(v, c, fleetRate)}<table><thead><tr><th>Data</th><th>Skąd</th><th>Kto / gdzie</th><th class="r">Licznik</th><th></th></tr></thead><tbody>${
      r.xs.map(x => `<tr><td class="num">${fdate(x.d)}${x.t ? ` <span class="muted small">${esc(x.t)}</span>` : ''}${x===r.anchor ? '<span class="sub">przed zakresem</span>' : ''}</td>
        <td>${esc(x.src)}</td><td>${esc(x.note || '')}</td><td class="r num">${km(x.odo)}</td><td>${r.bad.has(x.id) ? '<span class="pill off">licznik podejrzany – pominięty</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Brak liczników w tym zakresie.</td></tr>'}</tbody></table></td></tr>` : '';
    const notes = [c.fake && c.fake.size ? `${c.fake.size} bez prawdziwego licznika` : '', (() => { const n = r.bad.size + (c.bad ? c.bad.size : 0); return n ? `${n} ${isPlural(n,'licznik pominięty','liczniki pominięte','liczników pominiętych')}` : ''; })(), (r.breaks || c.breaks) ? `${(r.breaks || 0) + (c.breaks || 0)} ${isPlural((r.breaks || 0) + (c.breaks || 0),'przerwa','przerwy','przerw')}` : ''].filter(Boolean);
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-pbv="${esc(v.id)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${plate(v.plate)}<span class="sub">${esc(v.make + ' ' + v.model)}</span></td>
      <td class="r num">${rate!=null ? `<b class="fc-big">${rate.toFixed(1).replace('.', ',')}</b> l/100` : c.rate!=null ? `<span class="muted">${c.rate.toFixed(1).replace('.', ',')} l/100</span>` : `<span class="muted">${c.n ? 'za mało danych' : 'brak danych'}</span>`}
        <span class="sub">${c.rate!=null ? (c.unsure ? '<span class="pill off">niepewne – sprawdź liczniki</span>' : c.rate > THEFT_RATE ? '<span class="pill bad">podejrzane – możliwa kradzież</span>' : levelPill(levelFor(v.id, c.rate)) || '') : ''}</span></td>
      <td class="r num">${kmV!=null ? `<b>${nf(kmV)} km</b>` : '<span class="muted">—</span>'}${kmV && days ? `<span class="sub">${nf(kmV / days)} km / dzień</span>` : ''}</td>
      <td class="r num">${c.l ? fl(c.l) : '—'}</td>
      <td class="muted small">${c.src ? (c.src==='karta' ? 'z kart paliwowych' : 'z wpisów kierowców') : ''}${c.from ? `<span class="sub">${fdate(c.from)} – ${fdate(c.to)}</span>` : ''}</td>
      <td>${notes.map(n => `<span class="pill off">${esc(n)}</span>`).join(' ')}${!open && consWhy(v, c, fleetRate) ? ' <span class="pill warn">Dlaczego tak dużo? – kliknij</span>' : ''}</td></tr>${det}`;
  }).join('');
  return head + `<div class="panel fc-meta"><div><span class="label">Zakres</span><b>${all ? 'całość danych' : fdate(pbFrom) + ' – ' + fdate(pbTo)}</b></div>
      <div><span class="label">Średnie spalanie floty</span><b>${cKm ? (cL / cKm * 100).toFixed(1).replace('.', ',') + ' l/100 km' : '—'}</b></div>
      <div><span class="label">Przebieg floty</span><b>${nf(totalKm)} km</b></div>
      <div><span class="label">Podejrzane (> ${THEFT_RATE} l/100)</span><b class="${res.some(x => x.rate!=null && x.rate > THEFT_RATE) ? 'neg' : ''}">${res.filter(x => x.rate!=null && x.rate > THEFT_RATE).length}</b></div>
      <div><span class="label">Średnio na auto</span><b>${nf(totalKm / Math.max(1, res.filter(x => x.km).length))} km</b></div></div>
    <div class="panel tablewrap fc-table"><table><thead><tr>${th('plate', 'Auto')}${th('rate', 'Spalanie', 1)}${th('km', 'Przebieg', 1)}${th('l', 'Litry', 1)}<th>Dane</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    ${routeConsPanel(res)}
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

/* Spalanie wg tras: odcinki między tankowaniami przypisane do trasy z grafiku w dniu końca odcinka */
function routeConsPanel(res){
  if (!S.routes.length) return '';
  const agg = {};
  res.forEach(({v, c}) => (c && c.parts || []).forEach(p => {
    if (!p.km || p.km < 50) return;
    const b = S.bookings.find(x => x.vehicleId===v.id && x.routeId && x.from<=p.d1 && x.to>=p.d1); if (!b) return;
    (agg[b.routeId] = agg[b.routeId] || {km:0, l:0, n:0}); agg[b.routeId].km += p.km; agg[b.routeId].l += p.l; agg[b.routeId].n++;
  }));
  const xs = Object.entries(agg).filter(([, x]) => x.km >= 300).map(([rid, x]) => ({rid, ...x, rate: x.l / x.km * 100})).sort((a, b) => b.rate - a.rate);
  if (!xs.length) return '';
  return `<details class="panel fold"><summary class="sec-head"><h3>Spalanie wg tras</h3><span class="muted small">${xs.length} ${isPlural(xs.length,'trasa','trasy','tras')}</span></summary>
    ${xs.map(x => `<div class="mini"><span><b>${esc(rLabel(x.rid))}</b><span class="sub">${new Intl.NumberFormat('pl-PL').format(Math.round(x.km))} km · ${x.n} ${isPlural(x.n,'odcinek','odcinki','odcinków')}</span></span><span class="muted small">${fl(x.l)}</span><span class="mini-r num"><b class="${x.rate > THEFT_RATE ? 'neg' : ''}">${x.rate.toFixed(1).replace('.', ',')} l/100</b></span></div>`).join('')}
    <p class="muted small sec-empty">Odcinek liczy się do trasy, którą auto miało w grafiku w dniu tankowania zamykającego odcinek. Trasy z autostradą i pełnym załadunkiem palą więcej – porównuj tę samą trasę w czasie.</p></details>`;
}
