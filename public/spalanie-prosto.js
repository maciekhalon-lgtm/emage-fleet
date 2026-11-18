/* Emage FLEET — Paliwo → Spalanie (prosty widok).
   Jedno źródło: wpisy kierowców w aplikacji (litry i liczniki z tankowań, jak w Rankingu aut).
   Okres: ten miesiąc / poprzedni / ostatnie 3 miesiące. Klik w auto – lista jego tankowań. */
'use strict';
let spPer = 'mies';
function spRange(){
  const t = today(), m0 = t.slice(0, 8) + '01';
  if (spPer==='prev'){ const p = prevMonth(t.slice(0, 7)); return [p + '-01', addDays(m0, -1)]; }
  if (spPer==='3m') return [addDays(t, -89), t];
  return [m0, t];
}
function spData(){
  const [from, to] = spRange(), legs = rkLegs(from, to);
  const rows = S.vehicles.filter(v => v.status!=='wycofany').map(v => {
    const lg = legs.filter(x => x.vid===v.id), km = lg.reduce((a, x) => a + x.km, 0), l = lg.reduce((a, x) => a + x.l, 0);
    return {v, km, l, rate: km >= 300 ? l / km * 100 : null};
  });
  const ok = rows.filter(r => r.rate!=null), fKm = ok.reduce((a, r) => a + r.km, 0), fL = ok.reduce((a, r) => a + r.l, 0);
  const avg = fKm ? fL / fKm * 100 : null;
  ok.forEach(r => r.diff = avg ? (r.rate - avg) / avg * 100 : null);
  return {from, to, avg, km: fKm, l: fL, ok: ok.sort((a, b) => b.rate - a.rate), none: rows.filter(r => r.rate==null)};
}
function viewFuelSimple(){
  const D = spData(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const head = `<div class="bar"><h2>Spalanie</h2><div class="tools"><div class="seg">${[['mies', 'Ten miesiąc'], ['prev', 'Poprzedni'], ['3m', '3 miesiące']].map(([k, l]) => `<button type="button" class="${spPer===k ? 'on' : ''}" data-sp-per="${k}">${l}</button>`).join('')}</div></div></div>`;
  const kpi = `<div class="panel sp-kpi"><div><span class="label">Średnie spalanie floty</span><b class="num">${D.avg!=null ? f1(D.avg) + ' l/100 km' : '—'}</b></div>
    <div><span class="label">Km</span><b class="num">${nf.format(Math.round(D.km))}</b></div><div><span class="label">Litry</span><b class="num">${nf.format(Math.round(D.l))}</b></div></div>`;
  const row = r => `<tr class="click" data-sp-veh="${esc(r.v.id)}"><td>${plate(r.v.plate)}<span class="sub">${esc([r.v.make, r.v.model].filter(Boolean).join(' '))}</span></td>
    <td class="r"><b class="num ${r.rate > THEFT_RATE ? 'neg' : ''}">${f1(r.rate)}</b></td>
    <td class="r">${r.diff==null ? '' : `<span class="pill ${r.diff > 15 ? 'bad' : r.diff > 5 ? 'warn' : r.diff < -5 ? 'ok' : 'off'}">${r.diff > 0 ? '+' : ''}${Math.round(r.diff)}%</span>`}</td>
    <td class="r num">${nf.format(Math.round(r.km))}</td><td class="r num">${nf.format(Math.round(r.l))}</td></tr>`;
  const tbl = D.ok.length ? `<div class="panel tablewrap"><table class="sp-tbl"><thead><tr><th>Auto</th><th class="r">Spalanie l/100</th><th class="r">vs średnia</th><th class="r">Km</th><th class="r">Litry</th></tr></thead><tbody>${D.ok.map(row).join('')}</tbody></table></div>`
    : `<div class="panel empty"><p>Brak tankowań z licznikiem w tym okresie – spalanie policzy się, gdy kierowcy wpiszą co najmniej 2 tankowania auta (min. 300 km).</p></div>`;
  const none = D.none.length ? `<details class="panel fold"><summary class="sec-head"><h3>Bez danych</h3><span class="count">${D.none.length} ${isPlural(D.none.length, 'auto', 'auta', 'aut')}</span></summary>
    <p class="muted small" style="margin:0 0 8px">Za mało tankowań z licznikiem w tym okresie.</p><div class="sp-none">${D.none.map(r => `<span data-sp-veh="${esc(r.v.id)}" class="click">${plate(r.v.plate)}</span>`).join('')}</div></details>` : '';
  return head + kpi + tbl + none;
}
function openSpVehicle(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const [from, to] = spRange(), nf = new Intl.NumberFormat('pl-PL'), f1 = x => x.toFixed(1).replace('.', ',');
  const all = appFuel().filter(c => c.vehicleId===vid && Number(c.liters) > 0 && !String(c.note || '').startsWith('Karta:')).sort((a, b) => (Number(a.odometer) || 0) - (Number(b.odometer) || 0) || String(a.date).localeCompare(b.date));
  const rows = all.map((c, i) => { const p = all[i - 1], km = p && Number(c.odometer) && Number(p.odometer) ? Number(c.odometer) - Number(p.odometer) : null;
    return {c, km, rate: km > 50 ? Number(c.liters) / km * 100 : null}; }).filter(x => x.c.date >= from && x.c.date <= to).sort((a, b) => String(b.c.date).localeCompare(a.c.date) || (Number(b.c.odometer) || 0) - (Number(a.c.odometer) || 0));
  editing = {col: 'sp-veh', id: vid, base: {}, special: () => closeForm()};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = `${v.plate} – tankowania`;
  $('#dlg-body').innerHTML = `<p class="muted small field full" style="margin:0;display:block">${fdate(from)} – ${fdate(to)} · z wpisów kierowców</p>
    <div class="field full tablewrap"><table class="sp-tbl"><thead><tr><th>Data</th><th>Kierowca</th><th class="r">Litry</th><th class="r">Licznik</th><th class="r">Km od poprz.</th><th class="r">l/100</th><th></th></tr></thead><tbody>
    ${rows.map(x => `<tr ${canEditDoc('costs', x.c) ? `class="click" data-edit="costs" data-id="${esc(x.c.id)}"` : ''}><td>${fdate(x.c.date)}</td><td>${esc(dName(fillDriver(x.c) || x.c.driverId) || '—')}</td>
      <td class="r num">${f1(Number(x.c.liters))}</td><td class="r num">${x.c.odometer ? nf.format(x.c.odometer) : '—'}</td><td class="r num">${x.km ? nf.format(x.km) : '—'}</td>
      <td class="r">${x.rate!=null ? `<b class="num ${x.rate > THEFT_RATE ? 'neg' : ''}">${f1(x.rate)}</b>` : '—'}</td><td>${x.c.full===false ? '<span class="pill off">dotankowanie</span>' : ''}${(x.c.flags || []).length ? ' <span class="pill bad">uwaga</span>' : ''}</td></tr>`).join('')
      || '<tr><td colspan="7" class="muted">Brak tankowań w tym okresie.</td></tr>'}</tbody></table></div>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
document.addEventListener('click', e => {
  const p = e.target.closest('[data-sp-per]'); if (p){ spPer = p.dataset.spPer; render(); return; }
  const r = e.target.closest('[data-sp-veh]'); if (r){ openSpVehicle(r.dataset.spVeh); return; }
});
