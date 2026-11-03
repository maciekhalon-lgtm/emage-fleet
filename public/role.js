/* Emage FLEET — role: role użytkowników i uprawnienia (interfejs; baza egzekwuje je osobno regułami RLS) */
'use strict';
const ROLES = {
  floty:    {name:'Kierownik floty',   desc:'Pełne uprawnienia, zatwierdza konta i nadaje role', perm:{vehicles:'rw',deadlines:'rw',bookings:'rw',drivers:'rw',costs:'rw',issues:'rw',docs:'rw',routes:'rw',reports:'rw',history:'r',manage:true}},
  serwisu:  {name:'Kierownik serwisu', desc:'Pojazdy, terminy, usterki, dokumenty i koszty; podgląd rezerwacji', perm:{vehicles:'rw',deadlines:'rw',bookings:'r',drivers:'r',costs:'rw',issues:'rw',docs:'rw',reports:'r'}},
  kierowca: {name:'Kierowca',          desc:'Moje auto, rezerwacje, tankowania i zgłoszenia usterek', perm:{vehicles:'r',deadlines:'r',bookings:'own',drivers:'r',costs:'own',issues:'own',docs:'r',mycar:true}},
};
const DRIVER_CATS = ['Paliwo','Ładowanie','Myjnia','Opłaty i parkingi'];

/* Profil zalogowanej osoby (z tabeli profiles) */
let me = null;            // {id, email, full_name, status, role, driver_id}
let profiles = [];        // wszystkie profile – widzi je tylko kierownik floty
const names = {};         // id → imię i nazwisko (funkcja people() w bazie)

const roleOf = () => (me && me.status==='active' && ROLES[me.role]) ? me.role : null;
const P = () => (ROLES[roleOf()]||{}).perm || {};
const myDriverId = () => (me && me.driver_id) || '';
const canCreate = col => canWrite && ['rw','own'].includes(P()[col]);
function mine(col, doc){
  if (!doc) return false;
  if (col==='costs' || col==='issues') return !!myId && doc.createdBy===myId;
  if (col==='bookings') return (!!myId && doc.createdBy===myId) || (!!myDriverId() && (doc.driverId===myDriverId() || doc.coDriverId===myDriverId()));
  return false;
}
const canEditDoc = (col, doc) => canWrite && (P()[col]==='rw' || (P()[col]==='own' && mine(col, doc) && !(col==='issues' && doc.status && doc.status!=='nowe')));
const visibleCosts = () => S.costs;   // baza zwraca kierowcy tylko jego wpisy
function needProfiles(){}             // nazwiska ładowane z bazy w całości
const pName = id => names[id] || (me && id===me.id ? me.full_name : '') || 'Użytkownik';
