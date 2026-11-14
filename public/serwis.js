/* Emage FLEET — serwis w trzech krokach (kierownik floty i serwisu):
   1. Zgłoszenia – usterki, informacje serwisowe (np. „wymienić rozrząd”) i zbliżające się terminy oleju i rozrządu
      (30 dni albo 2 000 km przed terminem). Zaznaczasz jedno lub kilka (także z różnych aut) → „Zrób zlecenie”.
   2. Zlecenia – warsztat, data, numer ZL/RRRR/NNN (nadaje baza), wydruk / PDF (każde auto na osobnej kartce).
   3. Zakończ naprawę – dla każdego auta: co zrobiono, przebieg, koszt, faktura. Zapis tworzy wpis w książce serwisowej
      (baza sama zamyka usterki, odnawia olej i rozrząd, dopisuje koszt); niezrobione wracają do Zgłoszeń.
   Dane: work_orders, work_order_items (migracja 038). Kierowca widzi tylko swoje usterki (widok w usterki.js). */
'use strict';
const WO_SOON_DAYS = 30, WO_SOON_KM = 2000;
const WO_KIND = {usterka: 'usterka', olej: 'wymiana oleju', rozrzad: 'wymiana rozrządu', inne: 'informacja serwisowa'};
const SVC_TYPES = [['rozrzad', 'Wymiana rozrządu'], ['olej', 'Wymiana oleju'], ['inne', 'Inne (wpisz)']];
const woOn = () => typeof optOn==='function' && optOn('workOrders') && optOn('woItems') && (P().manage || P().service);
const woStaff = () => !!(P().manage || P().service);
const woPicked = new Set();
let woShowDone = false;
const issueKind = i => i.serviceType==='olej' ? 'olej' : i.serviceType==='rozrzad' ? 'rozrzad' : i.serviceType==='inne' ? 'inne' : 'usterka';
const dlKind = d => d.type==='Serwis olejowy' ? 'olej' : d.type==='Wymiana rozrządu' ? 'rozrzad' : null;
/* pozycje już na otwartym zleceniu */
function woOpenRefs(){
  const open = new Set(S.workOrders.filter(o => o.status==='otwarte').map(o => o.id)), iss = new Set(), dl = new Set();
  S.woItems.forEach(x => { if (open.has(x.orderId) && x.status==='zlecone'){ if (x.issueId) iss.add(x.issueId); if (x.deadlineId) dl.add(x.deadlineId); } });
  return {iss, dl};
}
/* Do zrobienia: [{key, vid, kind, title, sub, cls, issue?, deadline?}] */
function woTodo(){
  const {iss, dl} = woOpenRefs(), out = [];
  const live = vid => { const v = byId('vehicles', vid); return v && v.status!=='wycofany'; };
  S.issues.filter(i => i.status!=='naprawione' && live(i.vehicleId) && !iss.has(i.id)).forEach(i => {
    const sev = ISSUE_SEV[i.severity] || ISSUE_SEV.drobna, k = issueKind(i);
    out.push({key: 'i:' + i.id, vid: i.vehicleId, kind: k, title: i.title, issue: i, d: i.date,
      sub: `${fdate(i.date)}${i.createdBy ? ' · ' + esc(pName(i.createdBy)) : ''}${i.km ? ' · przy ' + km(i.km) : ''}`, cls: k==='usterka' ? sev.cls : 'info', sev: k==='usterka' ? sev.l : ''}); });
  S.deadlines.filter(d => dlKind(d) && live(d.vehicleId) && !dl.has(d.id)).forEach(d => {
    const sk = d.kmDue ? svcKm(d.vehicleId) : null, left = sk && sk.km ? Number(d.kmDue) - sk.km : null, days = d.date ? diffDays(today(), d.date) : null;
    const soon = (days!=null && days <= WO_SOON_DAYS) || (left!=null && left <= WO_SOON_KM); if (!soon) return;
    const late = (days!=null && days < 0) || (left!=null && left <= 0);
    out.push({key: 'd:' + d.id, vid: d.vehicleId, kind: dlKind(d), title: d.type, deadline: d, d: d.date || '',
      sub: [left!=null ? (left > 0 ? `za ${new Intl.NumberFormat('pl-PL').format(left)} km` : `przekroczony o ${new Intl.NumberFormat('pl-PL').format(-left)} km`) + (sk.gps ? '' : ' (bez GPS)') : '', days!=null ? (days >= 0 ? `do ${fdate(d.date)}` : `po terminie od ${fdate(d.date)}`) : ''].filter(Boolean).join(' · '),
      cls: late ? 'bad' : 'warn', sev: late ? 'po terminie' : 'zbliża się'}); });
  return out;
}

function viewRequests(){
  const items = woTodo(), byV = {};
  items.forEach(x => (byV[x.vid] = byV[x.vid] || []).push(x));
  [...woPicked].forEach(k => { if (!items.some(x => x.key===k)) woPicked.delete(k); });
  const sevO = {bad: 0, warn: 1, info: 2, off: 3};
  const vids = Object.keys(byV).sort((a, b) => Math.min(...byV[a].map(x => sevO[x.cls] ?? 3)) - Math.min(...byV[b].map(x => sevO[x.cls] ?? 3)) || String((byId('vehicles', a) || {}).plate).localeCompare((byId('vehicles', b) || {}).plate));
  const inWs = S.woItems.filter(x => x.status==='zlecone' && S.workOrders.some(o => o.id===x.orderId && o.status==='otwarte')).length;
  const head = `<div class="bar"><h2>Zgłoszenia</h2><div class="tools">
      ${canCreate('issues') ? `<button data-new="issues">${ic('plus')}Usterka</button>` : ''}
      <button class="primary" data-svc-info>${ic('plus')}Informacja serwisowa</button></div></div>
    <p class="muted small wo-steps"><b>1. Zgłoszenia</b> → 2. Zlecenie dla warsztatu → 3. Zakończenie naprawy. Zaznacz pozycje (mogą być z kilku aut) i kliknij „Zrób zlecenie”.${inWs ? ` W warsztacie: <a href="#zlecenia">${inWs} ${isPlural(inWs, 'pozycja', 'pozycje', 'pozycji')}</a>.` : ''}</p>`;
  const row = x => `<label class="wo-item ${x.cls}"><input type="checkbox" data-wo-pick="${esc(x.key)}" ${woPicked.has(x.key) ? 'checked' : ''}>
      <span class="wo-t"><b>${esc(x.title)}</b>${x.issue && typeof isAccident==='function' && isAccident(x.issue) ? ' <span class="pill bad">szkoda</span>' : ''}<span class="sub">${x.sub}</span>${x.issue && x.issue.description ? `<span class="sub">${esc(String(x.issue.description).slice(0, 160))}</span>` : ''}${x.issue ? photoStrip(x.issue.photos) : ''}</span>
      <span class="wo-p"><span class="pill ${x.kind==='usterka' ? 'off' : 'info'}">${WO_KIND[x.kind]}</span>${x.sev ? `<span class="pill ${x.cls}">${esc(x.sev)}</span>` : ''}</span>
      <span class="wo-a">${x.issue && canEditDoc('issues', x.issue) ? `<button type="button" class="small ghost" data-edit="issues" data-id="${esc(x.issue.id)}">Szczegóły</button>` : x.deadline ? `<button type="button" class="small ghost" data-edit="deadlines" data-id="${esc(x.deadline.id)}">Termin</button>` : ''}</span></label>`;
  const groups = vids.map(vid => { const v = byId('vehicles', vid) || {}, xs = byV[vid], all = xs.every(x => woPicked.has(x.key));
    return `<div class="panel wo-veh"><div class="sec-head">${plate(v.plate || '?')}<span class="muted small">${esc([v.make, v.model].filter(Boolean).join(' '))}</span>
      <button type="button" class="small ghost" data-wo-all="${esc(vid)}">${all ? 'Odznacz' : 'Zaznacz wszystkie'}</button></div>${xs.map(row).join('')}</div>`; }).join('');
  const n = woPicked.size, cars = new Set(items.filter(x => woPicked.has(x.key)).map(x => x.vid)).size;
  const bar = n ? `<div class="wo-bar-fix"><span><b>${n}</b> ${isPlural(n, 'pozycja', 'pozycje', 'pozycji')} · ${cars} ${isPlural(cars, 'auto', 'auta', 'aut')}</span><button type="button" class="ghost small" data-wo-clear>Wyczyść</button><button type="button" class="primary" data-wo-make>${ic('clip')}Zrób zlecenie</button></div>` : '';
  const done = S.issues.filter(i => i.status==='naprawione').sort((a, b) => (b.resolvedAt || b.date).localeCompare(a.resolvedAt || a.date));
  const doneHtml = `<details class="panel fold" ${woShowDone ? 'open' : ''} data-wo-done><summary class="sec-head"><h3>Naprawione</h3><span class="count">${done.length}</span></summary>${woShowDone ? `<div class="dl">${done.slice(0, 60).map(i => issueRow(i)).join('')}</div>` : ''}</details>`;
  return head + (groups || `<div class="panel"><div class="empty"><p>Nic do zrobienia – brak otwartych usterek, informacji serwisowych i zbliżających się wymian oleju i rozrządu.</p></div></div>`) + doneHtml + bar;
}

/* ---------- informacja serwisowa (np. „wymienić rozrząd”) ---------- */
function openSvcInfo(vid){
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => a.plate.localeCompare(b.plate));
  editing = {col: 'svc-info', base: {}, special: async () => {
    const w = $('#dlg-warn'), vId = $('#si-veh').value, t = $('#si-type').value, txt = $('#si-title').value.trim(), note = $('#si-note').value.trim();
    if (!vId){ w.textContent = 'Wybierz auto.'; w.hidden = false; return; }
    const title = t==='inne' ? txt : (SVC_TYPES.find(x => x[0]===t) || [, ''])[1] + (txt ? ' – ' + txt : '');
    if (!title){ w.textContent = 'Wpisz, co trzeba zrobić.'; w.hidden = false; return; }
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      const {error} = await sb.from('issues').insert({vehicle_id: vId, title: title.slice(0, 200), description: note || null, severity: 'drobna', status: 'nowe', date: today(), service_type: t});
      if (error) throw dbErr(error);
      await refresh('issues'); closeForm(); toast('Dodano do zgłoszeń');
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dlg-title').textContent = 'Informacja serwisowa';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="si-veh">Auto *</label><select id="si-veh"><option value="">— wybierz —</option>${vs.map(v => `<option value="${esc(v.id)}" ${v.id===vid ? 'selected' : ''}>${esc(v.plate)} · ${esc(v.make + ' ' + v.model)}</option>`).join('')}</select></div>
    <div class="field"><label for="si-type">Co trzeba zrobić *</label><select id="si-type">${SVC_TYPES.map(([k, l]) => `<option value="${k}">${l}</option>`).join('')}</select></div>
    <div class="field"><label for="si-title">Dopisek / nazwa</label><input id="si-title" placeholder="np. z pompą wody, klocki przód"></div>
    <div class="field full"><label for="si-note">Szczegóły</label><textarea id="si-note" placeholder="opcjonalnie"></textarea></div>
    <p class="muted small field full">Rozrząd i olej z tej informacji po zakończeniu naprawy same ustawią kolejny termin (od przebiegu przy naprawie).</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Dodaj'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}

/* ---------- krok 2: zlecenie ---------- */
function openWoMake(keys){
  const all = woTodo(), xs = all.filter(x => keys.includes(x.key)); if (!xs.length) return toast('Zaznacz pozycje do zlecenia');
  const ws = S.workshops.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  const byV = {}; xs.forEach(x => (byV[x.vid] = byV[x.vid] || []).push(x));
  editing = {col: 'wo-make', base: {}, special: async () => {
    const w = $('#dlg-warn'), wsId = $('#wo-ws').value, wsTxt = $('#wo-ws-txt').value.trim(), date = $('#wo-date').value, note = $('#wo-note').value.trim();
    const wsObj = byId('workshops', wsId), wsName = wsObj ? wsObj.name : wsTxt;
    if (!wsName){ w.textContent = 'Wybierz albo wpisz warsztat.'; w.hidden = false; return; }
    if (!date){ w.textContent = 'Podaj datę oddania auta.'; w.hidden = false; return; }
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      const id = crypto.randomUUID();
      const {error} = await sb.from('work_orders').insert({id, workshop_id: wsObj ? wsObj.id : null, workshop: wsName, date, note: note || null}); if (error) throw dbErr(error);
      const rows = xs.map(x => ({order_id: id, vehicle_id: x.vid, issue_id: x.issue ? x.issue.id : null, deadline_id: x.deadline ? x.deadline.id : null, kind: x.kind, title: String(x.title).slice(0, 200)}));
      const r2 = await sb.from('work_order_items').insert(rows); if (r2.error) throw dbErr(r2.error);
      xs.forEach(x => woPicked.delete(x.key));
      await Promise.all(['workOrders', 'woItems', 'issues'].map(c => refresh(c)));
      closeForm(); toast('Zlecenie zapisane'); location.hash = 'zlecenia'; render();
      setTimeout(() => printWorkOrders(id), 200);
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = 'Nowe zlecenie dla warsztatu';
  $('#dlg-body').innerHTML = `<div class="field"><label for="wo-ws">Warsztat *</label><select id="wo-ws"><option value="">— wpisz poniżej —</option>${ws.map(w => `<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select>
      <input id="wo-ws-txt" placeholder="albo nazwa warsztatu" style="margin-top:6px" ${ws.length ? 'hidden' : ''}></div>
    <div class="field"><label for="wo-date">Data oddania auta *</label><input id="wo-date" type="date" value="${addDays(today(), 1)}"></div>
    <div class="field full"><label for="wo-note">Uwagi do warsztatu</label><textarea id="wo-note" placeholder="np. proszę o kontakt przed wymianą części powyżej 1000 zł"></textarea></div>
    <div class="field full"><span class="label">Na zleceniu (${xs.length} ${isPlural(xs.length, 'pozycja', 'pozycje', 'pozycji')}, ${Object.keys(byV).length} ${isPlural(Object.keys(byV).length, 'auto', 'auta', 'aut')})</span>
      <div class="wo-sum">${Object.entries(byV).map(([vid, ys]) => `<div>${vPlate(vid)}<ul>${ys.map(x => `<li>${esc(x.title)} <span class="muted small">(${WO_KIND[x.kind]})</span></li>`).join('')}</ul></div>`).join('')}</div></div>
    <p class="muted small field full">Po zapisaniu otworzy się wydruk (albo zapis do PDF) – każde auto na osobnej kartce.</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#wo-ws').addEventListener('change', e => { $('#wo-ws-txt').hidden = !!e.target.value; });
  $('#dlg-save').textContent = 'Zapisz zlecenie'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}

function viewWorkOrders(){
  if (!woStaff()) return '';
  if (!woOn()) return `<div class="bar"><h2>Zlecenia</h2></div><div class="panel empty"><h3>Moduł czeka na bazę</h3><p>Uruchom w Supabase migrację <b>038_zlecenia.sql</b>.</p></div>`;
  const items = o => S.woItems.filter(x => x.orderId===o.id);
  const card = o => { const xs = items(o), byV = {}; xs.forEach(x => (byV[x.vehicleId] = byV[x.vehicleId] || []).push(x));
    const w = byId('workshops', o.workshopId), open = o.status==='otwarte';
    return `<div class="panel wo-card ${o.status}"><div class="sec-head"><h3>${esc(o.no || 'Zlecenie')}</h3><span class="muted small">${esc(o.workshop || (w ? w.name : ''))}${w && w.phone ? ` · <a href="tel:${esc(String(w.phone).replace(/\s/g, ''))}">${esc(w.phone)}</a>` : ''} · oddanie ${fdate(o.date)}</span>
        <span class="pill ${open ? 'warn' : o.status==='zakonczone' ? 'ok' : 'off'}">${open ? 'w warsztacie' : o.status==='zakonczone' ? 'zakończone' : 'anulowane'}</span></div>
      ${o.note ? `<p class="muted small sec-empty">${esc(o.note)}</p>` : ''}
      <div class="wo-sum">${Object.entries(byV).map(([vid, ys]) => `<div>${vPlate(vid)}<ul>${ys.map(x => `<li class="${x.status}">${x.status==='zrobione' ? '✓ ' : x.status==='niezrobione' ? '✗ ' : ''}${esc(x.title)} <span class="muted small">(${WO_KIND[x.kind] || x.kind})</span></li>`).join('')}</ul></div>`).join('')}</div>
      <div class="wo-act"><button class="small" data-wo-print="${esc(o.id)}">${ic('clip')}Drukuj / PDF</button>
        ${open && canWrite ? `<button class="small primary" data-wo-finish="${esc(o.id)}">${ic('check')}Zakończ naprawę</button><button class="small ghost" data-wo-cancel="${esc(o.id)}">Anuluj zlecenie</button>` : ''}</div></div>`; };
  const open = S.workOrders.filter(o => o.status==='otwarte').sort((a, b) => a.date.localeCompare(b.date));
  const closed = S.workOrders.filter(o => o.status!=='otwarte').sort((a, b) => (b.closedAt || b.createdAt || '').localeCompare(a.closedAt || a.createdAt || '')).slice(0, 30);
  const ws = S.workshops.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return `<div class="bar"><h2>Zlecenia</h2><div class="tools"><a class="btn primary" href="#usterki">${ic('plus')}Nowe zlecenie ze zgłoszeń</a></div></div>
    <p class="muted small wo-steps">1. Zgłoszenia → <b>2. Zlecenie dla warsztatu</b> → 3. Zakończenie naprawy. Po naprawie kliknij „Zakończ naprawę” – wpiszesz przebieg, koszt i co zrobiono.</p>
    ${open.map(card).join('') || '<div class="panel"><div class="empty"><p>Brak otwartych zleceń. Zrób je w Zgłoszeniach.</p></div></div>'}
    ${closed.length ? `<details class="panel fold"><summary class="sec-head"><h3>Zakończone i anulowane</h3><span class="count">${closed.length}</span></summary>${closed.map(card).join('')}</details>` : ''}
    <details class="panel fold"><summary class="sec-head"><h3>Warsztaty</h3><span class="count">${ws.length}</span></summary>
      <div class="dl">${ws.map(w => `<div class="mini"><span>${ic('wrench')}</span><span><b>${esc(w.name)}</b><span class="sub">${esc([w.kind, w.address, w.phone].filter(Boolean).join(' · '))}</span></span><span class="mini-r">${canCreate('workshops') ? `<button class="small ghost" data-edit="workshops" data-id="${esc(w.id)}">Edytuj</button>` : ''}</span></div>`).join('') || '<p class="muted sec-empty">Dodaj warsztaty, z którymi współpracujesz – wybierzesz je przy zleceniu.</p>'}</div>
      ${canCreate('workshops') ? `<p class="sec-empty"><button class="small" data-new="workshops">${ic('plus')}Warsztat</button></p>` : ''}</details>`;
}

/* ---------- wydruk: strona tytułowa + każde auto na osobnej kartce ---------- */
function printWorkOrders(id){
  const o = byId('workOrders', id); if (!o) return;
  const xs = S.woItems.filter(x => x.orderId===id && x.status!=='niezrobione'), byV = {};
  xs.forEach(x => (byV[x.vehicleId] = byV[x.vehicleId] || []).push(x));
  const w = byId('workshops', o.workshopId), box = '<span class="wo-box"></span>';
  let el = $('#print-area'); if (!el){ el = document.createElement('div'); el.id = 'print-area'; document.body.appendChild(el); }
  const head = sub => `<div class="pa-h"><div><b>Emage Group</b><span>Zlecenie dla warsztatu ${esc(o.no || '')}</span></div><div class="pa-r">${fdate(o.date)}${sub ? `<br>${sub}` : ''}</div></div>`;
  const cars = Object.keys(byV);
  el.innerHTML = `<div class="pa">${head('')}
      <h1>Zlecenie ${esc(o.no || '')}</h1>
      <table class="pa-t"><tr><th>Warsztat</th><td><b>${esc(o.workshop || (w ? w.name : ''))}</b>${w ? `<br>${esc([w.address, w.phone].filter(Boolean).join(' · '))}` : ''}</td></tr>
        <tr><th>Data oddania</th><td>${fdate(o.date)}</td></tr><tr><th>Auta</th><td>${cars.map(vid => esc((byId('vehicles', vid) || {}).plate || '')).join(', ')}</td></tr>
        ${o.note ? `<tr><th>Uwagi</th><td>${esc(o.note).replace(/\n/g, '<br>')}</td></tr>` : ''}</table>
      <p class="pa-s">Każde auto ma poniżej osobną kartkę z zakresem prac. Prosimy o wpisanie przebiegu przy oddaniu, wykonanych prac i kosztów.</p></div>
    ${cars.map((vid, n) => { const v = byId('vehicles', vid) || {}, sk = svcKm(vid);
      return `<div class="pa pa-page">${head(`auto ${n + 1} z ${cars.length}`)}
        <h1>${esc(v.plate || '')} · ${esc([v.make, v.model].filter(Boolean).join(' '))}</h1>
        <table class="pa-t"><tr><th>VIN</th><td>${esc(v.vin || '')}</td></tr><tr><th>Rok / paliwo</th><td>${esc([v.year, v.fuel].filter(Boolean).join(' · '))}</td></tr>
          <tr><th>Przebieg przy oddaniu</th><td>${sk.km ? km(sk.km) : ''} &nbsp; (sprawdź: ______________ km)</td></tr></table>
        <h2>Do zrobienia</h2>
        <table class="pa-t wo-t"><tr><th style="width:24px"></th><th>Zakres</th><th style="width:30%">Uwagi warsztatu</th></tr>
          ${byV[vid].map(x => { const i = x.issueId ? byId('issues', x.issueId) : null; return `<tr><td>${box}</td><td><b>${esc(x.title)}</b><br><span class="pa-s">${WO_KIND[x.kind] || ''}${i && i.description ? ' · ' + esc(i.description).replace(/\n/g, '<br>') : ''}</span></td><td></td></tr>`; }).join('')}
          ${[1, 2].map(() => `<tr><td>${box}</td><td>&nbsp;</td><td></td></tr>`).join('')}</table>
        <h2>Koszt i części</h2><div class="pa-desc" style="min-height:80px"></div>
        <div class="pa-sign"><div>Zlecający (Emage)</div><div>Warsztat – przyjęcie</div><div>Odbiór auta</div></div></div>`; }).join('')}`;
  document.documentElement.classList.add('print-doc');
  setTimeout(() => { window.print(); document.documentElement.classList.remove('print-doc'); }, 60);
}

/* ---------- krok 3: zakończenie naprawy ---------- */
function openWoFinish(id){
  const o = byId('workOrders', id); if (!o) return;
  const xs = S.woItems.filter(x => x.orderId===id && x.status==='zlecone'), byV = {};
  xs.forEach(x => (byV[x.vehicleId] = byV[x.vehicleId] || []).push(x));
  const vids = Object.keys(byV);
  editing = {col: 'wo-finish', base: {}, special: async () => {
    const w = $('#dlg-warn'), date = $('#wf-date').value, nf = n => new Intl.NumberFormat('pl-PL').format(n);
    if (!date){ w.textContent = 'Podaj datę naprawy.'; w.hidden = false; return; }
    const plan = [];
    for (const vid of vids){
      const done = byV[vid].filter(x => $(`#wf-x-${x.id}`).checked), kmV = Math.round(Number(String($(`#wf-km-${vid}`).value).replace(/\s/g, ''))), cost = Number(String($(`#wf-cost-${vid}`).value || '0').replace(/\s/g, '').replace(',', '.'));
      const plateV = (byId('vehicles', vid) || {}).plate || '';
      if (done.length && !(kmV > 0)){ w.textContent = `${plateV}: wpisz przebieg przy naprawie.`; w.hidden = false; $(`#wf-km-${vid}`).focus(); return; }
      if (isNaN(cost) || cost < 0){ w.textContent = `${plateV}: koszt musi być liczbą.`; w.hidden = false; return; }
      plan.push({vid, done, rest: byV[vid].filter(x => !done.includes(x)), km: kmV, cost, extra: $(`#wf-desc-${vid}`).value.trim(), file: ($(`#wf-file-${vid}`).files || [])[0] || null});
    }
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      for (const p of plan){
        let entryId = null;
        if (p.done.length){
          const row = {vehicle_id: p.vid, date, km: p.km, workshop: o.workshop || null, cost: p.cost || null,
            description: (p.done.map(x => x.title).join('; ') + (p.extra ? ' – ' + p.extra : '')).slice(0, 500), note: o.no ? 'Zlecenie ' + o.no : null,
            oil_change: p.done.some(x => x.kind==='olej'), timing_change: p.done.some(x => x.kind==='rozrzad'),
            issue_ids: p.done.map(x => x.issueId).filter(Boolean)};
          if (p.file){ const up = await uploadDocFile(p.file); Object.assign(row, {storage_path: up.id, file_name: p.file.name, content_type: up.contentType}); }
          const r = await sb.from('service_entries').insert(row).select('id').single(); if (r.error) throw dbErr(r.error);
          entryId = r.data.id;
          const u = await sb.from('work_order_items').update({status: 'zrobione', service_entry_id: entryId}).in('id', p.done.map(x => x.id)); if (u.error) throw dbErr(u.error);
        }
        if (p.rest.length){ const u = await sb.from('work_order_items').update({status: 'niezrobione'}).in('id', p.rest.map(x => x.id)); if (u.error) throw dbErr(u.error); }
      }
      const r = await sb.from('work_orders').update({status: 'zakonczone', closed_at: new Date().toISOString()}).eq('id', id); if (r.error) throw dbErr(r.error);
      await Promise.all(['workOrders', 'woItems', 'issues', 'deadlines', 'serviceEntries', 'costs', 'vehicles'].map(c => refresh(c)));
      const back = plan.reduce((s, p) => s + p.rest.length, 0);
      closeForm(); toast(`Naprawa zakończona – zapisano w historii napraw${back ? `; ${back} niezrobione wróciły do zgłoszeń` : ''}`);
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dialog').classList.add('dlg-wide');
  $('#dlg-title').textContent = `Zakończ naprawę ${o.no || ''}`;
  $('#dlg-body').innerHTML = `<div class="field"><label for="wf-date">Data naprawy *</label><input id="wf-date" type="date" value="${today()}"></div><div class="field"><span class="label">Warsztat</span><b>${esc(o.workshop || '')}</b></div>
    ${vids.map(vid => { const v = byId('vehicles', vid) || {}, sk = svcKm(vid);
      return `<fieldset class="field full wf-veh"><legend>${plate(v.plate || '?')} <span class="muted small">${esc([v.make, v.model].filter(Boolean).join(' '))}</span></legend>
        <div class="wf-items">${byV[vid].map(x => `<label class="check"><input type="checkbox" id="wf-x-${esc(x.id)}" checked> ${esc(x.title)} <span class="muted small">(${WO_KIND[x.kind]})</span></label>`).join('')}</div>
        <div class="wf-grid"><div><label for="wf-km-${esc(vid)}">Przebieg (km) *</label><input id="wf-km-${esc(vid)}" type="text" inputmode="numeric" value="${sk.km ? Math.round(sk.km) : ''}"></div>
          <div><label for="wf-cost-${esc(vid)}">Koszt brutto (zł)</label><input id="wf-cost-${esc(vid)}" type="text" inputmode="decimal" placeholder="np. 1 850"></div>
          <div class="wf-wide"><label for="wf-desc-${esc(vid)}">Co jeszcze zrobiono / części</label><input id="wf-desc-${esc(vid)}" placeholder="opcjonalnie"></div>
          <div class="wf-wide"><label for="wf-file-${esc(vid)}">Faktura (PDF albo zdjęcie)</label><input id="wf-file-${esc(vid)}" type="file" accept="${DOC_TYPES.join(',')}"></div></div></fieldset>`; }).join('')}
    <p class="muted small field full">Odznacz to, czego nie zrobiono – wróci do Zgłoszeń. Zrobione usterki zamkną się same, a wymiana oleju i rozrządu ustawi kolejny termin od wpisanego przebiegu.</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zakończ naprawę'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
async function woCancel(id){
  const o = byId('workOrders', id); if (!o) return;
  if (!confirmTwice('wo-cancel-' + id, 'Kliknij jeszcze raz „Anuluj zlecenie” – pozycje wrócą do Zgłoszeń.')) return;
  try {
    const ids = S.woItems.filter(x => x.orderId===id && x.status==='zlecone').map(x => x.id);
    if (ids.length){ const u = await sb.from('work_order_items').update({status: 'niezrobione'}).in('id', ids); if (u.error) throw dbErr(u.error); }
    const r = await sb.from('work_orders').update({status: 'anulowane', closed_at: new Date().toISOString()}).eq('id', id); if (r.error) throw dbErr(r.error);
    await Promise.all(['workOrders', 'woItems', 'issues'].map(c => refresh(c))); toast('Zlecenie anulowane – pozycje wróciły do Zgłoszeń');
  } catch(err){ handleWriteErr(err); }
}
let woConfirm = {k: '', t: 0};
function confirmTwice(k, msg){ const now = Date.now(); if (woConfirm.k===k && now - woConfirm.t < 5000){ woConfirm = {k: '', t: 0}; return true; } woConfirm = {k, t: now}; toast(msg); return false; }
/* zlecenie z karty auta: wszystkie otwarte pozycje tego auta */
function woForVehicle(vid){
  const keys = woTodo().filter(x => x.vid===vid).map(x => x.key);
  if (!keys.length) return toast('To auto nie ma otwartych zgłoszeń ani zbliżających się wymian oleju i rozrządu. Dodaj informację serwisową.');
  openWoMake(keys);
}
const woCount = () => woOn() ? S.workOrders.filter(o => o.status==='otwarte').length : 0;

document.addEventListener('change', e => {
  const c = e.target.closest && e.target.closest('[data-wo-pick]'); if (!c) return;
  c.checked ? woPicked.add(c.dataset.woPick) : woPicked.delete(c.dataset.woPick); render();
});
document.addEventListener('toggle', e => { if (e.target.matches && e.target.matches('[data-wo-done]')){ const o = e.target.open; if (o!==woShowDone){ woShowDone = o; render(); } } }, true);
document.addEventListener('click', e => {
  const t = e.target.closest('[data-svc-info],[data-wo-all],[data-wo-clear],[data-wo-make],[data-wo-print],[data-wo-finish],[data-wo-cancel],[data-wo-veh]'); if (!t || t.closest('#dialog')) return;
  e.preventDefault();
  if (t.dataset.svcInfo!==undefined) return openSvcInfo(t.dataset.svcInfo || '');
  if (t.dataset.woAll){ const ks = woTodo().filter(x => x.vid===t.dataset.woAll).map(x => x.key), all = ks.every(k => woPicked.has(k)); ks.forEach(k => all ? woPicked.delete(k) : woPicked.add(k)); render(); return; }
  if (t.dataset.woClear!==undefined){ woPicked.clear(); render(); return; }
  if (t.dataset.woMake!==undefined) return openWoMake([...woPicked]);
  if (t.dataset.woPrint) return printWorkOrders(t.dataset.woPrint);
  if (t.dataset.woFinish) return openWoFinish(t.dataset.woFinish);
  if (t.dataset.woCancel) return woCancel(t.dataset.woCancel);
  if (t.dataset.woVeh) return woForVehicle(t.dataset.woVeh);
});
