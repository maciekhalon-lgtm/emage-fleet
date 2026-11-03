/* Emage FLEET — statystyki: spalanie metodą „do pełna”, kilometry i spalanie kierowców */
'use strict';
const FUEL_CATS = ['Paliwo','Ładowanie'];
const isFuel = c => FUEL_CATS.includes(c.category);
const isEV = vehId => (byId('vehicles', vehId) || {}).fuel === 'Elektryczny';
const unitOf = vehId => isEV(vehId) ? 'kWh/100 km' : 'l/100 km';
const fmt1 = n => n.toFixed(1).replace('.', ',');
/* Kierowca widzi tylko swoje koszty, więc spalanie liczy z zanonimizowanej listy tankowań wszystkich aut (funkcja fuel_fills w bazie). */
const fillSource = () => P().costs==='own' ? S.fuelAll : S.costs;
const fmtInt = n => new Intl.NumberFormat('pl-PL').format(Math.round(n));

/* Kierowca tankowania: zapisany przy wpisie albo wynikający z konta, które go dodało. */
function fillDriver(c){
  if (c.driverId) return c.driverId;
  const m = c.createdBy && profiles.find(x => x.id===c.createdBy);
  return (m && m.driver_id) || '';
}

/* Odcinki między kolejnymi tankowaniami do pełna jednego auta. */
function fuelSegments(vehId){
  const fills = fillSource().filter(c => c.vehicleId===vehId && isFuel(c) && c.odometer && c.liters)
    .sort((a,b) => a.odometer-b.odometer || (a.date<b.date?-1:1));
  const ev = isEV(vehId), segs = [];
  let start = null, liters = 0, fillDrv = new Set();
  for (const f of fills){
    if (!start){ if (f.full){ start = f; fillDrv = new Set([fillDriver(f)]); } continue; }
    liters += Number(f.liters); fillDrv.add(fillDriver(f));
    if (!f.full) continue;
    const km = Number(f.odometer) - Number(start.odometer);
    if (km > 0){
      const rate = liters/km*100;
      const odd = ev ? (rate > 40 || rate < 8) : (rate > 25 || rate < 3);
      segs.push({vehId, from:Number(start.odometer), to:Number(f.odometer), date:f.date, km, liters, rate, odd, fillId:f.id, drivers: segDrivers(vehId, Number(start.odometer), Number(f.odometer), fillDrv, km)});
    }
    start = f; liters = 0; fillDrv = new Set([fillDriver(f)]);
  }
  return segs;
}

/* Kto jeździł na odcinku: z wydań i zwrotów (km z licznika), a gdy ich brak – po równo między tankujących. */
function segDrivers(vehId, from, to, fillDrv, km){
  const v = byId('vehicles', vehId);
  const out = [];
  S.bookings.forEach(b => {
    if (b.vehicleId!==vehId || !b.pickup || !b.pickup.km || !b.driverId) return;
    const a = Number(b.pickup.km), z = b.returned && b.returned.km ? Number(b.returned.km) : Number((v && v.km) || a);
    const ov = Math.min(z, to) - Math.max(a, from);
    if (ov > 0) out.push({driverId:b.driverId, km:ov, src:'handover'});
  });
  if (out.length) return out;
  const ds = [...fillDrv].filter(Boolean);
  return ds.map(d => ({driverId:d, km: km/ds.length, src:'fills'}));
}

/* Średnie spalanie auta – z pełnych odcinków, a gdy ich brak, ze wszystkich tankowań. */
function vehicleConsumption(vehId){
  const segs = fuelSegments(vehId).filter(s => !s.odd);
  if (!segs.length) return null;
  const km = segs.reduce((s,x) => s+x.km, 0), l = segs.reduce((s,x) => s+x.liters, 0);
  return {val: l/km*100, unit: unitOf(vehId), km, method:'full'};
}

/* Kilometry kierowcy w okresie: z wydań i zwrotów (data zwrotu w okresie) plus odcinki bez wydań, przypisane z tankowań. */
function driverHandoverKm(driverId, a, b){
  return S.bookings.filter(x => x.driverId===driverId && x.pickup && x.returned && x.returned.at >= a && x.returned.at <= b && x.returned.km > x.pickup.km)
    .reduce((s,x) => s + (Number(x.returned.km) - Number(x.pickup.km)), 0);
}

/* Statystyki kierowców w okresie [a, b]. Odcinek z kilkoma kierowcami liczy się do średniej każdego z nich, każdy dostaje tylko swoje km. */
function driverStats(a, b){
  const res = {};
  const get = id => res[id] || (res[id] = {driverId:id, segKm:0, fillKm:0, fills:0, fuelCost:0, perVeh:{}, expected:0, actual:0});
  S.vehicles.forEach(v => {
    const avg = vehicleConsumption(v.id);
    fuelSegments(v.id).forEach(s => {
      if (s.odd || s.date < a || s.date > b) return;
      s.drivers.forEach(({driverId, km, src}) => {
        if (!driverId) return;
        const r = get(driverId), lit = s.rate*km/100;
        r.segKm += km; if (src==='fills') r.fillKm += km;
        const pv = r.perVeh[v.id] || (r.perVeh[v.id] = {km:0, liters:0});
        pv.km += km; pv.liters += lit;
        if (avg){ r.expected += avg.val*km/100; r.actual += lit; }
      });
    });
  });
  S.costs.forEach(c => {
    if (!isFuel(c) || c.date < a || c.date > b) return;
    const d = fillDriver(c); if (!d) return;
    const r = get(d); r.fills++; r.fuelCost += Number(c.amount||0);
  });
  Object.values(res).forEach(r => {
    const hk = driverHandoverKm(r.driverId, a, b);
    r.km = hk + r.fillKm;
    r.vs = r.expected ? (r.actual/r.expected - 1) : null;
    r.vehicles = Object.entries(r.perVeh).map(([vid, x]) => ({vid, km:x.km, rate: x.km ? x.liters/x.km*100 : null, unit: unitOf(vid)}));
  });
  return Object.values(res).filter(r => r.km || r.fills).sort((x,y) => y.km - x.km);
}

function vsPill(vs){
  if (vs === null || vs === undefined) return '<span class="muted">—</span>';
  const p = Math.round(vs*100);
  const cls = p > 10 ? 'bad' : p > 3 ? 'warn' : p < -3 ? 'ok' : 'off';
  return `<span class="pill ${cls}">${p>0?'+':''}${p}%</span>`;
}

function driverRowsHtml(list){
  return list.map(r => `<tr>
    <td><b>${esc(dName(r.driverId))}</b>${r.vehicles.length ? r.vehicles.map(x => `<span class="sub">${esc(byId('vehicles',x.vid)?.plate||'')} · ${fmtInt(x.km)} km · ${x.rate?fmt1(x.rate)+' '+x.unit:'—'}</span>`).join('') : ''}</td>
    <td class="r num">${r.km ? fmtInt(r.km)+' km' : '—'}</td>
    <td class="r num">${r.fills}</td>
    <td class="r num">${zl(r.fuelCost)}</td>
    <td>${vsPill(r.vs)}</td></tr>`).join('');
}

function driversSection(){
  const [a, b, label] = periodRange();
  const list = driverStats(a, b);
  const odd = S.vehicles.flatMap(v => fuelSegments(v.id).filter(s => s.odd && s.date >= a && s.date <= b));
  return `<div class="section"><div class="bar"><h2>Kierowcy – ${label}</h2></div>
    ${list.length ? `<div class="panel tablewrap"><table><thead><tr><th>Kierowca i auta</th><th class="r">Przejechane</th><th class="r">Tankowania</th><th class="r">Paliwo</th><th>Spalanie vs średnia auta</th></tr></thead><tbody>${driverRowsHtml(list)}</tbody></table></div>`
      : '<div class="panel empty"><p>Brak danych kierowców w tym okresie. Statystyki pojawią się, gdy kierowcy zaczną wpisywać tankowania do pełna ze stanem licznika.</p></div>'}
    ${odd.length ? `<div class="notice"><span>Do sprawdzenia: ${odd.map(s => `${esc(byId('vehicles',s.vehId)?.plate||'')} ${fdate(s.date)} – wynik ${fmt1(s.rate)} ${unitOf(s.vehId)}`).join('; ')}. Pominięto je w średnich – zwykle to literówka w litrach lub liczniku albo tankowanie nie do pełna.</span></div>` : ''}
    <p class="muted" style="margin:0;font-size:13px;max-width:90ch">Spalanie liczymy między tankowaniami do pełna. Odcinek, na którym jeździło kilku kierowców, wlicza się do średniej każdego z nich; kilometry każdy dostaje tylko swoje. Procent pokazuje, ile kierowca pali więcej (+) lub mniej (−) niż średnia tego samego auta.</p></div>`;
}

/* Widok kierowcy: tylko własne statystyki (miesiąc z zakładki Koszty i cały rok). */
function myStatsPanel(){
  const me = myDriverId(); if (!me) return '';
  const [y, m] = costMonth.split('-').map(Number);
  const mA = costMonth+'-01', mB = costMonth+'-'+pad(new Date(y, m, 0).getDate());
  const sM = driverStats(mA, mB).find(r => r.driverId===me), sY = driverStats(y+'-01-01', y+'-12-31').find(r => r.driverId===me);
  const cell = (l, v) => `<div><span class="label">${l}</span><b>${v}</b></div>`;
  return `<div class="panel"><div class="sec-head"><h3>Twoje statystyki</h3><span class="muted">${MONTHS_FULL[m-1]} ${y}</span></div>
    <div class="totals">${cell('Przejechane', sM && sM.km ? fmtInt(sM.km)+' km' : '—')}${cell('Tankowania', sM ? sM.fills : 0)}${cell('Spalanie vs średnia aut', sM ? vsPill(sM.vs) : '—')}${cell('Od początku '+y+' r.', sY && sY.km ? fmtInt(sY.km)+' km' : '—')}</div>
    ${sY && sY.vehicles.length ? `<div class="tablewrap"><table><thead><tr><th>Auto (rok ${y})</th><th class="r">Twoje km</th><th class="r">Twoje spalanie</th><th class="r">Średnia auta</th></tr></thead><tbody>${sY.vehicles.map(x => { const avg = vehicleConsumption(x.vid); return `<tr><td>${plate(byId('vehicles',x.vid)?.plate)}</td><td class="r num">${fmtInt(x.km)} km</td><td class="r num">${x.rate?fmt1(x.rate)+' '+x.unit:'—'}</td><td class="r num">${avg?fmt1(avg.val)+' '+avg.unit:'—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted sec-empty">Zaznaczaj „Zatankowano do pełna”, a po dwóch takich tankowaniach zobaczysz tu swoje spalanie.</p>'}</div>`;
}

/* Kontrola licznika przy wpisie: nie niższy niż ostatni znany odczyt z tej samej lub wcześniejszej daty. */
function odometerProblem(vehId, date, odo, selfId){
  const prior = [];
  S.costs.forEach(c => { if (c.vehicleId===vehId && c.odometer && c.id!==selfId && c.date <= date) prior.push(Number(c.odometer)); });
  S.bookings.forEach(b => { if (b.vehicleId!==vehId) return; if (b.pickup && b.pickup.at <= date) prior.push(Number(b.pickup.km)); if (b.returned && b.returned.at <= date) prior.push(Number(b.returned.km)); });
  const v = byId('vehicles', vehId);
  if (v && v.km && date >= today()) prior.push(Number(v.km));
  const max = prior.length ? Math.max(...prior) : 0;
  if (odo < max) return `Stan licznika ${fmtInt(odo)} km jest niższy niż ostatni zapisany dla tego auta (${fmtInt(max)} km). Sprawdź wpis.`;
  return '';
}
