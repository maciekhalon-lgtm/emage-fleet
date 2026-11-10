/* Emage FLEET — średnie spalania (Paliwo → Spalanie → „Średnie miesięczne”, kierownik floty).
   1. Miesiąc po miesiącu: każdy bus × ostatnie N miesięcy, l/100 km tą samą metodą co „Spalanie i przebiegi”
      (karty paliwowe, a gdy brak – wpisy kierowców); kolumna „Średnia” = suma litrów / suma km z tych miesięcy;
      wiersz „Flota” = to samo dla całej floty w każdym miesiącu.
   2. Kierowcy: z ich własnych wpisów tankowania w aplikacji – licznik i litry.
      Tankowanie kierowcy liczy się, gdy to samo auto ma wcześniejsze tankowanie z prawdziwym licznikiem:
      km = licznik teraz − licznik poprzednio, litry = to, co wpisał (zakładamy tankowanie do pełna).
      Odrzucamy odcinki < 20 km i > 2500 km oraz tankowania większe niż bak (+12%). */
'use strict';
let avgMonths = 6, avgSort = {k: 'avg', dir: -1};
const r1 = n => n==null ? '—' : n.toFixed(1).replace('.', ',');
const monthsBack = n => { const out = []; let m = today().slice(0, 7); for (let i = 0; i < n; i++){ out.unshift(m); m = prevMonth(m); } return out; };
const odoOk = o => { const x = Number(o); return x > 1000 && !(typeof fakeOdo==='function' && fakeOdo(x)); };

function avgMatrix(months){
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const fleet = months.map(() => ({km: 0, l: 0}));
  const rows = vs.map(v => {
    let km_ = 0, l = 0;
    const cells = months.map((m, i) => { const [f, t] = monthRange(m), c = consRange(v.id, f, t);
      if (!c || c.rate==null || !c.km) return null;
      if (!c.unsure){ km_ += c.km; l += c.l; fleet[i].km += c.km; fleet[i].l += c.l; }
      return {rate: c.rate, km: c.km, l: c.l, unsure: !!c.unsure}; });
    return {v, cells, km: km_, l, avg: km_ ? l / km_ * 100 : null};
  });
  const fRates = fleet.map(x => x.km ? x.l / x.km * 100 : null);
  const tot = fleet.reduce((s, x) => ({km: s.km + x.km, l: s.l + x.l}), {km: 0, l: 0});
  return {rows, fleet, fRates, fAvg: tot.km ? tot.l / tot.km * 100 : null, fKm: tot.km};
}

function driverAvg(from, to){
  const fills = S.costs.filter(c => isFuel(c) && costOk(c) && c.vehicleId && Number(c.liters) > 0 && odoOk(c.odometer));
  const byV = {}; fills.forEach(c => (byV[c.vehicleId] = byV[c.vehicleId] || []).push(c));
  const res = {};
  const get = id => res[id] || (res[id] = {id, km: 0, l: 0, n: 0, all: 0, veh: new Set(), skip: 0});
  Object.entries(byV).forEach(([vid, xs]) => {
    const tank = Number((byId('vehicles', vid) || {}).tankL) || 90;
    xs.sort((a, b) => Number(a.odometer) - Number(b.odometer) || (a.date < b.date ? -1 : 1));
    xs.forEach((c, i) => {
      if (c.date < from || c.date > to) return;
      const d = fillDriver(c) || c.driverId; if (!d) return;
      const r = get(d); r.all++;
      const p = xs[i - 1]; const km_ = p ? Number(c.odometer) - Number(p.odometer) : 0, l = Number(c.liters);
      if (!p || km_ < 20 || km_ > 2500 || l > tank * 1.12){ r.skip++; return; }
      r.km += km_; r.l += l; r.n++; r.veh.add(vid);
    });
  });
  // tankowania kierowcy bez licznika też liczymy do „wszystkich”
  S.costs.filter(c => isFuel(c) && costOk(c) && c.date >= from && c.date <= to && !odoOk(c.odometer)).forEach(c => { const d = fillDriver(c) || c.driverId; if (d){ const r = get(d); r.all++; r.skip++; } });
  return Object.values(res).map(r => ({...r, rate: r.km >= 100 ? r.l / r.km * 100 : null}));
}

function viewAverages(){
  if (!P().manage) return '';
  const months = monthsBack(avgMonths), M = avgMatrix(months);
  const from = months[0] + '-01', to = today();
  const cell = (c, fr) => { if (!c) return '<td class="r muted">—</td>';
    const cls = c.unsure ? 'avg-u' : fr && c.rate > fr * 1.3 ? 'avg-bad' : fr && c.rate > fr * 1.15 ? 'avg-warn' : fr && c.rate < fr * 0.9 ? 'avg-good' : '';
    return `<td class="r num ${cls}" title="${new Intl.NumberFormat('pl-PL').format(Math.round(c.km))} km · ${fl(Math.round(c.l))}${c.unsure ? ' · niepewne – mało danych albo błędne liczniki, nie liczone do średniej' : ''}">${r1(c.rate)}</td>`; };
  const sortV = (a, b) => { const k = avgSort.k; const va = k==='plate' ? a.v.plate : a.avg, vb = k==='plate' ? b.v.plate : b.avg;
    if (va==null) return 1; if (vb==null) return -1; return (va < vb ? -1 : va > vb ? 1 : 0) * avgSort.dir; };
  const rows = M.rows.slice().sort(sortV).map(r => `<tr class="click" data-card-go="${esc(r.v.id)}" data-ctab-go="paliwo"><td>${plate(r.v.plate)}</td>${r.cells.map((c, i) => cell(c, M.fRates[i])).join('')}<td class="r num avg-col ${r.avg && M.fAvg && r.avg > M.fAvg * 1.15 ? 'avg-warn' : ''}"><b>${r1(r.avg)}</b></td><td class="r num muted">${r.km ? new Intl.NumberFormat('pl-PL').format(Math.round(r.km)) : '—'}</td></tr>`).join('');
  const mh = m => `${MONTHS_GEN[Number(m.slice(5, 7)) - 1].slice(0, 3)} ${m.slice(2, 4)}`;
  const th = (k, l, cls = '') => `<th class="${cls} sortable" data-avg-sort="${k}">${l}${avgSort.k===k ? (avgSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const matrix = `<div class="tablewrap"><table class="avg-tbl"><thead><tr>${th('plate','Auto')}${months.map(m => `<th class="r">${mh(m)}</th>`).join('')}${th('avg','Średnia','r')}<th class="r">km</th></tr></thead>
    <tbody>${rows}</tbody><tfoot><tr><td><b>Flota</b></td>${M.fRates.map(x => `<td class="r num"><b>${r1(x)}</b></td>`).join('')}<td class="r num avg-col"><b>${r1(M.fAvg)}</b></td><td class="r num muted">${new Intl.NumberFormat('pl-PL').format(Math.round(M.fKm))}</td></tr></tfoot></table></div>
    <p class="muted small sec-empty">l/100 km. Kolor względem średniej floty w tym miesiącu: <span class="avg-good">zielony</span> – ponad 10% lepiej, <span class="avg-warn">żółty</span> – 15% gorzej, <span class="avg-bad">czerwony</span> – 30% gorzej; <span class="avg-u">szary</span> – niepewne (mało danych lub błędne liczniki), nie liczone do średnich. Najedź na liczbę – km i litry. Kliknij auto – karta auta.</p>`;
  const D = driverAvg(from, to).filter(r => r.all).sort((a, b) => (a.rate==null) - (b.rate==null) || (b.rate || 0) - (a.rate || 0));
  const dTot = D.reduce((s, r) => ({km: s.km + r.km, l: s.l + r.l}), {km: 0, l: 0}), dAvg = dTot.km ? dTot.l / dTot.km * 100 : null;
  const drows = D.map(r => { const vs = r.rate!=null && dAvg ? r.rate / dAvg - 1 : null;
    return `<tr class="click" data-drv-card="${esc(r.id)}"><td><b>${esc(dName(r.id))}</b></td><td class="r num">${r.n} / ${r.all}</td><td class="r num">${fl(Math.round(r.l))}</td><td class="r num">${new Intl.NumberFormat('pl-PL').format(Math.round(r.km))}</td>
      <td class="r num"><b class="${vs!=null && vs > 0.15 ? 'neg' : ''}">${r1(r.rate)}</b></td><td class="r num">${vs==null ? '—' : `<span class="pill ${vs > 0.15 ? 'bad' : vs > 0.05 ? 'warn' : vs < -0.05 ? 'ok' : 'off'}">${vs > 0 ? '+' : ''}${Math.round(vs * 100)}%</span>`}</td>
      <td class="muted small">${[...r.veh].map(id => esc((byId('vehicles', id) || {}).plate || '')).join(', ')}</td></tr>`; }).join('');
  const drivers = D.length ? `<div class="tablewrap"><table><thead><tr><th>Kierowca</th><th class="r" title="policzone / wszystkie tankowania">Tankowania</th><th class="r">Litry</th><th class="r">Km (z liczników)</th><th class="r">Średnie l/100</th><th class="r">vs średnia</th><th>Auta</th></tr></thead><tbody>${drows}</tbody>
    <tfoot><tr><td><b>Wszyscy</b></td><td></td><td class="r num"><b>${fl(Math.round(dTot.l))}</b></td><td class="r num"><b>${new Intl.NumberFormat('pl-PL').format(Math.round(dTot.km))}</b></td><td class="r num"><b>${r1(dAvg)}</b></td><td></td><td></td></tr></tfoot></table></div>
    <p class="muted small sec-empty">Z tankowań wpisanych przez kierowców w aplikacji: litry, które wpisał, podzielone przez km od poprzedniego tankowania tego auta (stan licznika). Zakładamy tankowanie do pełna. Nie liczymy tankowań bez licznika, z licznikiem cofniętym albo z odcinkiem poniżej 20 / powyżej 2500 km i większych niż bak – stąd „policzone / wszystkie”. Średnia poniżej 100 km pokazuje „—”.</p>`
    : '<p class="muted sec-empty">W tym okresie kierowcy nie wpisali tankowań w aplikacji. Średnia kierowcy liczy się z jego wpisów: przycisk „Zatankuj” w panelu kierowcy (licznik + litry).</p>';
  return `<div class="bar"><h2>Średnie spalania</h2><div class="tools"><div class="seg" role="group" aria-label="Okres">${[3, 6, 12].map(n => `<button class="small ${avgMonths===n ? 'on' : ''}" data-avg-m="${n}" aria-pressed="${avgMonths===n}">${n} mies.</button>`).join('')}</div></div></div>
    <div class="panel fc-meta">${[[`Średnia floty (${avgMonths} mies.)`, r1(M.fAvg) + ' l/100 km'], ['Ten miesiąc', r1(M.fRates[M.fRates.length - 1]) + ' l/100 km'], ['Poprzedni miesiąc', r1(M.fRates[M.fRates.length - 2]) + ' l/100 km'], ['Z wpisów kierowców', r1(dAvg) + ' l/100 km']].map(([l, v]) => `<div><span class="label">${l}</span><b>${v}</b></div>`).join('')}</div>
    <div class="panel"><div class="sec-head"><h3>Busy miesiąc po miesiącu</h3><span class="muted small">${mh(months[0])} – ${mh(months[months.length - 1])}</span></div>${matrix}</div>
    <div class="panel"><div class="sec-head"><h3>Średnie spalanie kierowców</h3><span class="muted small">od ${fdate(from)}</span></div>${drivers}</div>`;
}
document.addEventListener('click', e => {
  const m = e.target.closest('[data-avg-m]'); if (m){ avgMonths = Number(m.dataset.avgM); render(); return; }
  const s = e.target.closest('[data-avg-sort]'); if (s){ const k = s.dataset.avgSort; avgSort = avgSort.k===k ? {k, dir: -avgSort.dir} : {k, dir: k==='plate' ? 1 : -1}; render(); return; }
  const d = e.target.closest('[data-drv-card]'); if (d && typeof openDriverCard==='function'){ openDriverCard(d.dataset.drvCard); }
});
