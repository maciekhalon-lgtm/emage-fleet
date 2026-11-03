/* Emage FLEET — trasy: ewidencja tras (kierownik floty) i raport tras */
'use strict';
const routeById = id => id ? byId('routes', id) : null;
const rCode = id => { const r = routeById(id); return r ? r.code : ''; };
const rLabel = id => { const r = routeById(id); return r ? `${r.code} · ${r.name}` : ''; };
const routePill = id => { const r = routeById(id); return r ? `<span class="pill soon route-pill" title="${esc(r.name)}">${esc(r.code)}</span>` : ''; };
/* Opcje trasy w formularzu: aktywne + ta, która już jest wpisana */
const routeOpts = () => { const keep = editing && editing.base ? editing.base.routeId : '';
  return [['','— bez trasy —'], ...S.routes.filter(r => r.active!==false || r.id===keep).sort((a, b) => String(a.code).localeCompare(b.code, 'pl', {numeric:true}))
    .map(r => [r.id, `${r.code} · ${r.name}${r.active===false ? ' (nieaktywna)' : ''}`])]; };

/* Wybór trasy dla kierowcy: aktywne trasy + ta, która jest już wpisana */
function routeSelect(id, cur, attrs = ''){
  const list = S.routes.filter(r => r.active!==false || r.id===cur).sort((a, b) => String(a.code).localeCompare(b.code, 'pl', {numeric:true}));
  return `<select id="${id}" ${attrs}><option value="">— bez trasy —</option>${list.map(r => `<option value="${esc(r.id)}" ${r.id===cur?'selected':''}>${esc(r.code)} · ${esc(r.name)}</option>`).join('')}</select>`;
}
document.addEventListener('change', async e => {
  const bid = e.target.dataset && e.target.dataset.routeFor; if (!bid) return;
  try { await db.collection('bookings').doc(bid).update({routeId: e.target.value || null}); toast(e.target.value ? 'Zmieniono trasę: ' + rLabel(e.target.value) : 'Usunięto trasę'); }
  catch(err){ handleWriteErr(err); }
});
function viewRoutes(){
  const head = `<div class="bar"><h2>Trasy</h2><div class="tools">${canCreate('routes') ? `<button class="primary" data-new="routes">${ic('plus')}Dodaj trasę</button>` : ''}</div></div>`;
  if (!S.routes.length) return head + loadingOr('routes', emptyBlock('Brak tras',
    'Dodaj trasy, które jeżdżą Twoi kierowcy – kod, nazwę i czy wymagają tachografu. Potem przypiszesz trasę w rezerwacji, a koszty i kilometry policzą się według tras.',
    `<button class="primary" data-new="routes">${ic('plus')}Dodaj trasę</button>`, '', 'routes'));
  const now = S.bookings.filter(holds);
  const list = S.routes.slice().sort((a, b) => (a.active===false) - (b.active===false) || String(a.code).localeCompare(b.code, 'pl', {numeric:true}));
  const rows = list.map(r => {
    const on = now.filter(b => b.routeId===r.id);
    return `<tr ${canEditDoc('routes', r) ? `class="click" data-edit="routes" data-id="${esc(r.id)}" tabindex="0"` : ''} ${r.active===false ? 'style="opacity:.6"' : ''}>
      <td><b class="num">${esc(r.code)}</b></td>
      <td><b>${esc(r.name)}</b>${r.note ? `<span class="sub">${esc(r.note)}</span>` : ''}</td>
      <td>${r.tacho ? '<span class="pill info">tachograf</span>' : '<span class="muted">—</span>'}</td>
      <td>${r.loading ? '<span class="pill soon">załadunkowa</span>' : '<span class="muted">—</span>'}</td>
      <td>${r.active===false ? '<span class="pill off">nieaktywna</span>' : '<span class="pill ok">aktywna</span>'}</td>
      <td>${on.length ? on.map(b => `${vPlate(b.vehicleId)} <span class="sub">${esc(crewName(b))}</span>`).join('') : '<span class="muted">—</span>'}</td></tr>`;
  }).join('');
  return `<div class="section">${head}<div class="panel tablewrap"><table><thead><tr><th>Kod</th><th>Nazwa</th><th>Tachograf</th><th>Załadunek</th><th>Status</th><th>Teraz w trasie</th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:0;max-width:90ch">Trasę przypisujesz w rezerwacji (Rezerwacje → rezerwacja → Trasa). Tankowania i koszty z tych dni dostają trasę automatycznie. Tachograf to tylko informacja – nie blokuje przydziału.</p></div>`;
}

/* Raport tras w okresie [a, b]: dni pracy i km z dni pracy, koszty i paliwo z kosztów przypisanych do trasy */
function routeReportRows(a, b){
  const days = S.bookings.filter(x => x.pickup && x.pickup.at >= a && x.pickup.at <= b);
  const costs = S.costs.filter(c => c.date >= a && c.date <= b);
  const ids = [...new Set([...days.map(x => x.routeId || ''), ...costs.map(c => c.routeId || '')])];
  return ids.map(id => {
    const d = days.filter(x => (x.routeId || '')===id);
    const cs = costs.filter(c => (c.routeId || '')===id);
    const kmD = d.reduce((s, x) => s + (x.returned && x.returned.km > x.pickup.km ? x.returned.km - x.pickup.km : 0), 0);
    const fuel = cs.filter(isFuel);
    const liters = fuel.reduce((s, c) => s + Number(c.liters || 0), 0);
    const cost = cs.reduce((s, c) => s + Number(c.amount || 0), 0);
    return {id, r: routeById(id), days: d.length, km: kmD, cost, fuelCost: fuel.reduce((s, c) => s + Number(c.amount || 0), 0), liters,
      cons: kmD && liters ? liters / kmD * 100 : null, perKm: kmD ? cost / kmD : null};
  }).sort((x, y) => (!x.id) - (!y.id) || y.km - x.km || y.cost - x.cost);
}
function routeReportSection(){
  if (!S.routes.length) return '';
  const [a, b, label] = periodRange();
  const rows = routeReportRows(a, b);
  const body = rows.map(x => `<tr><td>${x.r ? `<b class="num">${esc(x.r.code)}</b><span class="sub">${esc(x.r.name)}</span>` : '<span class="muted">bez trasy</span>'}</td>
    <td class="r num">${x.days || '—'}</td><td class="r num">${x.km ? fmtInt(x.km)+' km' : '—'}</td>
    <td class="r num">${zl(x.cost)}</td><td class="r num">${x.liters ? fmt1(x.liters)+' l' : '—'}</td>
    <td class="r num">${x.cons ? fmt1(x.cons)+' l/100 km' : '—'}</td><td class="r num">${x.perKm ? x.perKm.toFixed(2).replace('.', ',')+' zł' : '—'}</td></tr>`).join('');
  return `<div class="section"><div class="bar"><h2>Trasy – ${label}</h2></div>
    ${rows.length ? `<div class="panel tablewrap"><table><thead><tr><th>Trasa</th><th class="r">Dni pracy</th><th class="r">Przejechane</th><th class="r">Koszty</th><th class="r">Paliwo</th><th class="r">Spalanie (orient.)</th><th class="r">Koszt / km</th></tr></thead><tbody>${body}</tbody></table></div>`
      : '<div class="panel empty"><p>Brak dni pracy i kosztów w tym okresie.</p></div>'}
    <p class="muted small" style="margin:0;max-width:90ch">Kilometry z dni pracy (przejęcie → zdanie) z trasą. Spalanie orientacyjne: wszystkie litry z tankowań na trasie ÷ kilometry × 100 – dokładne spalanie aut i kierowców liczymy dalej między tankowaniami do pełna.</p></div>`;
}
