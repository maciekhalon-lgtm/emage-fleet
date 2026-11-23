/* Emage FLEET — aplikacja: nawigacja, odświeżanie widoków i obsługa kliknięć */
'use strict';
/* ---------- routing ---------- */
const DRIVER_VIEWS = ['moje','wybierz','moje-dane','moj-grafik','moja-historia','moja-mapa'];
const TABS = ['moje','wybierz','moje-dane','moj-grafik','moja-historia','moja-mapa','pulpit','pojazdy','trasy','terminy','usterki','ksiazka','przydzial','mapa-tras','koszty','wydatki','karty','oplaty','opony','wyposazenie','umowy','plan','zlecenia','serwis-terminy','ranking','ranking-kierowcy','spalanie','liczniki','raporty','rozliczenie','historia','kierowcy','uzytkownicy','ustawienia'];
const homeTab = () => P().mycar ? 'moje' : 'pulpit';
let pendingCard = null;
let tab = TABS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'pulpit', q = '', costMonth = today().slice(0,7), dlFilter = 'urgent';
document.getElementById('app')?.classList.toggle('planner', tab==='mapa-tras');   // planer po odświeżeniu: od razu pełny ekran, bez mignięcia menu
function route(){ actsOpen = false; const h = location.hash.slice(1); tab = TABS.includes(h) ? h : homeTab(); cardId = pendingCard; pendingCard = null; $('#app').classList.remove('nav-open'); render(); window.scrollTo(0,0); }
window.addEventListener('hashchange', route);

/* ---------- render ---------- */
function render(){
  if (typeof rkStamp!=='undefined') rkStamp++;   // świeże liczenie spalania po każdej zmianie danych
  const role = roleOf();
  renderWho(role);
  const ready = !!me;
  const gate = !role;
  const shell = $('#app');
  shell.classList.toggle('planner', tab==='mapa-tras');
  shell.classList.toggle('bare', gate || !!P().mycar);
  renderTop(role);
  if (gate){
    renderNotices();
    $('#view').innerHTML = !ready ? (tab==='mapa-tras' ? `<div class="pl pl-loading"><div class="pl-load">Wczytywanie planera…</div></div>` : `<div class="panel empty"><p>Sprawdzanie uprawnień…</p></div>`) : viewWaiting();
    return;
  }
  if (P().mycar){
    // kierowca: bez zakładek i paska podsumowania – ekran startowy i podstrony
    if (!DRIVER_VIEWS.includes(tab)) tab = 'moje';
    renderNotices();
    const v = $('#view');
    morph(v, tab==='moja-mapa' ? viewDriverMap() : tab==='wybierz' ? viewPickCar() : tab==='moje-dane' ? viewMyData() : tab==='moj-grafik' ? viewMySchedule() : tab==='moja-historia' ? viewMyHistory() : viewMyCar());
    hydrateFiles(v);
    return;
  }
  // stare adresy: Raporty → Koszty (Podsumowanie), Opłaty drogowe → Wydatki (opłaty)
  if (tab==='liczniki' && !P().manage){ tab = 'pulpit'; history.replaceState(null, '', '#pulpit'); }   // Kontrola liczników – tylko kierownik floty
  if (tab==='raporty'){ tab = 'koszty'; history.replaceState(null, '', '#koszty'); }
  if (tab==='oplaty'){ tab = 'wydatki'; if (typeof expF!=='undefined'){ Object.keys(expF).forEach(k => { expF[k] = ''; }); expF.grp = '5'; } history.replaceState(null, '', '#wydatki'); }
  const drive = canDrive();
  if (DRIVER_VIEWS.includes(tab) && !drive) tab = 'pulpit';
  const manage = !!P().manage;
  $('#tab-mycar').hidden = !drive; $('#bb-mycar').hidden = !drive; $('#bb-usterki').hidden = drive;
  syncNav();
  // Planer tras po odświeżeniu: zanim dane się wczytają, nie przerzucaj na Pulpit (żeby nie mignął)
  if ((!tabAllowed(tab) && !(tab==='mapa-tras' && dbState!=='live')) || (tab==='ustawienia' && !manage)){
    const g = groupOf(tab), first = g && GROUPS[g].find(([, , ok]) => ok());
    tab = first ? first[0] : 'pulpit';
  }
  navRemember(tab); syncNav();
  syncFab();
  const navTab = DRIVER_VIEWS.includes(tab) ? 'moje' : (innerParent(tab) || tab), navGroup = groupOf(tab);
  document.querySelectorAll('#tabs a, #bottombar a').forEach(a => { if (a.dataset.tab===navTab || (a.dataset.group && a.dataset.group===navGroup)) a.setAttribute('aria-current','page'); else a.removeAttribute('aria-current'); });
  renderNotices();
  updateCounts();
  // Planer tras: osobny widok na cały ekran (bez menu i nagłówka aplikacji)
  $('#app').classList.toggle('planner', tab==='mapa-tras');
  if (tab!=='mapa-tras' && typeof plPrev!=='undefined') plPrev = tab;
  const v = $('#view');
  const st = subTabs();
  let html = '';
  if (tab==='uzytkownicy') html = viewUsers();
  else if (tab==='kierowcy') html = viewDrivers();
  else if (tab==='ksiazka') html = viewServiceBook();
  else if (tab==='ustawienia') html = viewSettings();
  else if (tab==='wybierz') html = viewPickCar();
  else if (tab==='moja-mapa') html = viewDriverMap();
  else if (tab==='moje-dane') html = viewMyData();
  else if (tab==='moj-grafik') html = viewMySchedule();
  else if (tab==='moja-historia') html = viewMyHistory();
  else if (tab==='moje') html = viewMyCar();
  else if (tab==='pulpit') html = viewDashboard();
  else if (tab==='trasy') html = viewRoutes();
  else if (tab==='mapa-tras') html = viewRouteMap();
  else if (tab==='pojazdy') html = cardId ? viewCard() : viewVehicles();
  else if (tab==='terminy') html = viewDeadlines();
  else if (tab==='usterki') html = viewIssues();
  else if (tab==='wydatki') html = viewExpenses();
  else if (tab==='rozliczenie') html = viewSettlement();
  else if (tab==='historia') html = viewHistory();
  else if (tab==='przydzial') html = viewAssign();
  else if (tab==='karty') html = viewFuelCards();
  else if (tab==='spalanie') html = viewFuelSimple();
  else if (tab==='liczniki') html = viewOdoControl();
  // Rentowność (Cała firma, Trasy) – ukryta do czasu nowej wersji; kod w rentownosc.js i trasy-zysk.js, ustawienia zostają w bazie
  else if (tab==='opony') html = viewTires();
  else if (tab==='wyposazenie') html = viewEquipment();
  else if (tab==='umowy') html = viewContracts();
  else if (tab==='plan') html = viewPlan();
  else if (tab==='zlecenia') html = viewWorkOrders();
  else if (tab==='serwis-terminy') html = viewSvcCountdown();
  else if (tab==='ranking') html = viewRankingFleet();
  else if (tab==='ranking-kierowcy') html = viewRankingDrivers();
  else html = viewCosts();
  morph(v, (st || '') + html);
  hydrateFiles(v);
  centerTabs();
}
function updateCounts(){
  $('#c-pojazdy').textContent = S.vehicles.length;
}

function renderWho(role){
  const el = $('#who');
  if (!me){ el.hidden = true; return; }
  el.hidden = false;
  const name = me.full_name || me.email || '';
  const ini = name.split(/[\s@.]+/).filter(Boolean).slice(0,2).map(x => x[0].toUpperCase()).join('');
  morph(el, `<span class="ava">${esc(ini)}</span><div class="who-t"><b>${esc(name)}</b><span>${role?esc(ROLES[role].name):'Bez roli'}</span></div>
    <div class="who-act">${role ? `<button type="button" class="ghost icon bell" data-action="${typeof notifOn==='function' && notifOn() ? 'notif-open' : 'push-open'}" title="Powiadomienia" aria-label="Powiadomienia">${ic('bell')}${typeof notifBadge==='function' ? notifBadge() : ''}</button>` : ''}<button type="button" class="ghost icon" data-action="logout" title="Wyloguj" aria-label="Wyloguj">${ic('out')}</button></div>`);
}
/* Nagłówek na telefonie (i zawsze u kierowcy): motyw, powiadomienia, wylogowanie */
function renderTop(role){
  const t = currentTheme()==='dark' ? 'sun' : 'moon';
  $('#mtop-r').innerHTML = `<button type="button" class="ghost icon" data-action="theme-toggle" aria-label="Zmień motyw" title="Zmień motyw">${ic(t)}</button>`
    + (role ? `<button type="button" class="ghost icon bell" data-action="${typeof notifOn==='function' && notifOn() ? 'notif-open' : 'push-open'}" aria-label="Powiadomienia" title="Powiadomienia">${ic('bell')}${typeof notifBadge==='function' ? notifBadge() : ''}</button>` : '')
    + `<button type="button" class="ghost icon" data-action="logout" aria-label="Wyloguj" title="Wyloguj">${ic('out')}</button>`;
}

function renderNotices(){
  let h = dbState==='slow' ? `<div class="notice err"><span>Nie udało się połączyć z bazą danych. Sprawdź internet – strona spróbuje ponownie sama.</span></div>` : '';
  // nowe konto czeka na zatwierdzenie – widać na każdej stronie, aż kierownik je zatwierdzi albo odrzuci
  const pu = P().manage && typeof pendingUsers==='function' && tab!=='uzytkownicy' ? pendingUsers() : [];
  if (pu.length) h += `<div class="notice warn new-acc"><span>${ic('user')}<b>${pu.length===1 ? 'Nowe konto czeka na zatwierdzenie' : pu.length + ' nowe konta czekają na zatwierdzenie'}:</b> ${pu.slice(0, 3).map(p => esc(p.full_name || p.email)).join(', ')}${pu.length > 3 ? '…' : ''}</span><a class="btn small primary" href="#uzytkownicy">Zatwierdź</a></div>`;
  morph($('#notices'), h);
}

function emptyBlock(title, text, btn, extra='', col=''){
  const show = btn && (col ? canCreate(col) : canWrite);
  return `<div class="panel empty"><h3>${title}</h3><p>${text}</p><div class="empty-act">${show?btn:''}${extra}</div></div>`;
}
function loadingOr(col, html){ return (!got[col] && db) ? `<div class="panel empty"><p>Wczytywanie danych…</p></div>` : html; }

/* ---------- events ---------- */
document.addEventListener('click', e => {
  const t = e.target.closest('[data-new],[data-edit],[data-go],[data-dlf],[data-renew],[data-action],[data-card],[data-back],[data-cal],[data-noop],[data-isf],[data-issue-st],[data-ho],[data-transfer],[data-take],[data-rep],[data-card-go]');
  if (!t || t.closest('#dialog')) return;
  if (e.target.closest('.thumbs a, a.btn, a.maplink')) return;
  if (t.dataset.noop) return;
  if (t.dataset.renew){ e.stopPropagation(); renew(t.dataset.renew); return; }
  if (t.dataset.issueSt) return setIssueStatus(t.dataset.id, t.dataset.issueSt);
  if (t.dataset.ho){ e.stopPropagation(); return openHandover(t.dataset.id, t.dataset.ho); }
  if (t.dataset.transfer){ e.stopPropagation(); return openTransfer(t.dataset.transfer); }
  if (t.dataset.take) return openHandover(null, 'pickup', t.dataset.take);
  if (t.dataset.new) return openForm(t.dataset.new, null, t.dataset.veh ? {vehicleId: t.dataset.veh} : undefined);
  if (t.dataset.card){ cardId = t.dataset.card; cardTab = 'dane'; render(); window.scrollTo(0,0); return; }
  if (t.dataset.back){ cardId = null; render(); return; }
  if (t.dataset.cal){ calStart = t.dataset.cal==='0' ? mondayOf(today()) : addDays(calStart, Number(t.dataset.cal)); render(); return; }
  if (t.dataset.isf){ issueFilter = t.dataset.isf; render(); return; }
  if (t.dataset.rep){ repMode = t.dataset.rep; render(); return; }
  if (t.dataset.cardGo){ if (typeof cardTab!=='undefined') cardTab = t.dataset.ctabGo || 'dane'; if (location.hash==='#pojazdy'){ tab='pojazdy'; cardId=t.dataset.cardGo; render(); window.scrollTo(0,0); } else { pendingCard = t.dataset.cardGo; location.hash = 'pojazdy'; } return; }
  if (t.dataset.action==='export-xlsx') return exportXlsx();
  if (t.dataset.action==='save-budget') return saveBudget();
  if (t.dataset.action==='open-import') return openImport();
  if (t.dataset.edit) return openForm(t.dataset.edit, t.dataset.id);
  if (t.dataset.go){ cardId = null; if (t.dataset.dl) dlFilter=t.dataset.dl; if (t.dataset.go==='koszty') costMonth=today().slice(0,7); location.hash = t.dataset.go; render(); return; }
  if (t.dataset.dlf){ dlFilter = t.dataset.dlf; render(); return; }
});
document.addEventListener('keydown', e => {
  if ((e.key==='Enter'||e.key===' ') && e.target.matches('.dl-row,.is-row,tr[data-card],.fl-row')){ e.preventDefault(); e.target.click(); }
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

/* Telefon: aktywna zakładka w przewijanym pasku zakładek zawsze widoczna */
let actsOpen = false;
/* „Więcej” – rzadziej używane przyciski paska narzędzi w rozwijanym menu (pusta lista = brak przycisku) */
const moreMenu = html => html ? `<button class="acts-toggle" data-action="acts-toggle" aria-expanded="${actsOpen}">${ic('cog')}Więcej</button><span class="acts-sec">${html}</span>` : '';
const barOpen = () => actsOpen ? 'acts-open' : '';
function centerTabs(){
  document.querySelectorAll('.subtabs, .inner-tabs').forEach(n => { const a = n.querySelector('[aria-current="page"]');
    if (!a || n.scrollWidth <= n.clientWidth) return;
    const nr = n.getBoundingClientRect(), ar = a.getBoundingClientRect();
    n.scrollLeft += (ar.left - nr.left) - (nr.width - ar.width) / 2; });
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="acts-toggle"]')){ e.preventDefault(); e.stopPropagation(); actsOpen = !actsOpen; render(); } }, true);
document.addEventListener('click', e => { if (!actsOpen || e.target.closest('[data-action="acts-toggle"]')) return; const inside = e.target.closest('.acts-sec'); actsOpen = false; if (!inside) render(); else document.querySelector('.bar.acts-open')?.classList.remove('acts-open'); });

/* Telefon: przycisk „+” – najczęstsze wpisy jednym dotknięciem z każdego ekranu (kierownik floty i serwisu) */
function fabItems(){
  const it = [];
  if (canCreate('costs') && P().manage) it.push(['fuel', 'Koszt / tankowanie', () => openForm('costs')]);
  if (canCreate('issues')) it.push(['alert', 'Zgłoś usterkę', () => openForm('issues')]);
  if (canCreate('bookings') && P().manage) it.push(['cal', 'Przydział w grafiku', () => openForm('bookings')]);
  if (canCreate('deadlines')) it.push(['clip', 'Termin', () => openForm('deadlines')]);
  if (canCreate('serviceEntries') && P().service) it.push(['wrench', 'Wpis serwisowy', () => openForm('serviceEntries')]);
  return it;
}
function syncFab(){
  const w = document.getElementById('fab'); if (!w) return;
  const show = !!me && !P().mycar && fabItems().length > 0 && !['ustawienia', 'historia'].includes(tab);
  w.hidden = !show; if (!show) fabClose();
}
function fabClose(){ const m = document.getElementById('fab-menu'); if (m) m.hidden = true; document.querySelector('.fab')?.setAttribute('aria-expanded', 'false'); }
document.addEventListener('click', e => {
  const f = e.target.closest('[data-action="fab"]');
  const m = document.getElementById('fab-menu');
  if (f){ e.preventDefault(); e.stopPropagation(); if (!m.hidden) return fabClose();
    const items = fabItems(); m.innerHTML = items.map(([icn, l], k) => `<button type="button" data-fab-i="${k}">${ic(icn)}${l}</button>`).join('');
    m.hidden = false; f.setAttribute('aria-expanded', 'true'); return; }
  const b = e.target.closest('[data-fab-i]');
  if (b){ e.preventDefault(); e.stopPropagation(); const x = fabItems()[Number(b.dataset.fabI)]; fabClose(); if (x) x[2](); return; }
  if (m && !m.hidden && !e.target.closest('#fab')) fabClose();
}, true);
