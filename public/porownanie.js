/* Emage FLEET — porównanie spalania: dwa wybrane miesiące obok siebie, dla pojazdów albo kierowców (tylko kierownik floty).
   Pojazd: ta sama metoda co w „Spalanie i przebiegi” (karty paliwowe, a gdy brak – wpisy kierowców).
   Kierowca: odcinek między tankowaniami trafia do kierowcy, który wpisał tankowanie zamykające ten odcinek
   (tankowanie z karty paruje się z wpisem kierowcy jak w Kartach paliwowych). */
'use strict';
const prevMonth = m => { const d = parse(m + '-01'); d.setMonth(d.getMonth() - 1); return isoOf(d).slice(0, 7); };
let cmpA = prevMonth(today().slice(0, 7)), cmpB = today().slice(0, 7), cmpMode = 'veh', cmpSort = {k:'diff', dir:-1};
const monthRange = m => [m + '-01', mEnd(m + '-01')];
const MONTHS_GEN = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
const monthName = m => `${MONTHS_GEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;

/* Kierowca tankowania zamykającego odcinek: wpis w aplikacji albo wpis sparowany z tankowaniem z karty */
function cmpDriverOf(){
  const card2cost = new Map();
  fcCompare(S.fuelCardRows.filter(r => r.kind!=='other')).pairs.forEach(p => { if (p.cost) card2cost.set(p.row.id, p.cost); });
  const costById = new Map(appFuel().map(c => [c.id, c]));
  return id => { const c = card2cost.get(id) || costById.get(id); return c ? (fillDriver(c) || c.driverId || '') : ''; };
}
function cmpMonth(m, drv){
  const [f, t] = monthRange(m), veh = {}, dr = {};
  S.vehicles.filter(v => v.status!=='wycofany').forEach(v => {
    const c = consRange(v.id, f, t);
    veh[v.id] = c && c.rate!=null ? c : null;
    if (c && c.parts && c.rate!=null && !c.unsure) c.parts.forEach(p => {
      const d = drv(p.id) || '?'; const x = dr[d] = dr[d] || {km:0, l:0, veh: new Set()};
      x.km += p.km; x.l += p.l; x.veh.add(v.id);
    });
  });
  Object.values(dr).forEach(x => { x.rate = x.km ? x.l / x.km * 100 : null; x.unsure = x.rate!=null && (x.rate < 5 || x.rate > 25); });
  return {veh, dr};
}
function viewCompare(){
  if (!P().manage) return '';
  const drv = cmpDriverOf(), A = cmpMonth(cmpA, drv), B = cmpMonth(cmpB, drv);
  const f1 = n => n==null ? '—' : n.toFixed(1).replace('.', ',');
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const head = `<div class="bar"><h2>Porównanie spalania</h2><div class="tools pb-tools">
      <label class="label" for="cmp-a">Miesiąc A</label><input id="cmp-a" type="month" value="${cmpA}" style="width:auto">
      <label class="label" for="cmp-b">Miesiąc B</label><input id="cmp-b" type="month" value="${cmpB}" style="width:auto"></div></div>
    <div class="pb-quick"><div class="seg" role="group" aria-label="Widok"><button class="small ${cmpMode==='veh' ? 'on' : ''}" data-cmpm="veh" aria-pressed="${cmpMode==='veh'}">Pojazdy</button><button class="small ${cmpMode==='drv' ? 'on' : ''}" data-cmpm="drv" aria-pressed="${cmpMode==='drv'}">Kierowcy</button></div></div>`;
  const rateOf = c => c && c.rate!=null && !c.unsure ? c.rate : null;
  let rows;
  if (cmpMode==='veh'){
    rows = S.vehicles.filter(v => v.status!=='wycofany').map(v => { const a = A.veh[v.id], b = B.veh[v.id];
      return {id: v.id, name: v.plate, sub: v.make + ' ' + v.model, label: plate(v.plate), a: rateOf(a), b: rateOf(b), ka: a ? a.km : 0, kb: b ? b.km : 0, ua: a && a.unsure, ub: b && b.unsure}; });
  } else {
    const ids = new Set([...Object.keys(A.dr), ...Object.keys(B.dr)]);
    rows = [...ids].map(id => { const a = A.dr[id], b = B.dr[id], nm = id==='?' ? 'nieustalony (brak wpisu kierowcy)' : dName(id) || 'nieznany';
      const vs = new Set([...(a ? a.veh : []), ...(b ? b.veh : [])]);
      return {id, name: nm, sub: [...vs].map(x => (byId('vehicles', x) || {}).plate).filter(Boolean).join(', '), label: `<b>${esc(nm)}</b>`, a: rateOf(a), b: rateOf(b), ka: a ? a.km : 0, kb: b ? b.km : 0, ua: a && a.unsure, ub: b && b.unsure}; });
  }
  rows.forEach(r => { r.diff = r.a!=null && r.b!=null ? r.b - r.a : null; r.pct = r.diff!=null && r.a ? r.diff / r.a * 100 : null; });
  const val = (r, k) => k==='name' ? r.name : r[k];
  rows.sort((x, y) => { const X = val(x, cmpSort.k), Y = val(y, cmpSort.k);
    if (X==null && Y==null) return 0; if (X==null) return 1; if (Y==null) return -1;
    return (typeof X==='string' ? X.localeCompare(Y, 'pl') : X - Y) * cmpSort.dir; });
  const lvl = (r, rate) => cmpMode==='veh' && rate!=null ? levelPill(levelFor(r.id, rate)) : '';
  const cell = (r, rate, kmV, uns) => rate!=null ? `<b class="fc-big">${f1(rate)}</b> l/100<span class="sub">${nf(kmV)} km ${lvl(r, rate)}</span>` : `<span class="muted">${uns ? 'niepewne' : kmV ? 'za mało danych' : 'brak danych'}</span>`;
  const th = (k, l, r) => `<th class="${r ? 'r ' : ''}sortable" data-cmps="${k}">${l}${cmpSort.k===k ? (cmpSort.dir < 0 ? ' ▼' : ' ▲') : ''}</th>`;
  const body = rows.map(r => `<tr><td>${r.label}<span class="sub">${esc(cmpMode==='veh' ? r.sub : r.sub)}</span></td>
      <td class="r num">${cell(r, r.a, r.ka, r.ua)}</td><td class="r num">${cell(r, r.b, r.kb, r.ub)}</td>
      <td class="r num">${r.diff==null ? '<span class="muted">—</span>' : `<b class="${r.diff > 0.05 ? 'neg' : r.diff < -0.05 ? 'pos' : ''}">${r.diff > 0 ? '▲ +' : r.diff < 0 ? '▼ ' : ''}${f1(r.diff)}</b><span class="sub">${r.pct > 0 ? '+' : ''}${f1(r.pct)}%</span>`}</td></tr>`).join('');
  const tot = (M, k) => { const xs = cmpMode==='veh' ? Object.values(M.veh).filter(c => c && !c.unsure) : Object.values(M.dr).filter(x => x.rate!=null && !x.unsure);
    const km = xs.reduce((s, x) => s + x.km, 0), l = xs.reduce((s, x) => s + x.l, 0); return {km, rate: km ? l / km * 100 : null}; };
  const ta = tot(A), tb = tot(B), td = ta.rate!=null && tb.rate!=null ? tb.rate - ta.rate : null;
  const meta = `<div class="panel fc-meta"><div><span class="label">${esc(monthName(cmpA))}</span><b>${f1(ta.rate)} l/100 km</b><span class="sub">${nf(ta.km)} km</span></div>
    <div><span class="label">${esc(monthName(cmpB))}</span><b>${f1(tb.rate)} l/100 km</b><span class="sub">${nf(tb.km)} km</span></div>
    <div><span class="label">Zmiana floty</span><b class="${td > 0.05 ? 'neg' : td < -0.05 ? 'pos' : ''}">${td==null ? '—' : (td > 0 ? '+' : '') + f1(td) + ' l/100 km'}</b></div></div>`;
  return head + meta + `<div class="panel tablewrap fc-table"><table><thead><tr>${th('name', cmpMode==='veh' ? 'Auto' : 'Kierowca')}${th('a', esc(monthName(cmpA)), 1)}${th('b', esc(monthName(cmpB)), 1)}${th('diff', 'Zmiana', 1)}</tr></thead>
    <tbody>${body || '<tr><td colspan="4" class="muted">Brak danych w tych miesiącach.</td></tr>'}</tbody></table></div>
    <p class="muted small" style="margin:0">Spalanie liczone tak samo jak w „Spalanie i przebiegi” (karty paliwowe, a gdy brak – wpisy kierowców; odcinkami między tankowaniami). Kierowca: odcinek trafia do kierowcy, który wpisał tankowanie zamykające ten odcinek. Czerwony ▲ – spalanie wzrosło, zielony ▼ – spadło. Kliknij nagłówek, aby posortować.</p>`;
}
document.addEventListener('change', e => {
  if (e.target.id==='cmp-a' && e.target.value){ cmpA = e.target.value; render(); }
  if (e.target.id==='cmp-b' && e.target.value){ cmpB = e.target.value; render(); }
});
document.addEventListener('click', e => {
  const t = e.target.closest('[data-cmpm],[data-cmps]'); if (!t || t.closest('#dialog')) return;
  if (t.dataset.cmpm){ cmpMode = t.dataset.cmpm; render(); return; }
  const k = t.dataset.cmps; cmpSort = cmpSort.k===k ? {k, dir: -cmpSort.dir} : {k, dir: k==='name' ? 1 : -1}; render();
});
