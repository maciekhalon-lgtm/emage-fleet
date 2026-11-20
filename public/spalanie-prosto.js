/* Emage FLEET — Paliwo → Spalanie (prosty widok).
   Jedno źródło: wpisy kierowców w aplikacji (litry i liczniki z tankowań, jak w Rankingu aut).
   Okres: ten miesiąc / poprzedni / ostatnie 3 miesiące, ze zmianą do okresu wcześniej. Klik w auto – lista jego tankowań. */
'use strict';
let spPer = 'mies';
function spRange(per = spPer){
  const t = today(), m0 = t.slice(0, 8) + '01';
  if (per==='prev'){ const p = prevMonth(t.slice(0, 7)); return [p + '-01', addDays(m0, -1)]; }
  if (per==='3m') return [addDays(t, -89), t];
  return [m0, t];
}
/* okres do porównania: poprzedni miesiąc (albo 3 miesiące wcześniej dla „3 miesiące”) */
function spPrevRange(){
  const [from, to] = spRange();
  if (spPer==='3m') return [addDays(from, -90), addDays(from, -1)];
  const p = prevMonth(from.slice(0, 7)); return [p + '-01', addDays(from, -1)];
}
const spRate = lg => { const km = lg.reduce((a, x) => a + x.km, 0), l = lg.reduce((a, x) => a + x.l, 0); return {km, l, rate: km >= 300 ? l / km * 100 : null}; };
let spSort = ['diff', -1];   // domyślnie: najbardziej powyżej średniej swojej klasy na górze
const SP_SORTS = [['diff', 'vs średnia klasy'], ['own', 'vs własna średnia'], ['rate', 'Spalanie'], ['km', 'Km']];
function spData(){
  const [from, to] = spRange(), legs = rkLegs(from, to), [pf, pt] = spPrevRange(), prev = rkLegs(pf, pt), ownFrom = addDays(to, -179);
  const rows = S.vehicles.filter(v => v.status!=='wycofany').map(v => {
    const {km, l, rate} = spRate(legs.filter(x => x.vid===v.id)), pr = spRate(prev.filter(x => x.vid===v.id)).rate;
    const ownL = rkVehLegs(v.id).filter(x => x.date >= ownFrom && x.date <= to);
    // średnia auta z ostatnich 6 miesięcy – dopiero gdy są dane sprzed bieżącego okresu (z min. 2 miesięcy), inaczej to ta sama liczba
    const own = ownL.some(x => x.date < from) && ownL.length && diffDays(ownL[0].date, to) >= 55 ? spRate(ownL).rate : null;
    return {v, cls: wcls(v), km, l, rate, prev: pr, chg: rate!=null && pr!=null ? rate - pr : null, own, vsOwn: rate!=null && own!=null ? rate - own : null};
  });
  const ok = rows.filter(r => r.rate!=null), fKm = ok.reduce((a, r) => a + r.km, 0), fL = ok.reduce((a, r) => a + r.l, 0);
  const cls = {};
  WCLS.forEach(([k]) => { const xs = ok.filter(r => r.cls===k), km = xs.reduce((a, r) => a + r.km, 0), l = xs.reduce((a, r) => a + r.l, 0);
    cls[k] = {avg: km ? l / km * 100 : null, km, l, n: xs.length}; });
  ok.forEach(r => { const a = cls[r.cls].avg; r.diff = a ? (r.rate - a) / a * 100 : null; });
  return {from, to, avg: fKm ? fL / fKm * 100 : null, km: fKm, l: fL, cls, ok, none: rows.filter(r => r.rate==null)};
}
function viewFuelSimple(){
  const D = spData(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const head = `<div class="bar"><h2>Spalanie</h2><div class="tools"><div class="seg">${[['mies', 'Ten miesiąc'], ['prev', 'Poprzedni'], ['3m', '3 miesiące']].map(([k, l]) => `<button type="button" class="${spPer===k ? 'on' : ''}" data-sp-per="${k}">${l}</button>`).join('')}</div></div></div>`;
  const kpi = `<div class="panel sp-kpi">${WCLS.filter(([k]) => D.cls[k].n).map(([k, l]) => `<div><span class="label">Średnia – ${l.toLowerCase()}</span><b class="num">${f1(D.cls[k].avg)} l/100 km</b><span class="sub">${D.cls[k].n} ${isPlural(D.cls[k].n, 'auto', 'auta', 'aut')}</span></div>`).join('')
    || `<div><span class="label">Średnie spalanie</span><b class="num">—</b></div>`}
    <div><span class="label">Km</span><b class="num">${nf.format(Math.round(D.km))}</b></div><div><span class="label">Litry</span><b class="num">${nf.format(Math.round(D.l))}</b></div></div>`;
  const [sk, dir] = spSort;
  const val = r => sk==='own' ? r.vsOwn : r[sk];
  const cmp = (a, b) => { const x = val(a), y = val(b); if (x==null && y==null) return b.rate - a.rate; if (x==null) return 1; if (y==null) return -1; return (x - y) * dir || b.rate - a.rate; };
  const sorts = `<div class="sp-sort"><span class="muted small">Sortuj:</span><div class="seg">${SP_SORTS.map(([k, l]) => `<button type="button" class="small ${sk===k ? 'on' : ''}" data-sp-sort="${k}">${l}${sk===k ? (dir < 0 ? ' ▼' : ' ▲') : ''}</button>`).join('')}</div></div>`;
  const delta = (x, title) => x==null ? '<span class="muted">—</span>' : `<span class="num ${x > 0.5 ? 'neg' : x < -0.5 ? 'pos' : 'muted'}" title="${esc(title)}">${x > 0 ? '+' : x < 0 ? '−' : ''}${f1(Math.abs(x))}</span>`;
  const row = r => `<tr class="click" data-sp-veh="${esc(r.v.id)}"><td>${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></td>
    <td class="r"><b class="num ${r.rate > theftOf(r.v.id) ? 'neg' : ''}">${f1(r.rate)}</b></td>
    <td class="r">${r.diff==null ? '' : `<span class="pill ${r.diff > 15 ? 'bad' : r.diff > 5 ? 'warn' : r.diff < -5 ? 'ok' : 'off'}">${r.diff > 0 ? '+' : ''}${Math.round(r.diff)}%</span>`}</td>
    <td class="r">${r.own!=null ? `<span class="num">${f1(r.own)}</span> ${delta(r.vsOwn, 'teraz względem własnej średniej auta')}` : '<span class="muted">—</span>'}</td>
    <td class="r">${delta(r.chg, r.prev!=null ? 'poprzednio ' + f1(r.prev) + ' l/100 km' : '')}</td>
    <td class="r num">${nf.format(Math.round(r.km))}</td><td class="r num">${nf.format(Math.round(r.l))}</td></tr>`;
  const thead = `<thead><tr><th>Auto</th><th class="r">Spalanie l/100</th><th class="r">vs średnia klasy</th><th class="r">Średnia auta (6 mies.)</th><th class="r">${spPer==='3m' ? 'Zmiana do 3 mies. wcześniej' : 'Zmiana do poprz. miesiąca'}</th><th class="r">Km</th><th class="r">Litry</th></tr></thead>`;
  const sections = WCLS.map(([k, l]) => { const xs = D.ok.filter(r => r.cls===k).sort(cmp); if (!xs.length) return '';
    return `<div class="panel tablewrap"><div class="sec-head"><h3>${l}</h3><span class="muted small">średnia klasy <b>${f1(D.cls[k].avg)} l/100 km</b> · ${nf.format(Math.round(D.cls[k].km))} km</span></div>
      <table class="sp-tbl">${thead}<tbody>${xs.map(row).join('')}</tbody></table></div>`; }).join('');
  const tbl = D.ok.length ? sorts + sections
    : `<div class="panel empty"><p>Brak tankowań z licznikiem w tym okresie – spalanie policzy się, gdy kierowcy wpiszą co najmniej 2 tankowania auta (min. 300 km).</p></div>`;
  const none = D.none.length ? `<details class="panel fold"><summary class="sec-head"><h3>Bez danych</h3><span class="count">${D.none.length} ${isPlural(D.none.length, 'auto', 'auta', 'aut')}</span></summary>
    <p class="muted small" style="margin:0 0 8px">Za mało tankowań z licznikiem w tym okresie.</p><div class="sp-none">${D.none.map(r => `<span data-sp-veh="${esc(r.v.id)}" class="click">${plate(r.v.plate)}</span>`).join('')}</div></details>` : '';
  const note = D.ok.length ? `<p class="muted small">Auta porównujemy w obrębie klasy (do 2,5 t / powyżej 2,5 t – ustawiasz w danych auta). „Średnia auta” – jego spalanie z ostatnich 6 miesięcy; obok różnica: ile teraz pali więcej (+) albo mniej (−) niż zwykle.</p>` : '';
  return head + kpi + tbl + none + note;
}
function openSpVehicle(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const [from, to] = spRange(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const legs = new Map(rkVehLegs(vid).map(x => [x.c.id, x]));
  const rows = appFuel().filter(c => c.vehicleId===vid && Number(c.liters) > 0 && !String(c.note || '').startsWith('Karta:') && c.date >= from && c.date <= to)
    .map(c => { const g = legs.get(c.id); return {c, km: g ? g.km : null, l: g ? g.l : null, rate: g ? g.rate : null}; })
    .sort((a, b) => String(b.c.date).localeCompare(a.c.date) || (Number(b.c.odometer) || 0) - (Number(a.c.odometer) || 0));
  editing = {col: 'sp-veh', id: vid, base: {}, special: () => closeForm()};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = `${v.plate} – tankowania`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0;display:block">${fdate(from)} – ${fdate(to)} · z wpisów kierowców · spalanie liczone od tankowania do pełna (albo przejęcia auta) do następnego tankowania do pełna</p>
    <div class="field full tablewrap"><table class="sp-tbl"><thead><tr><th>Data</th><th>Kierowca</th><th class="r">Litry</th><th class="r">Licznik</th><th class="r">Odcinek (km / l)</th><th class="r">l/100</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr ${canEditDoc('costs', x.c) ? `class="click" data-edit="costs" data-id="${esc(x.c.id)}"` : ''}><td>${fdate(x.c.date)}</td><td>${esc(dName(fillDriver(x.c) || x.c.driverId) || '—')}</td>
      <td class="r num">${f1(Number(x.c.liters))}</td><td class="r num">${x.c.odometer ? nf.format(x.c.odometer) : '—'}</td><td class="r num">${x.km ? `${nf.format(x.km)} km / ${f1(x.l)} l` : '—'}</td>
      <td class="r">${x.rate!=null ? `<b class="num ${x.rate > theftOf(vid) ? 'neg' : ''}">${f1(x.rate)}</b>` : '—'}</td><td>${x.c.full===false ? '<span class="pill off">dotankowanie</span>' : ''}${(x.c.flags || []).length ? ' <span class="pill bad">uwaga</span>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="7" class="muted">Brak tankowań w tym okresie.</td></tr>'}</tbody></table></div>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
document.addEventListener('click', e => {
  const p = e.target.closest('[data-sp-per]'); if (p){ spPer = p.dataset.spPer; render(); return; }
  const o = e.target.closest('[data-sp-sort]'); if (o){ const k = o.dataset.spSort; spSort = [k, spSort[0]===k ? -spSort[1] : (k==='rate' || k==='km' || k==='diff' || k==='own' ? -1 : 1)]; render(); return; }
  const r = e.target.closest('[data-sp-veh]'); if (r){ openSpVehicle(r.dataset.spVeh); return; }
});
