/* Emage FLEET — statystyki: spalanie metodą „do pełna”, kilometry i spalanie kierowców */
'use strict';
const FUEL_CATS = ['Paliwo','Ładowanie'];
const isFuel = c => FUEL_CATS.includes(c.category);
const isEV = vehId => (byId('vehicles', vehId) || {}).fuel === 'Elektryczny';
const unitOf = vehId => isEV(vehId) ? 'kWh/100 km' : 'l/100 km';
const fmt1 = n => n.toFixed(1).replace('.', ',');
/* Kierowca widzi tylko swoje koszty, więc spalanie liczy z zanonimizowanej listy tankowań wszystkich aut (funkcja fuel_fills w bazie). */
/* Do spalania liczą się tylko tankowania potwierdzone (w podwójnej obsadzie potwierdza je drugi kierowca). */
const costOk = c => !c.confirmStatus || c.confirmStatus==='none' || c.confirmStatus==='confirmed';
const fillSource = () => P().costs==='own' ? S.fuelAll : S.costs.filter(costOk);
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
    // podwójna obsada: obaj kierowcy dostają pełne km odcinka (km floty liczą się raz – z liczników auta)
    if (ov > 0) crewOf(b).forEach(d => out.push({driverId:d, km:ov, src:'handover'}));
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
  return S.bookings.filter(x => crewOf(x).includes(driverId) && x.pickup && x.returned && (!x.coDriverId || x.returnConfirmedAt) && x.returned.at >= a && x.returned.at <= b && x.returned.km > x.pickup.km)
    .reduce((s,x) => s + (Number(x.returned.km) - Number(x.pickup.km)), 0);
}

/* Statystyki kierowców w okresie [a, b]. Odcinek z kilkoma kierowcami liczy się do średniej każdego z nich, każdy dostaje tylko swoje km. */
function driverStats(a, b){
  const res = {};
  const get = id => res[id] || (res[id] = {driverId:id, segKm:0, fillKm:0, fills:0, fuelCost:0, perVeh:{}, expected:0, actual:0, lv:{vgood:0, good:0, weak:0}});
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
        const lvl = levelFor(v.id, s.rate); if (lvl) r.lv[lvl] += km;
      });
    });
  });
  S.costs.forEach(c => {
    if (!isFuel(c) || !costOk(c) || c.date < a || c.date > b) return;
    const d = fillDriver(c); if (!d) return;
    const r = get(d); r.fills++; r.fuelCost += Number(c.amount||0);
  });
  Object.values(res).forEach(r => {
    const hk = driverHandoverKm(r.driverId, a, b);
    r.km = hk + r.fillKm;
    r.vs = r.expected ? (r.actual/r.expected - 1) : null;
    r.vehicles = Object.entries(r.perVeh).map(([vid, x]) => ({vid, km:x.km, rate: x.km ? x.liters/x.km*100 : null, unit: unitOf(vid), level: x.km ? levelFor(vid, x.liters/x.km*100) : null}));
    const lk = r.lv.vgood + r.lv.good + r.lv.weak;
    r.levelKm = lk; r.score = lk ? Math.round((r.lv.vgood*100 + r.lv.good*50) / lk) : null;
  });
  return Object.values(res).filter(r => r.km || r.fills).sort((x,y) => y.km - x.km);
}

/* Poziom spalania na aucie według progów kierownika (l/100 km): do consGood bardzo dobre, do consOk dobre, wyżej słabe. */
const LEVELS = {vgood:{l:'bardzo dobre', cls:'ok'}, good:{l:'dobre', cls:'soon'}, weak:{l:'słabe', cls:'bad'}};
function levelFor(vehId, rate){
  const v = byId('vehicles', vehId);
  if (!v || rate==null || !v.consGood || !v.consOk) return null;
  return rate <= Number(v.consGood) ? 'vgood' : rate <= Number(v.consOk) ? 'good' : 'weak';
}
const levelPill = lvl => lvl ? `<span class="pill ${LEVELS[lvl].cls}">${LEVELS[lvl].l}</span>` : '';

function vsPill(vs){
  if (vs === null || vs === undefined) return '<span class="muted">—</span>';
  const p = Math.round(vs*100);
  const cls = p > 10 ? 'bad' : p > 3 ? 'warn' : p < -3 ? 'ok' : 'off';
  return `<span class="pill ${cls}">${p>0?'+':''}${p}%</span>`;
}


/* Ranking kierowców (tylko kierownik floty): kolejność według poziomów spalania, obok terminowość, checklista i usterki. */
const RANK_MIN_KM = 300;
function driverExtras(driverId, a, b){
  const t = today();
  const mineB = S.bookings.filter(x => crewOf(x).includes(driverId) && x.pickup && x.pickup.at >= a && x.pickup.at <= b);
  const late = mineB.filter(x => (x.returned && x.returned.at > x.to) || (!x.returned && x.to < t)).length;
  const ck = mineB.filter(x => x.driverId===driverId).reduce((n, x) => n + (x.pickup.checklist || []).filter(c => !c.ok).length, 0);
  const accounts = profiles.filter(p => p.driver_id===driverId).map(p => p.id);
  const iss = S.issues.filter(i => accounts.includes(i.createdBy) && i.date >= a && i.date <= b).length;
  return {days: mineB.length, late, ck, iss};
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
    ${sY && sY.vehicles.length ? `<div class="tablewrap"><table><thead><tr><th>Auto (rok ${y})</th><th class="r">Twoje km</th><th class="r">Twoje spalanie</th><th class="r">Średnia auta</th></tr></thead><tbody>${sY.vehicles.map(x => { const avg = vehicleConsumption(x.vid); return `<tr><td>${plate(byId('vehicles',x.vid)?.plate)}</td><td class="r num">${fmtInt(x.km)} km</td><td class="r num">${x.rate?fmt1(x.rate)+' '+x.unit:'—'} ${levelPill(x.level)}</td><td class="r num">${avg?fmt1(avg.val)+' '+avg.unit:'—'}</td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted sec-empty">Zaznaczaj „Zatankowano do pełna”, a po dwóch takich tankowaniach zobaczysz tu swoje spalanie.</p>'}</div>`;
}

