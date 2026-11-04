/* Emage FLEET — przebiegi: ile km przejechał każdy bus w wybranym zakresie dat.
   Liczniki ze wszystkich źródeł: karta paliwowa, tankowania kierowców, przejęcie i zdanie auta.
   Km = suma odcinków między kolejnymi licznikami (od ostatniego licznika sprzed zakresu). Licznik odbiegający
   o > 20 000 km od reszty albo dający odcinek ujemny / nierealny (> 1500 km na dobę) jest pomijany. */
'use strict';
const mStart = d => d.slice(0, 8) + '01';
const mEnd = d => { const x = parse(mStart(d)); x.setMonth(x.getMonth() + 1); x.setDate(0); return isoOf(x); };
let pbFrom = mStart(today()), pbTo = today();
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

function viewMileage(){
  const nf = n => new Intl.NumberFormat('pl-PL').format(n);
  const t = today(), pm = (() => { const x = parse(mStart(t)); x.setDate(0); return isoOf(x); })();
  const quick = [['Ten miesiąc', mStart(t), t], ['Poprzedni miesiąc', mStart(pm), pm], ['Ostatnie 30 dni', addDays(t, -29), t], ['Od początku roku', t.slice(0, 4) + '-01-01', t]];
  const head = `<div class="bar"><h2>Przebiegi</h2><div class="tools pb-tools">
      <label class="label" for="pb-from">Od</label><input id="pb-from" type="date" value="${pbFrom}" style="width:auto">
      <label class="label" for="pb-to">Do</label><input id="pb-to" type="date" value="${pbTo}" style="width:auto"></div></div>
    <div class="pb-quick">${quick.map(([l, f, e]) => `<button class="small ${f===pbFrom && e===pbTo ? 'primary' : ''}" data-pb="${f}|${e}">${l}</button>`).join('')}</div>`;
  const vs = S.vehicles.filter(v => v.status!=='wycofany').slice().sort((a, b) => String(a.plate).localeCompare(b.plate));
  const res = vs.map(v => ({v, r: odoRange(v.id, pbFrom, pbTo)})).sort((a, b) => (b.r.km ?? -1) - (a.r.km ?? -1));
  const total = res.reduce((s, x) => s + (x.r.km || 0), 0), days = diffDays(pbFrom, pbTo) + 1;
  const rows = res.map(({v, r}) => {
    const open = pbOpen.has(v.id);
    const det = open ? `<tr class="fc-det"><td colspan="5"><table><thead><tr><th>Data</th><th>Skąd</th><th>Kto / gdzie</th><th class="r">Licznik</th><th></th></tr></thead><tbody>${
      (r.anchor ? [r.anchor] : []).concat(r.xs.filter(x => x!==r.anchor)).map(x => `<tr><td class="num">${fdate(x.d)}${x.t ? ` <span class="muted small">${esc(x.t)}</span>` : ''}${x===r.anchor ? '<span class="sub">przed zakresem</span>' : ''}</td>
        <td>${esc(x.src)}</td><td>${esc(x.note || '')}</td><td class="r num">${km(x.odo)}</td><td>${r.bad.has(x.id) ? '<span class="pill off">licznik podejrzany – pominięty</span>' : ''}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">Brak liczników w tym zakresie.</td></tr>'}</tbody></table></td></tr>` : '';
    return `<tr class="click fc-vrow ${open ? 'open' : ''}" data-pbv="${esc(v.id)}" aria-expanded="${open}"><td>${ic('chev', 'fc-chev')} ${plate(v.plate)}<span class="sub">${esc(v.make + ' ' + v.model)}</span></td>
      <td class="r num">${r.km==null ? `<span class="muted">${r.xs.length ? 'za mało liczników' : 'brak liczników'}</span>` : `<b>${nf(r.km)} km</b>`}${r.km ? `<span class="sub">${nf(Math.round(r.km / days))} km / dzień</span>` : ''}</td>
      <td class="r num">${r.first ? km(r.first.odo) : '—'}<span class="sub">${r.first ? fdate(r.first.d) : ''}</span></td>
      <td class="r num">${r.last ? km(r.last.odo) : '—'}<span class="sub">${r.last ? fdate(r.last.d) : ''}</span></td>
      <td>${r.xs.length ? `<span class="muted small">${r.xs.length} ${isPlural(r.xs.length,'licznik','liczniki','liczników')}</span>` : ''}${r.bad.size ? ` <span class="pill off">${r.bad.size} ${isPlural(r.bad.size,'pominięty','pominięte','pominiętych')}</span>` : ''}${r.breaks ? ` <span class="pill off" title="Nierealny skok licznika – ten odcinek nie jest liczony">${r.breaks} ${isPlural(r.breaks,'przerwa','przerwy','przerw')}</span>` : ''}</td></tr>${det}`;
  }).join('');
  return head + `<div class="panel fc-meta"><div><span class="label">Zakres</span><b>${fdate(pbFrom)} – ${fdate(pbTo)}</b></div><div><span class="label">Dni</span><b>${days}</b></div>
      <div><span class="label">Cała flota</span><b>${nf(total)} km</b></div><div><span class="label">Średnio na auto</span><b>${nf(Math.round(total / Math.max(1, res.filter(x => x.r.km).length)))} km</b></div></div>
    <div class="panel tablewrap fc-table"><table><thead><tr><th>Auto</th><th class="r">Przejechane</th><th class="r">Pierwszy licznik</th><th class="r">Ostatni licznik</th><th>Liczniki</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:0">Liczymy ze wszystkich liczników: karta paliwowa, tankowania kierowców, przejęcie i zdanie auta – od ostatniego licznika sprzed zakresu (najwyżej 7 dni wcześniej) do ostatniego w zakresie. Licznik odbiegający od reszty (np. brak cyfry) albo cofnięty jest pomijany. Kliknij auto, aby zobaczyć wszystkie liczniki po kolei.</p>`;
}
document.addEventListener('change', e => {
  if (e.target.id==='pb-from' && e.target.value){ pbFrom = e.target.value; if (pbTo < pbFrom) pbTo = pbFrom; render(); }
  if (e.target.id==='pb-to' && e.target.value){ pbTo = e.target.value; if (pbFrom > pbTo) pbFrom = pbTo; render(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-pb],[data-pbv]'); if (!t || t.closest('#dialog')) return;
  if (t.dataset.pb){ [pbFrom, pbTo] = t.dataset.pb.split('|'); render(); return; }
  pbOpen.has(t.dataset.pbv) ? pbOpen.delete(t.dataset.pbv) : pbOpen.add(t.dataset.pbv); render();
});
