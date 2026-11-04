/* Emage FLEET — układ stron: grupy menu z zakładkami (Grafik, Serwis, Raporty, Pracownicy),
   książka serwisowa wszystkich aut, lista kierowców i Ustawienia w jednym miejscu */
'use strict';

/* ---------- grupy menu i zakładki ---------- */
const GROUPS = {
  rezerwacje: [['przydzial','Grafik', () => true], ['trasy','Trasy', () => !!P().manage]],
  serwis:     [['usterki','Usterki', () => true], ['terminy','Terminy', () => true], ['ksiazka','Książka serwisowa', () => !!P().service]],
  raporty:    [['raporty','Raporty', () => !!P().reports], ['porownanie','Miesiąc do miesiąca', () => !!P().manage], ['historia','Historia', () => !!P().history]],
  koszty:     [['koszty','Koszty', () => true], ['karty','Karty paliwowe', () => !!P().manage], ['oplaty','Przejazdy i parkingi', () => !!P().manage], ['spalanie','Spalanie i przebiegi', () => !!P().manage]],
  ludzie:     [['kierowcy','Kierowcy', () => true], ['uzytkownicy','Użytkownicy', () => !!P().manage]],
};
const groupOf = t => Object.keys(GROUPS).find(g => GROUPS[g].some(([k]) => k===t)) || '';
const tabAllowed = t => { const g = groupOf(t); if (!g) return true; const e = GROUPS[g].find(([k]) => k===t); return !!(e && e[2]()); };
/* Liczniki przy zakładkach */
function tabCount(t){
  if (t==='usterki'){ const oi = openIssues(); return {n: oi.length, bad: oi.some(i => i.severity==='stop')}; }
  if (t==='terminy'){ const u = S.deadlines.filter(d => dlState(d).cls==='bad').length; return {n: u, bad: u > 0}; }
  if (t==='uzytkownicy' && P().manage){ const n = pendingUsers().length + pendingRequests().length + openDisputes().length; return {n, bad: n > 0}; }
  if (t==='przydzial'){ const cf = conflicts().size; return {n: cf, bad: cf > 0}; }
  return {n: 0, bad: false};
}
function groupCount(g){ const c = GROUPS[g].filter(([, , ok]) => ok()).map(([k]) => tabCount(k)); return {n: c.reduce((s, x) => s + x.n, 0), bad: c.some(x => x.bad)}; }
function subTabs(){
  const g = groupOf(tab); if (!g) return '';
  const list = GROUPS[g].filter(([, , ok]) => ok());
  if (list.length < 2) return '';
  return `<nav class="subtabs" aria-label="Zakładki">${list.map(([k, l]) => { const c = tabCount(k);
    return `<a href="#${k}" ${k===tab ? 'aria-current="page"' : ''}>${l}${c.n ? ` <span class="count ${c.bad ? 'bad' : ''}">${c.n}</span>` : ''}</a>`; }).join('')}</nav>`;
}
/* Link w menu prowadzi do pierwszej dostępnej zakładki grupy */
function syncNav(){
  document.querySelectorAll('[data-group]').forEach(a => {
    const g = a.dataset.group, first = GROUPS[g].find(([, , ok]) => ok());
    a.hidden = !first || !!P().mycar || (a.id==='bb-usterki' && canDrive());
    if (first) a.setAttribute('href', '#' + first[0]);
    const c = a.querySelector('.count'); if (c){ const x = groupCount(g); c.textContent = x.n; c.hidden = !x.n; c.classList.toggle('bad', x.bad); }
  });
}

/* ---------- książka serwisowa wszystkich aut ---------- */
let svcVeh = '';
function viewServiceBook(){
  const add = canCreate('serviceEntries') ? `<button class="primary" data-new="serviceEntries" ${svcVeh ? `data-veh="${esc(svcVeh)}"` : ''}>${ic('plus')}Wpis serwisowy</button>` : '';
  const vs = S.vehicles.slice().sort((a, b) => String(a.plate).localeCompare(b.plate));
  const head = `<div class="bar"><h2>Książka serwisowa</h2><div class="tools"><select id="svc-veh" style="width:auto" aria-label="Pojazd"><option value="">Wszystkie auta</option>${vs.map(v => `<option value="${esc(v.id)}" ${v.id===svcVeh ? 'selected' : ''}>${esc(v.plate)}</option>`).join('')}</select>${add}</div></div>`;
  const list = S.serviceEntries.filter(x => !svcVeh || x.vehicleId===svcVeh).sort((a, b) => a.date<b.date ? 1 : a.date>b.date ? -1 : 0);
  if (!list.length) return head + loadingOr('serviceEntries', `<div class="panel empty"><p>Brak wpisów serwisowych${svcVeh ? ' dla tego auta' : ''}. Zapisuj tu naprawy i wymiany: co zrobiono, przy jakim przebiegu, gdzie i za ile.</p></div>`);
  const sum = list.reduce((s, x) => s + Number(x.cost || 0), 0);
  const rows = list.slice(0, 300).map(x => `<tr ${canEditDoc('serviceEntries', x) ? `class="click" data-edit="serviceEntries" data-id="${esc(x.id)}"` : ''}>
      <td class="num">${fdate(x.date)}${x.km ? `<span class="sub">${km(x.km)}</span>` : ''}</td><td>${vPlate(x.vehicleId)}</td>
      <td><b>${esc(x.description)}</b><span class="sub">${[x.workshop, x.note].filter(Boolean).map(esc).join(' · ')}</span>
        <span class="svc-tags">${x.oilChange ? '<span class="pill soon">olej</span>' : ''}${x.timingChange ? '<span class="pill soon">rozrząd</span>' : ''}${x.tiresSet ? `<span class="pill info">opony ${esc((TIRES[x.tiresSet] || '').toLowerCase())}</span>` : ''}${(x.issueIds || []).length ? `<span class="pill ok">usterki: ${x.issueIds.length}</span>` : ''}</span></td>
      <td class="r num">${x.cost ? zl2(x.cost) : '—'}</td><td>${x.assetId ? `<a class="btn small" data-file="${esc(x.assetId)}" href="#" target="_blank" rel="noopener">Faktura</a>` : ''}</td></tr>`).join('');
  return head + `<div class="panel tablewrap"><table><thead><tr><th>Data</th><th>Auto</th><th>Co zrobiono</th><th class="r">Koszt</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:0">${list.length} ${isPlural(list.length,'wpis','wpisy','wpisów')} · razem ${zl(sum)}</p>`;
}
document.addEventListener('change', e => { if (e.target.id==='svc-veh'){ svcVeh = e.target.value; render(); } });

/* ---------- kierowcy ---------- */
function viewDrivers(){
  const t = today();
  const head = `<div class="bar"><h2>Kierowcy</h2>${canCreate('drivers') ? `<button class="primary" data-new="drivers">${ic('plus')}Dodaj kierowcę</button>` : ''}</div>`;
  if (!S.drivers.length) return head + loadingOr('drivers', emptyBlock('Brak kierowców', 'Dodaj osoby, które korzystają z aut służbowych – z kategorią i ważnością prawa jazdy.', `<button class="primary" data-new="drivers">${ic('plus')}Dodaj kierowcę</button>`, '', 'drivers'));
  const list = S.drivers.slice().sort((a, b) => (a.active===false) - (b.active===false) || a.name.localeCompare(b.name, 'pl'));
  const rows = list.map(d => {
    const veh = S.vehicles.filter(v => respOf(v).includes(d.id) && v.status!=='wycofany');
    const now = S.bookings.find(b => holds(b) && crewOf(b).includes(d.id));
    const docs = [['licenseExpiry','Prawo jazdy'],['medicalExpiry','Badania'],['psychExpiry','Psychotesty']].map(([k, l]) => { if (!d[k]) return ''; const x = diffDays(t, d[k]);
      return x < 0 ? `<span class="pill bad">${l} wygasło</span>` : x <= 30 ? `<span class="pill warn">${l} do ${fdate(d[k])}</span>` : ''; }).join(' ');
    return `<tr ${canEditDoc('drivers', d) ? `class="click" data-edit="drivers" data-id="${esc(d.id)}"` : ''} ${d.active===false ? 'style="opacity:.6"' : ''}>
      <td><b>${esc(d.name)}</b>${d.active===false ? ' <span class="pill off">nieaktywny</span>' : ''}<span class="sub">${esc([d.phone, d.categories ? 'kat. ' + d.categories : ''].filter(Boolean).join(' · '))}</span></td>
      <td>${now ? `${vPlate(now.vehicleId)}<span class="sub">${now.routeId ? esc(rLabel(now.routeId)) : 'w trasie'}</span>` : '<span class="muted">—</span>'}</td>
      <td>${veh.length ? veh.map(v => esc(v.plate)).join(', ') : '<span class="muted">—</span>'}</td>
      <td>${docs || '<span class="muted small">ważne</span>'}</td></tr>`;
  }).join('');
  return head + `<div class="panel tablewrap"><table><thead><tr><th>Kierowca</th><th>Teraz</th><th>Odpowiada za</th><th>Dokumenty</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* ---------- ustawienia (kierownik floty) ---------- */
function budgetPanel(){
  const fb = Number(budget().monthly) || 0;
  return `<div class="panel"><div class="sec-head"><h3>Budżet floty</h3></div><div class="budget"><div><span class="label">Miesięcznie (zł)</span>
    <div class="budget-edit"><input id="budget-in" type="number" min="0" inputmode="numeric" placeholder="np. 15000" value="${fb || ''}" aria-label="Budżet miesięczny w zł"><button class="small" data-action="save-budget">Zapisz</button></div></div>
    <span class="muted small" style="flex:1;min-width:220px">Wykorzystanie widać w Raportach i na Pulpicie. Limity pojedynczych aut ustawisz w danych pojazdu.</span></div></div>`;
}
function viewSettings(){
  if (!P().manage) return '';
  return `<div class="section settings"><div class="bar"><h2>Ustawienia</h2></div>
    ${budgetPanel()}
    ${checksSettingsPanel()}
    ${checklistPanel()}
  </div>`;
}
