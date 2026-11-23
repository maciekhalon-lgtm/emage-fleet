/* Emage FLEET — rdzeń: stan danych, pomocnicze funkcje dat i formatowania, logika domenowa */
'use strict';
const COLS = ['clients','routePlans','planCalc','vehicles','drivers','deadlines','bookings','costs','issues','docs','settings','requests','crewChanges','routes','serviceEntries','blockOverrides','loadings','loadingReports','fuelCardImports','fuelCardRows','routeStops','fleetCosts','tires','contracts','equipment','workshops','visits','gpsOdometer','odoGps','workOrders','woItems','events'];
const S = {clients:[],routePlans:[],planCalc:[],fuelCardRowsAll:[],gpsOdometer:[],odoGps:[],events:[],workOrders:[],woItems:[],routeStops:[],fleetCosts:[],tires:[],contracts:[],equipment:[],workshops:[],visits:[],vehicles:[],drivers:[],deadlines:[],bookings:[],costs:[],issues:[],docs:[],settings:[],requests:[],crewChanges:[],routes:[],serviceEntries:[],blockOverrides:[],loadings:[],loadingReports:[],fuelCardImports:[],fuelCardRows:[]};
const got = {};
let db = null, canWrite = true, dbState = 'loading';
let myId = null;
let viewAs = null;   // podgląd jako kierowca (podglad.js): {driverId, name, me0, myId0} – zapisy zablokowane
let assetsNS = null;      // magazyn plików (Supabase Storage), ustawiany po zalogowaniu

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const isoOf = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse = iso => { const [y,m,d] = String(iso).split('-').map(Number); return new Date(y, (m||1)-1, d||1); };
const today = () => isoOf(new Date());
/* identyfikator nowego wpisu – crypto.randomUUID działa tylko na https; na http (np. stary link) losujemy ręcznie */
const newId = () => {
  if (window.crypto && crypto.randomUUID) try { return crypto.randomUUID(); } catch(_){}
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};
const addDays = (iso, n) => { const d = parse(iso); d.setDate(d.getDate()+n); return isoOf(d); };
const addMonths = (iso, n) => { const d = parse(iso); d.setMonth(d.getMonth()+n); return isoOf(d); };
const diffDays = (a, b) => Math.round((parse(b) - parse(a)) / 864e5);
const fdate = iso => { if (!iso) return '—'; const [y,m,d] = iso.split('-'); return d+'.'+m+'.'+y; };
const zl = n => new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN',maximumFractionDigits:0}).format(n||0);
const zl2 = n => new Intl.NumberFormat('pl-PL',{style:'currency',currency:'PLN'}).format(n||0);
const km = n => (n||n===0) && n!=='' ? new Intl.NumberFormat('pl-PL').format(n)+' km' : '—';
const MONTHS = ['sty','lut','mar','kwi','maj','cze','lip','sie','wrz','paź','lis','gru'];
const MONTHS_FULL = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
const byId = (col, id) => S[col].find(x => x.id === id);
const vName = id => { const v = byId('vehicles', id); return v ? (v.make+' '+v.model).trim() : 'usunięty pojazd'; };
const dName = id => { const d = byId('drivers', id); return d ? d.name : '—'; };
const plate = (txt) => `<span class="plate" title="Numer rejestracyjny"><span class="eu">PL</span><span class="txt">${esc(txt||'—')}</span></span>`;
/* Kierowcy odpowiedzialni za busa (lista; starsze dane – pole stałego kierowcy) */
const respOf = v => !v ? [] : (Array.isArray(v.responsible) && v.responsible.length ? v.responsible : (v.driverId ? [v.driverId] : [])).filter(id => byId('drivers', id));
const respNames = v => respOf(v).map(dName).join(', ');
const vPlate = id => { const v = byId('vehicles', id); return v ? plate(v.plate) : '<span class="muted">—</span>'; };
const isPlural = (n, one, few, many) => n===1?one:(n%10>=2&&n%10<=4&&(n%100<10||n%100>=20))?few:many;

function toast(msg){ const t=$('#toast'); t.textContent=msg; t.hidden=false; clearTimeout(toast.t); toast.t=setTimeout(()=>t.hidden=true,2400); }

/* ---------- domain ---------- */
const DL_TYPES = ['Przegląd techniczny','Ubezpieczenie OC','Ubezpieczenie AC','Serwis olejowy','Wymiana rozrządu','Wymiana opon','Przegląd gwarancyjny','Koniec gwarancji','Legalizacja tachografu','Leasing – koniec umowy','Inne'];
/* Terminy liczone tylko z przebiegu (bez daty, migracja 042) */
const KM_DL = ['Serwis olejowy','Wymiana rozrządu','Przegląd gwarancyjny'];
const isKmDl = d => KM_DL.includes(typeof d==='string' ? d : d && d.type);
/* Rodzaj kwoty kosztu: naprawy netto, ubezpieczenie bez VAT, reszta (paliwo, opłaty…) brutto z paragonu / karty */
const costKind = cat => cat==='Serwis i naprawy' ? 'netto' : cat==='Ubezpieczenie' ? 'bez VAT' : 'brutto';
const COST_CATS = ['Paliwo','Ładowanie','Serwis i naprawy','Ubezpieczenie','Opony','Myjnia','Opłaty i parkingi','Leasing','Inne'];
const FUELS = ['Diesel','Benzyna','Hybryda','Elektryczny','LPG'];

/* Przebieg do serwisu (olej, rozrząd, przeglądy na km): licznik z lokalizatora GPS, jeśli odczyt ma najwyżej 3 dni;
   inaczej najwyższy zapisany przebieg auta (karty, kierowcy) – wtedy termin oznaczamy „przebieg bez GPS”. */
let svcKmMemo = {k: '', m: new Map()};
function svcKm(vid){
  const k = (S.gpsOdometer || []).length + '|' + today(); if (svcKmMemo.k!==k) svcKmMemo = {k, m: new Map()};
  if (svcKmMemo.m.has(vid)) return svcKmMemo.m.get(vid);
  const v = byId('vehicles', vid); let last = null;
  (S.gpsOdometer || []).forEach(g => { if (g.vehicleId===vid && Number(g.km) > 0 && (!last || g.day > last.day)) last = g; });
  const r = last && diffDays(last.day, today()) <= 3 ? {km: Math.round(Number(last.km)), gps: true, day: last.day}
    : {km: v && v.km ? Number(v.km) : null, gps: false, day: last ? last.day : null};
  svcKmMemo.m.set(vid, r); return r;
}
function dlState(dl){
  const dd = diffDays(today(), dl.date);
  if (dl.type==='Koniec gwarancji'){   // po końcu gwarancji nic nie alarmuje
    const sk = dl.kmDue ? svcKm(dl.vehicleId) : null, lk = sk && sk.km ? Number(dl.kmDue) - sk.km : null;
    if (dd < 0 || (lk!=null && lk <= 0)) return {cls:'off', txt:'Gwarancja zakończona', d: 9999};
  }
  const sk = dl.kmDue ? svcKm(dl.vehicleId) : null;
  const left = sk && sk.km ? Number(dl.kmDue) - sk.km : null;
  const warnAt = Number(dl.remindKm) || 1000, soonAt = Math.max(3000, warnAt + 1000);   // przypomnienie N km przed
  const kmEq = left===null ? Infinity : left<=0 ? 0 : left<=warnAt ? 7 : left<=soonAt ? 20 : Infinity;
  if (!dl.date){   // termin tylko na km
    if (left===null) return {cls:'soon', txt: dl.kmDue ? 'Brak przebiegu auta' : 'Wpisz przebieg terminu', d: 999, byKm:true};
    if (kmEq===Infinity) return {cls:'ok', txt:'Zostało '+new Intl.NumberFormat('pl-PL').format(left)+' km' + (sk.gps ? '' : ' (przebieg bez GPS)'), d: 999, byKm:true, noGps: !sk.gps};
  }
  if (kmEq < dd || (kmEq===0 && dd>0) || !dl.date){
    const cls = left<=0 ? 'bad' : left<=warnAt ? 'warn' : 'soon';
    return {cls, txt: (left<0 ? 'Przebieg przekroczony o '+new Intl.NumberFormat('pl-PL').format(-left)+' km' : left===0 ? 'Przebieg osiągnięty' : 'Zostało '+new Intl.NumberFormat('pl-PL').format(left)+' km') + (sk.gps ? '' : ' (przebieg bez GPS)'), d:kmEq, byKm:true, noGps: !sk.gps};
  }
  const d = dd;
  if (d < 0) return {cls:'bad', txt:'Po terminie '+(-d)+' '+isPlural(-d,'dzień','dni','dni'), d};
  if (d === 0) return {cls:'bad', txt:'Dziś', d};
  if (d <= 14) return {cls:'warn', txt:'Za '+d+' '+isPlural(d,'dzień','dni','dni'), d};
  if (d <= 30) return {cls:'soon', txt:'Za '+d+' dni', d};
  return {cls:'ok', txt:'Za '+d+' dni', d};
}
function bookingState(b){
  const t = today();
  if (b.returned && b.coDriverId && !b.returnConfirmedAt) return {cls:'warn', txt:'Zdanie czeka na potwierdzenie', key:0};
  if (b.returned) return {cls:'off', txt:'Zwrócona', key:2};
  if (b.pickup && b.coDriverId && !b.pickupConfirmedAt) return {cls:'warn', txt:'Przejęcie czeka na potwierdzenie', key:0};
  if (b.pickup) return bkOverdue(b) ? {cls:'bad', txt:'Nie zwrócono', key:0} : {cls:'info', txt:'W trasie', key:0};
  if (b.to < t) return {cls:'off', txt:'Zakończona', key:2};
  if (b.from <= t) return {cls:'info', txt:'Trwa', key:0};
  return {cls:'soon', txt:'Zaplanowana', key:1};
}
/* Rezerwacja „trzyma” auto: przejęte i niezdane, albo zdane w obsadzie bez potwierdzenia drugiego kierowcy */
const holds = b => !!b.pickup && (!b.returned || (!!b.coDriverId && !b.returnConfirmedAt));
const crewOf = b => [b.driverId, b.coDriverId].filter(Boolean);
const crewName = b => crewOf(b).map(dName).join(' + ');
function activeBooking(vehId){ const t=today(); return S.bookings.find(b => b.vehicleId===vehId && (holds(b) || (!b.pickup && !b.returned && b.from<=t && b.to>=t))); }
/* Auto zostawione „pod domem” kierowcy przy ostatnim zdaniu (znika przy kolejnym przejęciu) → {b, who, at} albo null */
function homeOf(vid){
  let last = null;
  S.bookings.forEach(b => { if (b.vehicleId===vid && b.pickup && b.pickup.at && (!last || (b.pickup.at + (b.from || '')) > (last.pickup.at + (last.from || '')))) last = b; });
  return last && last.returned && last.returned.home ? {b: last, who: crewName(last), at: last.returned.at} : null;
}
function vehicleState(v){
  if (v.status === 'wycofany') return {cls:'off', txt:'Wycofany'};
  if (v.status === 'serwis') return {cls:'warn', txt:'W serwisie'};
  if (typeof stopIssue==='function' && stopIssue(v.id)) return {cls:'bad', txt:'Niesprawny – usterka'};
  const b = activeBooking(v.id);
  if (b && b.returned) return {cls:'warn', txt:'Zdawanie – czeka na potwierdzenie'};
  if (b && !b.pickup) return {cls:'plan', txt:'Przydzielone – czeka na przejęcie ('+crewName(b)+')'};   // w grafiku na dziś, jeszcze nie przejęte – nie liczy się jako „w trasie”
  if (b) return {cls:'info', txt:'W trasie – '+crewName(b)};
  const bl = typeof vehicleBlock==='function' ? vehicleBlock(v) : null;
  if (bl && !bl.override) return {cls:'bad', txt:'Zablokowane – '+bl.reason};
  const hm = homeOf(v.id);
  return {cls:'ok', txt: (bl ? 'Dostępny dziś (zgoda kierownika)' : 'Dostępny') + (hm ? ` · pod domem – ${hm.who}${hm.at ? ' (od ' + fdate(hm.at) + ')' : ''}` : '')};
}
function conflicts(){
  const set = new Set();
  const list = S.bookings.filter(b => !b.returned || holds(b));   // zdane auto nie koliduje z kolejnym przejęciem
  for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++){
    const a=list[i], b=list[j];
    if (a.vehicleId===b.vehicleId && a.from<=b.to && b.from<=a.to){ set.add(a.id); set.add(b.id); }
    // ten sam kierowca z dwoma różnymi autami, które zaczyna tego samego dnia (nocna zmiana na styku dni nie jest konfliktem)
    else if (a.vehicleId!==b.vehicleId && a.from===b.from && crewOf(a).some(d => crewOf(b).includes(d))){ set.add(a.id); set.add(b.id); }
  }
  return set;
}
function nextDeadline(vehId){
  return S.deadlines.filter(d => d.vehicleId===vehId).map(d => ({d, x: dlState(d).d})).sort((a, b) => a.x - b.x || (a.d.date < b.d.date ? -1 : 1)).map(o => o.d)[0];
}
function consumption(vehId){
  const v = byId('vehicles', vehId);
  // kierownik: ta sama średnia co w Paliwo → Spalanie (wpisy kierowców, do pełna – do pełna)
  if (typeof fleetConsumption==='function'){ const c = fleetConsumption(vehId); if (c) return {val: c.rate, unit: (v && v.fuel==='Elektryczny') ? 'kWh/100 km' : 'l/100 km', km: c.km, method:'fleet'}; }
  if (typeof vehicleConsumption==='function'){ const full = vehicleConsumption(vehId); if (full) return full; }
  const fuel = (typeof fillSource==='function' ? fillSource() : S.costs).filter(c => c.vehicleId===vehId && (c.category==='Paliwo'||c.category==='Ładowanie') && c.odometer && c.liters).sort((a,b)=>a.odometer-b.odometer);
  if (fuel.length < 2) return null;
  const dist = fuel[fuel.length-1].odometer - fuel[0].odometer;
  if (dist <= 0) return null;
  const qty = fuel.slice(1).reduce((s,c)=>s+Number(c.liters||0),0);
  return {val: qty/dist*100, unit: (v && v.fuel==='Elektryczny') ? 'kWh/100 km' : 'l/100 km'};
}


/* ---------- grafik: dni tygodnia i początek tygodnia (dawniej kalendarz.js) ---------- */
const DOW = ['pn','wt','śr','cz','pt','so','nd'];
function mondayOf(iso){ const d = parse(iso); d.setDate(d.getDate() - (d.getDay()+6)%7); return isoOf(d); }
let calStart = mondayOf(today());

/* drobne pomocnicze (dawniej w srednie.js i porownanie.js) */
const MONTHS_GEN = ['styczeń','luty','marzec','kwiecień','maj','czerwiec','lipiec','sierpień','wrzesień','październik','listopad','grudzień'];
const monthName = m => `${MONTHS_GEN[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const prevMonth = m => { const d = parse(m + '-01'); d.setMonth(d.getMonth() - 1); return isoOf(d).slice(0, 7); };
const r1 = n => n==null ? '—' : n.toFixed(1).replace('.', ',');
const monthsBack = n => { const out = []; let m = today().slice(0, 7); for (let i = 0; i < n; i++){ out.unshift(m); m = prevMonth(m); } return out; };
const odoOk = o => { const x = Number(o); return x > 1000 && !(typeof fakeOdo==='function' && fakeOdo(x)); };

/* VAT na paliwo w Polsce wg daty tankowania – gdy źródło (plik z karty) nie podaje netto ani stawki.
   Okresy ustawia kierownik floty: Ustawienia → VAT na paliwo (settings 'vat'.fuelPL; ta sama zasada w bazie: private.fuel_vat, migracja 067).
   Data poza wszystkimi okresami = brak stawki → liczymy 23% i pokazujemy informację o brakującej stawce. */
const FUEL_VAT_DEF = [{from:'2020-01-01', to:'2026-08-16', rate:23}, {from:'2026-08-17', to:'2026-08-31', rate:8}, {from:'2026-09-01', to:'2026-10-02', rate:23}, {from:'2026-10-03', to:'2026-12-31', rate:8}];
const fuelVatPeriods = () => { const s = (typeof S!=='undefined' && S.settings || []).find(x => x.id==='vat'); return s && Array.isArray(s.fuelPL) ? s.fuelPL : FUEL_VAT_DEF; };
const fuelVatOf = d => { const x = String(d || '').slice(0, 10); let best = null;
  fuelVatPeriods().forEach(p => { if (p && p.from && x >= p.from && x <= (p.to || '9999-12-31') && (!best || p.from > best.from)) best = p; });
  return best ? Number(best.rate) : null; };
const fuelVat = d => fuelVatOf(d) ?? 23;
/* klasa auta: do 2,5 t / powyżej 2,5 t – spalanie porównujemy w obrębie klasy */
const WCLS = [['pow25', 'Powyżej 2,5 t'], ['do25', 'Do 2,5 t']];
const wcls = v => v && v.weightClass==='do25' ? 'do25' : 'pow25';
const wclsName = k => (WCLS.find(x => x[0]===k) || WCLS[0])[1];

/* ---- dzień pracy = zmiana, nie data w kalendarzu ----
   Nocna zmiana (np. wtorek 23:00 → środa 10:00) to 1 dzień pracy. Zmiana zaczęta przed 6:00 należy do poprzedniego dnia.
   Przejęte auto z godziną: liczba dni = czas od przejęcia do zdania (bez 2 h zapasu) / 24 h, w górę, min. 1.
   Bez godziny przejęcia (zaplanowane, stare wpisy) – dni z dat przydziału, jak dotąd. */
const BK_DAY_MS = 864e5;
const bkWarsawDay = ms => new Date(ms).toLocaleDateString('sv-SE', {timeZone: 'Europe/Warsaw'});
function bkDays(b, from, to){
  const out = [];
  if (b.pickupTs){
    const s = new Date(b.pickupTs).getTime(), e = b.returnTs ? new Date(b.returnTs).getTime() : (b.returned ? s : Math.min(Date.now(), s + 30 * BK_DAY_MS));
    const n = Math.max(1, Math.ceil((e - s - 2 * 36e5) / BK_DAY_MS)), d0 = bkWarsawDay(s - 6 * 36e5);
    for (let i = 0; i < n; i++){ const d = addDays(d0, i); if ((!from || d >= from) && (!to || d <= to)) out.push(d); }
    return out;
  }
  for (let x = from && b.from < from ? from : b.from; x <= (to && b.to > to ? to : b.to); x = addDays(x, 1)) out.push(x);
  return out;
}
/* auto przejęte i niezdane „po czasie”: od przejęcia minęło ponad 20 h (nocna zmiana trwa do rana – to nie zaległość);
   bez godziny przejęcia – przydział skończył się przedwczoraj albo wcześniej */
const bkOverdue = b => !!(b && b.pickup && !b.returned) && (b.pickupTs ? Date.now() - new Date(b.pickupTs).getTime() > 20 * 36e5 && b.to < today() : b.to < addDays(today(), -1));

/* ---- licznik z GPS w chwili wpisu (Geotab, tabela odo_gps) ----
   Spalanie i km kierowców liczymy z GPS: literówka w liczniku nie psuje wyniku. Wpis bez odczytu GPS – licznik kierowcy
   przesunięty o typową różnicę GPS↔licznik auta (np. GPS auta jest stale ~70 km za licznikiem), więc odcinki się nie rozjeżdżają. */
let gpsAtMemo = {k: '', m: new Map(), off: new Map()};
function gpsAtIdx(){
  const xs = S.odoGps || [], k = xs.length + '|' + (xs[0] || {}).id + '|' + S.costs.length + '|' + S.bookings.length;
  if (gpsAtMemo.k===k) return gpsAtMemo;
  const m = new Map(); xs.forEach(g => { if (Number(g.gpsKm) > 0) m.set(g.source + '|' + g.refId, Number(g.gpsKm)); });
  // typowa różnica wpis − GPS dla auta (mediana; tylko różnice do 300 km – większe to pomyłki)
  const dif = new Map(), add = (vid, typed, gps) => { if (!(typed > 0) || !(gps > 0)) return; const d = typed - gps; if (Math.abs(d) > 300) return; (dif.get(vid) || dif.set(vid, []).get(vid)).push(d); };
  S.costs.forEach(c => { if (c.odometer) add(c.vehicleId, Number(c.odometer), m.get('tankowanie|' + c.id)); });
  S.bookings.forEach(b => { if (b.pickup && b.pickup.km) add(b.vehicleId, Number(b.pickup.km), m.get('przejecie|' + b.id)); if (b.returned && b.returned.km) add(b.vehicleId, Number(b.returned.km), m.get('zdanie|' + b.id)); });
  const off = new Map(); dif.forEach((ds, vid) => { ds.sort((a, b) => a - b); off.set(vid, ds.length >= 2 ? ds[Math.floor(ds.length / 2)] : 0); });
  gpsAtMemo = {k, m, off};
  return gpsAtMemo;
}
/* km w skali GPS dla wpisu: source 'tankowanie' | 'przejecie' | 'zdanie'; typed – licznik wpisany przez kierowcę */
function odoAt(source, refId, vid, typed){
  const I = gpsAtIdx(), g = I.m.get(source + '|' + refId), t = Number(typed), ts = t > 0 ? t - (I.off.get(vid) || 0) : null;
  // wpis zrobiony długo po zdarzeniu (licznik kierowcy różni się od GPS z chwili wpisu o > 150 km) – liczymy z licznika kierowcy
  if (g && ts!=null && Math.abs(ts - g) > 150) return ts;
  if (g) return g;
  return ts;
}
/* Przejęcie wpisane z opóźnieniem: kierowca ruszył rano, a przejęcie wpisał po kilku godzinach jazdy.
   Rozpoznajemy tylko, gdy jednocześnie: wg GPS auto po zdaniu przez poprzedniego kierowcę STAŁO aż do dnia przejęcia
   (licznik dzienny z dnia przed przejęciem ≈ GPS przy zdaniu), przed wpisem przejechało 30–700 km i w tym czasie
   nikt nie wpisał tankowania. Wtedy start przejęcia (km i pełny bak) = GPS przy poprzednim zdaniu.
   (Gdy auto jeździło wcześniej bez nikogo w aplikacji – np. WGM 4792V 21.11 – liczymy normalnie, od wpisu.) */
const wawDay = ts => new Date(ts).toLocaleDateString('sv-SE', {timeZone: 'Europe/Warsaw'});
let lateMemo = {k: '', m: new Map()};
function pickupLate(b){
  if (!b || !b.pickup || !b.pickupTs) return null;
  const I = gpsAtIdx(), k = I.k + '|' + S.bookings.length + '|' + (S.gpsOdometer || []).length;
  if (lateMemo.k!==k) lateMemo = {k, m: new Map()};
  if (lateMemo.m.has(b.id)) return lateMemo.m.get(b.id);
  let r = null;
  const g = I.m.get('przejecie|' + b.id);
  if (g){
    const prev = S.bookings.filter(x => x.vehicleId===b.vehicleId && x.id!==b.id && x.returned && x.returnTs && x.returnTs < b.pickupTs).sort((x, y) => y.returnTs.localeCompare(x.returnTs))[0];
    const pg = prev && I.m.get('zdanie|' + prev.id), moved = pg ? g - pg : 0;
    if (pg && moved > 30 && moved <= 700){
      const busy = S.bookings.some(x => x.vehicleId===b.vehicleId && x.id!==b.id && x.id!==prev.id && x.pickupTs && x.pickupTs > prev.returnTs && x.pickupTs < b.pickupTs);
      const fuel = S.costs.some(c => c.vehicleId===b.vehicleId && c.createdAt && c.createdAt > prev.returnTs && c.createdAt < b.pickupTs && (c.category==='Paliwo' || c.category==='Ładowanie'));
      const day = wawDay(b.pickupTs), dayBefore = addDays(day, -1);
      const gd = (S.gpsOdometer || []).filter(x => x.vehicleId===b.vehicleId && x.day >= wawDay(prev.returnTs) && x.day <= dayBefore);
      const stood = gd.length > 0 && gd.every(x => Math.abs(Number(x.km) - pg) <= 30);   // auto stało do dnia przejęcia
      if (!busy && !fuel && stood) r = {anchor: pg, moved: Math.round(moved), prev};
    }
  }
  lateMemo.m.set(b.id, r);
  return r;
}
/* km startu przejęcia w skali GPS (z poprawką na przejęcie wpisane z opóźnieniem) */
const pickOdo = b => { const L = pickupLate(b); return L ? L.anchor : odoAt('przejecie', b.id, b.vehicleId, b.pickup && b.pickup.km); };
/* km przejechane w przydziale (przejęcie → zdanie) – z GPS, gdy jest */
const bkKm = b => { if (!b.pickup || !b.returned) return null; const a = pickOdo(b), z = odoAt('zdanie', b.id, b.vehicleId, b.returned.km); return a!=null && z!=null ? z - a : null; };

/* Podmiana treści strony bez „przeładowania”: zamiast innerHTML porównujemy stary i nowy DOM i zmieniamy tylko to,
   co się zmieniło. Zostaje przewinięcie, kursor w polu, otwarte <details>, mapa (#mt-slot) i wczytane zdjęcia. */
function morph(el, html){
  const tpl = document.createElement('template'); tpl.innerHTML = html;
  morphKids(el, tpl.content);
}
function morphKids(a, b){
  const an = [...a.childNodes], bn = [...b.childNodes];
  for (let i = 0; i < bn.length; i++){
    const x = an[i], y = bn[i];
    if (!x){ a.appendChild(y); continue; }
    if (x.nodeType!==y.nodeType || x.nodeName!==y.nodeName || (x.nodeType===1 && x.id!==y.id && (x.id || y.id))){ a.replaceChild(y, x); continue; }
    if (x.nodeType===3 || x.nodeType===8){ if (x.nodeValue!==y.nodeValue) x.nodeValue = y.nodeValue; continue; }
    if (x.nodeType!==1){ a.replaceChild(y, x); continue; }
    if (x.hasAttribute('data-morph-keep') && y.hasAttribute('data-morph-keep')) continue;   // elementy zarządzane same (komunikat na mapie)
    morphAttrs(x, y);
    if (x.id==='mt-slot') continue;   // mapa
    if (x.tagName==='TEXTAREA'){ if (document.activeElement!==x) x.value = y.value; continue; }
    if (x.tagName==='SELECT'){ morphKids(x, y); if (document.activeElement!==x){ const o = [...y.options].findIndex(o => o.defaultSelected); if (o >= 0) x.selectedIndex = o; } continue; }
    morphKids(x, y);
  }
  for (let i = an.length - 1; i >= bn.length; i--) a.removeChild(an[i]);
}
function morphAttrs(x, y){
  const keepSrc = x.hasAttribute('data-file');
  for (const at of [...x.attributes]) if (!y.hasAttribute(at.name) && !(keepSrc && (at.name==='src' || at.name==='href')) && !(x.tagName==='DETAILS' && at.name==='open')) x.removeAttribute(at.name);
  for (const at of [...y.attributes]) if (x.getAttribute(at.name)!==at.value) x.setAttribute(at.name, at.value);
  if (x.tagName==='INPUT' && document.activeElement!==x){
    if (x.type==='checkbox' || x.type==='radio') x.checked = y.hasAttribute('checked');
    else if (x.value!==(y.getAttribute('value') ?? '')) x.value = y.getAttribute('value') ?? '';
  }
}
