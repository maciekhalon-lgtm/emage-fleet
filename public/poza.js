/* ============================================================================
   Emage FLEET — km poza transportem (migracja 071)
   „Km nieprzypisane”: dni, w których auto wg GPS przejechało ≥ KM_FREE_MIN km, a nikt nie miał go przejętego w aplikacji
   (liczy noDriverDays w kontrola.js). Kierownik floty przypisuje dzień: kto jechał + cel → „km poza transportem”.
   Raport Paliwo → Poza transportem: km i szacowany koszt paliwa netto (spalanie auta × średnia cena litra netto).
   ============================================================================ */
const KM_FREE_MIN = 10;
const KM_PURPOSE = {prywatnie: 'Prywatnie', sluzbowo: 'Służbowo poza transportem', serwis: 'Serwis / warsztat', przestawienie: 'Przestawienie auta', inne: 'Inne'};
const pzOn = () => !!P().manage && optOn('kmAssign');
const kmAsOf = (vid, day) => (S.kmAssign || []).find(a => a.vehicleId===vid && a.day===day) || null;
const kmWho = a => a ? (a.driverId ? dName(a.driverId) : (a.whoName || '—')) : '';
let pzMonth = null;

/* szacunek: spalanie auta z odcinków „do pełna – do pełna” z ostatnich 120 dni (z GPS), gdy brak – średnia klasy auta */
function pzRate(vid, to){
  const from = addDays(to, -120), legs = rkVehLegsRaw(vid).filter(l => l.date >= from && l.date <= to);
  const km = legs.reduce((a, l) => a + l.km, 0), l = legs.reduce((a, x) => a + x.l, 0);
  if (km >= 300) return {rate: l / km * 100, src: 'auto'};
  const v = byId('vehicles', vid), cls = v && v.weightClass, same = S.vehicles.filter(x => x.weightClass===cls && x.id!==vid);
  let k2 = 0, l2 = 0; same.forEach(x => rkVehLegsRaw(x.id).filter(g => g.date >= from && g.date <= to).forEach(g => { k2 += g.km; l2 += g.l; }));
  return k2 >= 300 ? {rate: l2 / k2 * 100, src: 'klasa'} : null;
}
/* średnia cena litra netto (zł) z tankowań w miesiącu; za mało danych – ostatnie 60 dni */
function pzPrice(from, to){
  const calc = (a, b) => { const xs = visibleCosts().filter(c => c.category==='Paliwo' && Number(c.liters) > 0 && c.date >= a && c.date <= b);
    const l = xs.reduce((s, c) => s + Number(c.liters), 0); return l >= 50 ? xs.reduce((s, c) => s + costNet(c), 0) / l : null; };
  return calc(from, to) ?? calc(addDays(to, -60), to);
}

/* ---------- przypisanie dnia (okno) ---------- */
function openKmAssign(vid, day, km){
  if (!P().manage) return;
  const a = kmAsOf(vid, day), v = byId('vehicles', vid); if (!v) return;
  const drv = S.drivers.filter(d => d.active!==false).sort((x, y) => x.name.localeCompare(y.name, 'pl'));
  editing = {col: 'kmas', base: {}, special: async () => {
    const w = $('#dlg-warn'), dv = $('#ka-drv').value, name = $('#ka-name').value.trim();
    if (!dv && !name){ w.textContent = 'Wybierz kierowcę albo wpisz, kto jechał (np. Szef).'; w.hidden = false; return; }
    const doc = {vehicleId: vid, day, km: Math.round(km) || null, driverId: dv && dv!=='_' ? dv : null, whoName: dv && dv!=='_' ? '' : name, purpose: $('#ka-purpose').value, note: $('#ka-note').value.trim()};
    try { await db.collection('kmAssign').doc(a ? a.id : undefined).set(doc); closeForm(); toast(`${v.plate} ${fdate(day)}: przypisano ${km ? Math.round(km) + ' km' : ''}`); render(); }
    catch(e){ handleWriteErr(e); }
  }};
  $('#dlg-title').textContent = `${v.plate} · ${fdate(day)} · ${new Intl.NumberFormat('pl-PL').format(Math.round(km || 0))} km`;
  const sel = a ? (a.driverId || '_') : '';
  $('#dlg-body').innerHTML = `<p class="muted small field full">Auto przejechało ten dystans wg GPS, a nikt nie miał go przejętego w aplikacji. Wpisz, kto jechał i po co – km trafią do „poza transportem” (nie do rankingu kierowców).</p>
    <div class="field"><label for="ka-drv">Kto jechał</label><select id="ka-drv"><option value="" ${sel==='' ? 'selected' : ''}>— wybierz —</option>${drv.map(d => `<option value="${esc(d.id)}" ${sel===d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}<option value="_" ${sel==='_' ? 'selected' : ''}>Inna osoba (wpisz obok)</option></select></div>
    <div class="field"><label for="ka-name">Inna osoba</label><input id="ka-name" value="${esc(a && !a.driverId ? a.whoName || '' : '')}" placeholder="np. Szef, mechanik"></div>
    <div class="field full"><label for="ka-purpose">Cel jazdy</label><select id="ka-purpose">${Object.entries(KM_PURPOSE).map(([k, l]) => `<option value="${k}" ${(a ? a.purpose : 'sluzbowo')===k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
    <div class="field full"><label for="ka-note">Notatka (opcjonalnie)</label><input id="ka-note" value="${esc(a ? a.note || '' : '')}" placeholder="np. dowóz części, wyjazd do klienta"></div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = !a; $('#scrim').hidden = false;
  if (a) $('#dlg-del').onclick = async () => { try { await db.collection('kmAssign').doc(a.id).delete(); closeForm(); toast('Przypisanie usunięte – dzień wraca do km nieprzypisanych'); render(); } catch(e){ handleWriteErr(e); } };
  $('#ka-name').addEventListener('input', () => { if ($('#ka-name').value.trim()) $('#ka-drv').value = '_'; });
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-km-as]'); if (!b) return;
  const [vid, day, km] = b.dataset.kmAs.split('|'); openKmAssign(vid, day, Number(km));
});

/* ---------- raport: Paliwo → Poza transportem ---------- */
function viewOutsideKm(){
  if (!P().manage) return '';
  if (!optOn('kmAssign')) return `<div class="bar"><h2>Km poza transportem</h2></div>${loadingOr('kmAssign', `<div class="panel empty"><p>Raport wymaga uruchomienia migracji 071 w bazie.</p></div>`)}`;
  const m = pzMonth || today().slice(0, 7), [from, end] = setlRange(m), to = end < today() ? end : addDays(today(), -1);
  const days = to >= from ? noDriverDays(from, to, {all: true}) : [];
  const price = pzPrice(from, end), nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const rateOf = new Map(); const rate = vid => { if (!rateOf.has(vid)) rateOf.set(vid, pzRate(vid, end)); return rateOf.get(vid); };
  const cost = x => { const r = rate(x.vid); return r && price ? x.km * r.rate / 100 * price : null; };
  const fr = n => n==null ? '—' : zl(n);
  const asg = days.filter(x => x.as), free = days.filter(x => !x.as), sum = (xs, f) => xs.reduce((a, x) => a + (f(x) || 0), 0);
  const tiles = `<div class="panel sp-kpi">
      <div><span class="label">Km poza transportem</span><b>${nf(sum(asg, x => x.km))} km</b><span class="sub">${asg.length} ${isPlural(asg.length, 'dzień', 'dni', 'dni')} przypisanych · koszt ok. ${fr(sum(asg, cost))}</span></div>
      <div><span class="label">Km nieprzypisane</span><b class="${free.length ? 'warn-t' : ''}">${nf(sum(free, x => x.km))} km</b><span class="sub">${free.length} ${isPlural(free.length, 'dzień', 'dni', 'dni')} do wyjaśnienia · koszt ok. ${fr(sum(free, cost))}</span></div>
      <div><span class="label">Cena paliwa netto</span><b>${price ? zl2(price) + '/l' : '—'}</b><span class="sub">średnia z tankowań ${price ? 'w miesiącu (albo z ostatnich 60 dni)' : '– brak danych'}</span></div></div>`;
  // według aut
  const byV = new Map(); days.forEach(x => { if (!byV.has(x.vid)) byV.set(x.vid, []); byV.get(x.vid).push(x); });
  const vRows = [...byV.entries()].map(([vid, xs]) => ({vid, a: xs.filter(x => x.as), f: xs.filter(x => !x.as), r: rate(vid)})).sort((p, q) => sum(q.a.concat(q.f), x => x.km) - sum(p.a.concat(p.f), x => x.km));
  const tV = vRows.length ? `<div class="panel tablewrap"><div class="sec-head"><h3>Według aut</h3></div><table><thead><tr><th>Auto</th><th class="r">Poza transportem</th><th class="r">Nieprzypisane</th><th class="r">Spalanie</th><th class="r">Koszt poza transp.</th><th class="r">Koszt nieprzypisanych</th></tr></thead><tbody>
      ${vRows.map(r => `<tr><td>${vPlate(r.vid)}</td><td class="r num">${r.a.length ? nf(sum(r.a, x => x.km)) + ' km' : ''}</td><td class="r num">${r.f.length ? `<b class="warn-t">${nf(sum(r.f, x => x.km))} km</b>` : ''}</td>
        <td class="r num">${r.r ? r.r.rate.toFixed(1).replace('.', ',') + ' l/100' + (r.r.src==='klasa' ? '<span class="sub">średnia klasy</span>' : '') : '—'}</td><td class="r num">${r.a.length ? fr(sum(r.a, cost)) : ''}</td><td class="r num">${r.f.length ? fr(sum(r.f, cost)) : ''}</td></tr>`).join('')}
      <tr class="total"><td><b>Razem</b></td><td class="r num"><b>${nf(sum(asg, x => x.km))} km</b></td><td class="r num"><b>${nf(sum(free, x => x.km))} km</b></td><td></td><td class="r num"><b>${fr(sum(asg, cost))}</b></td><td class="r num"><b>${fr(sum(free, cost))}</b></td></tr></tbody></table></div>` : '';
  // według osób i celu
  const byW = new Map(); asg.forEach(x => { const k = kmWho(x.as) + '|' + x.as.purpose; if (!byW.has(k)) byW.set(k, []); byW.get(k).push(x); });
  const tW = byW.size ? `<div class="panel tablewrap"><div class="sec-head"><h3>Kto jechał</h3></div><table><thead><tr><th>Osoba</th><th>Cel</th><th class="r">Dni</th><th class="r">Km</th><th class="r">Koszt paliwa</th></tr></thead><tbody>
      ${[...byW.entries()].sort((p, q) => sum(q[1], x => x.km) - sum(p[1], x => x.km)).map(([k, xs]) => `<tr><td><b>${esc(k.split('|')[0])}</b></td><td>${esc(KM_PURPOSE[xs[0].as.purpose] || '')}</td><td class="r num">${xs.length}</td><td class="r num">${nf(sum(xs, x => x.km))} km</td><td class="r num">${fr(sum(xs, cost))}</td></tr>`).join('')}</tbody></table></div>` : '';
  // dni
  const tD = days.length ? `<div class="panel tablewrap"><div class="sec-head"><h3>Dni</h3><span class="muted small">auto przejechało ≥ ${KM_FREE_MIN} km wg GPS bez przejęcia w aplikacji</span></div><table><thead><tr><th>Dzień</th><th>Auto</th><th class="r">Km</th><th>Kto / cel</th><th class="r">Koszt</th><th></th></tr></thead><tbody>
      ${days.map(x => `<tr><td class="num">${fdate(x.day)}</td><td>${vPlate(x.vid)}</td><td class="r num">${nf(x.km)} km</td>
        <td>${x.as ? `<b>${esc(kmWho(x.as))}</b><span class="sub">${esc(KM_PURPOSE[x.as.purpose] || '')}${x.as.note ? ' · ' + esc(x.as.note) : ''}</span>` : '<span class="pill warn">nieprzypisane</span>'}</td>
        <td class="r num">${fr(cost(x))}</td><td class="r"><button type="button" class="small ${x.as ? 'ghost' : ''}" data-km-as="${esc(x.vid)}|${x.day}|${x.km}">${x.as ? 'Zmień' : 'Przypisz'}</button></td></tr>`).join('')}</tbody></table></div>`
    : `<div class="panel empty"><p>W tym miesiącu żadne auto nie jeździło bez przejęcia w aplikacji.</p></div>`;
  const months = monthsList(addDays(today(), -365).slice(0, 7), today().slice(0, 7)).reverse();
  return `<div class="bar"><h2>Km poza transportem</h2><div class="tools"><select id="pz-month" aria-label="Miesiąc" style="width:auto">${months.map(x => `<option value="${x}" ${x===m ? 'selected' : ''}>${monthLabel(x)}</option>`).join('')}</select></div></div>
    ${tiles}${tV}${tW}${tD}
    <p class="muted small">Km z liczników dziennych GPS. Koszt to szacunek: km × spalanie auta (odcinki „do pełna – do pełna” z ostatnich 120 dni, gdy brak – średnia klasy auta) × średnia cena litra netto. Km poza transportem nie wchodzą do rankingu ani spalania kierowców.</p>`;
}
document.addEventListener('change', e => { if (e.target.id==='pz-month'){ pzMonth = e.target.value; render(); } });
