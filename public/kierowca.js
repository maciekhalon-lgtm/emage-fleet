/* Emage FLEET — kierowca: widok „Moje auto” na telefon (szybkie akcje kierowcy) */
'use strict';
function myCurrent(){
  const me_ = myDriverId(), t = today();
  const active = S.bookings.find(b => b.driverId===me_ && b.pickup && !b.returned)
    || S.bookings.find(b => b.driverId===me_ && !b.returned && b.from<=addDays(t,1) && b.to>=t);
  const veh = active ? byId('vehicles', active.vehicleId) : S.vehicles.find(v => v.driverId===me_ && v.status!=='wycofany');
  return {booking: active || null, vehicle: veh || null};
}

function viewMyCar(){
  if (!myDriverId()) return `<div class="panel empty wait"><h2>Konto nie jest powiązane z kierowcą</h2><p>Poproś kierownika floty, żeby w panelu Użytkownicy powiązał Twoje konto z Twoim wpisem na liście kierowców. Wtedy zobaczysz tu swoje auto i będziesz mógł tankować i rezerwować.</p></div>`;
  const {booking:b, vehicle:v} = myCurrent();
  const t = today();
  const big = (attrs, label, sub, cls = '') => `<button class="big ${cls}" ${attrs}><b>${label}</b><span>${sub}</span></button>`;
  let card;
  if (v){
    const st = vehicleState(v), cons = consumption(v.id);
    const acts = [];
    if (b && !b.pickup) acts.push(big(`data-ho="pickup" data-id="${esc(b.id)}"`, 'Odbierz auto', 'wpisz licznik i paliwo', 'primary'));
    acts.push(big(`data-new="costs" data-veh="${esc(v.id)}"`, 'Zatankuj', 'litry, kwota, licznik'));
    acts.push(big(`data-new="issues" data-veh="${esc(v.id)}"`, 'Zgłoś usterkę', 'opis i zdjęcie'));
    if (b && b.pickup && !b.returned) acts.push(big(`data-ho="return" data-id="${esc(b.id)}"`, 'Oddaj auto', 'licznik, paliwo, uwagi', 'primary'));
    card = `<div class="panel mycar">
      <div class="mycar-head">${plate(v.plate)}<div><h2>${esc(v.make)} ${esc(v.model)}</h2><span class="muted">${km(v.km)}${cons ? ' · śr. '+fmt1(cons.val)+' '+cons.unit : ''}</span></div><span class="pill ${st.cls}">${esc(st.txt)}</span></div>
      ${b ? `<div class="mycar-booking"><span class="label">${b.pickup ? 'Masz to auto od '+fdate(b.pickup.at) : 'Rezerwacja'}</span><span>${fdate(b.from)}${b.to!==b.from?' – '+fdate(b.to):''}${b.purpose?' · '+esc(b.purpose):''}</span></div>` : '<div class="mycar-booking"><span class="label">Auto przypisane na stałe</span></div>'}
      <div class="big-grid">${acts.join('')}</div>
    </div>`;
  } else {
    card = `<div class="panel empty"><h3>Nie masz dziś auta</h3><p>Zarezerwuj wolne auto – zobaczysz je tutaj w dniu wyjazdu.</p></div>`;
  }
  const upcoming = S.bookings.filter(x => x.driverId===myDriverId() && !x.returned && x.to>=t && (!b || x.id!==b.id)).sort((x,y) => x.from<y.from?-1:1).slice(0,5);
  const upHtml = upcoming.map(x => `<div class="mini ${canEditDoc('bookings',x)?'click':''}" ${canEditDoc('bookings',x)?`data-edit="bookings" data-id="${esc(x.id)}"`:''}><span class="num">${fdate(x.from)}${x.to!==x.from?'–'+fdate(x.to).slice(0,5):''}</span><span>${vPlate(x.vehicleId)} ${esc(x.purpose||'')}</span><span class="mini-r">${handoverBtn(x)}</span></div>`).join('');
  const vIssues = v ? openIssues(v.id) : [];
  const vDl = v ? S.deadlines.filter(d => d.vehicleId===v.id && dlState(d).d<=30).sort((a,c) => a.date<c.date?-1:1) : [];
  return `<div class="section">
    ${card}
    <div class="grid2">
      <div class="section">
        <div class="panel"><div class="sec-head"><h3>Moje rezerwacje</h3>${canCreate('bookings')?'<button class="small" data-new="bookings">+ Zarezerwuj</button>':''}</div>${upHtml || '<p class="muted sec-empty">Brak kolejnych rezerwacji.</p>'}</div>
        ${myStatsPanel()}
      </div>
      <div class="section">
        ${v ? `<div class="panel"><div class="sec-head"><h3>Usterki tego auta</h3></div>${vIssues.length ? `<div class="dl">${vIssues.map(i => issueRow(i, false)).join('')}</div>` : '<p class="muted sec-empty">Brak otwartych usterek.</p>'}</div>` : ''}
        ${vDl.length ? `<div class="panel"><div class="sec-head"><h3>Zbliżające się terminy</h3></div>${vDl.map(d => { const s = dlState(d); return `<div class="mini"><span class="num">${fdate(d.date)}</span><span>${esc(d.type)}</span><span class="pill ${s.cls}">${esc(s.txt)}</span></div>`; }).join('')}</div>` : ''}
      </div>
    </div>
  </div>`;
}
