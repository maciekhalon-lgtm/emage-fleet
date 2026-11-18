/* Emage FLEET — wykorzystanie aut z GPS (dla Pulpitu „auto stoi” i karty auta).
   Źródło: dzienne stany licznika z lokalizatorów Geotab (tabela gps_odometer, jeden odczyt na koniec dnia).
   km dnia = licznik dnia − licznik dnia poprzedniego; gdy brakuje dni, różnicę dzielimy równo na brakujące dni.
   Dzień jazdy = ponad 20 km. „Stoi” = kolejne dni do dziś z przebiegiem do 20 km.
   Km floty z GPS są TYLKO INFORMACYJNE – nie wchodzą do Rentowności ani Rentowności tras (tam liczą się km do faktury i liczniki). */
'use strict';
const UT_MOVE = 20;

/* km dzień po dniu dla auta: {dzień: km} (tylko dni, które da się policzyć) */
function utDaily(vid){
  const xs = (S.gpsOdometer || []).filter(g => g.vehicleId===vid && Number(g.km) > 0).sort((a, b) => a.day.localeCompare(b.day));
  const out = {};
  for (let i = 1; i < xs.length; i++){
    const a = xs[i - 1], b = xs[i], gap = diffDays(a.day, b.day), d = Number(b.km) - Number(a.km);
    if (gap < 1 || gap > 10 || d < 0 || d > gap * 1500) continue;   // przerwa za długa albo licznik cofnięty – nie zgadujemy
    for (let k = 1; k <= gap; k++) out[addDays(a.day, k)] = d / gap;
  }
  return out;
}
function utStats(days){
  const to = today(), from = addDays(to, -(days - 1)), list = []; for (let d = from; d <= to; d = addDays(d, 1)) list.push(d);
  const gpsV = new Set((S.gpsOdometer || []).map(g => g.vehicleId));
  const vs = S.vehicles.filter(v => v.status!=='wycofany');
  const fleetDay = Object.fromEntries(list.map(d => [d, 0]));
  const rows = vs.filter(v => gpsV.has(v.id)).map(v => {
    const dly = utDaily(v.id), cells = list.map(d => dly[d]);
    const known = cells.filter(x => x!=null), km_ = known.reduce((s, x) => s + x, 0);
    const drive = known.filter(x => x > UT_MOVE).length, stand = known.filter(x => x <= UT_MOVE).length;
    list.forEach((d, i) => { if (cells[i]!=null) fleetDay[d] += cells[i]; });
    // ile dni z rzędu stoi (od ostatniego znanego dnia wstecz)
    let streak = 0, lastMove = null;
    const all = Object.keys(dly).sort();
    for (let i = all.length - 1; i >= 0; i--){ if (dly[all[i]] > UT_MOVE){ lastMove = all[i]; break; } streak++; }
    return {v, cells, km: km_, drive, stand, known: known.length, perDrive: drive ? km_ / drive : null, streak, lastMove, util: known.length ? drive / known.length : null};
  });
  const noGps = vs.filter(v => !gpsV.has(v.id));
  return {list, rows, noGps, fleetDay, from, to};
}
