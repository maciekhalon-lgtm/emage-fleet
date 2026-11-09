/* Emage FLEET — kierowca: ekran startowy, wybór auta, moje dane i statystyki */
'use strict';
const myActive = () => S.bookings.find(b => holds(b) && crewOf(b).includes(myDriverId()));
const partnerOf = b => crewOf(b).find(d => d!==myDriverId());
const meDriver = () => byId('drivers', myDriverId());
/* Auto przydzielone przez kierownika: rezerwacja na dziś bez przejęcia albo auto stałe */
function myAssigned(){
  const t = today();
  const b = S.bookings.filter(x => x.driverId===myDriverId() && !x.pickup && !x.returned && x.from<=t && x.to>=t).sort((a,c) => a.from<c.from?-1:1)[0];
  if (b) return {booking:b, vehicle: byId('vehicles', b.vehicleId)};
  const mineV = S.vehicles.filter(x => respOf(x).includes(myDriverId()) && x.status!=='wycofany');
  const v = mineV.find(x => { const st = takeState(x); return st && st.ok; }) || mineV[0];
  return v ? {booking:null, vehicle:v} : null;
}
/* Czy auto można dziś przejąć: aktywne, sprawne, nikt go nie ma i nikt inny go dziś nie zarezerwował */
function takeState(v){
  const t = today();
  if (v.status==='wycofany') return null;
  if (v.status==='serwis') return {ok:false, why:'w serwisie'};
  if (stopIssue(v.id)) return {ok:false, why:'niesprawne – usterka'};
  const bl = vehicleBlock(v); if (bl && !bl.override) return {ok:false, why:'zablokowane – ' + bl.reason.toLowerCase()};
  const out = S.bookings.find(b => b.vehicleId===v.id && holds(b));
  if (out) return {ok:false, why: crewOf(out).includes(myDriverId()) ? 'masz je teraz' : out.returned ? 'zdawanie – czeka na potwierdzenie' : 'w użyciu – '+crewName(out)};
  const res = S.bookings.find(b => b.vehicleId===v.id && !b.pickup && !b.returned && b.from<=t && b.to>=t && b.driverId!==myDriverId());
  if (res) return {ok:false, why:'zarezerwowane dziś dla: '+dName(res.driverId)};
  return {ok:true};
}
let driverMore = false;
const big = (attrs, label, sub, cls = '', icon = '') => `<button class="big ${cls}" ${attrs}>${icon ? ic(icon) : ''}<b>${label}</b><span>${sub}</span></button>`;
const subBack = () => P().mycar ? '' : backBtn();
const backBtn = () => `<div class="bar"><a class="btn ghost" href="#moje">${ic('back')}Wróć</a></div>`;

/* Ostrzeżenie o kończącej się ważności prawa jazdy lub badań (30 dni) */
function myExpiryNotes(){
  const d = meDriver(); if (!d) return '';
  return [['licenseExpiry','Prawo jazdy'],['medicalExpiry','Badania lekarskie'],['psychExpiry','Badania psychologiczne']].map(([k, l]) => {
    if (!d[k]) return '';
    const x = diffDays(today(), d[k]);
    if (x < 0) return `<div class="notice err"><span><b>${l}</b> – ważność minęła ${fdate(d[k])}. Zgłoś to kierownikowi floty.</span></div>`;
    if (x <= 30) return `<div class="notice"><span><b>${l}</b> – ważne do ${fdate(d[k])} (zostało ${x} ${isPlural(x,'dzień','dni','dni')}).</span></div>`;
    return '';
  }).join('');
}

function inactiveNote(){
  return `<div class="panel empty wait"><h2>Konto kierowcy jest nieaktywne</h2><p>Kierownik floty oznaczył Cię jako nieaktywnego kierowcę, więc nie możesz teraz przejmować aut. Jeśli to pomyłka, skontaktuj się z nim.</p></div>`;
}
function notLinked(){
  return `<div class="panel empty wait"><h2>Konto nie jest powiązane z kierowcą</h2><p>Poproś kierownika floty, żeby w panelu Użytkownicy powiązał Twoje konto z Twoim wpisem na liście kierowców. Wtedy będziesz mógł przejmować auta.</p></div>`;
}

/* ---------- ekran startowy ---------- */
const initials = n => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(x => x[0].toUpperCase()).join('') || '?';
/* Dolny pasek kierowcy: Start · Grafik · Historia · Ja */
const DRV_NAV = [['moje','Start','home'],['moj-grafik','Grafik','cal'],['moja-historia','Historia','hist'],['moje-dane','Ja','user']];
function driverBar(){
  if (!P().mycar) return '';
  const cur = tab==='wybierz' ? 'moje' : tab;
  const badge = k => k==='moje' ? myConfirmations().length + S.costs.filter(c => c.flagState==='explain' && (c.driverId===myDriverId() || c.createdBy===myId)).length : 0;
  return `<nav class="d-bar" aria-label="Menu kierowcy">${DRV_NAV.map(([k, l, i]) => `<a href="#${k}" ${cur===k ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span>${badge(k) ? `<em>${badge(k)}</em>` : ''}</a>`).join('')}</nav>`;
}
/* Etapy dnia: przejęcie → w trasie → zdanie */
function dayStepper(stage){
  const st = [['Przejęcie','key'],['W trasie','route'],['Zdanie','check']];
  return `<ol class="d-steps" aria-label="Etap dnia">${st.map(([l], i) => `<li class="${i < stage ? 'done' : i===stage ? 'now' : ''}"><i>${i < stage ? ic('check') : i + 1}</i><span>${l}</span></li>`).join('')}</ol>`;
}
const qa = (attrs, icon, label, sub = '', cls = '') => `<${attrs.startsWith('href') ? 'a' : 'button'} class="d-qa ${cls}" ${attrs}><span class="d-qa-i">${ic(icon)}</span><b>${label}</b>${sub ? `<span>${sub}</span>` : ''}</${attrs.startsWith('href') ? 'a' : 'button'}>`;

/* Karta „Auto”: znane usterki (żeby nie zgłaszać drugi raz) i najbliższe terminy */
function myCarState(v){
  if (!v || !v.id) return '';
  const iss = S.issues.filter(i => i.vehicleId===v.id && i.status!=='naprawione').sort((a, b) => a.date < b.date ? 1 : -1);
  const t = today();
  const dls = (S.deadlines || []).filter(d => d.vehicleId===v.id && DRV_DL.includes(d.type)).map(d => {
    const days = d.date ? diffDays(t, d.date) : null, left = d.kmDue && v.km ? Number(d.kmDue) - Number(v.km) : null;
    const cls = (days!=null && days < 0) || (left!=null && left <= 0) ? 'bad' : (days!=null && days <= 14) || (left!=null && left <= 1500) ? 'warn' : 'ok';
    const txt = [d.date ? fdate(d.date) : '', left!=null ? (left <= 0 ? `przekroczony o ${km(-left)}` : `za ${km(left)}`) : ''].filter(Boolean).join(' · ');
    return {d, cls, txt, k: Math.min(days==null ? 999 : days, left==null ? 999 : left / 100)};
  }).sort((a, b) => a.k - b.k).slice(0, 4);
  const sev = {stop:'bad', istotna:'warn'};
  return `<section class="panel d-card"><div class="sec-head"><h3>Auto ${esc(v.plate || '')}</h3><span class="muted small">${km(lastKm(v.id))}</span></div>
    <div class="d-sub">Zgłoszone usterki${iss.length ? ` <span class="count">${iss.length}</span>` : ''}</div>
    ${iss.length ? `<ul class="d-rows">${iss.slice(0, 4).map(i => `<li><span class="dot ${sev[i.severity] || ''}"></span><span><b>${esc(i.title || 'Usterka')}</b><span class="sub">${fdate(i.date)} · ${(ISSUE_ST[i.status] || ISSUE_ST.nowe).l.toLowerCase()}</span></span></li>`).join('')}</ul><p class="d-hint">Te usterki są już zgłoszone – nie musisz ich zgłaszać drugi raz.</p>`
      : `<p class="d-hint ok">${ic('check')}Brak zgłoszonych usterek.</p>`}
    ${dls.length ? `<div class="d-sub">Terminy</div><ul class="d-rows">${dls.map(x => `<li><span class="dot ${x.cls}"></span><span><b>${esc(x.d.type)}</b><span class="sub">${esc(x.txt)}</span></span></li>`).join('')}</ul>` : ''}
  </section>`;
}
/* Mój miesiąc: dni w trasie, przejechane km, tankowania */
function myMonth(ym){
  const me_ = myDriverId(), [y, m] = ym.split('-').map(Number);
  const A = ym + '-01', B = ym + '-' + pad(new Date(y, m, 0).getDate());
  const days = new Set(); let dist = 0;
  const trips = S.bookings.filter(b => crewOf(b).includes(me_) && b.from <= B && b.to >= A);
  trips.forEach(b => { if (!b.pickup) return; for (let x = b.from > A ? b.from : A; x <= (b.to < B ? b.to : B) && x <= today(); x = addDays(x, 1)) days.add(x);
    if (b.returned && b.returned.km > b.pickup.km) dist += b.returned.km - b.pickup.km; });
  const fuel = S.costs.filter(c => isFuel(c) && (c.driverId===me_ || c.createdBy===myId) && c.date >= A && c.date <= B);
  return {A, B, days: days.size, dist, trips: trips.filter(b => b.pickup).sort((a, b) => a.from < b.from ? 1 : -1), fuel: fuel.sort((a, b) => a.date < b.date ? 1 : -1),
    liters: fuel.reduce((s, c) => s + Number(c.liters || 0), 0), amount: fuel.reduce((s, c) => s + Number(c.amount || 0), 0)};
}
const nf = n => new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(n || 0);
function monthTiles(s){
  return `<div class="d-tiles"><div><b>${s.days}</b><span>${isPlural(s.days,'dzień','dni','dni')} w trasie</span></div><div><b>${nf(s.dist)}</b><span>km przejechane</span></div><div><b>${s.fuel.length}</b><span>${isPlural(s.fuel.length,'tankowanie','tankowania','tankowań')}</span></div></div>`;
}

function viewMyCar(){
  if (!myDriverId()) return notLinked();
  const active = myActive(), t = today();
  const first = esc((me.full_name || '').split(' ')[0] || 'kierowco');
  const hello = `<header class="d-hello"><div><span class="d-date">${esc(new Date().toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'}))}</span><h2>Cześć, ${first}</h2></div>
    <a class="d-me" href="#moje-dane" aria-label="Moje dane">${esc(initials(me.full_name))}</a></header>`;
  const todayB = S.bookings.find(b => crewOf(b).includes(myDriverId()) && b.from<=t && b.to>=t && !b.returned);
  let hero, quick = '', car = null;
  if (active && active.returned){
    const v = car = byId('vehicles', active.vehicleId) || {};
    hero = `<section class="d-hero"><div class="d-hero-top"><span class="d-state-chip warn">Zdawanie</span></div>
      <div class="d-car">${plate(v.plate)}<span>${esc(v.make||'')} ${esc(v.model||'')}</span></div>
      ${dayStepper(2)}
      <div class="d-state warn">${ic('clip')}<span>Zdane ${fdate(active.returned.at)} przy ${km(active.returned.km)} – ${active.returned.by===myId ? `czeka na potwierdzenie: <b>${esc(dName(partnerOf(active)))}</b>` : 'potwierdź zdanie powyżej'}</span></div></section>`;
  } else if (active){
    const v = car = byId('vehicles', active.vehicleId) || {};
    const since = v.km && active.pickup.km ? v.km - active.pickup.km : 0;
    const rt = active.routeId ? routeById(active.routeId) : null;
    const dd = active.pickup.at ? diffDays(String(active.pickup.at).slice(0, 10), t) : 0;
    hero = `<section class="d-hero on">
      <div class="d-hero-top"><span class="d-state-chip ok">W trasie</span><span class="d-since">od ${active.pickup.at ? (dd===0 ? 'dziś' : dd===1 ? 'wczoraj' : fdate(String(active.pickup.at).slice(0, 10))) : '—'}</span></div>
      <div class="d-car">${plate(v.plate)}<span>${esc(v.make||'')} ${esc(v.model||'')}${v.hasTacho ? ' · tachograf' : ''}</span></div>
      ${dayStepper(1)}
      <div class="d-meta">
        <button class="d-route" data-action="more" aria-expanded="${driverMore}">${ic('route')}<span>${rt ? `<b>${esc(rt.code)}</b> ${esc(rt.name)}` : 'Bez trasy'}</span><em>${S.routes.length ? 'zmień' : ''}</em></button>
        <span class="d-km">${ic('truck')}${km(active.pickup.km)}${since > 0 ? ` <em>+${nf(since)}</em>` : ''}</span>
      </div>
      ${driverMore && S.routes.length ? `<div class="route-pick">${routeSelect('my-route', active.routeId, `data-route-for="${esc(active.id)}"`)}</div>` : ''}
      ${active.coDriverId ? `<div class="d-note">${ic('users')}<span>Jedziesz z: <b>${esc(dName(partnerOf(active)))}</b>${!active.pickupConfirmedAt ? ' · przejęcie czeka na potwierdzenie' : ''}</span></div>` : ''}
      ${active.purpose ? `<div class="d-note">${ic('clip')}<span>${esc(active.purpose)}</span></div>` : ''}
      ${myDueNote(v)}
      <button class="d-main" data-ho="return" data-id="${esc(active.id)}">${ic('key')}Zdaj auto</button>
    </section>`;
    const hasDocs = (S.docs || []).some(d => d.vehicleId===v.id);
    quick = [qa(`data-fuel="${esc(v.id)}"`, 'fuel', 'Zatankuj', 'paragon i licznik', 'hot'),
      qa(`data-new="issues" data-veh="${esc(v.id)}"`, 'wrench', 'Usterka', 'coś nie działa'),
      qa(`data-accident="${esc(v.id)}"`, 'alert', 'Szkoda', 'kolizja, zdjęcia', 'bad'),
      loadingRoutesOk() ? qa('data-action="loading"', 'box', 'Załadunek', loadingCount() ? `zaznaczone: ${loadingCount()}` : 'czyj towar wiozę') : '',
      hasDocs ? qa(`data-mydocs="${esc(v.id)}"`, 'clip', 'Dokumenty', 'dowód, polisa') : '',
      v.assistancePhone ? qa(`href="tel:${esc(String(v.assistancePhone).replace(/\s/g, ''))}"`, 'phone', 'Assistance', esc(v.assistancePhone)) : ''].filter(Boolean).join('');
  } else if (meDriver() && meDriver().active===false){
    hero = inactiveNote();
  } else {
    const asg = myAssigned();
    const asgOk = asg && asg.vehicle && takeState(asg.vehicle) && takeState(asg.vehicle).ok;
    const v = asgOk ? asg.vehicle : null, b = asgOk ? asg.booking : null;
    if (v) car = v;
    const rt = b && b.routeId ? routeById(b.routeId) : (todayB && todayB.routeId ? routeById(todayB.routeId) : null);
    hero = v ? `<section class="d-hero">
      <div class="d-hero-top"><span class="d-state-chip">${b ? 'Dziś jedziesz' : 'Twój bus'}</span></div>
      <div class="d-car">${plate(v.plate)}<span>${esc(v.make)} ${esc(v.model)}${v.hasTacho ? ' · tachograf' : ''} · ${km(lastKm(v.id))}</span></div>
      ${dayStepper(0)}
      ${rt ? `<div class="d-note">${ic('route')}<span><b>${esc(rt.code)}</b> ${esc(rt.name)}</span></div>` : ''}
      ${b && b.purpose ? `<div class="d-note">${ic('clip')}<span>${esc(b.purpose)}</span></div>` : ''}
      <button class="d-main" ${b ? `data-ho="pickup" data-id="${esc(b.id)}"` : `data-take="${esc(v.id)}"`}>${ic('key')}Przyjmij auto</button>
      <p class="d-hero-hint">Sprawdzisz checklistę, wpiszesz licznik i paliwo.</p></section>`
      : `<section class="d-hero empty"><div class="d-hero-top"><span class="d-state-chip">Dziś</span></div><h3>Nie masz przydzielonego auta</h3>
      <p class="muted">Wybierz wolne auto z listy – zobaczysz, które są sprawne i nikt ich nie ma.</p>
      <a class="d-main" href="#wybierz">${ic('key')}Wybierz auto</a></section>`;
    quick = [v ? qa('href="#wybierz"', 'truck', 'Inne auto', 'wolne auta') : '',
      loadingRoutesOk() ? qa('data-action="loading"', 'box', 'Załadunek', loadingCount() ? `zaznaczone: ${loadingCount()}` : 'czyj towar wiozę') : '',
      P().mycar ? '' : qa('href="#moj-grafik"', 'cal', 'Grafik', 'kiedy jadę'),
      P().mycar ? '' : qa('href="#moja-historia"', 'hist', 'Historia', 'tankowania, trasy')].filter(Boolean);
    quick = quick.length > 1 ? quick : [];
    quick = quick.join('');
  }
  const inbox = [typeof myAnnouncements==='function' ? myAnnouncements() : '', myExpiryNotes(), offlineNote(), toConfirmPanel(), myExplainPanel()].join('');
  const next = myNextDays(3);
  const ms = myMonth(t.slice(0, 7));
  return `<div class="section driver d-home">${hello}
    ${inbox ? `<div class="d-inbox">${inbox}</div>` : ''}
    ${hero}
    ${quick ? `<div class="d-quick n${(quick.match(/class="d-qa /g) || []).length}">${quick}</div>` : ''}
    ${typeof myStopsPanel==='function' ? myStopsPanel(active && !active.returned ? active.routeId : (todayB && todayB.routeId) || null) : ''}
    ${car && active && !active.returned ? myCarState(car) : ''}
    <section class="panel d-card"><div class="sec-head"><h3>Najbliższe dni</h3><a class="small ghost btn" href="#moj-grafik">Cały grafik</a></div>${next}</section>
    <section class="panel d-card"><div class="sec-head"><h3>${esc(MONTHS_FULL[Number(t.slice(5, 7)) - 1])} u Ciebie</h3><a class="small ghost btn" href="#moja-historia">Historia</a></div>${monthTiles(ms)}</section>
    ${typeof installHint==='function' ? installHint() : ''}
    ${driverBar()}
  </div>`;
}

/* ---------- grafik kierowcy ---------- */
function dayRows(list){
  const me_ = myDriverId(), t = today();
  /* kolejne wolne dni łączymy w jeden wiersz */
  const runs = []; list.forEach(x => { const last = runs[runs.length - 1];
    if (!x.bs.length && last && last.free) last.to = x.d; else runs.push(x.bs.length ? x : {d: x.d, to: x.d, bs: [], free: true}); });
  const dl = d => { const dt = parse(d); return `${DOW[(dt.getDay()+6)%7]} ${dt.getDate()}.${pad(dt.getMonth()+1)}`; };
  return runs.map(({d, bs, to, free}) => {
    if (free) return `<div class="d-sched free"><span class="d-day free"><b>wolne</b></span><span class="muted">${d===to ? dl(d) : `${dl(d)} – ${dl(to)}`}</span></div>`;
    const dt = parse(d), lab = d===t ? 'Dziś' : diffDays(t, d)===1 ? 'Jutro' : DOW[(dt.getDay()+6)%7];
    const head = `<span class="d-day ${d===t ? 'today' : ''} ${bs.length ? '' : 'free'}"><b>${lab}</b><em>${dt.getDate()}.${pad(dt.getMonth()+1)}</em></span>`;
    return bs.map((b, i) => {
      const v = byId('vehicles', b.vehicleId), partner = crewOf(b).find(x => x!==me_);
      const loaders = b.routeId && typeof routeLoaders==='function' ? routeLoaders(b.routeId, d).filter(x => x.id!==me_) : [];
      const n = b.routeId && typeof stopsOf==='function' ? stopsOf(b.routeId).length : 0;
      return `<div class="d-sched ${d===t ? 'today' : ''}">${i ? '<span></span>' : head}<div class="d-sched-m">
        <b>${b.routeId ? esc(rLabel(b.routeId)) : 'bez trasy'}</b>
        <span class="sub">${v ? esc(v.plate) : ''}${partner ? ' · z: ' + esc(dName(partner)) : ''}${n ? ` · ${n} ${isPlural(n,'przystanek','przystanki','przystanków')}` : ''}</span>
        ${b.purpose ? `<span class="ms-note">${esc(b.purpose)}</span>` : ''}
        ${loaders.length ? `<span class="ms-load">${ic('box')}Twój towar wiezie:</span>${loaders.map(x => personRow(x)).join('')}` : ''}
      </div></div>`; }).join('');
  }).join('');
}
function myDays(n, from = today()){
  const me_ = myDriverId();
  return Array.from({length: n}, (_, i) => addDays(from, i)).map(d => ({d, bs: S.bookings.filter(b => crewOf(b).includes(me_) && b.from<=d && b.to>=d)}));
}
function myNextDays(k){
  const work = myDays(14, addDays(today(), 1)).filter(x => x.bs.length).slice(0, k);
  return work.length ? `<div class="d-scheds">${dayRows(work)}</div>` : '<p class="muted sec-empty">W najbliższych dwóch tygodniach nie masz nic w grafiku.</p>';
}
function viewMySchedule(){
  if (!myDriverId()) return notLinked();
  const all = myDays(14), w = all.filter(x => x.bs.length).length;
  const strip = `<div class="d-strip">${all.slice(0, 14).map(({d, bs}) => { const dt = parse(d); return `<span class="${bs.length ? 'on' : ''} ${d===today() ? 'today' : ''}" title="${bs.length ? 'jedziesz' : 'wolne'}"><em>${DOW[(dt.getDay()+6)%7]}</em><b>${dt.getDate()}</b></span>`; }).join('')}</div>`;
  return `<div class="section driver">${subBack()}
    <header class="d-pagehead"><h2>Mój grafik</h2><p class="muted">${w ? `W najbliższych 2 tygodniach jedziesz ${w} ${isPlural(w,'dzień','dni','dni')}.` : 'W najbliższych 2 tygodniach nie masz nic w grafiku.'}</p></header>
    <section class="panel d-card">${strip}</section>
    <section class="panel d-card"><div class="sec-head"><h3>Dzień po dniu</h3><span class="muted small">${fdate(all[0].d).slice(0, 5)} – ${fdate(all[all.length-1].d).slice(0, 5)}</span></div><div class="d-scheds">${dayRows(all)}</div></section>
    ${driverBar()}</div>`;
}

/* ---------- historia kierowcy: przejazdy, tankowania, usterki w miesiącu ---------- */
let myHistMonth = today().slice(0, 7);
function viewMyHistory(){
  if (!myDriverId()) return notLinked();
  const s = myMonth(myHistMonth), [y, m] = myHistMonth.split('-').map(Number);
  const canNext = myHistMonth < today().slice(0, 7);
  const trips = s.trips.map(b => { const v = byId('vehicles', b.vehicleId) || {}, d = b.returned && b.pickup ? b.returned.km - b.pickup.km : null;
    return `<li class="d-trip"><span class="d-li-d"><b>${fdate(b.from).slice(0, 5)}</b>${b.to!==b.from ? `<em>do ${fdate(b.to).slice(0, 5)}</em>` : ''}</span><span><b>${esc(v.plate || '')}</b>${b.routeId ? ` · ${esc(rLabel(b.routeId))}` : ''}<span class="sub">${b.returned ? 'zdane' : 'w trasie'}${b.coDriverId ? ' · z: ' + esc(dName(partnerOf(b))) : ''}</span></span><b class="num">${d!=null && d >= 0 ? nf(d) + ' km' : '—'}</b></li>`; }).join('');
  const fuel = s.fuel.map(c => `<div class="d-li ${canEditDoc('costs',c)?'click':''}" ${canEditDoc('costs',c)?'data-edit="costs"':''} data-id="${esc(c.id)}"><span class="d-li-d num"><b>${fdate(c.date).slice(0,5)}</b><em>${esc((byId('vehicles', c.vehicleId)||{}).plate||'')}</em></span><span class="d-li-m">${String(c.liters||'').replace('.',',')} ${c.category==='Ładowanie'?'kWh':'l'} · ${km(c.odometer)}${c.station ? `<em>${esc(c.station)}</em>` : ''}</span><b class="num">${zl2(c.amount)}</b></div>`).join('');
  const iss = S.issues.filter(i => i.createdBy===myId && i.date >= s.A && i.date <= s.B).sort((a, b) => a.date < b.date ? 1 : -1);
  return `<div class="section driver">${subBack()}
    <header class="d-pagehead"><h2>Historia</h2>
      <div class="d-month"><button class="ghost icon" data-drv-month="-1" aria-label="Poprzedni miesiąc">${ic('back')}</button><b>${esc(MONTHS_FULL[m-1])} ${y}</b><button class="ghost icon" data-drv-month="1" aria-label="Następny miesiąc" ${canNext ? '' : 'disabled'}>${ic('chev')}</button></div></header>
    <section class="panel d-card">${monthTiles(s)}${s.fuel.length ? `<p class="d-hint">Zatankowane: <b>${nf(s.liters)} l</b> za <b>${zl2(s.amount)}</b></p>` : ''}</section>
    <section class="panel d-card"><div class="sec-head"><h3>Przejazdy</h3><span class="count">${s.trips.length}</span></div>${trips ? `<ul class="d-trips">${trips}</ul>` : '<p class="muted sec-empty">W tym miesiącu nie przejmowałeś auta.</p>'}</section>
    <section class="panel d-card"><div class="sec-head"><h3>Tankowania</h3><span class="count">${s.fuel.length}</span></div>${fuel ? `<div class="d-list">${fuel}</div>` : '<p class="muted sec-empty">Brak tankowań w tym miesiącu. Dodasz je przyciskiem „Zatankuj” na ekranie Start.</p>'}</section>
    <section class="panel d-card"><div class="sec-head"><h3>Moje zgłoszenia usterek</h3><span class="count">${iss.length}</span></div>${iss.length ? `<ul class="d-rows">${iss.map(i => `<li ${canEditDoc('issues', i) ? `class="click" data-edit="issues" data-id="${esc(i.id)}"` : ''}><span class="dot ${i.status==='naprawione' ? 'ok' : i.severity==='stop' ? 'bad' : i.severity==='istotna' ? 'warn' : ''}"></span><span><b>${esc(i.title || 'Usterka')}</b><span class="sub">${fdate(i.date)} · ${esc((byId('vehicles', i.vehicleId) || {}).plate || '')}${i.severity==='stop' ? ' · auto niesprawne' : ''}</span></span><span class="pill ${(ISSUE_ST[i.status] || ISSUE_ST.nowe).cls}">${(ISSUE_ST[i.status] || ISSUE_ST.nowe).l}</span></li>`).join('')}</ul>` : '<p class="muted sec-empty">W tym miesiącu nic nie zgłaszałeś.</p>'}</section>
    ${driverBar()}</div>`;
}
document.addEventListener('click', e => {
  const b = e.target.closest('[data-drv-month]'); if (!b) return;
  const [y, m] = myHistMonth.split('-').map(Number), d = new Date(y, m - 1 + Number(b.dataset.drvMonth), 1);
  const nx = d.getFullYear() + '-' + pad(d.getMonth() + 1); if (nx > today().slice(0, 7)) return;
  myHistMonth = nx; render();
});
const loadingRoutesOk = () => !!(modOn('zaladunek') && myDriverId() && typeof loadRoutes==='function' && loadRoutes().length);
const loadingCount = () => typeof workDay==='function' ? S.loadings.filter(l => l.driverId===myDriverId() && l.forDate===workDay()).length : 0;

/* ---------- wybór auta ---------- */
function viewPickCar(){
  if (!myDriverId()) return notLinked();
  if (myActive()){ setTimeout(() => { location.hash = 'moje'; }, 0); return ''; }
  if (meDriver() && meDriver().active===false) return `<div class="section driver">${backBtn()}${inactiveNote()}</div>`;
  const asg = myAssigned();
  const asgOk = asg && asg.vehicle && takeState(asg.vehicle) && takeState(asg.vehicle).ok;
  const asgHtml = asgOk ? `<div class="panel mycar assigned">
      <span class="label">${asg.booking ? 'Kierownik przydzielił Ci na dziś' : 'Twój bus – jesteś za niego odpowiedzialny'}</span>
      <div class="mycar-head">${plate(asg.vehicle.plate)}<div><h2>${esc(asg.vehicle.make)} ${esc(asg.vehicle.model)}${asg.vehicle.hasTacho ? ' <span class="pill off">tachograf</span>' : ''}</h2><span class="muted">Ostatni stan licznika: ${km(lastKm(asg.vehicle.id))}${asg.booking && asg.booking.routeId ? ' · trasa '+esc(rLabel(asg.booking.routeId)) : ''}${asg.booking && asg.booking.purpose ? ' · '+esc(asg.booking.purpose) : ''}</span></div></div>
      <div class="big-grid">${asg.booking ? big(`data-ho="pickup" data-id="${esc(asg.booking.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary wide', 'key') : big(`data-take="${esc(asg.vehicle.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary wide', 'key')}</div>
    </div>` : '';
  const list = S.vehicles.filter(v => !asgOk || v.id!==asg.vehicle.id)
    .map(v => ({v, st: takeState(v)})).filter(x => x.st)
    .sort((a, b) => (b.st.ok - a.st.ok) || (respOf(b.v).includes(myDriverId()) - respOf(a.v).includes(myDriverId())) || String(a.v.plate).localeCompare(b.v.plate));
  const rows = list.map(({v, st}) => `<div class="pick ${st.ok?'':'off'}">
      <div class="pick-car">${plate(v.plate)}<div><b>${esc(v.make)} ${esc(v.model)}${respOf(v).includes(myDriverId()) ? ' <span class="pill soon">Twój bus</span>' : ''}</b><span class="sub">${esc(v.fuel||'')} · ${km(lastKm(v.id))}${v.hasTacho ? ' · tachograf' : ''}</span></div></div>
      ${st.ok ? `<button class="primary" data-take="${esc(v.id)}">Wybierz</button>` : `<span class="muted small">${esc(st.why)}</span>`}</div>`).join('');
  return `<div class="section driver">${backBtn()}
    <header class="d-pagehead"><h2>Wybierz auto</h2><p class="muted">Najpierw wolne i sprawne auta. Szare są zajęte albo niesprawne – obok widać dlaczego.</p></header>
    ${asgHtml}
    <div class="panel"><div class="sec-head"><h3>${asgHtml ? 'Albo wybierz inne wolne auto' : 'Wolne auta'}</h3><span class="muted small">${list.filter(x => x.st.ok).length} wolnych</span></div>
      ${rows ? `<div class="picks">${rows}</div>` : '<p class="muted sec-empty">Brak aut w ewidencji.</p>'}</div>
    ${driverBar()}</div>`;
}

/* ---------- „Ja”: moje dane, ważność dokumentów, telefon, ustawienia aplikacji ---------- */
function viewMyData(){
  if (!myDriverId()) return notLinked();
  const me_ = myDriverId(), d = meDriver() || {};
  const pend = S.requests.find(r => r.driverId===me_ && r.status==='pending' && r.field==='phone');
  const lastDecided = S.requests.filter(r => r.driverId===me_ && r.status!=='pending').sort((a, b) => (a.decidedAt||'') < (b.decidedAt||'') ? 1 : -1)[0];
  const doc = (k, l) => {
    if (!d[k]) return `<li><span class="dot"></span><span><b>${l}</b><span class="sub">brak daty – poproś kierownika o wpisanie</span></span></li>`;
    const x = diffDays(today(), d[k]), cls = x < 0 ? 'bad' : x <= 30 ? 'warn' : 'ok';
    return `<li><span class="dot ${cls}"></span><span><b>${l}</b><span class="sub">ważne do ${fdate(d[k])}</span></span><span class="pill ${cls==='ok' ? 'ok' : cls}">${x < 0 ? 'nieważne' : x <= 30 ? `${x} ${isPlural(x,'dzień','dni','dni')}` : 'ważne'}</span></li>`;
  };
  const vs = S.vehicles.filter(v => respOf(v).includes(me_) && v.status!=='wycofany');
  return `<div class="section driver">${subBack()}
    <section class="d-profile"><span class="d-avatar">${esc(initials(d.name || me.full_name))}</span><div><h2>${esc(d.name || me.full_name || '—')}</h2><span class="muted">${esc(me.email || '')}</span>
      ${d.categories ? `<span class="d-cats">${String(d.categories).split(/[,\s]+/).filter(Boolean).map(c => `<span>${esc(c)}</span>`).join('')}</span>` : ''}</div></section>
    <section class="panel d-card"><div class="sec-head"><h3>Moje dokumenty</h3></div>
      <ul class="d-rows">${doc('licenseExpiry','Prawo jazdy')}${doc('medicalExpiry','Badania lekarskie')}${doc('psychExpiry','Badania psychologiczne')}</ul>
      <p class="d-hint">Daty wpisuje kierownik floty. Przypomnimy Ci 30 dni przed końcem ważności.</p></section>
    ${vs.length ? `<section class="panel d-card"><div class="sec-head"><h3>Odpowiadasz za</h3></div><ul class="d-rows">${vs.map(v => `<li>${plate(v.plate)}<span><b>${esc(v.make||'')} ${esc(v.model||'')}</b><span class="sub">${km(lastKm(v.id))}</span></span></li>`).join('')}</ul></section>` : ''}
    <section class="panel d-card"><div class="sec-head"><h3>Telefon</h3></div><div class="d-phone">
      <b class="num">${esc(d.phone || 'brak numeru')}</b>
      ${P().manage ? `<span class="muted small">Dane kierowcy zmienisz w Pracownicy → Kierowcy.</span>` : pend ? `<span class="pend">Czeka na akceptację kierownika: <b>${esc(pend.newValue)}</b> <button class="small ghost" data-req-cancel="${esc(pend.id)}">Wycofaj</button></span>`
        : `<span class="phone-edit"><input id="new-phone" type="tel" inputmode="tel" placeholder="Nowy numer telefonu" autocomplete="tel"><button class="small" data-action="req-phone">Wyślij do akceptacji</button></span>`}
      ${!pend && lastDecided ? `<span class="muted small">Ostatnia zmiana (${esc(lastDecided.newValue)}): ${lastDecided.status==='approved' ? 'zaakceptowana' : 'odrzucona'}.</span>` : ''}
    </div></section>
    <section class="panel d-card"><div class="sec-head"><h3>Aplikacja</h3></div>
      <div class="d-settings">
        <button class="d-set" data-action="push-open">${ic('bell')}<span><b>Powiadomienia</b><span class="sub">przydział auta, komunikaty, prośby kierownika</span></span>${ic('chev')}</button>
        <div class="d-set">${ic('moon')}<span><b>Wygląd</b><span class="sub">jasny albo ciemny</span></span><span class="theme-sw" role="group" aria-label="Motyw"><button type="button" data-theme-set="light" aria-pressed="${currentTheme()==='light'}">${ic('sun')}Jasny</button><button type="button" data-theme-set="dark" aria-pressed="${currentTheme()==='dark'}">${ic('moon')}Ciemny</button></span></div>
        <button class="d-set" data-action="logout">${ic('out')}<span><b>Wyloguj się</b></span></button>
      </div>
      <p class="d-hint">Pozostałe dane zmienia kierownik floty. Jeśli coś się nie zgadza, daj mu znać.</p></section>
    ${typeof installHint==='function' ? installHint() : ''}
    ${driverBar()}</div>`;
}

async function requestPhone(){
  const v = ($('#new-phone') || {}).value?.trim() || '';
  if (v.replace(/\D/g,'').length < 9) return toast('Wpisz pełny numer telefonu (min. 9 cyfr)');
  try {
    await db.collection('requests').doc().set({driverId: myDriverId(), field:'phone', oldValue: (meDriver()||{}).phone || null, newValue: v, status:'pending'});
    toast('Wysłano do akceptacji kierownika floty');
  } catch(err){ handleWriteErr(err); }
}
async function cancelRequest(id){
  try { await db.collection('requests').doc(id).delete(); toast('Wycofano zmianę'); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  if (e.target.closest('[data-action="req-phone"]')) return requestPhone();
  const c = e.target.closest('[data-req-cancel]'); if (c) cancelRequest(c.dataset.reqCancel);
});

/* ---------- podwójna obsada: sprawy do potwierdzenia przez drugiego kierowcę ---------- */
function myConfirmations(){
  const me_ = myDriverId(), out = [];
  const openDispute = (b, st) => b.disputeStage===st && !b.disputeResolvedAt;
  S.bookings.forEach(b => {
    if (!b.coDriverId || !crewOf(b).includes(me_)) return;
    if (b.coDriverId===me_ && b.pickup && !b.pickupConfirmedAt && !openDispute(b,'pickup')) out.push({kind:'pickup', b});
    if (b.returned && !b.returnConfirmedAt && b.returned.by!==myId && !openDispute(b,'return')) out.push({kind:'return', b});
  });
  S.costs.filter(c => c.coDriverId===me_ && c.confirmStatus==='pending').forEach(c => out.push({kind:'cost', c}));
  return out;
}
let disputeOpen = null;
function toConfirmPanel(){
  const list = myConfirmations(); if (!list.length) return '';
  const item = x => {
    const key = x.kind + ':' + (x.b ? x.b.id : x.c.id);
    let what;
    if (x.kind==='pickup'){ const p = x.b.pickup; what = `<b>Przejęcie auta</b> ${vPlate(x.b.vehicleId)} przez ${esc(dName(x.b.driverId))}<span class="sub">Licznik ${km(p.km)} · paliwo ${fuelLabel(p.fuel)}</span>${checklistSummary(p.checklist)}`; }
    else if (x.kind==='return'){ const r = x.b.returned; what = `<b>Zdanie pojazdu</b> ${vPlate(x.b.vehicleId)}<span class="sub">Licznik ${km(r.km)} · paliwo ${fuelLabel(r.fuel)}${x.b.pickup ? ' · przejechane '+km(r.km - x.b.pickup.km) : ''}</span>${r.note ? `<span class="sub">Uwagi: ${esc(r.note)}</span>` : ''}`; }
    else { const c = x.c; what = `<b>Tankowanie</b> ${vPlate(c.vehicleId)} – wpisał(a) ${esc(dName(c.driverId))}<span class="sub">${fdate(c.date)} · ${String(c.liters).replace('.',',')} ${c.category==='Ładowanie'?'kWh':'l'} · ${zl2(c.amount)} · licznik ${km(c.odometer)}${c.full?' · do pełna':''}</span>`; }
    const acts = disputeOpen===key
      ? `<span class="disp"><input id="disp-note" type="text" placeholder="Co się nie zgadza? np. było 62 l" maxlength="300"><button class="small danger" data-disp-send="${esc(key)}">Wyślij do kierownika</button><button class="small ghost" data-disp-cancel="1">Anuluj</button></span>`
      : `<button class="small primary" data-conf-ok="${esc(key)}">Potwierdzam</button><button class="small" data-conf-no="${esc(key)}">Nie zgadzam się</button>`;
    return `<div class="confirm"><div style="min-width:0">${what}</div><div class="row-act">${acts}</div></div>`;
  };
  return `<div class="panel confirms"><div class="sec-head"><h3>Do potwierdzenia</h3><span class="pill warn">${list.length}</span></div>${list.map(item).join('')}</div>`;
}
async function confirmItem(key, accept, reason){
  const [kind, id] = key.split(':');
  const {error} = kind==='cost'
    ? await sb.rpc('confirm_cost', {cost_id:id, accept, reason: reason || null})
    : await sb.rpc('confirm_booking', {booking_id:id, stage:kind, accept, reason: reason || null});
  if (error) return toast(dbErr(error).message || 'Nie udało się zapisać potwierdzenia');
  disputeOpen = null;
  await refresh(kind==='cost' ? 'costs' : 'bookings');
  if (kind==='cost') await refresh('bookings');
  toast(accept ? 'Potwierdzono' : 'Wysłano do kierownika floty');
}
document.addEventListener('click', e => {
  const ok = e.target.closest('[data-conf-ok]'); if (ok) return confirmItem(ok.dataset.confOk, true);
  const no = e.target.closest('[data-conf-no]'); if (no){ disputeOpen = no.dataset.confNo; render(); setTimeout(() => $('#disp-note')?.focus(), 30); return; }
  const send = e.target.closest('[data-disp-send]'); if (send){ const n = ($('#disp-note')||{}).value?.trim() || ''; if (n.length < 3) return toast('Napisz krótko, co się nie zgadza'); return confirmItem(send.dataset.dispSend, false, n); }
  if (e.target.closest('[data-disp-cancel]')){ disputeOpen = null; render(); }
});

/* Dokumenty auta dla kierowcy (np. przy kontroli drogowej): dowód, polisa, inne skany dodane przez kierownika */
/* Kierowca widzi, gdy zbliża się termin, który dotyczy jazdy (przegląd, OC, olej, opony…): ≤ 14 dni albo ≤ 1500 km */
const DRV_DL = ['Przegląd techniczny','Ubezpieczenie OC','Serwis olejowy','Wymiana rozrządu','Wymiana opon','Legalizacja tachografu'];
function myDueNote(v){
  if (!v || !v.id) return '';
  const t = today();
  const xs = (S.deadlines || []).filter(d => d.vehicleId===v.id && DRV_DL.includes(d.type)).map(d => {
    const days = d.date ? Math.round((parse(d.date) - parse(t)) / 864e5) : null;
    const left = d.kmDue && v.km ? Number(d.kmDue) - Number(v.km) : null;
    const hot = (days != null && days <= 14) || (left != null && left <= 1500);
    const over = (days != null && days < 0) || (left != null && left <= 0);
    const txt = [left != null && left <= 1500 ? (left <= 0 ? `przekroczony o ${km(-left)}` : `za ${km(left)}`) : '', days != null && days <= 14 ? (days < 0 ? `po terminie (${fdate(d.date)})` : days===0 ? 'dziś' : `za ${days} ${isPlural(days,'dzień','dni','dni')}`) : ''].filter(Boolean).join(' / ');
    return {d, hot, over, txt, k: Math.min(days == null ? 999 : days, left == null ? 999 : left / 100)};
  }).filter(x => x.hot).sort((a, b) => a.k - b.k);
  if (!xs.length) return '';
  const x = xs[0], more = xs.length - 1;
  return `<div class="d-note ${x.over ? 'bad' : 'warn'}">${ic('alert')}<span><b>${esc(x.d.type)}</b> ${esc(x.txt)}${more ? ` · i ${more} ${isPlural(more,'inny termin','inne terminy','innych terminów')}` : ''}${x.over ? ' – zgłoś kierownikowi' : ''}</span></div>`;
}

function openMyDocs(vid){
  const v = byId('vehicles', vid) || {}, docs = (S.docs || []).filter(d => d.vehicleId===vid);
  editing = {col:'my-docs', id: vid, base:{}, special: () => closeForm()};
  $('#dlg-title').textContent = `Dokumenty · ${v.plate || ''}`;
  $('#dlg-body').innerHTML = `${v.insurer || v.policyNo ? `<div class="field full"><div class="notice"><span>OC: <b>${esc([v.insurer, v.policyNo].filter(Boolean).join(' · '))}</b>${v.policyUntil ? ` · ważna do ${fdate(v.policyUntil)}` : ''}</span></div></div>` : ''}
    <div class="field full">${docs.map(d => `<div class="mini"><span>${ic('clip')}</span><span><b>${esc(d.name || d.kind || 'Dokument')}</b><span class="sub">${esc(d.kind || '')}${d.validUntil ? ' · ważny do ' + fdate(d.validUntil) : ''}</span></span><span class="mini-r">${d.assetId ? `<a class="btn small" data-file="${esc(d.assetId)}" href="#" target="_blank" rel="noopener">Otwórz</a>` : ''}</span></div>`).join('') || '<span class="muted">Brak dokumentów.</span>'}</div>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  hydrateFiles($('#dlg-body'));
}
document.addEventListener('click', e => { const t = e.target.closest('[data-mydocs]'); if (!t) return; e.preventDefault(); openMyDocs(t.dataset.mydocs); });
