/* Emage FLEET — wykorzystanie aut (Grafik → „Wykorzystanie aut”, kierownik floty).
   Źródło: dzienne stany licznika z lokalizatorów Geotab (tabela gps_odometer, jeden odczyt na koniec dnia).
   km dnia = licznik dnia − licznik dnia poprzedniego; gdy brakuje dni, różnicę dzielimy równo na brakujące dni.
   Dzień jazdy = ponad 20 km. „Stoi” = kolejne dni do dziś z przebiegiem do 20 km.
   Km floty z GPS są TYLKO INFORMACYJNE – nie wchodzą do Rentowności ani Rentowności tras (tam liczą się km do faktury i liczniki). */
'use strict';
let utDays = 30, utSort = {k: 'km', dir: -1};
const UT_MOVE = 20;
const utN = n => new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(Math.round(Number(n) || 0));

/* km dzień po dniu dla auta: {dzień: km} (tylko dni, które da się policzyć) */
function utDaily(vid){
  const xs = (S.gpsOdometer || []).filter(g => g.vehicleId===vid && Number(g.km) > 0).sort((a, b) => a.day.localeCompare(b.day));
  const out = {};
  for (let i = 1; i < xs.length; i++){
    const a = xs[i - 1], b = xs[i], gap = diffDays(a.day, b.day), d = Number(b.km) - Number(a.km);
    if (gap < 1 || gap > 10 || d < 0 || d > gap * 1500) continue;   // przerwa za długa albo licznik cofnięty – nie zgadujemy
    for (let k = 1; k <= gap; k++) out[addDays(a.day, k)] = d / gap;
  }
  return out;
}
function utStats(days){
  const to = today(), from = addDays(to, -(days - 1)), list = []; for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  const gpsV = new Set((S.gpsOdometer || []).map(g => g.vehicleId));
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const fleetDay = Object.fromEntries(list.map(d => [d, 0]));
  const rows = vs.filter(v => gpsV.has(v.id)).map(v => {
    const dly = utDaily(v.id), cells = list.map(d => dly[d]);
    const known = cells.filter(x => x!=null), km_ = known.reduce((s, x) => s + x, 0);
    const drive = known.filter(x => x > UT_MOVE).length, stand = known.filter(x => x <= UT_MOVE).length;
    list.forEach((d, i) => { if (cells[i]!=null) fleetDay[d] += cells[i]; });
    // ile dni z rzędu stoi (od ostatniego znanego dnia wstecz)
    let streak = 0, lastMove = null;
    const all = Object.keys(dly).sort();
    for (let i = all.length - 1; i >= 0; i--){ if (dly[all[i]] > UT_MOVE){ lastMove = all[i]; break; } streak++; }
    return {v, cells, km: km_, drive, stand, known: known.length, perDrive: drive ? km_ / drive : null, streak, lastMove, util: known.length ? drive / known.length : null};
  });
  const noGps = vs.filter(v => !gpsV.has(v.id));
  return {list, rows, noGps, fleetDay, from, to};
}
/* km floty miesiąc po miesiącu z GPS – ostatnie 6 miesięcy, w których są dane */
function utFleetMonths(){
  const byM = {};
  const vids = new Set(S.vehicles.filter(v => v.status!=='wycofany').map(v => v.id));
  [...vids].forEach(vid => { const dly = utDaily(vid); Object.entries(dly).forEach(([d, k]) => { const m = d.slice(0, 7); (byM[m] = byM[m] || {km: 0, days: new Set(), cars: new Set()}); byM[m].km += k; byM[m].days.add(d); if (k > UT_MOVE) byM[m].cars.add(vid); }); });
  return Object.keys(byM).sort().slice(-6).map(m => ({m, km: byM[m].km, days: byM[m].days.size, cars: byM[m].cars.size}));
}

function viewUtilization(){
  if (!P().manage) return '';
  const head = `<div class="bar"><h2>Wykorzystanie aut</h2><div class="tools"><div class="seg" role="group" aria-label="Okres">${[14, 30, 90].map(n => `<button class="small ${utDays===n ? 'on' : ''}" data-ut-d="${n}" aria-pressed="${utDays===n}">${n} dni</button>`).join('')}</div></div></div>`;
  if (!(S.gpsOdometer || []).length) return head + `<div class="panel"><p class="muted sec-empty">Brak danych z lokalizatorów GPS. Wykorzystanie liczy się z dziennych przebiegów Geotab – włącz je w Ustawienia → Geotab („Synchronizuj teraz”).</p></div>`;
  const U = utStats(utDays), cnt = U.rows.length;
  const fleetKm = U.rows.reduce((s, r) => s + r.km, 0), driveDays = U.rows.reduce((s, r) => s + r.drive, 0), knownDays = U.rows.reduce((s, r) => s + r.known, 0);
  const standing = U.rows.filter(r => r.streak >= 3).sort((a, b) => b.streak - a.streak);
  const maxDay = Math.max(1, ...Object.values(U.fleetDay));
  const sortF = {plate: r => r.v.plate, km: r => r.km, drive: r => r.drive, util: r => r.util ?? -1, perDrive: r => r.perDrive ?? -1, streak: r => r.streak};
  const rows = U.rows.slice().sort((a, b) => { const f = sortF[utSort.k], x = f(a), y = f(b); return (x < y ? -1 : x > y ? 1 : 0) * utSort.dir; });
  const cmax = Math.max(1, ...U.rows.flatMap(r => r.cells.filter(x => x!=null)));
  const strip = r => `<span class="ut-strip" aria-hidden="true">${r.cells.map((x, i) => `<i class="${x==null ? 'na' : x > UT_MOVE ? 'go' : 'st'}" style="${x > UT_MOVE ? `--h:${Math.max(18, Math.round(x / cmax * 100))}%` : ''}" title="${fdate(U.list[i])}: ${x==null ? 'brak danych' : utN(x) + ' km'}"></i>`).join('')}</span>`;
  const th = (k, l, cls = 'r') => `<th class="${cls} sortable" data-ut-sort="${k}">${l}${utSort.k===k ? (utSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const tbl = `<div class="tablewrap"><table class="ut-tbl"><thead><tr>${th('plate', 'Auto', '')}${th('km', 'Km')}${th('drive', 'Dni jazdy')}${th('util', 'Wykorzystanie')}${th('perDrive', 'Km / dzień jazdy')}${th('streak', 'Stoi')}<th>Dzień po dniu</th></tr></thead><tbody>
    ${rows.map(r => `<tr class="click" data-card-go="${esc(r.v.id)}"><td data-l="Auto">${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></td>
      <td class="r num" data-l="Km"><b>${utN(r.km)}</b></td>
      <td class="r num" data-l="Dni jazdy">${r.drive} <span class="muted">/ ${r.known}</span></td>
      <td class="r num" data-l="Wykorzystanie">${r.util==null ? '—' : `<span class="pill ${r.util < 0.4 ? 'bad' : r.util < 0.65 ? 'warn' : 'ok'}">${Math.round(r.util * 100)}%</span>`}</td>
      <td class="r num" data-l="Km / dzień jazdy">${r.perDrive==null ? '—' : utN(r.perDrive)}</td>
      <td class="r num" data-l="Stoi">${r.streak >= 3 ? `<span class="pill ${r.streak >= 7 ? 'bad' : 'warn'}">${r.streak} dni</span>` : r.streak ? `<span class="muted">${r.streak} d.</span>` : '<span class="muted">jeździ</span>'}</td>
      <td data-l="Dzień po dniu">${strip(r)}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small sec-empty">Dzień jazdy = ponad ${UT_MOVE} km. Wykorzystanie = dni jazdy / dni z danymi GPS. „Stoi” = ile ostatnich dni z rzędu auto przejechało do ${UT_MOVE} km. Pasek: wysokość = km danego dnia, jasne kropki = postój, puste = brak odczytu. Kliknij auto – karta auta.</p>`;
  const bars = `<div class="ut-days" role="img" aria-label="Km floty dzień po dniu">${U.list.map(d => { const k = U.fleetDay[d], we = [0, 6].includes(new Date(d + 'T12:00:00').getDay());
    return `<span class="${we ? 'we' : ''}" title="${fdate(d)}: ${utN(k)} km"><i style="--h:${Math.round(k / maxDay * 100)}%"></i></span>`; }).join('')}</div>
    <div class="ut-axis muted small"><span>${fdate(U.from)}</span><span>dziś</span></div>`;
  const months = utFleetMonths(), mh = m => `${MONTHS_GEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
  const mtbl = months.length ? `<div class="tablewrap"><table class="ut-m"><thead><tr><th>Miesiąc</th><th class="r">Km floty (GPS)</th><th class="r">Średnio na dzień</th><th class="r">Aut w ruchu</th></tr></thead><tbody>
    ${months.map(x => `<tr><td data-l="Miesiąc">${mh(x.m)}${x.m===today().slice(0, 7) ? ' <span class="muted small">(do dziś)</span>' : ''}</td><td class="r num" data-l="Km floty"><b>${utN(x.km)}</b></td><td class="r num" data-l="Na dzień">${utN(x.km / Math.max(1, x.days))}</td><td class="r num" data-l="Aut w ruchu">${x.cars}</td></tr>`).join('')}</tbody></table></div>` : '';
  const meta = [[`Km floty (${utDays} dni)`, utN(fleetKm) + ' km'], ['Średnio dziennie', utN(fleetKm / Math.max(1, U.list.length)) + ' km'], ['Wykorzystanie floty', knownDays ? Math.round(driveDays / knownDays * 100) + '%' : '—'], ['Stoją 3+ dni', String(standing.length)]];
  return head + `<div class="panel fc-meta">${meta.map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
    ${standing.length ? `<div class="panel ut-stand"><div class="sec-head"><h3>Stoją bez ruchu</h3><span class="count">${standing.length}</span></div><p class="ut-chips">${standing.map(r => `<button type="button" class="ut-chip" data-card-go="${esc(r.v.id)}">${plate(r.v.plate)} <b>${r.streak} dni</b>${r.lastMove ? `<span class="sub">ostatnio w ruchu ${fdate(r.lastMove)}</span>` : ''}</button>`).join('')}</p></div>` : ''}
    <div class="panel"><div class="sec-head"><h3>Busy</h3><span class="muted small">${cnt} z lokalizatorem · ${fdate(U.from)} – ${fdate(U.to)}</span></div>${tbl}
      ${U.noGps.length ? `<p class="muted small sec-empty">Bez danych GPS: ${U.noGps.map(v => esc(v.plate)).join(', ')}.</p>` : ''}</div>
    <div class="panel"><div class="sec-head"><h3>Km floty z GPS</h3><span class="pill info">tylko informacyjnie</span></div>${bars}${mtbl}
      <p class="muted small sec-empty">Suma przebiegów wszystkich aut z lokalizatorami (Geotab). Nie wchodzi do Rentowności ani Rentowności tras – tam liczą się km do faktury i liczniki. Weekendy jaśniej.</p></div>`;
}
document.addEventListener('click', e => {
  const d = e.target.closest('[data-ut-d]'); if (d){ utDays = Number(d.dataset.utD); render(); return; }
  const s = e.target.closest('[data-ut-sort]'); if (s){ const k = s.dataset.utSort; utSort = utSort.k===k ? {k, dir: -utSort.dir} : {k, dir: k==='plate' ? 1 : -1}; render(); }
});
