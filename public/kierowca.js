/* Emage FLEET — kierowca: „Moje auto” – wybór auta, przejęcie z checklistą, zdanie pojazdu, usterki */
'use strict';
const myActive = () => S.bookings.find(b => b.driverId===myDriverId() && b.pickup && !b.returned);
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
  const out = S.bookings.find(b => b.vehicleId===v.id && b.pickup && !b.returned);
  if (out) return {ok:false, why: out.driverId===myDriverId() ? 'masz je teraz' : 'w użyciu – '+dName(out.driverId)};
  const res = S.bookings.find(b => b.vehicleId===v.id && !b.pickup && !b.returned && b.from<=t && b.to>=t && b.driverId!==myDriverId());
  if (res) return {ok:false, why:'zarezerwowane dziś dla: '+dName(res.driverId)};
  return {ok:true};
}

function viewMyCar(){
  if (!myDriverId()) return `<div class="panel empty wait"><h2>Konto nie jest powiązane z kierowcą</h2><p>Poproś kierownika floty, żeby w panelu Użytkownicy powiązał Twoje konto z Twoim wpisem na liście kierowców. Wtedy będziesz mógł przejmować auta.</p></div>`;
  const big = (attrs, label, sub, cls = '') => `<button class="big ${cls}" ${attrs}><b>${label}</b><span>${sub}</span></button>`;
  const active = myActive();
  let main;
  if (active){
    const v = byId('vehicles', active.vehicleId) || {};
    const cons = v.id ? consumption(v.id) : null;
    const today_km = v.km && active.pickup.km ? v.km - active.pickup.km : 0;
    main = `<div class="panel mycar">
      <div class="mycar-head">${plate(v.plate)}<div><h2>${esc(v.make||'')} ${esc(v.model||'')}</h2><span class="muted">Przejęte ${fdate(active.pickup.at)} przy ${km(active.pickup.km)}${today_km>0?' · od tego czasu '+km(today_km):''}${cons ? ' · śr. '+fmt1(cons.val)+' '+cons.unit : ''}</span></div><span class="pill info">Twoje auto</span></div>
      ${checklistSummary(active.pickup.checklist) ? `<div class="mycar-booking">${checklistSummary(active.pickup.checklist)}</div>` : ''}
      <div class="big-grid">
        ${big(`data-new="costs" data-veh="${esc(v.id)}"`, 'Zatankuj', 'litry, kwota, licznik')}
        ${big(`data-new="issues" data-veh="${esc(v.id)}"`, 'Zgłoś usterkę', 'opis i zdjęcie')}
        ${big(`data-ho="return" data-id="${esc(active.id)}"`, 'Zdaj pojazd', 'koniec dnia: licznik, paliwo, uwagi', 'primary')}
      </div></div>`;
  } else {
    const asg = myAssigned();
    const asgHtml = asg && asg.vehicle && takeState(asg.vehicle)?.ok !== false ? `<div class="panel mycar assigned">
        <span class="label">${asg.booking ? 'Kierownik przydzielił Ci na dziś' : 'Twoje auto stałe'}</span>
        <div class="mycar-head">${plate(asg.vehicle.plate)}<div><h2>${esc(asg.vehicle.make)} ${esc(asg.vehicle.model)}</h2><span class="muted">Ostatni stan licznika: ${km(lastKm(asg.vehicle.id))}${asg.booking && asg.booking.purpose ? ' · '+esc(asg.booking.purpose) : ''}</span></div></div>
        <div class="big-grid">${asg.booking ? big(`data-ho="pickup" data-id="${esc(asg.booking.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary') : big(`data-take="${esc(asg.vehicle.id)}"`, 'Przyjmij auto', 'checklista i przebieg', 'primary')}</div>
      </div>` : '';
    const free = S.vehicles.filter(v => v.status!=='wycofany' && (!asg || !asg.vehicle || v.id!==asg.vehicle.id))
      .map(v => ({v, st: takeState(v)})).filter(x => x.st)
      .sort((a, b) => (b.st.ok - a.st.ok) || String(a.v.plate).localeCompare(b.v.plate));
    const list = free.map(({v, st}) => `<div class="pick ${st.ok?'':'off'}">
        <div class="pick-car">${plate(v.plate)}<div><b>${esc(v.make)} ${esc(v.model)}</b><span class="sub">${esc(v.fuel||'')} · ${km(lastKm(v.id))}</span></div></div>
        ${st.ok ? `<button class="primary" data-take="${esc(v.id)}">Wybierz</button>` : `<span class="muted small">${esc(st.why)}</span>`}</div>`).join('');
    main = `${asgHtml}
      <div class="panel"><div class="sec-head"><h3>${asgHtml ? 'Albo wybierz inne wolne auto' : 'Wybierz auto na dziś'}</h3><span class="muted small">${free.filter(x => x.st.ok).length} wolnych</span></div>
      ${list ? `<div class="picks">${list}</div>` : '<p class="muted sec-empty">Brak aut w ewidencji.</p>'}</div>`;
  }
  const upcoming = S.bookings.filter(x => x.driverId===myDriverId() && !x.returned && !x.pickup && x.from>today()).sort((x,y) => x.from<y.from?-1:1).slice(0,5);
  const upHtml = upcoming.map(x => `<div class="mini ${canEditDoc('bookings',x)?'click':''}" ${canEditDoc('bookings',x)?`data-edit="bookings" data-id="${esc(x.id)}"`:''}><span class="num">${fdate(x.from)}${x.to!==x.from?'–'+fdate(x.to).slice(0,5):''}</span><span>${vPlate(x.vehicleId)} ${esc(x.purpose||'')}</span><span></span></div>`).join('');
  const v = active ? byId('vehicles', active.vehicleId) : null;
  const vIssues = v ? openIssues(v.id) : [];
  return `<div class="section">
    ${main}
    <div class="grid2">
      <div class="section">
        <div class="panel"><div class="sec-head"><h3>Kolejne rezerwacje</h3>${canCreate('bookings')?'<button class="small" data-new="bookings">+ Zarezerwuj</button>':''}</div>${upHtml || '<p class="muted sec-empty">Brak zaplanowanych rezerwacji.</p>'}</div>
        ${myStatsPanel()}
      </div>
      <div class="section">
        ${v ? `<div class="panel"><div class="sec-head"><h3>Otwarte usterki tego auta</h3></div>${vIssues.length ? `<div class="dl">${vIssues.map(i => issueRow(i, false)).join('')}</div>` : '<p class="muted sec-empty">Brak otwartych usterek.</p>'}</div>` : ''}
      </div>
    </div>
  </div>`;
}
