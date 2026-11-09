/* Emage FLEET — raport miesięczny dla zarządu (Koszty → Raporty → „Raport dla zarządu”).
   Jedna strona A4 do wydruku albo zapisu jako PDF: koszty i kilometry z porównaniem do poprzedniego okresu,
   koszty według kategorii, najdroższe auta, usterki i szkody, terminy na następny miesiąc, umowy, uwagi o danych.
   Okres = okres wybrany w Raportach (miesiąc albo rok). Bez nowej tabeli. */
'use strict';
function boardPeriod(){
  const [a, b, label] = periodRange();
  if (repMode==='year'){ const y = Number(a.slice(0, 4)) - 1; return {a, b, label, pa: y + '-01-01', pb: y + '-12-31', plabel: 'rok ' + y}; }
  const d = new Date(a + 'T12:00:00'); d.setMonth(d.getMonth() - 1);
  const pm = d.toISOString().slice(0, 7), last = new Date(Number(pm.slice(0, 4)), Number(pm.slice(5, 7)), 0).getDate();
  return {a, b, label, pa: pm + '-01', pb: pm + '-' + pad(last), plabel: MONTHS_FULL[Number(pm.slice(5, 7)) - 1] + ' ' + pm.slice(0, 4)};
}
function boardNumbers(a, b){
  const cs = visibleCosts().filter(c => c.date >= a && c.date <= b);
  const vs = S.vehicles.filter(v => v.status!=='wycofany' || cs.some(c => c.vehicleId===v.id));
  const per = vs.map(v => { const my = cs.filter(c => c.vehicleId===v.id), cost = sumOf(my);
    const kmV = typeof odoRange==='function' ? (odoRange(v.id, a, b).km || 0) : 0; return {v, cost, km: kmV}; });
  const fleet = sumOf((S.fleetCosts || []).filter(c => c.date >= a && c.date <= b));   // koszty ogólne floty (migracja 024)
  const cost = sumOf(cs) + fleet, km = per.reduce((s, r) => s + r.km, 0);
  const cats = Object.fromEntries(COST_CATS.map(k => [k, sumOf(cs.filter(c => c.category===k))]));
  if (fleet) cats['Koszty ogólne floty'] = fleet;
  const iss = S.issues.filter(i => (i.date || '') >= a && (i.date || '') <= b);
  return {cs, per, cost, km, cats, fuel: (cats['Paliwo'] || 0) + (cats['Ładowanie'] || 0), active: S.vehicles.filter(v => v.status!=='wycofany').length,
    iss: iss.length, acc: iss.filter(i => typeof isAccident==='function' && isAccident(i)).length, bookings: S.bookings.filter(x => x.from <= b && x.to >= a).length};
}
function printBoardReport(){
  const p = boardPeriod(), now = boardNumbers(p.a, p.b), prev = boardNumbers(p.pa, p.pb);
  const nf = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));
  const ch = (x, y, lowerGood = true) => { if (!y) return '<td class="pa-c">—</td>'; const d = Math.round((x - y) / y * 100); const good = lowerGood ? d <= 0 : d >= 0;
    return `<td class="pa-c" style="color:${d===0 ? '#555' : good ? '#11733f' : '#b42318'}">${d > 0 ? '+' : ''}${d}%</td>`; };
  const pk = (n) => n.km ? n.cost / n.km : null;
  const kpi = [
    ['Koszty floty razem', zl(now.cost), zl(prev.cost), ch(now.cost, prev.cost)],
    ['w tym paliwo i ładowanie', zl(now.fuel), zl(prev.fuel), ch(now.fuel, prev.fuel)],
    ['Przejechane kilometry', nf(now.km) + ' km', nf(prev.km) + ' km', ch(now.km, prev.km, false)],
    ['Koszt na 1 km', pk(now) ? pk(now).toFixed(2).replace('.', ',') + ' zł' : '—', pk(prev) ? pk(prev).toFixed(2).replace('.', ',') + ' zł' : '—', pk(now) && pk(prev) ? ch(pk(now), pk(prev)) : '<td class="pa-c">—</td>'],
    ['Koszt na 1 auto', now.active ? zl(now.cost / now.active) : '—', now.active ? zl(prev.cost / now.active) : '—', ch(now.cost, prev.cost)],
    ['Nowe usterki / w tym szkody', `${now.iss} / ${now.acc}`, `${prev.iss} / ${prev.acc}`, ch(now.iss, prev.iss)],
    ['Przydziały w grafiku', String(now.bookings), String(prev.bookings), '<td class="pa-c">—</td>'],
  ];
  const cats = Object.keys(now.cats).filter(k => now.cats[k] || prev.cats[k]).sort((x, y) => now.cats[y] - now.cats[x]);
  const top = now.per.filter(r => r.cost > 0).sort((x, y) => y.cost - x.cost).slice(0, 8);
  const nextA = addDays(today(), 1), nextB = addDays(today(), 31);
  const dls = S.deadlines.filter(d => { const v = byId('vehicles', d.vehicleId); return v && v.status!=='wycofany' && (d.date <= nextB); }).sort((x, y) => x.date.localeCompare(y.date)).slice(0, 14);
  const open = typeof openIssues==='function' ? openIssues() : [];
  const ctr = typeof contractsOn==='function' && contractsOn() ? contractProblems() : [];
  const notes = [];
  if (P().manage && !(S.fuelCardImports || []).some(i => (i.periodTo || i.date || i.createdAt || '').slice(0, 7) >= p.b.slice(0, 7))) notes.push('brak importu z kart paliwowych za ten okres – koszty paliwa mogą być niepełne');
  if (!now.km) notes.push('brak odczytów liczników w okresie – kilometry i koszt/km niepełne');
  const noStd = typeof stdMissing==='function' ? stdMissing().length : 0; if (noStd) notes.push(`${noStd} ${isPlural(noStd,'auto nie ma','auta nie mają','aut nie ma')} kompletu podstawowych terminów (przegląd, OC, olej)`);
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  el.innerHTML = `<div class="pa pa-board">
    <div class="pa-h"><div><b>Emage Group · flota</b>Raport dla zarządu</div><div class="pa-r"><b>${esc(p.label)}</b>porównanie: ${esc(p.plabel)}<br>wygenerowano ${fdate(today())}</div></div>
    <h1>Flota: ${now.active} ${isPlural(now.active,'auto','auta','aut')} · ${zl(now.cost)} · ${nf(now.km)} km</h1>
    <table class="pa-t pa-k"><tr><th></th><th>${esc(p.label)}</th><th>${esc(p.plabel)}</th><th>zmiana</th></tr>${kpi.map(([l, x, y, c]) => `<tr><th>${l}</th><td>${x}</td><td>${y}</td>${c}</tr>`).join('')}</table>
    <div class="pa-2">
      <div><h2>Koszty według kategorii</h2><table class="pa-t pa-k"><tr><th>Kategoria</th><th>teraz</th><th>wcześniej</th></tr>${cats.map(k => `<tr><th>${esc(k)}</th><td>${zl(now.cats[k] || 0)}</td><td>${zl(prev.cats[k] || 0)}</td></tr>`).join('') || '<tr><td colspan="3">brak kosztów</td></tr>'}</table></div>
      <div><h2>Najdroższe auta</h2><table class="pa-t pa-k"><tr><th>Auto</th><th>koszt</th><th>km</th><th>zł/km</th></tr>${top.map(r => `<tr><th>${esc(r.v.plate)}</th><td>${zl(r.cost)}</td><td>${r.km ? nf(r.km) : '—'}</td><td>${r.km ? (r.cost / r.km).toFixed(2).replace('.', ',') : '—'}</td></tr>`).join('') || '<tr><td colspan="4">brak</td></tr>'}</table></div>
    </div>
    <div class="pa-2">
      <div><h2>Terminy do ${fdate(nextB)} (i zaległe)</h2><table class="pa-t pa-k">${dls.map(d => { const s = dlState(d); return `<tr><th>${esc((byId('vehicles', d.vehicleId) || {}).plate || '')}</th><td>${esc(d.type)}</td><td style="${d.date < today() ? 'color:#b42318;font-weight:600' : ''}">${fdate(d.date)}</td></tr>`; }).join('') || '<tr><td>brak terminów w tym okresie</td></tr>'}</table></div>
      <div><h2>Stan na dziś</h2><table class="pa-t pa-k">
        <tr><th>Otwarte usterki</th><td>${open.length}${open.filter(i => i.severity==='stop').length ? ` (niesprawne: ${open.filter(i => i.severity==='stop').length})` : ''}</td></tr>
        <tr><th>Auta w serwisie</th><td>${S.vehicles.filter(v => v.status==='serwis').length}</td></tr>
        ${ctr.length ? `<tr><th>Umowy: koniec / limit km</th><td>${esc(ctr.map(x => (byId('vehicles', x.c.vehicleId) || {}).plate + ': ' + x.i.warn.map(w => w[1]).join(', ')).join('; '))}</td></tr>` : ''}
        ${typeof eqOn==='function' && eqOn() && eqProblems().length ? `<tr><th>Wyposażenie do poprawy</th><td>${eqProblems().length}</td></tr>` : ''}
        ${typeof tiresOn==='function' && tiresOn() && tireProblems().filter(x => x.t.location==='na_aucie').length ? `<tr><th>Opony zużyte / stare na autach</th><td>${tireProblems().filter(x => x.t.location==='na_aucie').length}</td></tr>` : ''}
        <tr><th>Budżet miesięczny</th><td>${Number(budget().monthly) ? zl(budget().monthly) + (repMode==='month' ? ` – wykorzystano ${Math.round(now.cost / Number(budget().monthly) * 100)}%` : '') : 'nie ustawiony'}</td></tr>
      </table></div>
    </div>
    ${notes.length ? `<h2>Uwagi o danych</h2><ul class="pa-ul">${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul>` : ''}
    <p class="pa-f">Emage FLEET · koszty z kart paliwowych, wpisów kierowców i faktur; kilometry z liczników (karty, przejęcia i zdania aut). Szczegóły: Koszty → Raporty i Rozliczenie aut.</p></div>`;
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="board-report"]')){ e.preventDefault(); printBoardReport(); } });
