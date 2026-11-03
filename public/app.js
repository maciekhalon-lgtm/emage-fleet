/* Emage FLEET — aplikacja: nawigacja, odświeżanie widoków i obsługa kliknięć */
'use strict';
/* ---------- routing ---------- */
const DRIVER_VIEWS = ['moje','wybierz','moje-dane'];
const TABS = ['moje','wybierz','moje-dane','pojazdy','terminy','usterki','przydzial','koszty','raporty','historia','uzytkownicy'];
const homeTab = () => P().mycar ? 'moje' : 'pojazdy';
let pendingCard = null;
let tab = 'pojazdy', q = '', costMonth = today().slice(0,7), dlFilter = 'all', assignView = 'kalendarz';
function route(){ const h = location.hash.slice(1); tab = TABS.includes(h) ? h : homeTab(); cardId = pendingCard; pendingCard = null; render(); window.scrollTo(0,0); }
window.addEventListener('hashchange', route);

/* ---------- render ---------- */
function render(){
  const role = roleOf();
  renderWho(role);
  const ready = !!me;
  const gate = !role;
  $('#strip').hidden = gate; $('#tabs').hidden = gate;
  if (gate){
    renderNotices();
    $('#view').innerHTML = !ready ? `<div class="panel empty"><p>Sprawdzanie uprawnień…</p></div>` : viewWaiting();
    return;
  }
  if (P().mycar){
    // kierowca: bez zakładek i paska podsumowania – ekran startowy i podstrony
    $('#strip').hidden = true; $('#tabs').hidden = true;
    if (!DRIVER_VIEWS.includes(tab)) tab = 'moje';
    renderNotices();
    const v = $('#view');
    v.innerHTML = tab==='wybierz' ? viewPickCar() : tab==='moje-dane' ? viewMyData() : viewMyCar();
    hydrateFiles(v);
    return;
  }
  if (DRIVER_VIEWS.includes(tab)) tab = 'pojazdy';
  const manage = !!P().manage;
  $('#tab-users').hidden = !manage;
  $('#tab-moje').hidden = !P().mycar;
  if (tab==='moje' && !P().mycar) tab = 'pojazdy';
  $('#tab-reports').hidden = !P().reports;
  $('#tab-history').hidden = !P().history;
  if ((tab==='uzytkownicy' && !manage) || (tab==='raporty' && !P().reports) || (tab==='historia' && !P().history)) tab = 'pojazdy';
  document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  renderStrip(); renderNotices();
  if (manage){ const pend = pendingUsers().length + pendingRequests().length; const cu=$('#c-uzytkownicy'); cu.textContent = pend; cu.classList.toggle('bad', pend>0); cu.hidden = !pend; }
  if (tab==='uzytkownicy'){ $('#view').innerHTML = viewUsers(); updateCounts(); return; }
  updateCounts();
  const v = $('#view');
  if (tab==='moje') v.innerHTML = viewMyCar();
  else if (tab==='pojazdy') v.innerHTML = cardId ? viewCard() : viewVehicles();
  else if (tab==='terminy') v.innerHTML = viewDeadlines();
  else if (tab==='usterki') v.innerHTML = viewIssues();
  else if (tab==='raporty') v.innerHTML = viewReports();
  else if (tab==='historia') v.innerHTML = viewHistory();
  else if (tab==='przydzial') v.innerHTML = viewAssign();
  else v.innerHTML = viewCosts();
  hydrateFiles(v);
}
function updateCounts(){
  const urgent = S.deadlines.filter(d => dlState(d).cls==='bad').length;
  $('#c-pojazdy').textContent = S.vehicles.length;
  const ct = $('#c-terminy'); ct.textContent = urgent || S.deadlines.length; ct.classList.toggle('bad', urgent>0);
  const cf = conflicts().size; const cp = $('#c-przydzial');
  cp.textContent = cf ? cf/1 : S.bookings.filter(b=>bookingState(b).key<2).length; cp.classList.toggle('bad', cf>0);
  const oi = openIssues(); const cu = $('#c-usterki'); cu.textContent = oi.length; cu.classList.toggle('bad', oi.some(i=>i.severity==='stop'));
}

function renderWho(role){
  const el = $('#who');
  if (!me){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = `<b>${esc(me.full_name || me.email)}</b><span class="pill ${role?'info':'off'}">${role?esc(ROLES[role].name):'Bez roli'}</span>${role ? '<button class="small ghost" data-action="push-open" title="Powiadomienia">Powiadomienia</button>' : ''}<button class="small ghost" data-action="logout">Wyloguj</button>`;
}

function renderStrip(){
  const active = S.vehicles.filter(v => v.status!=='wycofany');
  const avail = active.filter(v => vehicleState(v).cls==='ok').length;
  const inUse = active.filter(v => vehicleState(v).cls==='info').length;
  const svc = active.filter(v => v.status==='serwis' || vehicleState(v).cls==='bad').length;
  const over = S.deadlines.filter(d => dlState(d).d <= 0).length;
  const soon = S.deadlines.filter(d => { const x=dlState(d).d; return x>0 && x<=30; }).length;
  const m = today().slice(0,7);
  const own = P().costs==='own';
  const mc = visibleCosts().filter(c => (c.date||'').startsWith(m)).reduce((s,c)=>s+Number(c.amount||0),0);
  $('#strip').innerHTML = `
    <button class="stat" data-go="pojazdy"><span class="label">Pojazdy</span><b>${active.length}</b><span class="sub">${avail} dostępne · ${inUse} w użyciu · ${svc} w serwisie lub niesprawne</span></button>
    <button class="stat ${over?'bad':''}" data-go="terminy" data-dl="over"><span class="label">Po terminie / dziś</span><b>${over}</b><span class="sub">${over?'wymagają reakcji':'wszystko na czas'}</span></button>
    <button class="stat ${soon?'warn':''}" data-go="terminy" data-dl="soon"><span class="label">Terminy w 30 dni</span><b>${soon}</b><span class="sub">przeglądy, polisy, serwisy</span></button>
    <button class="stat" data-go="koszty"><span class="label">${own?'Moje koszty':'Koszty'} – ${MONTHS_FULL[Number(m.slice(5))-1]}</span><b>${zl(mc)}</b><span class="sub">${own?'Twoje wpisy, brutto':'brutto, wszystkie pojazdy'}</span></button>`;
}

function renderNotices(){
  const n = $('#notices'); let h='';
  if (dbState==='slow') h += `<div class="notice err"><span>Nie udało się połączyć z bazą danych. Sprawdź internet – strona spróbuje ponownie sama.</span></div>`;
  if (P().manage && pendingRequests().length && tab!=='uzytkownicy') h += `<div class="notice"><span>${pendingRequests().length} ${isPlural(pendingRequests().length,'zmiana danych czeka','zmiany danych czekają','zmian danych czeka')} na akceptację.</span><button class="small" data-go="uzytkownicy">Sprawdź</button></div>`;
  if (P().manage && pendingUsers().length && tab!=='uzytkownicy') h += `<div class="notice"><span>${pendingUsers().length} ${isPlural(pendingUsers().length,'konto czeka','konta czekają','kont czeka')} na zatwierdzenie.</span><button class="small" data-go="uzytkownicy">Zatwierdź</button></div>`;
  if (P().reports && tab!=='raporty'){
    const la = limitAlerts();
    const over = la.vehicles.filter(x => x.over), near = la.vehicles.filter(x => !x.over);
    if (la.fleet) h += `<div class="notice ${la.fleet.over?'err':''}"><span>Koszty floty w tym miesiącu: <b>${zl(la.fleet.sum)}</b> z budżetu ${zl(la.fleet.lim)}${la.fleet.over?' – budżet przekroczony':''}.</span><button class="small" data-go="raporty">Raporty</button></div>`;
    if (over.length || near.length) h += `<div class="notice ${over.length?'err':''}"><span>${over.length?`Limit kosztów przekroczony: <b>${over.map(x=>esc(x.v.plate)).join(', ')}</b>. `:''}${near.length?`Blisko limitu (ponad 90%): ${near.map(x=>esc(x.v.plate)).join(', ')}.`:''}</span><button class="small" data-go="raporty">Raporty</button></div>`;
  }
  n.innerHTML = h;
}

function emptyBlock(title, text, btn, extra='', col=''){
  const show = btn && (col ? canCreate(col) : canWrite);
  return `<div class="panel empty"><h3>${title}</h3><p>${text}</p><div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center">${show?btn:''}${extra}</div></div>`;
}
function loadingOr(col, html){ return (!got[col] && db) ? `<div class="panel empty"><p>Wczytywanie danych…</p></div>` : html; }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-new],[data-edit],[data-go],[data-dlf],[data-renew],[data-action],[data-card],[data-back],[data-av],[data-cal],[data-cal-lane],[data-noop],[data-isf],[data-issue-st],[data-ho],[data-take],[data-rep],[data-card-go]');
  if (!t || t.closest('#dialog')) return;
  if (e.target.closest('.thumbs a, a.btn')) return;
  if (t.dataset.noop) return;
  if (t.dataset.renew){ e.stopPropagation(); renew(t.dataset.renew); return; }
  if (t.dataset.issueSt) return setIssueStatus(t.dataset.id, t.dataset.issueSt);
  if (t.dataset.ho){ e.stopPropagation(); return openHandover(t.dataset.id, t.dataset.ho); }
  if (t.dataset.take) return openHandover(null, 'pickup', t.dataset.take);
  if (t.dataset.new) return openForm(t.dataset.new, null, t.dataset.veh ? {vehicleId: t.dataset.veh} : undefined);
  if (t.dataset.card){ cardId = t.dataset.card; render(); window.scrollTo(0,0); return; }
  if (t.dataset.back){ cardId = null; render(); return; }
  if (t.dataset.av){ assignView = t.dataset.av; render(); return; }
  if (t.dataset.cal){ calStart = t.dataset.cal==='0' ? mondayOf(today()) : addDays(calStart, Number(t.dataset.cal)); render(); return; }
  if (t.dataset.calLane) return calLaneClick(t, e);
  if (t.dataset.isf){ issueFilter = t.dataset.isf; render(); return; }
  if (t.dataset.rep){ repMode = t.dataset.rep; render(); return; }
  if (t.dataset.cardGo){ if (location.hash==='#pojazdy'){ tab='pojazdy'; cardId=t.dataset.cardGo; render(); window.scrollTo(0,0); } else { pendingCard = t.dataset.cardGo; location.hash = 'pojazdy'; } return; }
  if (t.dataset.action==='export-xlsx') return exportXlsx();
  if (t.dataset.action==='save-budget') return saveBudget();
  if (t.dataset.action==='open-import') return openImport();
  if (t.dataset.edit) return openForm(t.dataset.edit, t.dataset.id);
  if (t.dataset.go){ cardId = null; if (t.dataset.dl) dlFilter=t.dataset.dl; if (t.dataset.go==='koszty') costMonth=today().slice(0,7); location.hash = t.dataset.go; render(); return; }
  if (t.dataset.dlf){ dlFilter = t.dataset.dlf; render(); return; }
});
document.addEventListener('keydown', e => {
  if ((e.key==='Enter'||e.key===' ') && e.target.matches('.dl-row,.drv,.is-row,.cal-bar,tr[data-card]')){ e.preventDefault(); e.target.click(); }
});
document.addEventListener('input', e => {
  if (e.target.id==='search'){ q = e.target.value; const pos=e.target.selectionStart; render(); const s=$('#search'); s.focus(); s.setSelectionRange(pos,pos); }
});
document.addEventListener('change', e => {
  if (e.target.id==='month' && e.target.value){ costMonth = e.target.value; render(); }
  if (e.target.id==='rep-month' && e.target.value){ repMonth = e.target.value; render(); }
  if (e.target.id==='rep-year'){ repYear = e.target.value; render(); }
  if (e.target.id==='hist-who'){ histWho = e.target.value; render(); }
  if (e.target.id==='hist-col'){ histCol = e.target.value; render(); }
  if (e.target.dataset.roleFor) setRole(e.target.dataset.roleFor, e.target.value);
  if (e.target.dataset.drvFor) setDriverLink(e.target.dataset.drvFor, e.target.value);
});

