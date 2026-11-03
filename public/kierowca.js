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
  const v = S.vehicles.find(x => x.driverId===myDriverId() && x.status!=='wycofany');
  return v ? {booking:null, vehicle:v} : null;
}
/* Czy auto można dziś przejąć: aktywne, sprawne, nikt go nie ma i nikt inny go dziś nie zarezerwował */
function takeState(v){
  const t = today();
  if (v.status==='wycofany') return null;
  if (v.status==='serwis') return {ok:false, why:'w serwisie'};
  if (stopIssue(v.id)) return {ok:false, why:'niesprawne – usterka'};
  const out = S.bookings.find(b => b.vehicleId===v.id && holds(b));
  if (out) return {ok:false, why: crewOf(out).includes(myDriverId()) ? 'masz je teraz' : out.returned ? 'zdawanie – czeka na potwierdzenie' : 'w użyciu – '+crewName(out)};
  const res = S.bookings.find(b => b.vehicleId===v.id && !b.pickup && !b.returned && b.from<=t && b.to>=t && b.driverId!==myDriverId());
  if (res) return {ok:false, why:'zarezerwowane dziś dla: '+dName(res.driverId)};
  return {ok:true};
}
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
  const active = myActive();
  const hello = `<div class="hello"><h2>Dzień dobry, ${esc((me.full_name || '').split(' ')[0] || 'kierowco')}</h2><span class="muted">${esc(new Date().toLocaleDateString('pl-PL', {weekday:'long', day:'numeric', month:'long'}))}</span></div>`;
  let carTile;
  if (active && active.returned){
    const v = byId('vehicles', active.vehicleId) || {};
    carTile = `<div class="panel mycar"><div class="mycar-head">${plate(v.plate)}<div><h2>${esc(v.make||'')} ${esc(v.model||'')}</h2><span class="muted">Zdane ${fdate(active.returned.at)} przy ${km(active.returned.km)}</span></div><span class="pill warn">czeka na potwierdzenie</span></div>
      <p class="muted" style="margin:0">${active.returned.by===myId ? `Zdanie musi jeszcze potwierdzić <b>${esc(dName(partnerOf(active)))}</b>. Do tego czasu auto jest zajęte.` : 'Potwierdź zdanie pojazdu w sekcji „Do potwierdzenia” powyżej.'}</p></div>`;
  } else if (active){
    const v = byId('vehicles', active.vehicleId) || {};
    const since = v.km && active.pickup.km ? v.km - active.pickup.km : 0;
    carTile = `<div class="panel mycar">
      <div class="mycar-head">${plate(v.plate)}<div><h2>${esc(v.make||'')} ${esc(v.model||'')}</h2><span class="muted">Przejęte ${fdate(active.pickup.at)} przy ${km(active.pickup.km)}${since>0?' · od tego czasu '+km(since):''}</span></div><span class="pill info">Twoje auto</span>${v.hasTacho ? '<span class="pill off">tachograf</span>' : ''}</div>
      ${active.routeId ? `<div class="mycar-booking"><span>Trasa: <b>${esc(rLabel(active.routeId))}</b>${routeById(active.routeId)?.tacho ? ' · trasa wymaga tachografu' : ''}</span></div>` : ''}
      ${active.coDriverId ? `<div class="mycar-booking"><span>Podwójna obsada: <b>${esc(crewName(active))}</b>${!active.pickupConfirmedAt ? ` · <span style="color:var(--warn)">przejęcie czeka na potwierdzenie (${esc(dName(active.coDriverId))})</span>` : ''}</span></div>` : ''}
      ${checklistSummary(active.pickup.checklist) ? `<div class="mycar-booking">${checklistSummary(active.pickup.checklist)}</div>` : ''}
      <div class="big-grid">
        ${big(`data-new="costs" data-veh="${esc(v.id)}"`, 'Zatankuj', 'litry, kwota, licznik', '', 'fuel')}
        ${big(`data-new="issues" data-veh="${esc(v.id)}"`, 'Zgłoś usterkę', 'opis i zdjęcie', '', 'wrench')}
        ${big(`data-ho="return" data-id="${esc(active.id)}"`, 'Zdaj pojazd', 'koniec dnia: licznik, paliwo, uwagi', 'primary wide', 'key')}
      </div></div>`;
  } else if (meDriver() && meDriver().active===false){
    carTile = inactiveNote();
  } else {
    const asg = myAssigned();
    const asgOk = asg && asg.vehicle && takeState(asg.vehicle) && takeState(asg.vehicle).ok;
    carTile = `<a class="tile primary" href="#wybierz"><span class="t-ic">${ic('key')}</span><span class="t-txt"><b>Wybierz auto</b><span>${asgOk ? `Czeka na Ciebie: ${esc(asg.vehicle.plate)} · ${esc(asg.vehicle.make)} ${esc(asg.vehicle.model)}` : 'Wybierz wolne auto na dziś, wypełnij checklistę i podaj przebieg'}</span></span>${ic('chev','chev')}</a>`;
  }
  return `<div class="section driver">${hello}${myExpiryNotes()}
    ${toConfirmPanel()}
    ${carTile}
    <a class="tile" href="#moje-dane"><span class="t-ic">${ic('chart')}</span><span class="t-txt"><b>Moje dane i statystyki</b><span>Kilometry, spalanie, dni pracy, tankowania, zgłoszenia i dane kontaktowe</span></span>${ic('chev','chev')}</a>
  </div>`;
}

/* ---------- wybór auta ---------- */
function viewPickCar(){
  if (!myDriverId()) return notLinked();
  if (myActive()){ setTimeout(() => { location.hash = 'moje'; }, 0); return ''; }
  if (meDriver() && meDriver().active===false) return `<div class="section driver">${backBtn()}${inactiveNote()}</div>`;
  const asg = myAssigned();
  const asgOk = asg && asg.vehicle && takeState(asg.vehicle) && takeState(asg.vehicle).ok;
  const asgHtml = asgOk ? `<div class="panel mycar assigned">
      <span class="label">${asg.booking ? 'Kierownik przydzielił Ci na dziś' : 'Twoje auto stałe'}</span>
      <div class="mycar-head">${plate(asg.vehicle.plate)}<div><h2>${esc(asg.vehicle.make)} ${esc(asg.vehicle.model)}${asg.vehicle.hasTacho ? ' <span class="pill off">tachograf</span>' : ''}</h2><span class="muted">Ostatni stan licznika: ${km(lastKm(asg.vehicle.id))}${asg.booking && asg.booking.routeId ? ' · trasa '+esc(rLabel(asg.booking.routeId)) : ''}${asg.booking && asg.booking.purpose ? ' · '+esc(asg.booking.purpose) : ''}</span></div></div>
      <div class="big-grid">${asg.booking ? big(`data-ho="pickup" data-id="${esc(asg.booking.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary wide', 'key') : big(`data-take="${esc(asg.vehicle.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary wide', 'key')}</div>
    </div>` : '';
  const list = S.vehicles.filter(v => !asgOk || v.id!==asg.vehicle.id)
    .map(v => ({v, st: takeState(v)})).filter(x => x.st)
    .sort((a, b) => (b.st.ok - a.st.ok) || String(a.v.plate).localeCompare(b.v.plate));
  const rows = list.map(({v, st}) => `<div class="pick ${st.ok?'':'off'}">
      <div class="pick-car">${plate(v.plate)}<div><b>${esc(v.make)} ${esc(v.model)}</b><span class="sub">${esc(v.fuel||'')} · ${km(lastKm(v.id))}${v.hasTacho ? ' · tachograf' : ''}</span></div></div>
      ${st.ok ? `<button class="primary" data-take="${esc(v.id)}">Wybierz</button>` : `<span class="muted small">${esc(st.why)}</span>`}</div>`).join('');
  return `<div class="section driver">${backBtn()}
    <h2>Wybierz auto</h2>
    ${asgHtml}
    <div class="panel"><div class="sec-head"><h3>${asgHtml ? 'Albo wybierz inne wolne auto' : 'Wolne auta'}</h3><span class="muted small">${list.filter(x => x.st.ok).length} wolnych</span></div>
      ${rows ? `<div class="picks">${rows}</div>` : '<p class="muted sec-empty">Brak aut w ewidencji.</p>'}</div>
  </div>`;
}

/* ---------- moje dane i statystyki ---------- */
function viewMyData(){
  if (!myDriverId()) return notLinked();
  const me_ = myDriverId(), d = meDriver() || {};
  const [y, m] = costMonth.split('-').map(Number);
  const mA = costMonth+'-01', mB = costMonth+'-'+pad(new Date(y, m, 0).getDate());
  const days = S.bookings.filter(b => b.driverId===me_ && b.pickup).sort((a, b) => (b.pickup.at||'') < (a.pickup.at||'') ? -1 : 1);
  const daysM = days.filter(b => b.pickup.at >= mA && b.pickup.at <= mB);
  const kmM = daysM.reduce((s, b) => s + (b.returned && b.returned.km > b.pickup.km ? b.returned.km - b.pickup.km : 0), 0);

  // a) statystyki
  const statsA = `<div class="panel"><div class="sec-head"><h3>Statystyki</h3><input id="month" type="month" value="${costMonth}" style="width:auto" aria-label="Miesiąc"></div>
    <div class="totals">
      <div><span class="label">Dni pracy</span><b>${daysM.length}</b></div>
      <div><span class="label">Przejechane (zdane auta)</span><b>${kmM ? new Intl.NumberFormat('pl-PL').format(kmM)+' km' : '—'}</b></div>
    </div></div>${myStatsPanel()}`;

  // b) historia dni pracy
  const histB = `<div class="panel"><div class="sec-head"><h3>Historia dni pracy</h3><span class="muted small">ostatnie 30</span></div>
    ${days.length ? `<div class="tablewrap"><table><thead><tr><th>Data</th><th>Auto</th><th class="r">Przejęcie</th><th class="r">Zdanie</th><th class="r">Przejechane</th><th>Checklista</th></tr></thead><tbody>
    ${days.slice(0,30).map(b => { const ck = b.pickup.checklist || [], bad = ck.filter(x => !x.ok).length; const dist = b.returned && b.returned.km > b.pickup.km ? b.returned.km - b.pickup.km : null;
      return `<tr><td class="num">${fdate(b.pickup.at)}</td><td>${vPlate(b.vehicleId)}</td><td class="r num">${km(b.pickup.km)}</td><td class="r num">${b.returned ? km(b.returned.km) : '<span class="pill info">w trasie</span>'}</td><td class="r num">${dist!==null ? new Intl.NumberFormat('pl-PL').format(dist)+' km' : '—'}</td><td>${ck.length ? (bad ? `<span class="pill warn">${bad} ${isPlural(bad,'uwaga','uwagi','uwag')}</span>` : '<span class="pill ok">OK</span>') : '—'}</td></tr>`; }).join('')}
    </tbody></table></div>` : '<p class="muted sec-empty">Nie masz jeszcze zapisanych dni pracy.</p>'}</div>`;

  // c) moje tankowania
  const fuel = S.costs.filter(c => isFuel(c) && (c.driverId===me_ || c.createdBy===myId)).sort((a, b) => a.date < b.date ? 1 : -1);
  const fuelM = fuel.filter(c => c.date >= mA && c.date <= mB);
  const fuelC = `<div class="panel"><div class="sec-head"><h3>Moje tankowania</h3><span class="muted small">${MONTHS_FULL[m-1]}: ${fuelM.length} · ${zl2(fuelM.reduce((s, c) => s + Number(c.amount||0), 0))}</span></div>
    ${fuel.length ? `<div class="tablewrap"><table><thead><tr><th>Data</th><th>Auto</th><th class="r">Ilość</th><th class="r">Kwota</th><th class="r">Licznik</th></tr></thead><tbody>
    ${fuel.slice(0,30).map(c => `<tr ${canEditDoc('costs',c)?'class="click" data-edit="costs"':''} data-id="${esc(c.id)}"><td class="num">${fdate(c.date)}</td><td>${vPlate(c.vehicleId)}</td><td class="r num">${String(c.liters||'').replace('.',',')} ${c.category==='Ładowanie'?'kWh':'l'}${c.full?' · pełny':''}</td><td class="r num">${zl2(c.amount)}</td><td class="r num">${km(c.odometer)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted sec-empty">Brak tankowań. Dodasz je przyciskiem „Zatankuj” na ekranie startowym.</p>'}</div>`;

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
        ${pend ? `<span class="pend">Czeka na akceptację kierownika: <b>${esc(pend.newValue)}</b> <button class="small ghost" data-req-cancel="${esc(pend.id)}">Wycofaj</button></span>`
          : `<span class="phone-edit"><input id="new-phone" type="tel" inputmode="tel" placeholder="Nowy numer telefonu" autocomplete="tel"><button class="small" data-action="req-phone">Wyślij do akceptacji</button></span>`}
        ${!pend && lastDecided ? `<span class="muted small">Ostatnia zmiana (${esc(lastDecided.newValue)}): ${lastDecided.status==='approved' ? 'zaakceptowana' : 'odrzucona'}.</span>` : ''}
      </div>
    </div>
    <p class="muted small sec-empty">Pozostałe dane zmienia kierownik floty. Jeśli coś się nie zgadza, daj mu znać.</p></div>`;

  return `<div class="section driver">${backBtn()}<h2>Moje dane i statystyki</h2>${statsA}${histB}${fuelC}${issD}${dataF}</div>`;
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
