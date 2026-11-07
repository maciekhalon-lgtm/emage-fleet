/* Emage FLEET — karta kierowcy (kierownik floty): ostatnie 30 dni w jednym oknie.
   Dni pracy z grafiku, tankowania wpisane w aplikacji, spalanie na odcinkach zamkniętych jego tankowaniem,
   złe liczniki, tankowania do wyjaśnienia i podejrzane tankowania z kart. „Edytuj dane” otwiera zwykły formularz. */

let drvCardDays = 30;

function drvCardStats(id, from, to){
  const d = byId('drivers', id) || {}, name = d.name || '';
  const days = new Set();
  S.bookings.forEach(b => { if (!crewOf(b).includes(id)) return;
    for (let x = b.from > from ? b.from : from; x <= (b.to < to ? b.to : to); x = addDays(x, 1)) days.add(x); });
  const fuel = appFuel().filter(c => (fillDriver(c) || c.driverId)===id && c.date>=from && c.date<=to).sort((a, b) => a.date<b.date ? 1 : -1);
  const drv = cmpDriverOf();
  let km_ = 0, l = 0; const veh = new Set();
  S.vehicles.forEach(v => { const c = consRange(v.id, from, to);
    if (c && c.parts && c.rate!=null && !c.unsure) c.parts.forEach(p => { if (drv(p.id)===id){ km_ += p.km; l += p.l; veh.add(v.id); } }); });
  const bad = name ? badOdometers().filter(x => x.d>=from && x.d<=to && String(x.who || '').includes(name)) : [];
  const flagged = flaggedCosts().filter(c => (fillDriver(c) || c.driverId)===id);
  const susp = typeof fcSuspicious==='function' && name ? fcSuspicious().filter(x => x.row.txDate>=from && x.row.txDate<=to && String(fcDriver(x.row, null) || '').includes(name)) : [];
  // usterki i szkody z dni, w których jechał tym autem (wg grafiku)
  const iss = S.issues.filter(i => i.date>=from && i.date<=to && S.bookings.some(b => b.vehicleId===i.vehicleId && crewOf(b).includes(id) && b.from<=i.date && b.to>=i.date)).sort((a, b) => a.date<b.date ? 1 : -1);
  return {days: days.size, fuel, km: km_, l, rate: km_ >= 300 ? l / km_ * 100 : null, veh, bad, flagged, susp, iss, acc: iss.filter(i => typeof isAccident==='function' && isAccident(i))};
}

function openDriverCard(id){
  const d = byId('drivers', id); if (!d) return;
  const t = today(), from = addDays(t, -(drvCardDays - 1));
  const s = drvCardStats(id, from, t);
  const now = S.bookings.find(b => holds(b) && crewOf(b).includes(id));
  const sumL = s.fuel.reduce((a, c) => a + Number(c.liters || 0), 0), sumA = s.fuel.reduce((a, c) => a + Number(c.amount || 0), 0);
  const fact = (l, v, cls = '') => `<div><span class="label">${l}</span><b class="${cls}">${v}</b></div>`;
  const rateCls = s.rate == null ? '' : s.rate > THEFT_RATE ? 'neg' : '';
  editing = {col:'driver-card', id, base:{}, special: () => { closeForm(); openForm('drivers', id); }};
  $('#dlg-title').textContent = d.name;
  $('#dlg-body').innerHTML = `<div class="field full dc-top">
      <span class="muted">${esc([d.phone, d.categories ? 'kat. ' + d.categories : ''].filter(Boolean).join(' · ')) || 'brak telefonu'}</span>
      ${d.phone && P().manage ? `<a class="btn small" href="tel:${esc(String(d.phone).replace(/\s/g, ''))}">${ic('phone')}Zadzwoń</a>` : ''}
    </div>
    ${now ? `<div class="field full"><div class="notice"><span>Teraz: <b>${esc(byId('vehicles', now.vehicleId)?.plate || '')}</b>${now.routeId ? ' · ' + esc(rLabel(now.routeId)) : ''}</span></div></div>` : ''}
    <div class="field full"><div class="seg dc-range">${[30, 90].map(n => `<button type="button" class="${drvCardDays===n ? 'on' : ''}" data-dc-days="${n}" data-dc-id="${esc(id)}">${n} dni</button>`).join('')}</div></div>
    <div class="field full facts dc-facts">
      ${fact('Dni pracy (grafik)', s.days)}
      ${fact('Tankowania', `${s.fuel.length} · ${fl(sumL)}`)}
      ${fact('Spalanie na jego odcinkach', s.rate != null ? `${s.rate.toFixed(1).replace('.', ',')} l/100` : '—', rateCls)}
      ${fact('Przejechane (odcinki)', s.km ? new Intl.NumberFormat('pl-PL').format(Math.round(s.km)) + ' km' : '—')}
      ${fact('Złe liczniki', s.bad.length, s.bad.length ? 'neg' : '')}
      ${fact('Do wyjaśnienia', s.flagged.length + s.susp.length, s.flagged.length + s.susp.length ? 'neg' : '')}
      ${fact('Usterki / szkody', `${s.iss.length - s.acc.length} / ${s.acc.length}`, s.acc.length ? 'neg' : '')}
    </div>
    ${s.rate != null && s.rate > THEFT_RATE ? `<div class="field full"><div class="notice err"><span>Spalanie powyżej ${THEFT_RATE} l/100 km na odcinkach, które zamknął jego tankowaniem – sprawdź w Paliwo → Miesiąc do miesiąca.</span></div></div>` : ''}
    ${s.bad.length ? `<div class="field full"><span class="label">Złe liczniki</span>${s.bad.slice(0, 5).map(x => `<div class="mini"><span class="num">${fdate(x.d)}</span><span>${vPlate(x.vid)}</span><span class="mini-r num">${km(x.odo)} <span class="pill warn">${esc(x.kind)}</span></span></div>`).join('')}</div>` : ''}
    ${s.susp.length ? `<div class="field full"><span class="label">Podejrzane tankowania z kart</span>${s.susp.slice(0, 5).map(x => `<div class="mini"><span class="num">${fdate(x.row.txDate)}</span><span>${vPlate(x.row.vehicleId)}</span><span class="mini-r"><span class="pill warn">${esc(x.why[0])}</span></span></div>`).join('')}</div>` : ''}
    ${s.iss.length ? `<div class="field full"><span class="label">Usterki i szkody w jego dniach jazdy</span>${s.iss.slice(0, 6).map(i => `<div class="mini"><span class="num">${fdate(i.date)}</span><span>${esc(i.title)}<span class="sub">${esc(byId('vehicles', i.vehicleId)?.plate || '')}</span></span><span class="mini-r">${isAccident(i) ? '<span class="pill bad">szkoda</span>' : `<span class="pill">${esc({nowe:'nowe', naprawa:'w naprawie', naprawione:'naprawione'}[i.status] || i.status)}</span>`}</span></div>`).join('')}</div>` : ''}
    <div class="field full"><span class="label">Ostatnie tankowania</span>${s.fuel.slice(0, 8).map(c => `<div class="mini"><span class="num">${fdate(c.date)}</span><span>${vPlate(c.vehicleId)}</span><span class="mini-r num">${fl(c.liters)} · ${fm(c.amount)}</span></div>`).join('') || '<span class="muted small">Brak tankowań w tym okresie.</span>'}</div>`;
  $('#dlg-save').textContent = canEditDoc('drivers', d) ? 'Edytuj dane' : 'Zamknij';
  if (!canEditDoc('drivers', d)) editing.special = () => closeForm();
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
}
document.addEventListener('click', e => {
  const r = e.target.closest('[data-dc-days]');
  if (r){ drvCardDays = Number(r.dataset.dcDays); openDriverCard(r.dataset.dcId); return; }
  const t = e.target.closest('[data-drv-card]');
  if (t && !e.target.closest('a,button')){ openDriverCard(t.dataset.drvCard); }
});
