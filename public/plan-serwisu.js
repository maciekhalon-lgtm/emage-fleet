/* Emage FLEET — plan serwisu: wizyty aut w warsztatach (Serwis → Plan serwisu).
   Dane: workshops i service_visits (migracja 030). Wizyta „w warsztacie” sama ustawia auto na „serwis”,
   zakończenie przywraca „aktywny” i otwiera wpis do książki serwisowej. Ostrzega, gdy auto jest tego dnia w grafiku. */
'use strict';
const VISIT_ST = {zaplanowana:'zaplanowana', w_warsztacie:'w warsztacie', zakonczona:'zakończona', odwolana:'odwołana'};
const planOn = () => typeof optOn==='function' && optOn('visits') && optOn('workshops') && (P().manage || P().service);
const canPlan = () => canWrite && P().visits==='rw';
/* terminy, które załatwia się w warsztacie (bez ubezpieczeń, winiet, opłat) */
const WORKSHOP_DL = t => !/ubezpiecz|\boc\b|\bac\b|winiet|leasing|opłat|abonament/i.test(String(t || ''));
const openVisit = v => v.status==='zaplanowana' || v.status==='w_warsztacie';
/* przydziały auta w dniu wizyty (bez już zdanych) */
const visitClash = x => S.bookings.filter(b => b.vehicleId===x.vehicleId && !b.returned && b.from <= x.date && b.to >= x.date);
/* do umówienia: terminy serwisowe ≤ 30 dni / po terminie i otwarte usterki „naprawa/nowe” bez zaplanowanej wizyty */
function toPlan(){
  const has = (vid, f) => S.visits.some(x => x.vehicleId===vid && openVisit(x) && f(x));
  const dl = S.deadlines.filter(d => { const v = byId('vehicles', d.vehicleId); if (!v || v.status==='wycofany') return false; if (!WORKSHOP_DL(d.type)) return false; const s = dlState(d); return (s.cls==='bad' || s.cls==='warn') && !has(d.vehicleId, x => x.deadlineId===d.id); });
  const is = openIssues().filter(i => { const v = byId('vehicles', i.vehicleId); return v && v.status!=='wycofany' && !has(i.vehicleId, x => x.issueId===i.id); });
  return {dl, is};
}
function visitRow(x){
  const v = byId('vehicles', x.vehicleId) || {}, w = byId('workshops', x.workshopId), cl = visitClash(x), past = x.date < today() && x.status==='zaplanowana';
  const act = canPlan() ? (x.status==='zaplanowana' ? `<button class="small" data-visit-st="w_warsztacie" data-id="${esc(x.id)}">Auto w warsztacie</button>` : x.status==='w_warsztacie' ? `<button class="small primary" data-visit-done="${esc(x.id)}">${ic('check')}Zakończona</button>` : '') : '';
  return `<div class="mini vis-row ${x.status}">
    <span class="vis-when"><b>${x.date===today() ? 'dziś' : x.date===addDays(today(), 1) ? 'jutro' : fdate(x.date).slice(0, 5)}</b><span class="sub">${esc(x.time || '')}</span></span>
    <span>${plate(v.plate || '?')} <b>${esc(x.reason)}</b>${x.status!=='zaplanowana' ? ` <span class="pill ${x.status==='w_warsztacie' ? 'warn' : x.status==='zakonczona' ? 'ok' : 'off'}">${VISIT_ST[x.status]}</span>` : ''}${past ? ' <span class="pill bad">minęła – zaktualizuj</span>' : ''}
      <span class="sub">${w ? `${esc(w.name)}${w.phone ? ` · <a href="tel:${esc(String(w.phone).replace(/\s/g, ''))}">${esc(w.phone)}</a>` : ''}` : 'warsztat nie wybrany'}${cl.length && x.status==='zaplanowana' ? ` · <b class="neg">w grafiku: ${esc(cl.map(crewName).join(', '))}</b>` : ''}</span></span>
    <span class="mini-r">${cl.length && x.status==='zaplanowana' && canEditDoc('bookings', cl[0]) ? `<button class="small" data-edit="bookings" data-id="${esc(cl[0].id)}">Zmień auto w grafiku</button>` : ''}${act}${canPlan() ? `<button class="small ghost" data-edit="visits" data-id="${esc(x.id)}" aria-label="Edytuj">Edytuj</button>` : ''}</span></div>`;
}
let planWeeks = 4;
function viewPlan(){
  if (!planOn()) return `<div class="bar"><h2>Plan serwisu</h2></div><div class="panel empty"><h3>Moduł czeka na bazę</h3><p>Uruchom w Supabase migrację <b>030_warsztaty.sql</b>.</p></div>`;
  const t = today(), end = addDays(t, planWeeks * 7);
  const now = S.visits.filter(x => x.status==='w_warsztacie').sort((a, b) => a.date.localeCompare(b.date));
  const late = S.visits.filter(x => x.status==='zaplanowana' && x.date < t);
  const up = S.visits.filter(x => x.status==='zaplanowana' && x.date >= t && x.date <= end).sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')));
  const done = S.visits.filter(x => x.status==='zakonczona' || x.status==='odwolana').sort((a, b) => b.date.localeCompare(a.date)).slice(0, 10);
  const weeks = {}; up.forEach(x => { const k = mondayOf(x.date); (weeks[k] = weeks[k] || []).push(x); });
  const {dl, is} = toPlan();
  const planBtn = (vid, reason, extra) => canPlan() ? `<button class="small" data-visit-new="${esc(vid)}" data-reason="${esc(reason)}" ${extra}>${ic('cal')}Umów</button>` : '';
  const ws = S.workshops.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl'));
  return `<div class="bar"><h2>Plan serwisu</h2><div class="tools"><div class="seg">${[2, 4, 8].map(n => `<button type="button" class="${planWeeks===n ? 'on' : ''}" data-plan-w="${n}">${n} tyg.</button>`).join('')}</div>${canPlan() ? `<button class="primary" data-new="visits">${ic('plus')}Umów wizytę</button>` : ''}</div></div>
    <div class="dgrid"><div class="dcol">
      ${now.length || late.length ? `<div class="panel"><div class="sec-head"><h3>Teraz w warsztacie${late.length ? ' i zaległe' : ''}</h3><span class="count">${now.length + late.length}</span></div><div class="dl">${[...now, ...late].map(visitRow).join('')}</div></div>` : ''}
      <div class="panel"><div class="sec-head"><h3>Najbliższe ${planWeeks} tygodnie</h3><span class="count">${up.length}</span></div>
        ${Object.keys(weeks).sort().map(k => `<div class="vis-week">tydzień od ${fdate(k).slice(0, 5)}</div><div class="dl">${weeks[k].map(visitRow).join('')}</div>`).join('') || '<p class="muted sec-empty">Brak zaplanowanych wizyt. Umów je z listy „Do umówienia” albo przyciskiem „Umów wizytę”.</p>'}</div>
      ${done.length ? `<details class="panel fold"><summary class="sec-head"><h3>Ostatnie zakończone</h3><span class="count">${done.length}</span></summary><div class="dl">${done.map(visitRow).join('')}</div></details>` : ''}
    </div><div class="dcol">
      <div class="panel"><div class="sec-head"><h3>Do umówienia</h3><span class="count ${dl.length + is.length ? 'bad' : ''}">${dl.length + is.length}</span></div><div class="dl">
        ${dl.map(d => { const s = dlState(d); return `<div class="mini">${vPlate(d.vehicleId)}<span><b>${esc(d.type)}</b><span class="sub">${fdate(d.date)} · ${esc(s.txt.toLowerCase())}</span></span><span class="mini-r">${planBtn(d.vehicleId, d.type, `data-dl="${esc(d.id)}"`)}</span></div>`; }).join('')}
        ${is.map(i => `<div class="mini">${vPlate(i.vehicleId)}<span><b>${esc(i.title)}</b><span class="sub">usterka${i.severity==='stop' ? ' · <b class="neg">niesprawne</b>' : ''} · ${fdate(i.date)}</span></span><span class="mini-r">${planBtn(i.vehicleId, i.title, `data-iss="${esc(i.id)}"`)}</span></div>`).join('')}
        ${dl.length + is.length ? '' : '<p class="muted sec-empty">Wszystkie pilne terminy i usterki mają umówione wizyty.</p>'}</div></div>
      <div class="panel"><div class="sec-head"><h3>Warsztaty</h3>${canPlan() ? `<button class="small" data-new="workshops">${ic('plus')}Warsztat</button>` : ''}</div><div class="dl">
        ${ws.map(w => `<div class="mini"><span>${ic('wrench')}</span><span><b>${esc(w.name)}</b><span class="sub">${esc([w.kind, w.address].filter(Boolean).join(' · '))}</span></span><span class="mini-r">${w.phone ? `<a class="btn small" href="tel:${esc(String(w.phone).replace(/\s/g, ''))}">${ic('phone')}${esc(w.phone)}</a>` : ''}${canPlan() ? `<button class="small ghost" data-edit="workshops" data-id="${esc(w.id)}" aria-label="Edytuj">Edytuj</button>` : ''}</span></div>`).join('') || '<p class="muted sec-empty">Dodaj warsztaty, z którymi pracujecie – telefon będzie pod ręką przy każdej wizycie.</p>'}</div></div>
    </div></div>`;
}
async function visitDone(id){
  const x = byId('visits', id); if (!x || !canPlan()) return;
  try { await db.collection('visits').doc(id).update({status:'zakonczona'}); }
  catch(err){ return handleWriteErr(err); }
  toast('Wizyta zakończona – auto znów aktywne. Uzupełnij wpis serwisowy.');
  if (P().serviceEntries==='rw' || canCreate('serviceEntries')){ const w = byId('workshops', x.workshopId);
    setTimeout(() => openForm('serviceEntries', null, {vehicleId: x.vehicleId, date: today(), description: x.reason + (x.note ? ' – ' + x.note : ''), workshop: w ? w.name : undefined}), 150); }
}
function planCount(){ if (!planOn()) return {n: 0}; const late = S.visits.filter(x => x.status==='zaplanowana' && x.date < today()).length, cl = S.visits.filter(x => x.status==='zaplanowana' && x.date >= today() && x.date <= addDays(today(), 3) && visitClash(x).length).length; return {n: late + cl, bad: !!(late + cl)}; }
document.addEventListener('click', async e => {
  const w = e.target.closest('[data-plan-w]'); if (w){ planWeeks = Number(w.dataset.planW); render(); return; }
  const n = e.target.closest('[data-visit-new]'); if (n){ e.preventDefault(); openForm('visits', null, {vehicleId: n.dataset.visitNew, reason: n.dataset.reason, deadlineId: n.dataset.dl || null, issueId: n.dataset.iss || null}); return; }
  const s = e.target.closest('[data-visit-st]'); if (s){ e.preventDefault(); try { await db.collection('visits').doc(s.dataset.id).update({status: s.dataset.visitSt}); toast('Auto w warsztacie – w grafiku oznaczone jako serwis'); } catch(err){ handleWriteErr(err); } return; }
  const d = e.target.closest('[data-visit-done]'); if (d){ e.preventDefault(); visitDone(d.dataset.visitDone); }
});
