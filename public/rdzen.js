/* Emage FLEET — rdzeń: stan danych, pomocnicze funkcje dat i formatowania, logika domenowa */
'use strict';
const COLS = ['vehicles','drivers','deadlines','bookings','costs','issues','docs','settings','requests','crewChanges','routes','serviceEntries','inspections','cleanings','blockOverrides','loadings','loadingReports','fuelCardImports','fuelCardRows','routeStops'];
const S = {routeStops:[],vehicles:[],drivers:[],deadlines:[],bookings:[],costs:[],issues:[],docs:[],settings:[],requests:[],crewChanges:[],routes:[],serviceEntries:[],inspections:[],cleanings:[],blockOverrides:[],loadings:[],loadingReports:[],fuelCardImports:[],fuelCardRows:[]};
const got = {};
let db = null, canWrite = true, dbState = 'loading';
let myId = null;
let assetsNS = null;      // magazyn plików (Supabase Storage), ustawiany po zalogowaniu

/* ---------- helpers ---------- */
const $ = s => document.querySelector(s);
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const pad = n => String(n).padStart(2,'0');
const isoOf = d => d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate());
const parse = iso => { const [y,m,d] = String(iso).split('-').map(Number); return new Date(y, (m||1)-1, d||1); };
const today = () => isoOf(new Date());
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
const DL_TYPES = ['Przegląd techniczny','Ubezpieczenie OC','Ubezpieczenie AC','Serwis olejowy','Wymiana rozrządu','Wymiana opon','Przegląd gwarancyjny','Legalizacja tachografu','Leasing – koniec umowy','Inne'];
const COST_CATS = ['Paliwo','Ładowanie','Serwis i naprawy','Ubezpieczenie','Opony','Myjnia','Opłaty i parkingi','Leasing','Inne'];
const FUELS = ['Diesel','Benzyna','Hybryda','Elektryczny','LPG'];

function dlState(dl){
  const dd = diffDays(today(), dl.date);
  const veh = dl.kmDue ? byId('vehicles', dl.vehicleId) : null;
  const left = veh && veh.km ? Number(dl.kmDue) - Number(veh.km) : null;
  const warnAt = Number(dl.remindKm) || 1000, soonAt = Math.max(3000, warnAt + 1000);   // przypomnienie N km przed
  const kmEq = left===null ? Infinity : left<=0 ? 0 : left<=warnAt ? 7 : left<=soonAt ? 20 : Infinity;
  if (kmEq < dd || (kmEq===0 && dd>0)){
    const cls = left<=0 ? 'bad' : left<=warnAt ? 'warn' : 'soon';
    return {cls, txt: left<=0 ? 'Przebieg przekroczony o '+new Intl.NumberFormat('pl-PL').format(-left)+' km' : 'Zostało '+new Intl.NumberFormat('pl-PL').format(left)+' km', d:kmEq, byKm:true};
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
  if (b.pickup) return b.to < t ? {cls:'bad', txt:'Nie zwrócono', key:0} : {cls:'info', txt:'W trasie', key:0};
  if (b.to < t) return {cls:'off', txt:'Zakończona', key:2};
  if (b.from <= t) return {cls:'info', txt:'Trwa', key:0};
  return {cls:'soon', txt:'Zaplanowana', key:1};
}
/* Rezerwacja „trzyma” auto: przejęte i niezdane, albo zdane w obsadzie bez potwierdzenia drugiego kierowcy */
const holds = b => !!b.pickup && (!b.returned || (!!b.coDriverId && !b.returnConfirmedAt));
const crewOf = b => [b.driverId, b.coDriverId].filter(Boolean);
const crewName = b => crewOf(b).map(dName).join(' + ');
function activeBooking(vehId){ const t=today(); return S.bookings.find(b => b.vehicleId===vehId && (holds(b) || (!b.pickup && !b.returned && b.from<=t && b.to>=t))); }
function vehicleState(v){
  if (v.status === 'wycofany') return {cls:'off', txt:'Wycofany'};
  if (v.status === 'serwis') return {cls:'warn', txt:'W serwisie'};
  if (typeof stopIssue==='function' && stopIssue(v.id)) return {cls:'bad', txt:'Niesprawny – usterka'};
  const b = activeBooking(v.id);
  if (b && b.returned) return {cls:'warn', txt:'Zdawanie – czeka na potwierdzenie'};
  if (b) return {cls:'info', txt:'W użyciu – '+crewName(b)};
  const bl = typeof vehicleBlock==='function' ? vehicleBlock(v) : null;
  if (bl && !bl.override) return {cls:'bad', txt:'Zablokowane – '+bl.reason};
  return {cls:'ok', txt: bl ? 'Dostępny dziś (zgoda kierownika)' : 'Dostępny'};
}
function conflicts(){
  const set = new Set();
  const list = S.bookings.filter(b => !b.returned || holds(b));   // zdane auto nie koliduje z kolejnym przejęciem
  for (let i=0;i<list.length;i++) for (let j=i+1;j<list.length;j++){
    const a=list[i], b=list[j];
    if (a.vehicleId===b.vehicleId && a.from<=b.to && b.from<=a.to){ set.add(a.id); set.add(b.id); }
  }
  return set;
}
function nextDeadline(vehId){
  return S.deadlines.filter(d => d.vehicleId===vehId).map(d => ({d, x: dlState(d).d})).sort((a, b) => a.x - b.x || (a.d.date < b.d.date ? -1 : 1)).map(o => o.d)[0];
}
function consumption(vehId){
  const v = byId('vehicles', vehId);
  // kierownik: ta sama średnia co w „Spalanie i przebiegi” (karty paliwowe, a gdy brak – wpisy kierowców)
  if (P().manage && typeof fleetConsumption==='function'){ const c = fleetConsumption(vehId); if (c) return {val: c.rate, unit: (v && v.fuel==='Elektryczny') ? 'kWh/100 km' : 'l/100 km', km: c.km, method:'fleet'}; }
  if (typeof vehicleConsumption==='function'){ const full = vehicleConsumption(vehId); if (full) return full; }
  const fuel = (typeof fillSource==='function' ? fillSource() : S.costs).filter(c => c.vehicleId===vehId && (c.category==='Paliwo'||c.category==='Ładowanie') && c.odometer && c.liters).sort((a,b)=>a.odometer-b.odometer);
  if (fuel.length < 2) return null;
  const dist = fuel[fuel.length-1].odometer - fuel[0].odometer;
  if (dist <= 0) return null;
  const qty = fuel.slice(1).reduce((s,c)=>s+Number(c.liters||0),0);
  return {val: qty/dist*100, unit: (v && v.fuel==='Elektryczny') ? 'kWh/100 km' : 'l/100 km'};
}

