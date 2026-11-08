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
function viewMyCar(){
  if (!myDriverId()) return notLinked();
  const active = myActive(), t = today();
  const first = esc((me.full_name || '').split(' ')[0] || 'kierowco');
  const hello = `<div class="d-hello"><div><span class="d-date">${esc(new Date().toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'}))}</span><h2>Cześć, ${first}</h2></div>
    <a class="d-me" href="#moje-dane" aria-label="Moje dane">${ic('user')}</a></div>`;
  const todayB = S.bookings.find(b => crewOf(b).includes(myDriverId()) && b.from<=t && b.to>=t && !b.returned);
  let hero;
  if (active && active.returned){
    const v = byId('vehicles', active.vehicleId) || {};
    hero = `<div class="d-hero"><div class="d-car">${plate(v.plate)}<span>${esc(v.make||'')} ${esc(v.model||'')}</span></div>
      <div class="d-state warn">${ic('clip')}<span>Zdane ${fdate(active.returned.at)} przy ${km(active.returned.km)} – ${active.returned.by===myId ? `czeka na potwierdzenie: <b>${esc(dName(partnerOf(active)))}</b>` : 'potwierdź zdanie powyżej'}</span></div></div>`;
  } else if (active){
    const v = byId('vehicles', active.vehicleId) || {};
    const since = v.km && active.pickup.km ? v.km - active.pickup.km : 0;
    const rt = active.routeId ? routeById(active.routeId) : null;
    hero = `<div class="d-hero on">
      <div class="d-car">${plate(v.plate)}<span>${esc(v.make||'')} ${esc(v.model||'')}${v.hasTacho ? ' · tachograf' : ''}</span></div>
      <div class="d-meta">
        <button class="d-route" data-action="more" aria-expanded="${driverMore}">${ic('route')}<span>${rt ? `<b>${esc(rt.code)}</b> ${esc(rt.name)}` : 'Bez trasy'}</span><em>${S.routes.length ? 'zmień' : ''}</em></button>
        <span class="d-km">${ic('truck')}${km(active.pickup.km)}${since > 0 ? ` <em>+${new Intl.NumberFormat('pl-PL').format(since)}</em>` : ''}</span>
      </div>
      ${driverMore && S.routes.length ? `<div class="route-pick">${routeSelect('my-route', active.routeId, `data-route-for="${esc(active.id)}"`)}</div>` : ''}
      ${active.coDriverId ? `<div class="d-note">${ic('users')}<span>Z: <b>${esc(dName(partnerOf(active)))}</b>${!active.pickupConfirmedAt ? ' · przejęcie czeka na potwierdzenie' : ''}</span></div>` : ''}
      ${active.purpose ? `<div class="d-note">${ic('clip')}<span>${esc(active.purpose)}</span></div>` : ''}
      ${myDueNote(v)}
      <div class="d-actions">
        <button class="d-act" data-fuel="${esc(v.id)}">${ic('fuel')}<b>Zatankuj</b></button>
        ${loadingRoutesOk() ? `<button class="d-act" data-action="loading">${ic('box')}<b>Załadunek</b>${loadingCount() ? `<em>${loadingCount()}</em>` : ''}</button>` : ''}
        <button class="d-act" data-new="issues" data-veh="${esc(v.id)}">${ic('wrench')}<b>Usterka</b></button>
      </div>
      <button class="d-main" data-ho="return" data-id="${esc(active.id)}">${ic('key')}Zdaj auto</button>
      <div class="d-links"><button class="d-link" data-accident="${esc(v.id)}">${ic('alert')} Kolizja lub szkoda</button>${v.assistancePhone ? `<a class="d-link" href="tel:${esc(String(v.assistancePhone).replace(/\s/g, ''))}">${ic('phone')} Assistance</a>` : ''}${(S.docs || []).some(d => d.vehicleId===v.id) ? `<button class="d-link" data-mydocs="${esc(v.id)}">${ic('clip')} Dokumenty auta</button>` : ''}</div>
    </div>`;
  } else if (meDriver() && meDriver().active===false){
    hero = inactiveNote();
  } else {
    const asg = myAssigned();
    const asgOk = asg && asg.vehicle && takeState(asg.vehicle) && takeState(asg.vehicle).ok;
    const v = asgOk ? asg.vehicle : null, b = asgOk ? asg.booking : null;
    const rt = b && b.routeId ? routeById(b.routeId) : (todayB && todayB.routeId ? routeById(todayB.routeId) : null);
    hero = v ? `<div class="d-hero">
      <span class="d-kicker">${b ? 'Dziś jedziesz' : 'Twój bus'}</span>
      <div class="d-car">${plate(v.plate)}<span>${esc(v.make)} ${esc(v.model)}${v.hasTacho ? ' · tachograf' : ''}</span></div>
      ${rt ? `<div class="d-note">${ic('route')}<span><b>${esc(rt.code)}</b> ${esc(rt.name)}</span></div>` : ''}
      ${b && b.purpose ? `<div class="d-note">${ic('clip')}<span>${esc(b.purpose)}</span></div>` : ''}
      <button class="d-main" ${b ? `data-ho="pickup" data-id="${esc(b.id)}"` : `data-take="${esc(v.id)}"`}>${ic('key')}Przyjmij auto</button>
      <a class="d-link" href="#wybierz">Inne auto</a></div>`
      : `<div class="d-hero empty"><span class="d-kicker">Dziś</span><h3>Nie masz przydzielonego auta</h3>
      <a class="d-main" href="#wybierz">${ic('key')}Wybierz auto</a>
      ${loadingRoutesOk() ? `<button class="d-link" data-action="loading">${ic('box')} Załadunek${loadingCount() ? ` (${loadingCount()})` : ''}</button>` : ''}</div>`;
  }
  return `<div class="section driver">${hello}${typeof myAnnouncements==='function' ? myAnnouncements() : ''}${myExpiryNotes()}
    ${offlineNote()}
    ${toConfirmPanel()}
    ${myExplainPanel()}
    ${hero}
    ${typeof myStopsPanel==='function' ? myStopsPanel(active && !active.returned ? active.routeId : (todayB && todayB.routeId) || null) : ''}
    ${mySchedulePanel()}
    ${typeof installHint==='function' ? installHint() : ''}
  </div>`;
}
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
    <h2>Wybierz auto</h2>
    ${asgHtml}
    <div class="panel"><div class="sec-head"><h3>${asgHtml ? 'Albo wybierz inne wolne auto' : 'Wolne auta'}</h3><span class="muted small">${list.filter(x => x.st.ok).length} wolnych</span></div>
      ${rows ? `<div class="picks">${rows}</div>` : '<p class="muted sec-empty">Brak aut w ewidencji.</p>'}</div>
  </div>`;
}

/* ---------- moje dane: tankowania, usterki, dane osobowe ---------- */
function viewMyData(){
  if (!myDriverId()) return notLinked();
  const me_ = myDriverId(), d = meDriver() || {};
  const [y, m] = costMonth.split('-').map(Number);
  const mA = costMonth+'-01', mB = costMonth+'-'+pad(new Date(y, m, 0).getDate());
  // c) moje tankowania
  const fuel = S.costs.filter(c => isFuel(c) && (c.driverId===me_ || c.createdBy===myId)).sort((a, b) => a.date < b.date ? 1 : -1);
  const fuelM = fuel.filter(c => c.date >= mA && c.date <= mB);
  const fuelC = `<div class="panel"><div class="sec-head"><h3>Moje tankowania</h3><span class="muted small">${MONTHS_FULL[m-1]}: ${fuelM.length} · ${zl2(fuelM.reduce((s, c) => s + Number(c.amount||0), 0))}</span></div>
    ${fuel.length ? `<div class="d-list">${fuel.slice(0,10).map(c => `<div class="d-li ${canEditDoc('costs',c)?'click':''}" ${canEditDoc('costs',c)?'data-edit="costs"':''} data-id="${esc(c.id)}"><span class="d-li-d num"><b>${fdate(c.date).slice(0,5)}</b><em>${esc((byId('vehicles', c.vehicleId)||{}).plate||'')}</em></span><span class="d-li-m">${String(c.liters||'').replace('.',',')} ${c.category==='Ładowanie'?'kWh':'l'} · ${km(c.odometer)}${c.station ? `<em>${esc(c.station)}</em>` : ''}</span><b class="num">${zl2(c.amount)}</b></div>`).join('')}</div>` : '<p class="muted sec-empty">Brak tankowań. Dodasz je przyciskiem „Zatankuj” na ekranie startowym.</p>'}</div>`;

  // d) moje zgłoszenia usterek
  const iss = S.issues.filter(i => i.createdBy===myId).sort((a, b) => a.date < b.date ? 1 : -1);
  const issD = `<div class="panel"><div class="sec-head"><h3>Moje zgłoszenia usterek</h3><span class="muted small">${iss.filter(i => i.status!=='naprawione').length} otwartych</span></div>
    ${iss.length ? `<div class="dl">${iss.slice(0,20).map(i => issueRow(i)).join('')}</div>` : '<p class="muted sec-empty">Nie zgłaszałeś jeszcze usterek.</p>'}</div>`;

  // f) moje dane
  const pend = S.requests.find(r => r.driverId===me_ && r.status==='pending' && r.field==='phone');
  const lastDecided = S.requests.filter(r => r.driverId===me_ && r.status!=='pending').sort((a, b) => (a.decidedAt||'') < (b.decidedAt||'') ? 1 : -1)[0];
  const exp = (k) => { if (!d[k]) return '—'; const x = diffDays(today(), d[k]); return `${fdate(d[k])}${x < 0 ? ' <span class="pill bad">nieważne</span>' : x <= 30 ? ' <span class="pill warn">kończy się</span>' : ''}`; };
  const dataF = `<div class="panel"><div class="sec-head"><h3>Moje dane</h3></div>
    <div class="mydata">
      <div><span class="label">Imię i nazwisko</span><span>${esc(d.name || me.full_name || '—')}</span></div>
      <div><span class="label">E-mail (logowanie)</span><span>${esc(me.email || '—')}</span></div>
      <div><span class="label">Kategorie prawa jazdy</span><span>${esc(d.categories || '—')}</span></div>
      <div><span class="label">Prawo jazdy ważne do</span><span>${exp('licenseExpiry')}</span></div>
      <div><span class="label">Badania lekarskie do</span><span>${exp('medicalExpiry')}</span></div>
      <div><span class="label">Badania psychologiczne do</span><span>${exp('psychExpiry')}</span></div>
      <div class="full"><span class="label">Telefon</span>
        <span>${esc(d.phone || '—')}</span>
        ${P().manage ? `<span class="muted small">Dane kierowcy zmienisz w Pracownicy → Kierowcy.</span>` : pend ? `<span class="pend">Czeka na akceptację kierownika: <b>${esc(pend.newValue)}</b> <button class="small ghost" data-req-cancel="${esc(pend.id)}">Wycofaj</button></span>`
          : `<span class="phone-edit"><input id="new-phone" type="tel" inputmode="tel" placeholder="Nowy numer telefonu" autocomplete="tel"><button class="small" data-action="req-phone">Wyślij do akceptacji</button></span>`}
        ${!pend && lastDecided ? `<span class="muted small">Ostatnia zmiana (${esc(lastDecided.newValue)}): ${lastDecided.status==='approved' ? 'zaakceptowana' : 'odrzucona'}.</span>` : ''}
      </div>
    </div>
    <p class="muted small sec-empty">Pozostałe dane zmienia kierownik floty. Jeśli coś się nie zgadza, daj mu znać.</p></div>`;

  return `<div class="section driver">${backBtn()}<h2>Moje dane</h2>${fuelC}${issD}${dataF}</div>`;
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
