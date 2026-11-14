/* Emage FLEET — rentowność tras (Koszty → Rentowność tras, kierownik floty).
   Dla każdej trasy wpisujesz raz: jak jest rozliczana (za kurs / za km / ryczałt miesięczny) i stawkę,
   km jednego kursu (tam i z powrotem), koszty jednego kursu (opłaty drogowe, parkingi, prom…),
   dodatkowe km na kurs (np. kierowca zabiera auto do domu) i koszt kierowcy na kurs.
   Co miesiąc: liczba kursów (domyślnie z grafiku – dni z tą trasą), dodatkowe km i koszty w miesiącu,
   a jeśli znasz – faktyczny przychód z faktury (zastępuje wyliczenie).
   Koszt km auta = paliwo (średnie spalanie floty × średnia cena litra z kart) + pozostałe koszty aut na km z Rozliczenia aut
   (serwis, opony, ubezpieczenie, leasing, koszty ogólne – średnia z 3 ostatnich pełnych miesięcy).
   Zapis w ustawieniach: settings 'route_fin' = {routes: {routeId: {...}}, months: {'RRRR-MM': {routeId: {...}}}}. */
'use strict';
let rtMonth = prevMonth(today().slice(0, 7));
const RT_MODES = [['kurs', 'za kurs'], ['km', 'za km'], ['mies', 'ryczałt / mies.']];
const rtCfg = () => { const s = (S.settings || []).find(x => x.id==='route_fin') || {}; return {routes: s.routes || {}, months: s.months || {}}; };
const rtNum = x => { const s = String(x ?? '').replace(/\s/g, '').replace(',', '.'); return s==='' ? null : Number(s); };
const rtShow = n => n==null || n==='' ? '' : String(n).replace('.', ',');
const zlr = n => n==null ? '—' : zl(Math.round(n));

/* Koszt 1 km auta: paliwo + reszta kosztów aut na km (średnia z 3 pełnych miesięcy przed wybranym) */
function rtKmCost(m){
  const ms = [prevMonth(m), prevMonth(prevMonth(m)), prevMonth(prevMonth(prevMonth(m)))];
  let km_ = 0, other = 0, fuelZl = 0, fuelL = 0;
  ms.forEach(x => { const st = settlement(x); km_ += st.tot.km || 0; other += (st.tot.total || 0) - (st.tot.g[0] || 0); });
  const [a] = setlRange(ms[2]), [, b] = setlRange(ms[0]);
  (S.fuelCardRows || []).forEach(r => { if (r.kind!=='other' && r.txDate >= a && r.txDate <= b && (!r.currency || r.currency==='PLN') && Number(r.liters) > 0 && Number(r.amount) > 0){ fuelZl += Number(r.amount); fuelL += Number(r.liters); } });
  let ck = 0, cl = 0; S.vehicles.filter(v => v.status!=='wycofany').forEach(v => { const c = consRange(v.id, a, b); if (c && c.rate!=null && !c.unsure){ ck += c.km; cl += c.l; } });
  const lp100 = ck ? cl / ck * 100 : 10, price = fuelL ? fuelZl / fuelL : 6.5;
  const fuelKm = lp100 / 100 * price, otherKm = km_ ? other / km_ : 0;
  return {lp100, price, fuelKm, otherKm, total: fuelKm + otherKm, from: a, to: b};
}
/* Kursy z grafiku: dni w miesiącu, w których trasa była przydzielona (1 dzień = 1 kurs, niezależnie od obsady) */
function rtGrafikTrips(rid, m){
  const [a, b] = setlRange(m), days = new Set();
  S.bookings.filter(x => x.routeId===rid && x.from <= b && x.to >= a).forEach(x => { for (let d = x.from > a ? x.from : a; d <= (x.to < b ? x.to : b); d = addDays(d, 1)) days.add(x.vehicleId + d); });
  return days.size;
}
function rtCalc(m){
  const cfg = rtCfg(), kc = rtKmCost(m), mm = cfg.months[m] || {};
  const rows = S.routes.filter(r => r.active!==false || (mm[r.id] && Object.keys(mm[r.id]).length)).sort((a, b) => String(a.code).localeCompare(b.code, 'pl', {numeric: true})).map(r => {
    const c = cfg.routes[r.id] || {}, x = mm[r.id] || {};
    const graf = rtGrafikTrips(r.id, m), trips = x.trips!=null ? Number(x.trips) : graf;
    const kmT = Number(c.km) || 0, km_ = trips * kmT, extraKm = trips * (Number(c.extraKm) || 0) + (Number(x.extraKm) || 0);
    const rate = Number(c.rate) || 0, mode = c.mode || 'kurs';
    const revCalc = mode==='kurs' ? trips * rate : mode==='km' ? km_ * rate : (trips > 0 || x.trips==null ? rate : 0);
    const rev = x.revenue!=null ? Number(x.revenue) : (rate ? revCalc : null);
    const carCost = (km_ + extraKm) * kc.total, extraCost = extraKm * kc.total;
    const tripCost = trips * (Number(c.cost) || 0) + (Number(x.cost) || 0);
    const drvCost = trips * (Number(c.driver) || 0);
    const cost = carCost + tripCost + drvCost, profit = rev!=null ? rev - cost : null;
    return {r, c, x, graf, trips, kmT, km: km_, extraKm, extraCost, rate, mode, rev, revCalc, carCost, tripCost, drvCost, cost, profit,
      perTrip: profit!=null && trips ? profit / trips : null, perKm: profit!=null && (km_ + extraKm) ? profit / (km_ + extraKm) : null, margin: profit!=null && rev ? profit / rev : null, set: !!(c.rate || x.revenue!=null)};
  });
  const sum = k => rows.reduce((s, r) => s + (r[k] || 0), 0);
  return {m, kc, rows, tot: {trips: sum('trips'), km: sum('km'), extraKm: sum('extraKm'), extraCost: sum('extraCost'), rev: rows.some(r => r.rev!=null) ? sum('rev') : null, cost: sum('cost'), profit: rows.some(r => r.profit!=null) ? sum('profit') : null}};
}

function viewRouteProfit(){
  if (!P().manage) return '';
  const R = rtCalc(rtMonth), k = R.kc;
  const head = `<div class="bar"><h2>Rentowność tras</h2><div class="tools"><label class="label" for="rt-m">Miesiąc</label><input id="rt-m" type="month" value="${rtMonth}" style="width:auto">${typeof odoSwitch==='function' ? odoSwitch() : ''}</div></div>`;
  const kpis = `<div class="panel fc-meta">
    <div><span class="label">Przychód z tras</span><b>${zlr(R.tot.rev)}</b></div>
    <div><span class="label">Koszty tras</span><b>${zlr(R.tot.cost)}</b></div>
    <div><span class="label">Zysk z tras</span><b class="${R.tot.profit!=null && R.tot.profit < 0 ? 'neg' : ''}">${zlr(R.tot.profit)}</b></div>
    <div><span class="label">Kursy / km</span><b>${R.tot.trips} · ${nfk(R.tot.km)} km</b></div>
    <div><span class="label">Dodatkowe km (np. do domu)</span><b>${nfk(R.tot.extraKm)} km · ${zlr(R.tot.extraCost)}</b></div>
    <div><span class="label">Koszt 1 km auta</span><b>${zlk(k.total)}</b><span class="sub muted small">paliwo ${zlk(k.fuelKm)} (${r1(k.lp100)} l/100 × ${zlk(k.price)}) + reszta ${zlk(k.otherKm)}</span></div></div>`;
  // wynik miesiąca
  const res = `<div class="panel"><div class="sec-head"><h3>Wynik tras – ${esc(monthName(rtMonth))}</h3><span class="muted small">od najsłabszej</span></div><div class="tablewrap"><table><thead><tr><th>Trasa</th><th class="r">Kursy</th><th class="r">Km</th><th class="r">Dodatk. km</th><th class="r">Przychód</th><th class="r">Koszt auta</th><th class="r">Koszty trasy</th><th class="r">Kierowca</th><th class="r">Zysk</th><th class="r">Na kurs</th><th class="r">Marża</th></tr></thead><tbody>
    ${R.rows.slice().sort((a, b) => (a.profit==null) - (b.profit==null) || (a.perTrip ?? 0) - (b.perTrip ?? 0)).map(x => `<tr><td><b>${esc(x.r.code)}</b> ${esc(x.r.name)}${!x.set ? '<span class="sub muted">brak stawki – uzupełnij niżej</span>' : ''}</td>
      <td class="r num">${x.trips}${x.x.trips==null && x.graf ? '<span class="sub muted">z grafiku</span>' : ''}</td><td class="r num">${nfk(x.km)}</td><td class="r num">${x.extraKm ? nfk(x.extraKm) : '—'}</td>
      <td class="r num">${zlr(x.rev)}${x.x.revenue!=null ? '<span class="sub muted">z faktury</span>' : ''}</td><td class="r num">${zlr(x.carCost)}</td><td class="r num">${zlr(x.tripCost)}</td><td class="r num">${x.drvCost ? zlr(x.drvCost) : '—'}</td>
      <td class="r num"><b class="${x.profit!=null && x.profit < 0 ? 'neg' : ''}">${zlr(x.profit)}</b></td><td class="r num">${x.perTrip!=null ? zlr(x.perTrip) : '—'}</td>
      <td class="r num">${x.margin==null ? '—' : `<span class="pill ${x.margin < 0 ? 'bad' : x.margin < 0.1 ? 'warn' : 'ok'}">${Math.round(x.margin * 100)}%</span>`}</td></tr>`).join('')}</tbody>
    <tfoot><tr><td><b>Razem</b></td><td class="r num"><b>${R.tot.trips}</b></td><td class="r num"><b>${nfk(R.tot.km)}</b></td><td class="r num"><b>${nfk(R.tot.extraKm)}</b></td><td class="r num"><b>${zlr(R.tot.rev)}</b></td><td colspan="3" class="r num"><b>${zlr(R.tot.cost)}</b></td><td class="r num"><b>${zlr(R.tot.profit)}</b></td><td></td><td></td></tr></tfoot></table></div>
    <p class="muted small sec-empty">Koszt auta = (km tras + dodatkowe km) × koszt 1 km auta. Dodatkowe km to km bez przychodu – np. auto zabrane przez kierowcę do domu. Kursy bez wpisu liczą się z grafiku (dzień z trasą = kurs).</p></div>`;
  // dane miesiąca – edytowalna tabela
  const mIn = (rid, k, v, ph = '') => `<input class="rt-in" data-rt-m="${esc(rid)}" data-k="${k}" type="text" inputmode="decimal" value="${esc(rtShow(v))}" placeholder="${esc(ph)}" aria-label="${k}">`;
  const month = `<div class="panel"><div class="sec-head"><h3>Dane miesiąca – ${esc(monthName(rtMonth))}</h3><button class="small primary" data-rt-save="m">Zapisz miesiąc</button></div><div class="tablewrap"><table class="rt-tbl"><thead><tr><th>Trasa</th><th>Kursy</th><th>Dodatkowe km w miesiącu</th><th>Koszty dodatkowe (zł)</th><th>Przychód z faktury (zł)</th></tr></thead><tbody>
    ${R.rows.map(x => `<tr><td><b>${esc(x.r.code)}</b> ${esc(x.r.name)}</td><td data-l="Kursy">${mIn(x.r.id, 'trips', x.x.trips, x.graf ? x.graf + ' z grafiku' : '0')}</td><td data-l="Dodatkowe km">${mIn(x.r.id, 'extraKm', x.x.extraKm, '0')}</td><td data-l="Koszty dodatkowe">${mIn(x.r.id, 'cost', x.x.cost, '0')}</td><td data-l="Przychód z faktury">${mIn(x.r.id, 'revenue', x.x.revenue, x.revCalc ? 'wyliczone ' + nfk(x.revCalc) : 'puste = ze stawki')}</td></tr>`).join('')}</tbody></table></div>
    <p class="muted small sec-empty">Puste pole = wartość domyślna (kursy z grafiku, przychód ze stawki). Koszty dodatkowe – jednorazowe w tym miesiącu (np. mandat, prom, naprawa po drodze).</p></div>`;
  // ustawienia tras – edytowalna tabela
  const cIn = (rid, k, v, ph = '') => `<input class="rt-in" data-rt-c="${esc(rid)}" data-k="${k}" type="text" inputmode="decimal" value="${esc(rtShow(v))}" placeholder="${esc(ph)}" aria-label="${k}">`;
  const routes = `<div class="panel"><div class="sec-head"><h3>Stawki i koszty tras</h3><button class="small primary" data-rt-save="c">Zapisz trasy</button></div><div class="tablewrap"><table class="rt-tbl"><thead><tr><th>Trasa</th><th>Rozliczenie</th><th>Stawka (zł)</th><th>Km kursu (tam i z powrotem)</th><th>Koszty kursu (zł)</th><th>Dodatkowe km na kurs</th><th>Kierowca na kurs (zł)</th></tr></thead><tbody>
    ${S.routes.filter(r => r.active!==false).sort((a, b) => String(a.code).localeCompare(b.code, 'pl', {numeric: true})).map(r => { const c = rtCfg().routes[r.id] || {};
      return `<tr><td><b>${esc(r.code)}</b> ${esc(r.name)}</td><td data-l="Rozliczenie"><select class="rt-in" data-rt-c="${esc(r.id)}" data-k="mode">${RT_MODES.map(([v, l]) => `<option value="${v}" ${(c.mode || 'kurs')===v ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
        <td data-l="Stawka">${cIn(r.id, 'rate', c.rate, 'np. 1800')}</td><td data-l="Km kursu">${cIn(r.id, 'km', c.km, 'np. 640')}</td><td data-l="Koszty kursu">${cIn(r.id, 'cost', c.cost, 'opłaty, parkingi')}</td><td data-l="Dodatkowe km na kurs">${cIn(r.id, 'extraKm', c.extraKm, 'np. dojazd do domu')}</td><td data-l="Kierowca na kurs">${cIn(r.id, 'driver', c.driver, 'opcjonalnie')}</td></tr>`; }).join('')}</tbody></table></div>
    <p class="muted small sec-empty">Rozliczenie: <b>za kurs</b> – stawka × liczba kursów; <b>za km</b> – stawka × km tras (dodatkowe km nie są płatne); <b>ryczałt</b> – stała kwota na miesiąc. Koszty kursu – stałe wydatki jednego kursu (opłaty drogowe, parkingi, winiety). Kierowca na kurs – jeśli chcesz liczyć zysk trasy po wynagrodzeniu kierowcy.</p></div>`;
  return head + kpis + res + month + routes;
}
async function rtSave(kind){
  const cfg = rtCfg(), bad = [];
  if (kind==='c'){
    const routes = {...cfg.routes};
    document.querySelectorAll('[data-rt-c]').forEach(i => { const rid = i.dataset.rtC, k = i.dataset.k; const o = routes[rid] = {...(routes[rid] || {})};
      if (k==='mode'){ o.mode = i.value; return; }
      const n = rtNum(i.value); if (n!=null && (isNaN(n) || n < 0)) bad.push(i); else o[k] = n; });
    if (bad.length){ bad[0].focus(); toast('Wpisz same liczby (np. 1800 albo 1 800,50)'); return; }
    try { await db.collection('settings').doc('route_fin').set({routes, months: cfg.months}); toast('Zapisano stawki i koszty tras'); } catch(err){ handleWriteErr(err); }
  } else {
    const mm = {...(cfg.months[rtMonth] || {})};
    document.querySelectorAll('[data-rt-m]').forEach(i => { const rid = i.dataset.rtM, k = i.dataset.k; const o = mm[rid] = {...(mm[rid] || {})};
      const n = rtNum(i.value); if (n!=null && (isNaN(n) || n < 0)) bad.push(i); else if (n==null) delete o[k]; else o[k] = n; });
    if (bad.length){ bad[0].focus(); toast('Wpisz same liczby (np. 22 albo 1 250,50)'); return; }
    try { await db.collection('settings').doc('route_fin').set({routes: cfg.routes, months: {...cfg.months, [rtMonth]: mm}}); toast('Zapisano dane miesiąca'); } catch(err){ handleWriteErr(err); }
  }
}
document.addEventListener('click', e => { const b = e.target.closest('[data-rt-save]'); if (b){ e.preventDefault(); rtSave(b.dataset.rtSave); } });
document.addEventListener('change', e => { if (e.target.id==='rt-m' && e.target.value){ rtMonth = e.target.value; render(); } });
