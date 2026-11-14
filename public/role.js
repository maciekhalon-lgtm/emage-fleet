/* Emage FLEET — role: role użytkowników i uprawnienia (interfejs; baza egzekwuje je osobno regułami RLS) */
'use strict';
const ROLES = {
  floty:    {name:'Kierownik floty',   desc:'Pełne uprawnienia, zatwierdza konta i nadaje role', perm:{vehicles:'rw',deadlines:'rw',bookings:'rw',drivers:'rw',costs:'rw',issues:'rw',docs:'rw',routes:'rw',serviceEntries:'rw',blockOverrides:'rw',tires:'rw',contracts:'rw',equipment:'rw',workshops:'rw',visits:'rw',service:true,reports:'rw',history:'r',manage:true}},
  serwisu:  {name:'Kierownik serwisu', desc:'Pojazdy, terminy, usterki zgłoszone przez kierowców (obsługa, bez zgłaszania), książka serwisowa, dokumenty i koszty', perm:{vehicles:'rw',deadlines:'rw',drivers:'r',costs:'rw',issues:'rw',noIssueCreate:true,docs:'rw',serviceEntries:'rw',tires:'rw',contracts:'r',equipment:'rw',workshops:'rw',visits:'rw',service:true,reports:'r'}},
  kierowca: {name:'Kierowca',          desc:'Moje auto, grafik, załadunek, tankowania i zgłoszenia usterek', perm:{vehicles:'r',deadlines:'r',bookings:'own',drivers:'r',costs:'own',issues:'own',docs:'r',mycar:true}},
};
const DRIVER_CATS = ['Paliwo','Ładowanie','Myjnia','Opłaty i parkingi'];

/* Profil zalogowanej osoby (z tabeli profiles) */
let me = null;            // {id, email, full_name, status, role, driver_id}
let profiles = [];        // wszystkie profile – widzi je tylko kierownik floty
const names = {};         // id → imię i nazwisko (funkcja people() w bazie)

const roleOf = () => (me && me.status==='active' && ROLES[me.role]) ? me.role : null;
const P = () => (ROLES[roleOf()]||{}).perm || {};
const myDriverId = () => (me && me.driver_id) || '';
/* Kierownik floty powiązany z wpisem kierowcy też prowadzi auta (zakładka „Moje auto”) */
const canDrive = () => !!P().mycar || (!!P().manage && !!myDriverId());
const canCreate = col => canWrite && ['rw','own'].includes(P()[col]) && !(col==='issues' && P().noIssueCreate);
/* Kierownik serwisu (bez uprawnień kierownika floty): bez Grafiku i Pracowników */
const serviceOnly = () => !!P().service && !P().manage;
function mine(col, doc){
  if (!doc) return false;
  if (col==='costs' || col==='issues') return !!myId && doc.createdBy===myId;
  if (col==='bookings') return (!!myId && doc.createdBy===myId) || (!!myDriverId() && (doc.driverId===myDriverId() || doc.coDriverId===myDriverId()));
  return false;
}
const canEditDoc = (col, doc) => canWrite && !(doc && doc.virtual) && (P()[col]==='rw' || (P()[col]==='own' && mine(col, doc) && !(col==='issues' && doc.status && doc.status!=='nowe')));
/* Koszty do sum i wykresów: wpisy z aplikacji + tankowania z kart paliwowych, które nie mają swojego wpisu
   (karty importuje kierownik floty; tankowanie połączone z wpisem kierowcy liczy się raz – z wpisu). */
let cardFuelMemo = {k: '', v: []};
function cardFuelCosts(){
  const rows = S.fuelCardRows || [];
  const k = rows.length + '|' + (rows[0] || {}).id + '|' + S.costs.length;
  if (cardFuelMemo.k===k) return cardFuelMemo.v;
  const v = rows.filter(r => r.kind!=='other' && r.vehicleId && !r.costId && Number(r.amount) > 0 && (!r.currency || r.currency==='PLN'))
    .map(r => ({id: 'fc_' + r.id, virtual: true, vehicleId: r.vehicleId, date: r.txDate, category: 'Paliwo', amount: Number(r.amount), liters: Number(r.liters) || null,
      odometer: Number(r.odometer) || null, station: r.station || '', currency: 'PLN', note: 'karta paliwowa' + (r.cardNo ? ' ' + r.cardNo : ''), full: false}));
  cardFuelMemo = {k, v};
  return v;
}
const visibleCosts = () => P().costs==='own' ? S.costs : S.costs.concat(cardFuelCosts());   // kierowca: baza zwraca tylko jego wpisy
const pName = id => names[id] || (me && id===me.id ? me.full_name : '') || 'Użytkownik';
