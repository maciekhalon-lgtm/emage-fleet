/* Emage FLEET — układ stron: grupy menu z zakładkami (Grafik, Serwis, Raporty, Pracownicy),
   książka serwisowa wszystkich aut, lista kierowców i Ustawienia w jednym miejscu */
'use strict';

/* ---------- grupy menu i zakładki ---------- */
const GROUPS = {
  rezerwacje: [['przydzial','Grafik', () => true], ['trasy','Trasy', () => !!P().manage]],
  serwis:     [['usterki','Usterki', () => true], ['terminy','Terminy', () => true], ['ksiazka','Książka serwisowa', () => !!P().service]],
  paliwo:     [['karty','Karty paliwowe', () => !!P().manage], ['spalanie','Spalanie i przebiegi', () => !!P().manage], ['liczniki','Liczniki', () => !!P().manage], ['porownanie','Miesiąc do miesiąca', () => !!P().manage], ['oplaty','Przejazdy i parkingi', () => !!P().manage]],
  koszty:     [['koszty','Koszty', () => true], ['raporty','Raporty', () => !!P().reports]],
  ludzie:     [['kierowcy','Kierowcy', () => true], ['uzytkownicy','Użytkownicy', () => !!P().manage]],
  ustawienia: [['ustawienia','Ustawienia', () => !!P().manage], ['historia','Historia zmian', () => !!P().history]],
};
const groupOf = t => Object.keys(GROUPS).find(g => GROUPS[g].some(([k]) => k===t)) || '';
const tabAllowed = t => { const g = groupOf(t); if (!g) return true; const e = GROUPS[g].find(([k]) => k===t); return !!(e && e[2]()); };
/* Liczniki przy zakładkach */
function tabCount(t){
  if (t==='usterki'){ const oi = openIssues(); return {n: oi.length, bad: oi.some(i => i.severity==='stop')}; }
  if (t==='terminy'){ const u = S.deadlines.filter(d => dlState(d).cls==='bad').length; return {n: u, bad: u > 0}; }
  if (t==='uzytkownicy' && P().manage){ const n = pendingUsers().length + pendingRequests().length + openDisputes().length; return {n, bad: n > 0}; }
  if (t==='liczniki' && P().manage){ const n = odoTodoCount(); return {n, bad: n > 0}; }
  if (t==='karty' && P().manage){ const n = suspTodoCount(); return {n, bad: n > 0}; }
  if (t==='spalanie' && P().manage){ const n = theftVehicles().length; return {n, bad: n > 0}; }
  if (t==='przydzial'){ const cf = conflicts().size; return {n: cf, bad: cf > 0}; }
  return {n: 0, bad: false};
}
function groupCount(g){ const c = GROUPS[g].filter(([k, , ok]) => ok() && k!=='liczniki').map(([k]) => tabCount(k)); /* liczniki tylko w swojej zakładce */ return {n: c.reduce((s, x) => s + x.n, 0), bad: c.some(x => x.bad)}; }
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
  // warsztaty z ostatnich 12 miesięcy: ile wizyt, ile kosztowały, średnio na wizytę
  const y1 = addDays(today(), -365), ws = {};
  list.filter(x => x.date >= y1 && (x.workshop || '').trim()).forEach(x => { const k = x.workshop.trim(); (ws[k] = ws[k] || {n:0, c:0, cars:new Set()}); ws[k].n++; ws[k].c += Number(x.cost || 0); ws[k].cars.add(x.vehicleId); });
  const wl = Object.entries(ws).sort((a, b) => b[1].c - a[1].c);
  const wsPanel = wl.length >= 2 ? `<details class="panel fold"><summary class="sec-head"><h3>Warsztaty – ostatnie 12 miesięcy</h3><span class="muted small">${wl.length} ${isPlural(wl.length,'warsztat','warsztaty','warsztatów')}</span></summary>
    ${wl.slice(0, 10).map(([k, x]) => `<div class="mini"><span><b>${esc(k)}</b><span class="sub">${x.n} ${isPlural(x.n,'wizyta','wizyty','wizyt')} · ${x.cars.size} ${isPlural(x.cars.size,'auto','auta','aut')}</span></span><span class="muted small">średnio ${x.n ? zl(x.c / x.n) : '—'}</span><span class="mini-r num"><b>${zl(x.c)}</b></span></div>`).join('')}</details>` : '';
  return head + wsPanel + `<div class="panel tablewrap"><table><thead><tr><th>Data</th><th>Auto</th><th>Co zrobiono</th><th class="r">Koszt</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
    <p class="muted small" style="margin:0">${list.length} ${isPlural(list.length,'wpis','wpisy','wpisów')} · razem ${zl(sum)}</p>`;
}
document.addEventListener('change', e => { if (e.target.id==='svc-veh'){ svcVeh = e.target.value; render(); } });

/* ---------- kierowcy ---------- */
let drvMonth = today().slice(0, 7);
/* Zestawienie kierowców za miesiąc (np. do rozliczeń i premii): dni pracy, tankowania, spalanie, usterki, szkody, złe liczniki */
async function driversXlsx(){
  let X; try { X = await loadXLSX(); } catch(_){ return toast('Nie udało się wczytać modułu Excel – sprawdź połączenie'); }
  const a = drvMonth + '-01', b = (d => { d.setMonth(d.getMonth() + 1); d.setDate(0); return isoOf(d); })(parse(a));
  const rows = S.drivers.filter(d => d.active!==false).sort((x, y) => x.name.localeCompare(y.name, 'pl')).map(d => {
    const s = drvCardStats(d.id, a, b > today() ? today() : b);
    const iss = S.issues.filter(i => i.date>=a && i.date<=b && S.bookings.some(k => k.vehicleId===i.vehicleId && crewOf(k).includes(d.id) && k.from<=i.date && k.to>=i.date));
    return {'Kierowca': d.name, 'Dni pracy (grafik)': s.days, 'Tankowania': s.fuel.length, 'Litry': +s.fuel.reduce((x, c) => x + Number(c.liters || 0), 0).toFixed(1),
      'Kwota tankowań (zł)': +s.fuel.reduce((x, c) => x + Number(c.amount || 0), 0).toFixed(2), 'Km na jego odcinkach': Math.round(s.km), 'Spalanie l/100': s.rate != null ? +s.rate.toFixed(1) : '',
      'Usterki w jego dniach': iss.filter(i => !/^Szkoda:/.test(i.title)).length, 'Szkody': iss.filter(i => /^Szkoda:/.test(i.title)).length, 'Złe liczniki': s.bad.length, 'Sprawy do wyjaśnienia': s.flagged.length + s.susp.length};
  });
  const wb = X.utils.book_new(), ws = X.utils.json_to_sheet(rows);
  ws['!cols'] = [{wch:24},{wch:12},{wch:11},{wch:9},{wch:14},{wch:14},{wch:12},{wch:14},{wch:8},{wch:12},{wch:14}];
  X.utils.book_append_sheet(wb, ws, 'Kierowcy ' + drvMonth);
  await saveFile(`Emage-FLEET-kierowcy-${drvMonth}.xlsx`, new Uint8Array(X.write(wb, {type:'array', bookType:'xlsx'})));
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="drv-xlsx"]')){ e.preventDefault(); driversXlsx(); } });
document.addEventListener('change', e => { if (e.target.id==='drv-month' && e.target.value){ drvMonth = e.target.value; } });
function viewDrivers(){
  const t = today();
  const head = `<div class="bar"><h2>Kierowcy</h2><div class="tools">${P().manage ? `<input type="month" id="drv-month" value="${drvMonth}" style="width:auto" aria-label="Miesiąc zestawienia"><button data-action="drv-xlsx">${ic('chart')}Zestawienie (Excel)</button>` : ''}${canCreate('drivers') ? `<button class="primary" data-new="drivers">${ic('plus')}Dodaj kierowcę</button>` : ''}</div></div>`;
  if (!S.drivers.length) return head + loadingOr('drivers', emptyBlock('Brak kierowców', 'Dodaj osoby, które korzystają z aut służbowych – z kategorią i ważnością prawa jazdy.', `<button class="primary" data-new="drivers">${ic('plus')}Dodaj kierowcę</button>`, '', 'drivers'));
  const list = S.drivers.slice().sort((a, b) => (a.active===false) - (b.active===false) || a.name.localeCompare(b.name, 'pl'));
  const rows = list.map(d => {
    const veh = S.vehicles.filter(v => respOf(v).includes(d.id) && v.status!=='wycofany');
    const now = S.bookings.find(b => holds(b) && crewOf(b).includes(d.id));
    const docs = [['licenseExpiry','Prawo jazdy'],['medicalExpiry','Badania'],['psychExpiry','Psychotesty']].map(([k, l]) => { if (!d[k]) return ''; const x = diffDays(t, d[k]);
      return x < 0 ? `<span class="pill bad">${l} wygasło</span>` : x <= 30 ? `<span class="pill warn">${l} do ${fdate(d[k])}</span>` : ''; }).join(' ');
    return `<tr ${P().manage ? `class="click" data-drv-card="${esc(d.id)}"` : canEditDoc('drivers', d) ? `class="click" data-edit="drivers" data-id="${esc(d.id)}"` : ''} ${d.active===false ? 'style="opacity:.6"' : ''}>
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
    ${dataQualityPanel()}
    ${budgetPanel()}
    ${pushSetupPanel()}
    ${P().manage ? `<div class="panel"><div class="sec-head"><h3>Kopia danych</h3><button class="small" data-action="backup">${ic('clip')}Pobierz kopię (JSON)</button></div><p class="muted sec-empty">Wszystkie dane floty w jednym pliku: auta, kierowcy, grafik, koszty, terminy, usterki, książka serwisowa, karty paliwowe, trasy i przystanki. Zrób kopię raz w miesiącu i trzymaj ją na dysku firmy. Zdjęcia i skany zostają w Supabase.</p></div>` : ''}
    ${checksSettingsPanel()}
    ${checklistPanel()}
  </div>`;
}

/* Kompletność danych: czego brakuje, żeby działały alarmy (bak → podejrzane tankowania, opony → przypomnienie o sezonie,
   polisa → druk szkody, telefon i dokumenty kierowcy → ostrzeżenia w grafiku). Kliknięcie otwiera formularz. */
function dqChecks(){
  const vs = S.vehicles.filter(v => v.status!=='wycofany'), ds = S.drivers.filter(d => d.active!==false);
  const checks = [
    ['vehicles', 'VIN', 'potrzebny do druku szkody i zlecenia warsztatowego', vs.filter(v => !v.vin)],
    ['vehicles', 'Pojemność baku', 'bez niej podejrzane tankowania liczą się od 90 l', vs.filter(v => !v.tankL)],
    ['vehicles', 'Założone opony', 'przypomnienie o zmianie opon działa tylko, gdy wiadomo, jakie są', vs.filter(v => !v.tires)],
    ['vehicles', 'Polisa OC (ubezpieczyciel, numer, ważność)', 'dane trafiają do zgłoszenia szkody', vs.filter(v => !v.insurer || !v.policyNo || !v.policyUntil)],
    ['vehicles', 'Telefon assistance', 'kierowca dzwoni z ekranu „Moje auto” i ze zgłoszenia szkody', vs.filter(v => !v.assistancePhone)],
    ['drivers', 'Telefon kierowcy', 'szybki kontakt z pulpitu i grafiku', ds.filter(d => !d.phone)],
    ['drivers', 'Ważność prawa jazdy / badań', 'grafik ostrzega o przeterminowanych dokumentach', ds.filter(d => !d.licenseExpiry || !d.medicalExpiry)],
  ].filter(c => c[3].length);
  const total = vs.length * 5 + ds.length * 2, miss = checks.reduce((s, c) => s + c[3].length, 0);
  return {checks, total, pct: total ? Math.round((1 - miss / total) * 100) : 100};
}
function dataQualityPanel(){
  const {checks, total, pct} = dqChecks();
  if (!total) return '';
  if (!checks.length) return `<div class="panel"><div class="sec-head"><h3>Kompletność danych</h3><span class="pill ok">100%</span></div></div>`;
  const name = (col, x) => col==='vehicles' ? x.plate : x.name;
  return `<details class="panel fold dq" ${pct < 90 ? 'open' : ''}><summary class="sec-head"><h3>Kompletność danych</h3><span class="pill ${pct >= 90 ? 'ok' : pct >= 70 ? 'soon' : 'bad'}">${pct}%</span></summary>
    <p class="muted small sec-empty">Uzupełnione dane włączają alarmy i druki. Kliknij rejestrację albo nazwisko, żeby uzupełnić.</p>
    ${checks.map(([col, l, why, xs]) => `<div class="dq-row"><div><b>${l}</b><span class="sub">${why}</span></div><span class="count">${xs.length}</span>
      ${dqBulk(l, xs)}<div class="dq-list">${xs.slice(0, 9).map(x => `<button type="button" class="chip" data-edit="${col}" data-id="${esc(x.id)}">${esc(name(col, x) || '?')}</button>`).join('')}${xs.length > 9 ? `<span class="muted small">+${xs.length - 9}</span>` : ''}</div></div>`).join('')}
  </details>`;
}

/* Szybkie uzupełnienie jednym kliknięciem dla wszystkich aut z brakiem (bak, opony) – zwykle cała flota to te same busy */
function dqBulk(label, xs){
  if (xs.length < 2 || !canWrite) return '';
  if (label==='Pojemność baku') return `<div class="dq-bulk"><input id="dq-tank" type="number" min="20" max="400" inputmode="numeric" value="90" aria-label="Pojemność baku w litrach"><span class="muted small">l</span><button class="small" data-dq-bulk="tank">Ustaw wszystkim (${xs.length})</button></div>`;
  if (label==='Założone opony') return `<div class="dq-bulk"><select id="dq-tires" aria-label="Rodzaj opon">${Object.entries(TIRES).map(([k, v]) => `<option value="${k}" ${k===(today().slice(5) >= '10-15' || today().slice(5) < '04-15' ? 'zimowe' : 'letnie') ? 'selected' : ''}>${v}</option>`).join('')}</select><button class="small" data-dq-bulk="tires">Ustaw wszystkim (${xs.length})</button></div>`;
  return '';
}
async function dqBulkSave(kind, btn){
  const {checks} = dqChecks();
  const c = checks.find(x => x[1]===(kind==='tank' ? 'Pojemność baku' : 'Założone opony')); if (!c) return;
  const val = kind==='tank' ? Number($('#dq-tank').value) : $('#dq-tires').value;
  if (kind==='tank' && !(val >= 20 && val <= 400)){ toast('Podaj pojemność baku 20–400 l'); return; }
  btn.disabled = true;
  try {
    for (const v of c[3]) await db.collection('vehicles').doc(v.id).update(kind==='tank' ? {tankL: val} : {tires: val});
    toast(`Uzupełniono ${c[3].length} ${isPlural(c[3].length,'auto','auta','aut')}`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-dq-bulk]'); if (!b) return; e.preventDefault(); dqBulkSave(b.dataset.dqBulk, b); });

/* Kopia danych do pliku JSON (kierownik floty) */
async function backupJson(){
  const cols = ['vehicles','drivers','bookings','routes','routeStops','costs','deadlines','issues','serviceEntries','docs','settings','loadings','loadingReports','fuelCardImports','fuelCardRows'];
  const data = {app:'Emage FLEET', exportedAt: new Date().toISOString(), by: me.full_name || '', tables: {}};
  cols.forEach(c => { if (Array.isArray(S[c])) data.tables[c] = S[c]; });
  const n = Object.values(data.tables).reduce((s, x) => s + x.length, 0);
  await saveFile(`Emage-FLEET-kopia-${today()}.json`, new Blob([JSON.stringify(data, null, 1)], {type:'application/json'}));
  toast(`Kopia gotowa: ${n} rekordów`);
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="backup"]')){ e.preventDefault(); backupJson(); } });
