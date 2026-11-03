/* Emage FLEET — aplikacja: nawigacja, odświeżanie widoków i obsługa kliknięć */
'use strict';
/* ---------- routing ---------- */
const DRIVER_VIEWS = ['moje','wybierz','moje-dane'];
const TABS = ['moje','wybierz','moje-dane','pulpit','pojazdy','trasy','kontrole','terminy','usterki','przydzial','koszty','raporty','historia','uzytkownicy'];
const homeTab = () => P().mycar ? 'moje' : 'pulpit';
let pendingCard = null;
let tab = 'pulpit', q = '', costMonth = today().slice(0,7), dlFilter = 'all', assignView = 'kalendarz';
function route(){ const h = location.hash.slice(1); tab = TABS.includes(h) ? h : homeTab(); cardId = pendingCard; pendingCard = null; $('#app').classList.remove('nav-open'); render(); window.scrollTo(0,0); }
window.addEventListener('hashchange', route);

/* ---------- render ---------- */
function render(){
  const role = roleOf();
  renderWho(role);
  const ready = !!me;
  const gate = !role;
  const shell = $('#app');
  shell.classList.toggle('bare', gate || !!P().mycar);
  $('#strip').hidden = true;
  renderTop(role);
  if (gate){
    renderNotices();
    $('#view').innerHTML = !ready ? `<div class="panel empty"><p>Sprawdzanie uprawnień…</p></div>` : viewWaiting();
    return;
  }
  if (P().mycar){
    // kierowca: bez zakładek i paska podsumowania – ekran startowy i podstrony
    if (!DRIVER_VIEWS.includes(tab)) tab = 'moje';
    renderNotices();
    const v = $('#view');
    v.innerHTML = tab==='wybierz' ? viewPickCar() : tab==='moje-dane' ? viewMyData() : viewMyCar();
    hydrateFiles(v);
    return;
  }
  if (DRIVER_VIEWS.includes(tab)) tab = 'pulpit';
  const manage = !!P().manage;
  $('#tab-users').hidden = !manage; $('#grp-adm').hidden = !manage; $('#tab-routes').hidden = !manage; $('#tab-checks').hidden = !P().service;
  $('#tab-reports').hidden = !P().reports;
  $('#tab-history').hidden = !P().history;
  $('#grp-an').hidden = !P().reports && !P().history;
  if ((tab==='uzytkownicy' && !manage) || (tab==='trasy' && !manage) || (tab==='kontrole' && !P().service) || (tab==='raporty' && !P().reports) || (tab==='historia' && !P().history)) tab = 'pulpit';
  document.querySelectorAll('#tabs a, #bottombar a').forEach(a => { if (a.dataset.tab===tab) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  renderNotices();
  if (manage){ const pend = pendingUsers().length + pendingRequests().length + openDisputes().length; const cu=$('#c-uzytkownicy'); cu.textContent = pend; cu.classList.toggle('bad', pend>0); cu.hidden = !pend; }
  if (tab==='uzytkownicy'){ $('#view').innerHTML = viewUsers(); updateCounts(); return; }
  updateCounts();
  const v = $('#view');
  if (tab==='pulpit') v.innerHTML = viewDashboard();
  else if (tab==='trasy') v.innerHTML = viewRoutes();
  else if (tab==='kontrole') v.innerHTML = viewChecks();
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
  if (P().service){ const n = (P().manage ? pendingCleanings().length : 0) + overdueInspections().length; const ck = $('#c-kontrole'); ck.textContent = n; ck.hidden = !n; ck.classList.toggle('bad', n>0); }
  const oi = openIssues(); const cu = $('#c-usterki'); cu.textContent = oi.length; cu.classList.toggle('bad', oi.some(i=>i.severity==='stop'));
}

function renderWho(role){
  const el = $('#who');
  if (!me){ el.hidden = true; return; }
  el.hidden = false;
  const name = me.full_name || me.email || '';
  const ini = name.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(x => x[0].toUpperCase()).join('');
  el.innerHTML = `<span class="ava">${esc(ini)}</span><div class="who-t"><b>${esc(name)}</b><span>${role?esc(ROLES[role].name):'Bez roli'}</span></div>
    <div class="who-act">${role ? `<button type="button" class="ghost icon" data-action="push-open" title="Powiadomienia" aria-label="Powiadomienia">${ic('bell')}</button>` : ''}<button type="button" class="ghost icon" data-action="logout" title="Wyloguj" aria-label="Wyloguj">${ic('out')}</button></div>`;
}
/* Nagłówek na telefonie (i zawsze u kierowcy): motyw, powiadomienia, wylogowanie */
function renderTop(role){
  const t = currentTheme()==='dark' ? 'sun' : 'moon';
  $('#mtop-r').innerHTML = `<button type="button" class="ghost icon" data-action="theme-toggle" aria-label="Zmień motyw" title="Zmień motyw">${ic(t)}</button>`
    + (role ? `<button type="button" class="ghost icon" data-action="push-open" aria-label="Powiadomienia" title="Powiadomienia">${ic('bell')}</button>` : '')
    + `<button type="button" class="ghost icon" data-action="logout" aria-label="Wyloguj" title="Wyloguj">${ic('out')}</button>`;
}

function renderNotices(){
  const n = $('#notices'); let h='';
  if (dbState==='slow') h += `<div class="notice err"><span>Nie udało się połączyć z bazą danych. Sprawdź internet – strona spróbuje ponownie sama.</span></div>`;
  if (tab==='pulpit' && !P().mycar){ n.innerHTML = h; return; }   // na Pulpicie wszystko jest w „Wymaga uwagi”
  if (P().manage && openDisputes().length && tab!=='uzytkownicy') h += `<div class="notice err"><span>${openDisputes().length} ${isPlural(openDisputes().length,'sporny wpis','sporne wpisy','spornych wpisów')} w podwójnej obsadzie czeka na Twoją decyzję.</span><button class="small" data-go="uzytkownicy">Rozstrzygnij</button></div>`;
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
  return `<div class="panel empty"><h3>${title}</h3><p>${text}</p><div class="empty-act">${show?btn:''}${extra}</div></div>`;
}
function loadingOr(col, html){ return (!got[col] && db) ? `<div class="panel empty"><p>Wczytywanie danych…</p></div>` : html; }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-new],[data-edit],[data-go],[data-dlf],[data-renew],[data-action],[data-card],[data-back],[data-av],[data-cal],[data-cal-lane],[data-noop],[data-isf],[data-issue-st],[data-ho],[data-transfer],[data-take],[data-rep],[data-card-go]');
  if (!t || t.closest('#dialog')) return;
  if (e.target.closest('.thumbs a, a.btn')) return;
  if (t.dataset.noop) return;
  if (t.dataset.renew){ e.stopPropagation(); renew(t.dataset.renew); return; }
  if (t.dataset.issueSt) return setIssueStatus(t.dataset.id, t.dataset.issueSt);
  if (t.dataset.ho){ e.stopPropagation(); return openHandover(t.dataset.id, t.dataset.ho); }
  if (t.dataset.transfer){ e.stopPropagation(); return openTransfer(t.dataset.transfer); }
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
  if ((e.key==='Enter'||e.key===' ') && e.target.matches('.dl-row,.drv,.is-row,.cal-bar,tr[data-card],.fl-row')){ e.preventDefault(); e.target.click(); }
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


/* ---------- wygląd: ikony w menu, motyw, menu na telefonie ---------- */
document.querySelectorAll('[data-ic]').forEach(el => el.insertAdjacentHTML('afterbegin', ic(el.dataset.ic)));
document.querySelectorAll('[data-theme-set]').forEach(b => { const d = b.dataset.themeSet==='dark'; b.innerHTML = ic(d?'moon':'sun') + (d?'Ciemny':'Jasny'); });
document.querySelectorAll('.side-close').forEach(b => b.innerHTML = ic('x'));
function syncThemeUi(){
  const t = currentTheme();
  document.querySelectorAll('[data-theme-set]').forEach(b => b.setAttribute('aria-pressed', b.dataset.themeSet===t));
  document.querySelectorAll('[data-action="theme-toggle"]').forEach(b => b.innerHTML = ic(t==='dark'?'sun':'moon'));
}
syncThemeUi();
try { matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => setTimeout(syncThemeUi, 0)); } catch(_){}
document.addEventListener('click', e => {
  const s = e.target.closest('[data-theme-set]'); if (s){ setTheme(s.dataset.themeSet); syncThemeUi(); return; }
  if (e.target.closest('[data-action="theme-toggle"]')){ setTheme(currentTheme()==='dark' ? 'light' : 'dark'); syncThemeUi(); return; }
  if (e.target.closest('[data-action="nav-open"]')){ $('#app').classList.add('nav-open'); return; }
  if (e.target.closest('[data-action="nav-close"]') || e.target.closest('#tabs a')){ $('#app').classList.remove('nav-open'); }
});
document.addEventListener('keydown', e => { if (e.key==='Escape') $('#app').classList.remove('nav-open'); });
