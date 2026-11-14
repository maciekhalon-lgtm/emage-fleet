/* Emage FLEET — formularz: okno dodawania i edycji wpisów */
'use strict';
/* ---------- forms ---------- */
const vehOpts = () => [['','— wybierz pojazd —'], ...S.vehicles.slice().sort((a,b)=>String(a.plate).localeCompare(b.plate)).map(v => [v.id, v.plate+' · '+v.make+' '+v.model])];
/* Nieaktywni kierowcy nie pojawiają się w wyborze – chyba że są już wpisani w edytowanym wpisie */
/* Lista do zaznaczenia odpowiedzialnych: aktywni kierowcy + już wpisani */
const respOpts = () => { const keep = (editing && editing.base && respOf(editing.base)) || [];
  return S.drivers.filter(d => d.active!==false || keep.includes(d.id)).sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(d => [d.id, d.name + (d.active===false ? ' (nieaktywny)' : '')]); };
const drvOpts = (blank='— brak —') => { const keep = editing && editing.base ? editing.base.driverId : '';
  return [['',blank], ...S.drivers.filter(d => d.active!==false || d.id===keep).sort((a,b)=>a.name.localeCompare(b.name,'pl')).map(d => [d.id, d.name + (d.active===false ? ' (nieaktywny)' : '')])]; };
const FORMS = {
  vehicles: { title:['Nowy pojazd','Edytuj pojazd'], fields: () => [
    {k:'plate',l:'Numer rejestracyjny',req:1,ph:'np. PO 4K27R'},
    {k:'make',l:'Marka',req:1,ph:'np. Škoda'},
    {k:'model',l:'Model',req:1,ph:'np. Octavia Combi'},
    {k:'year',l:'Rok produkcji',t:'number'},
    {k:'fuel',l:'Napęd',t:'select',o:FUELS.map(f=>[f,f])},
    {k:'km',l:'Przebieg (km)',t:'number'},
    {k:'status',l:'Status',t:'select',o:[['aktywny','Aktywny'],['serwis','W serwisie'],['wycofany','Wycofany']]},
    {k:'vin',l:'VIN',ph:'17 znaków'},
    {k:'secDrv',t:'html',html:'<div class="f-sec">Kierowcy</div>'},
    {k:'responsible',l:'Kierowcy odpowiedzialni za busa',t:'checks',full:1,o:respOpts()},
    {k:'secIns',t:'html',html:'<div class="f-sec">Ubezpieczenie i assistance</div>'},
    {k:'insurer',l:'Towarzystwo ubezpieczeniowe',ph:'np. PZU'},
    {k:'policyNo',l:'Numer polisy',ph:'np. 123/2026'},
    {k:'policyUntil',l:'Polisa ważna do',t:'date'},
    {k:'assistancePhone',l:'Telefon assistance',t:'tel',ph:'np. +48 22 566 55 55'},
    {k:'secEq',t:'html',html:'<div class="f-sec">Wyposażenie i limity</div>'},
    {k:'tankL',l:'Pojemność baku (l)',t:'number',ph:'np. 90'},
    ...(tireSizeOn() ? [{k:'tireSize',l:'Rozmiar opon',ph:'np. 225/75 R16C'}] : []),
    {k:'tires',l:'Założone opony',t:'select',o:[['','— nie wiadomo —'],...Object.entries(TIRES)]},
    {k:'monthlyLimit',l:'Limit kosztów / mies. (zł)',t:'number',ph:'np. 2500'},
    ...(P().manage ? [{k:'hasTacho',l:'Auto ma tachograf',t:'check'}] : []),
    {k:'secCons',t:'html',html:'<div class="f-sec">Normy spalania <span class="muted small">(do kolorów w raportach – można pominąć)</span></div>'},
    {k:'consGood',l:'Bardzo dobre – do (l/100 km)',t:'number',step:'0.1',ph:'np. 9,5'},
    {k:'consOk',l:'Dobre – do (l/100 km)',t:'number',step:'0.1',ph:'np. 11,0 (powyżej = słabe)'},
    {k:'applyModel',l:'Zastosuj te normy do wszystkich aut tego samego modelu',t:'check'},
    {k:'notes',l:'Notatki',t:'textarea',full:1},
  ]},
  drivers: { title:['Nowy kierowca','Edytuj kierowcę'], fields: () => [
    {k:'name',l:'Imię i nazwisko',req:1,full:1},
    {k:'phone',l:'Telefon',t:'tel'},
    {k:'categories',l:'Kategorie prawa jazdy',ph:'np. B, C'},
    {k:'licenseExpiry',l:'Prawo jazdy ważne do',t:'date'},
    {k:'medicalExpiry',l:'Badania lekarskie do',t:'date'},
    {k:'psychExpiry',l:'Badania psychologiczne do',t:'date'},
    {k:'active',l:'Aktywny – może przejmować auta (odznacz, gdy kierowca już nie jeździ)',t:'check'},
  ]},
  deadlines: { title:['Nowy termin','Edytuj termin'], fields: () => [
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'type',l:'Rodzaj',t:'select',o:DL_TYPES.map(t=>[t,t]),req:1},
    {k:'date',l:'Termin',t:'date',req:1},
    {k:'kmDue',l:'Lub przy przebiegu (km)',t:'number'},
    {k:'intervalMonths',l:'Powtarzaj co (miesięcy)',t:'number',ph:'np. 12'},
    {k:'intervalKm',l:'Powtarzaj co (km)',t:'number',ph:'np. 15000'},
    {k:'remindKm',l:'Przypomnij … km przed',t:'number',ph:'domyślnie 1000'},
    {k:'note',l:'Notatka',ph:'np. polisa nr, warsztat',full:1},
  ]},
  bookings: { title:['Nowy przydział','Edytuj przydział'], fields: () => [
    {k:'driverId',l:'Kierowca',t:'select',o: P().bookings==='own' ? drvOpts('— wybierz kierowcę —').filter(([id])=>id===myDriverId()) : drvOpts('— wybierz kierowcę —'),req:1,full:1},
    {k:'from',l:'Dzień',t:'date',req:1},
    ...(editing && editing.base && editing.base.to && editing.base.to!==editing.base.from ? [{k:'to',l:'Do (przydział na kilka dni)',t:'date',req:1}] : []),
    {k:'vehicleId',l:'Auto',t:'select',o:vehOpts(),req:1,full:1},
    ...(P().bookings==='rw' ? [{k:'routeId',l:'Trasa',t:'select',o:routeOpts(),full:1}, ...(modOn('obsada') ? [{k:'coDriverId',l:'Drugi kierowca (opcjonalnie)',t:'select',o:drvOpts('— brak —'),full:1}] : [])] : []),
    {k:'purpose',l:'Uwagi',t:'textarea',full:1,ph:'np. załadunek o 6:00, klient czeka od 8:00'},
    ...(!(editing && editing.id) && P().bookings==='rw' ? [{k:'repeatUntil',l:'Powtórz w dni robocze do (opcjonalnie)',t:'date',full:1}] : []),
  ]},
  costs: { title:['Nowy koszt','Edytuj koszt'], fields: () => costFieldsFor([
    {k:'date',l:'Data',t:'date',req:1},
    {k:'category',l:'Kategoria',t:'select',o:(P().costs==='own'?DRIVER_CATS:COST_CATS).map(c=>[c,c]),req:1},
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'amount',l:'Kwota brutto',t:'number',step:'0.01',req:1},
    ...(editing && editing.base && editing.base.mode==='quick' ? [{k:'abroad',l:'Tankuję za granicą (EUR / CZK)',t:'check'}] : []),
    {k:'currency',l:'Waluta',t:'select',o:CURRENCIES.map(c=>[c,c])},
    {k:'fxPrev',t:'html',html:'<div class="fx-prev muted small" id="fx-prev" hidden></div>'},
    ...(P().manage ? [{k:'fxManual',l:'Kurs wpisuję ręcznie (zamiast kursu NBP)',t:'check'},{k:'fxRate',l:'Kurs ręczny (zł za 1 jednostkę)',t:'number',step:'0.0001'}] : []),
    {k:'stationSel',l:'Stacja',t:'select',o:[['','— nie podano —'],...STATIONS.map(s=>[s,s])]},
    {k:'stationOther',l:'Nazwa stacji',ph:'np. Shell, Aral'},
    {k:'liters',l:'Ilość (l / kWh)',t:'number',step:'0.01',hint:'dla paliwa i ładowania'},
    {k:'odometer',l:'Stan licznika (km) – wymagany przy tankowaniu',t:'number'},
    {k:'full',l:'Zatankowano do pełna (naładowano do 100%)',t:'check'},
    ...(P().costs==='rw' ? [{k:'driverId',l:'Kierowca',t:'select',o:drvOpts('— nie dotyczy —')}] : []),
    {k:'note',l:'Opis',ph:'np. stacja, faktura nr'},
    {k:'photos',t:'photos'},
  ])},
  issues: { title:['Zgłoś usterkę','Edytuj zgłoszenie'], fields: () => [
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'title',l:'Co się dzieje?',req:1,full:1,ph:'np. stuk z przedniego zawieszenia'},
    {k:'severity',l:'Waga',t:'select',o:Object.entries(ISSUE_SEV).map(([k,v])=>[k,v.l]),req:1},
    {k:'date',l:'Data zgłoszenia',t:'date',req:1},
    {k:'km',l:'Przebieg (km)',t:'number'},
    {k:'description',l:'Szczegóły',t:'textarea',full:1,ph:'Kiedy występuje, co już sprawdzono'},
    ...(P().issues==='rw' ? [
      {k:'status',l:'Status',t:'select',o:Object.entries(ISSUE_ST).map(([k,v])=>[k,v.l]),req:1},
      {k:'repairNote',l:'Opis naprawy',ph:'np. wymiana łącznika stabilizatora'},
    ] : []),
    {k:'photos',t:'photos'},
  ]},
  serviceEntries: { title:['Nowy wpis serwisowy','Edytuj wpis serwisowy'], fields: () => [
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'date',l:'Data',t:'date',req:1},
    {k:'km',l:'Przebieg (km)',t:'number'},
    {k:'workshop',l:'Warsztat',ph:'np. Auto-Serwis Kowalski'},
    {k:'cost',l:'Koszt brutto (zł)',t:'number',step:'0.01',hint:'doda się sam do kosztów'},
    {k:'description',l:'Co zrobiono',t:'textarea',req:1,full:1,ph:'np. wymiana oleju i filtrów, klocki przód'},
    {k:'oilChange',l:'Wymiana oleju – następna za 12 000 km (przypomnienie 2 000 km wcześniej)',t:'check'},
    {k:'timingChange',l:'Wymiana rozrządu – następna za 80 000 km (przypomnienie 5 000 km wcześniej)',t:'check'},
    {k:'tiresSet',l:'Założono opony',t:'select',o:[['','— bez zmiany opon —'],...Object.entries(TIRES)]},
    {k:'deadlineId',l:'Odnów termin',t:'select',o:svcDeadlineOpts(),full:1},
    {k:'issueIds',l:'Naprawione usterki',t:'checks',o:svcIssueOpts(),full:1},
    {k:'note',l:'Uwagi',full:1},
    {k:'file',l:'Faktura lub protokół (PDF albo zdjęcie, do 20 MB)',t:'file',full:1},
  ]},
  routes: { title:['Nowa trasa','Edytuj trasę'], fields: () => [
    {k:'code',l:'Kod',req:1,ph:'np. R12'},
    {k:'name',l:'Nazwa',req:1,ph:'np. Wrocław – Praga'},
    {k:'tacho',l:'Wymaga tachografu (tylko informacja)',t:'check'},
    {k:'loading',l:'Trasa załadunkowa',t:'check'},
    {k:'active',l:'Aktywna (można ją przypisywać)',t:'check'},
    {k:'note',l:'Notatka',t:'textarea',full:1},
  ]},
  workshops: { title:['Nowy warsztat','Edytuj warsztat'], fields: () => [
    {k:'name',l:'Nazwa',req:1,full:1,ph:'np. Auto-Serwis Kowalczyk'},
    {k:'phone',l:'Telefon',t:'tel'},
    {k:'kind',l:'Rodzaj',ph:'np. mechanika, opony, ASO, blacharnia'},
    {k:'address',l:'Adres',full:1},
    {k:'note',l:'Notatka',full:1},
  ]},
  visits: { title:['Umów wizytę w warsztacie','Edytuj wizytę'], fields: () => [
    {k:'vehicleId',l:'Auto',t:'select',o:vehOpts(),req:1,full:1},
    {k:'date',l:'Dzień',t:'date',req:1},
    {k:'time',l:'Godzina',t:'time'},
    {k:'workshopId',l:'Warsztat',t:'select',o:[['','— wybierz —'], ...S.workshops.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl')).map(w => [w.id, w.name])],full:1},
    {k:'reason',l:'Powód',req:1,full:1,ph:'np. przegląd techniczny, olej, hamulce'},
    {k:'status',l:'Stan',t:'select',o:Object.entries(VISIT_ST)},
    {k:'note',l:'Notatka',full:1},
  ]},
  contracts: { title:['Nowa umowa auta','Edytuj umowę auta'], fields: () => [
    {k:'vehicleId',l:'Auto',t:'select',o:vehOpts(),req:1,full:1},
    {k:'kind',l:'Rodzaj',t:'select',o:Object.entries(CONTRACT_KINDS),req:1},
    {k:'provider',l:'Finansujący / wynajmujący',ph:'np. mLeasing, Arval'},
    {k:'contractNo',l:'Numer umowy'},
    {k:'startDate',l:'Początek',t:'date'},
    {k:'endDate',l:'Koniec',t:'date'},
    {k:'monthlyNet',l:'Rata netto (zł)',t:'number',step:'0.01'},
    {k:'monthlyGross',l:'Rata brutto (zł)',t:'number',step:'0.01'},
    {k:'kmLimit',l:'Limit km w całej umowie',t:'number',ph:'np. 150000'},
    {k:'kmStart',l:'Przebieg na początku (km)',t:'number'},
    {k:'kmExcessRate',l:'Opłata za 1 km ponad limit (zł)',t:'number',step:'0.01',ph:'np. 0,25'},
    {k:'buyout',l:'Wykup (zł)',t:'number',step:'0.01'},
    {k:'insuranceIn',l:'Ubezpieczenie w racie',t:'check'},
    {k:'serviceIn',l:'Serwis w racie',t:'check'},
    {k:'note',l:'Notatka',full:1},
  ]},
  tires: { title:['Nowy komplet opon','Edytuj komplet opon'], fields: () => [
    {k:'vehicleId',l:'Auto',t:'select',o:[['','— bez auta (zapas) —'], ...vehOpts().filter(([v]) => v)],full:1},
    {k:'season',l:'Sezon',t:'select',o:Object.entries(TIRES),req:1},
    {k:'location',l:'Gdzie jest',t:'select',o:Object.entries(TIRE_LOC),req:1},
    {k:'size',l:'Rozmiar',ph:'np. 225/75 R16C'},
    {k:'brand',l:'Marka i model',ph:'np. Michelin Agilis'},
    {k:'dot',l:'Rok produkcji (DOT)',t:'number',ph:'np. 2023'},
    {k:'treadMm',l:'Bieżnik (mm)',t:'number',step:'0.1',ph:'np. 6,5'},
    {k:'storage',l:'Miejsce w magazynie',ph:'np. regał A3, przechowalnia Vulco',full:1},
    {k:'mountedAt',l:'Założone dnia',t:'date'},
    {k:'mountedKm',l:'Przy przebiegu (km)',t:'number'},
    {k:'note',l:'Notatka',full:1},
  ]},
  docs: { title:['Dodaj dokument','Edytuj dokument'], fields: () => [
    {k:'kind',l:'Rodzaj',t:'select',o:DOC_KINDS.map(k=>[k,k]),req:1},
    {k:'validUntil',l:'Ważny do',t:'date'},
    {k:'name',l:'Opis',full:1,ph:'np. polisa nr 123/2026'},
    ...(editing && editing.id ? [] : [{k:'file',l:'Plik (PDF lub zdjęcie, do 20 MB)',t:'file',req:1,full:1}]),
  ]},
};
const DEFAULTS = {
  workshops: () => ({}),
  visits: () => ({date: addDays(today(), 1), time: '08:00', status: 'zaplanowana'}),
  contracts: () => ({kind:'leasing'}),
  tires: () => ({season: 'zimowe', location: 'magazyn'}),
  vehicles: () => ({status:'aktywny', fuel:'Diesel', tankL:90}),
  drivers: () => ({active:true}),
  routes: () => ({active:true}),
  serviceEntries: () => ({date: today()}),
  deadlines: () => ({type:'Przegląd techniczny', date: addDays(today(),30), intervalMonths:12}),
  bookings: () => ({from: today(), to: today(), driverId: P().bookings==='own' ? myDriverId() : ''}),
  costs: () => {
    const base = {date: today(), category:'Paliwo', full:true};
    if (P().costs==='own'){
      const me = myDriverId();
      const b = me && S.bookings.find(x => x.driverId===me && !x.returned && (x.pickup || (x.from<=today() && x.to>=today())));
      const v = b ? byId('vehicles', b.vehicleId) : S.vehicles.find(x => respOf(x).includes(me) && x.status!=='wycofany');
      return {...base, vehicleId: v ? v.id : '', driverId: me};
    }
    return base;
  },
  issues: () => ({date: today(), severity:'istotna', status:'nowe'}),
  docs: () => ({kind:'Dowód rejestracyjny'}),
};
let editing = null;
/* ---------- waluty i stacje (tankowanie za granicą) ---------- */
const CURRENCIES = ['PLN','EUR','CZK'];
const STATIONS = ['Orlen','UTA','Inna'];
const FORM_VIEW = {
  vehicles: d => ({...d, responsible: respOf(d)}),
  costs: d => { const foreign = d.currency && d.currency!=='PLN';
    const st = d.station || '', known = STATIONS.includes(st) && st!=='Inna';
    return {...d, currency: d.currency || 'PLN', amount: foreign ? (d.amountOrig ?? '') : d.amount, stationSel: !st ? '' : known ? st : 'Inna', stationOther: !st || known ? '' : st, abroad: !!foreign}; },
};
/* ---------- książka serwisowa: terminy i usterki auta wybranego w formularzu ---------- */
const svcDeadlineOpts = () => [['','— nie odnawiaj —'], ...S.deadlines.slice().sort((a,b) => a.date<b.date?-1:1)
  .map(d => [d.id, `${byId('vehicles', d.vehicleId)?.plate || ''} · ${d.type} · ${fdate(d.date)}${d.kmDue ? ' / '+km(d.kmDue) : ''}`, d.vehicleId])];
const svcIssueOpts = () => { const keep = (editing && editing.base && editing.base.issueIds) || [];
  return S.issues.filter(i => i.status!=='naprawione' || keep.includes(i.id)).sort((a,b) => a.date<b.date?1:-1)
    .map(i => [i.id, `${fdate(i.date)} · ${i.title}${i.status==='naprawione' ? ' (naprawione)' : ''}`, i.vehicleId]); };
function svcUi(e){
  if (!editing || editing.col!=='serviceEntries') return;
  const veh = $('#f-serviceEntries-vehicleId')?.value || '';
  const sel = $('#f-serviceEntries-deadlineId');
  if (sel){ const opts = svcDeadlineOpts(); [...sel.options].forEach((o, i) => { if (!i) return; const show = opts[i] && opts[i][2]===veh; o.hidden = !show; o.disabled = !show; });
    if (sel.selectedOptions[0] && sel.selectedOptions[0].disabled) sel.value = ''; }
  document.querySelectorAll('#f-serviceEntries-issueIds label').forEach(l => { const show = l.dataset.veh===veh; l.hidden = !show; if (!show) l.querySelector('input').checked = false; });
  if (e && e.target && e.target.id==='f-serviceEntries-vehicleId'){ const v = byId('vehicles', veh); const k = $('#f-serviceEntries-km'); if (v && v.km && k && !k.value) k.value = v.km; }
}
/* Kierowca: szybkie tankowanie (tylko litry, kwota, licznik) i „Inny wydatek” – reszta uzupełnia się sama */
const QUICK_FIELDS = ['liters','amount','odometer','abroad','currency','fxPrev','photos'];
const OTHER_FIELDS = ['category','amount','currency','fxPrev','note','photos'];
function costFieldsFor(all){
  const mode = editing && editing.base && editing.base.mode;
  if (!mode) return all;
  const keys = mode==='quick' ? QUICK_FIELDS : OTHER_FIELDS;
  return keys.map(k => all.find(f => f.k===k)).filter(Boolean).map(f => {
    if (mode==='quick' && f.k==='liters') return {...f, l:'Litry', req:1, hint:''};
    if (mode==='quick' && f.k==='odometer') return {...f, l:'Stan licznika (km)', req:1, ph: editing.base.vehicleId ? 'ostatni: ' + new Intl.NumberFormat('pl-PL').format(lastKm(editing.base.vehicleId) || 0) : ''};
    if (mode==='other' && f.k==='category') return {...f, o: DRIVER_CATS.filter(c => !FUEL_CATS.includes(c)).map(c => [c, c])};
    return f;
  });
}
const FUEL_PREFS = 'ef-fuel-last';
const fuelPrefs = () => { try { return JSON.parse(localStorage.getItem(FUEL_PREFS) || '{}'); } catch(_){ return {}; } };
let receiptCache = null;
async function receiptToday(){
  if (receiptCache && receiptCache.d===today()) return receiptCache.v;
  if (!navigator.onLine) return false;
  try { const {data, error} = await sb.rpc('my_receipt_today'); if (error) return false; receiptCache = {d: today(), v: !!data}; return !!data; } catch(_){ return false; }
}
async function openQuickFuel(vid){
  const v = byId('vehicles', vid), pf = fuelPrefs();
  openForm('costs', null, {vehicleId: vid, mode:'quick', category: v && v.fuel==='Elektryczny' ? 'Ładowanie' : 'Paliwo', currency: pf.currency || 'PLN', station: pf.station || '', full: true});
  if (!editing) return;
  $('#dlg-title').textContent = 'Tankowanie';
  const ph = $('#dlg-body input[type=file]')?.closest('.field'); if (ph) ph.hidden = true;   // zdjęcie tylko przy kontroli paragonu
  if (P().costs==='own' && await receiptToday() && editing && editing.base.mode==='quick'){
    editing.receipt = true; if (ph) ph.hidden = false;
    $('#dlg-body').insertAdjacentHTML('afterbegin', '<div class="field full"><div class="notice"><span><b>Dziś wylosowano Cię do kontroli paragonów</b> – dodaj zdjęcie paragonu.</span></div></div>');
  }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-fuel],[data-action="more"],[data-action="loading"],[data-ck-expand]');
  if (!t) return;
  if (t.dataset.ckExpand!==undefined){ const box = t.closest('.ck-wrap'); box.querySelector('.checklist').hidden = false; t.closest('.ck-all').hidden = true; return; }
  if (t.closest('#dialog')) return;
  if (t.dataset.fuel) return openQuickFuel(t.dataset.fuel);
  if (t.dataset.action==='more'){ driverMore = !driverMore; render(); return; }
  if (t.dataset.action==='loading') return openLoading();
});
const fxCache = {};
async function fxRate(cur, date){
  const k = cur+':'+date;
  if (fxCache[k]) return fxCache[k];
  const {data, error} = await sb.rpc('nbp_rate', {cur, d: date});
  const r = !error && data && data[0] ? {rate: Number(data[0].rate), date: data[0].eff_date, tbl: data[0].tbl} : null;
  if (r) fxCache[k] = r;
  return r;
}
let fxSeq = 0;
async function costFxUi(){
  if (!editing || editing.col!=='costs') return;
  const g = n => $('#f-costs-'+n);
  const ab = g('abroad');
  if (ab && g('currency')){ const w = $('#wrap-costs-currency'); if (w) w.hidden = !ab.checked;
    if (!ab.checked) g('currency').value = 'PLN'; else if (g('currency').value==='PLN') g('currency').value = 'EUR'; }
  const cur = g('currency')?.value || 'PLN', foreign = cur!=='PLN';
  const sel = g('stationSel')?.value;
  const other = $('#wrap-costs-stationOther'); if (other) other.hidden = sel!=='Inna';
  const lab = $('#wrap-costs-amount label'); if (lab) lab.textContent = `Kwota brutto (${cur==='PLN'?'zł':cur}) *`;
  ['fxManual','fxRate'].forEach(k => { const w = $('#wrap-costs-'+k); if (w) w.hidden = !foreign; });
  const man = g('fxManual')?.checked; const wr = $('#wrap-costs-fxRate'); if (wr && foreign) wr.hidden = !man;
  const box = $('#fx-prev'); if (!box) return;
  const amt = Number(String(g('amount')?.value || '').replace(',', '.'));
  if (!foreign){ box.hidden = true; return; }
  box.hidden = false;
  if (man){ const r = Number(String(g('fxRate')?.value || '').replace(',', '.')); box.innerHTML = r > 0 && amt ? `≈ <b>${zl2(amt * r)}</b> · kurs ręczny ${String(r).replace('.', ',')}` : 'Wpisz kurs ręczny.'; return; }
  const date = g('date')?.value || today(); const seq = ++fxSeq;
  box.textContent = 'Pobieranie kursu NBP…';
  const r = await fxRate(cur, date);
  if (seq !== fxSeq) return;
  box.innerHTML = r ? `${amt ? `≈ <b>${zl2(amt * r.rate)}</b> · ` : ''}kurs NBP ${String(r.rate).replace('.', ',')} zł z ${fdate(r.date)} (tabela ${esc(r.tbl || '')})`
    : 'Nie udało się teraz pobrać kursu NBP – baza spróbuje ponownie przy zapisie.';
}
/* Kwota w walucie i kurs – do list kosztów */
const fxNote = c => c.currency && c.currency!=='PLN' && c.amountOrig!=null
  ? `${new Intl.NumberFormat('pl-PL', {style:'currency', currency:c.currency}).format(c.amountOrig)} · kurs ${String(Number(c.fxRate)).replace('.', ',')}${c.fxManual ? ' (ręcznie)' : ' NBP'}` : '';
function openForm(col, id, preset){
  if (id ? !canEditDoc(col, byId(col, id)) : !canCreate(col)) { if (!id) toast('Twoja rola nie pozwala na tę zmianę'); return; }
  if (!id && col==='bookings' && P().bookings==='own' && !myDriverId()){ toast('Kierownik floty musi najpierw powiązać Twoje konto z kierowcą'); return; }
  if ((col==='deadlines'||col==='bookings'||col==='costs'||col==='issues') && !S.vehicles.length){ toast('Najpierw dodaj pojazd'); return; }
  const cfg = FORMS[col];
  const doc = id ? byId(col, id) : {...DEFAULTS[col](), ...(preset||{})};
  editing = {col, id: id||null, base: doc||{}};
  const vw = FORM_VIEW[col] ? FORM_VIEW[col](doc || {}) : doc;
  if ((col==='issues' || col==='serviceEntries') && !id && preset && preset.vehicleId){ const v=byId('vehicles',preset.vehicleId); if (v && v.km) doc.km = v.km; }
  $('#dlg-title').textContent = cfg.title[id?1:0];
  $('#dlg-body').innerHTML = cfg.fields().map(f => {
    if (f.t==='photos') return photoField('f-'+col, (doc && doc.photos) || []);
    if (f.t==='html') return `<div class="field full" id="wrap-${col}-${f.k}">${f.html}</div>`;
    if (f.t==='checks'){ const cur = (vw && vw[f.k]) || [];
      return `<div class="field full" id="wrap-${col}-${f.k}"><span class="label">${esc(f.l)}</span><div class="checks" id="f-${col}-${f.k}">${f.o.map(([val, lab, veh]) => `<label class="check" data-veh="${esc(veh||'')}"><input type="checkbox" value="${esc(val)}" ${cur.includes(val)?'checked':''}> ${esc(lab)}</label>`).join('') || '<span class="muted small">Brak otwartych usterek.</span>'}</div></div>`; }
    if (f.t==='check') return `<div class="field full" id="wrap-${col}-${f.k}"><label class="check"><input id="f-${col}-${f.k}" type="checkbox" ${vw && vw[f.k] ? 'checked' : ''}> ${esc(f.l)}</label></div>`;
    const v = vw?.[f.k] ?? '';
    const fid = 'f-'+col+'-'+f.k;
    let ctrl;
    if (f.t==='select') ctrl = `<select id="${fid}" name="${f.k}" ${f.req?'required':''}>${f.o.map(([val,lab])=>`<option value="${esc(val)}" ${String(val)===String(v)?'selected':''}>${esc(lab)}</option>`).join('')}</select>`;
    else if (f.t==='file') ctrl = `<input id="${fid}" name="${f.k}" type="file" accept="${DOC_TYPES.join(',')}">`;
    else if (f.t==='textarea') ctrl = `<textarea id="${fid}" name="${f.k}">${esc(v)}</textarea>`;
    else ctrl = `<input id="${fid}" name="${f.k}" type="${f.t||'text'}" value="${esc(v)}" ${f.step?`step="${f.step}"`:''} ${f.t==='number'?'inputmode="decimal" min="0"':''} placeholder="${esc(f.ph||f.hint||'')}" ${f.req?'required':''}>`;
    return `<div class="field ${f.full?'full':''}" id="wrap-${col}-${f.k}"><label for="${fid}">${esc(f.l)}${f.req?' *':''}</label>${ctrl}</div>`;
  }).join('') + `<div class="warnline" id="dlg-warn" hidden></div>`;
  const del = $('#dlg-del'); del.hidden = !id; del.classList.remove('armed'); del.textContent='Usuń';
  $('#scrim').hidden = false;
  hydrateFiles($('#dlg-body'));
  setTimeout(()=>{ const first=$('#dlg-body input, #dlg-body select'); first && first.focus(); },20);
  if (col==='bookings') { $('#dialog').addEventListener('input', bookingCheck); bookingCheck(); }
  if (col==='costs' && P().costs==='rw') $('#f-costs-vehicleId')?.addEventListener('change', e => {
    const b = activeBooking(e.target.value); const v = byId('vehicles', e.target.value);
    const d = (b && b.driverId) || (v && v.driverId) || ''; const sel = $('#f-costs-driverId'); if (sel && d) sel.value = d;
  });
  if (col==='costs'){ $('#dialog').addEventListener('input', costFxUi); costFxUi(); }
  if (col==='serviceEntries'){ $('#dialog').addEventListener('input', svcUi); svcUi(); }
  if (col==='deadlines') $('#f-deadlines-type')?.addEventListener('change', e => {
    const d = DL_INTERVALS[e.target.value]; if (!d) return;
    $('#f-deadlines-intervalMonths').value = d[0] ?? ''; $('#f-deadlines-intervalKm').value = d[1] ?? '';
    const rk = $('#f-deadlines-remindKm'); if (rk && !rk.value && e.target.value==='Przegląd gwarancyjny') rk.value = 5000;
  });
}
function bookingCheck(){
  if (!editing || editing.col!=='bookings') return;
  const g = n => $('#f-bookings-'+n)?.value;
  const v=g('vehicleId'), f=g('from'), t=g('to') || f, dr=g('driverId'); const w=$('#dlg-warn');
  let msg='';
  if (f && t && t < f) msg='Data końca jest wcześniejsza niż początek.';
  else if (v && f && t){
    const c = S.bookings.find(b => b.id!==editing.id && !b.returned && b.vehicleId===v && b.from<=t && f<=b.to);
    if (c) msg = 'To auto ma już w tym dniu: '+dName(c.driverId)+(c.from!==c.to ? ' ('+fdate(c.from)+'–'+fdate(c.to)+')' : '')+'.';
  }
  if (!msg && dr && f){
    const c = S.bookings.find(b => b.id!==editing.id && !b.returned && crewOf(b).includes(dr) && b.from<=t && f<=b.to);
    if (c) msg = dName(dr)+' ma już w tym dniu przydział: '+((byId('vehicles', c.vehicleId)||{}).plate||'?')+'.';
  }
  if (!msg && dr && f){   // dokumenty kierowcy ważne w dniu przydziału
    const d = byId('drivers', dr) || {};
    const bad = [['licenseExpiry','prawo jazdy'],['medicalExpiry','badania lekarskie'],['psychExpiry','badania psychologiczne']].filter(([k]) => d[k] && d[k] < f).map(([, l]) => l);
    if (bad.length) msg = `Uwaga: ${dName(dr)} – nieważne ${bad.join(', ')} w dniu ${fdate(f)}. Możesz zapisać – to tylko ostrzeżenie.`;
  }
  if (!msg && v && t && typeof BLOCK_TYPES!=='undefined'){   // przegląd / OC auta ważne przez cały przydział
    const bad = BLOCK_TYPES.map(ty => [ty, S.deadlines.filter(x => x.vehicleId===v && x.type===ty && x.date).reduce((m, x) => !m || x.date > m ? x.date : m, '')]).filter(([, d]) => d && d < t);
    if (bad.length) msg = `Uwaga: ${bad.map(([ty, d]) => `${ty.replace('Ubezpieczenie ', '').toLowerCase().replace('oc', 'OC')} ważne do ${fdate(d)}`).join(', ')} – auto nie może wtedy wyjechać. Odnów termin albo wybierz inne auto.`;
  }
  const co = g('coDriverId');
  if (!msg && co && f){
    const d = byId('drivers', co) || {};
    const bad = [['licenseExpiry','prawo jazdy'],['medicalExpiry','badania lekarskie'],['psychExpiry','badania psychologiczne']].filter(([k]) => d[k] && d[k] < f).map(([, l]) => l);
    if (bad.length) msg = `Uwaga: ${dName(co)} (drugi kierowca) – nieważne ${bad.join(', ')} w dniu ${fdate(f)}.`;
  }
  const r = routeById(g('routeId')), veh = byId('vehicles', v);
  if (!msg && r && r.tacho && veh && !veh.hasTacho) msg = `Uwaga: trasa ${r.code} wymaga tachografu, a ${veh.plate} nie ma tachografu. Możesz zapisać – to tylko informacja.`;
  w.textContent=msg; w.hidden=!msg;
}
function closeForm(){ $('#scrim').hidden = true; $('#dialog').classList.remove('dlg-wide'); editing = null; $('#dlg-save').textContent = 'Zapisz'; $('#dialog').removeEventListener('input', bookingCheck); $('#dialog').removeEventListener('input', costFxUi); $('#dialog').removeEventListener('input', svcUi); }

$('#dialog').addEventListener('submit', async e => {
  e.preventDefault();
  if (!editing || !db) { if(!db) toast('Baza danych jest niedostępna'); return; }
  if (editing.special) return editing.special();
  const {col, id, base} = editing;
  const fields = FORMS[col].fields();
  const data = {...base}; delete data.id;
  let file = null;
  for (const f of fields){
    const el = $('#f-'+col+'-'+f.k);
    if (f.t==='photos' || f.t==='html') continue;
    if (f.t==='checks'){ data[f.k] = [...el.querySelectorAll('input:checked')].map(i => i.value); continue; }
    if (f.t==='check'){ data[f.k] = !!el.checked; continue; }
    if (f.t==='file'){ file = el.files && el.files[0]; if (f.req && !file){ toast('Wybierz plik do wgrania'); return; } continue; }
    let v = el.value.trim();
    if (f.req && !v){ el.focus(); toast('Uzupełnij pole: '+f.l); return; }
    if (f.t==='number') v = v==='' ? null : Number(v.replace(',','.'));
    if (f.k==='plate') v = v.toUpperCase();
    data[f.k] = v;
  }
  if (col==='bookings' && !fields.some(f => f.k==='to')) data.to = data.from;
  if (col==='bookings' && data.to < data.from){ toast('Data końca jest przed początkiem'); return; }
  if (col==='bookings' && data.coDriverId && data.coDriverId===data.driverId){ toast('Drugi kierowca musi być inną osobą'); return; }
  if (col==='vehicles'){
    if (data.tireSize) data.tireSize = normTireSize(data.tireSize);
    if ((data.consGood && !data.consOk) || (!data.consGood && data.consOk)){ const w = $('#dlg-warn'); w.textContent = 'Podaj oba progi spalania albo żaden.'; w.hidden = false; return; }
    if (data.consGood && data.consOk && data.consGood >= data.consOk){ const w = $('#dlg-warn'); w.textContent = 'Próg „bardzo dobre” musi być niższy niż próg „dobre”.'; w.hidden = false; return; }
  }
  const asDriver = col==='costs' && (P().costs==='own' || !!base.mode);
  if (col==='costs'){
    data.station = data.stationSel==='Inna' ? (data.stationOther || 'Inna') : (data.stationSel || null);
    delete data.stationSel; delete data.stationOther; delete data.fxPrev; delete data.abroad;
    data.currency = data.currency || 'PLN';
    if (data.currency!=='PLN'){
      if (data.fxManual && !(data.fxRate > 0)){ const w = $('#dlg-warn'); w.textContent = 'Wpisz kurs ręczny albo odznacz „Kurs wpisuję ręcznie”.'; w.hidden = false; $('#f-costs-fxRate')?.focus(); return; }
      data.amountOrig = data.amount;
      const est = data.fxManual ? data.fxRate : (fxCache[data.currency+':'+data.date] || {}).rate;
      data.amount = est ? Math.round(data.amount * est * 100) / 100 : 0;   // dokładną kwotę w zł policzy baza z kursu NBP
    } else { data.amountOrig = null; data.fxManual = false; }
    if (asDriver && myDriverId()) data.driverId = myDriverId();
    // podwójna obsada: tankowanie w trakcie wspólnego dnia pracy potwierdza drugi kierowca
    if (asDriver && FUEL_CATS.includes(data.category) && !id){
      const act = S.bookings.find(b => holds(b) && !b.returned && b.coDriverId && b.vehicleId===data.vehicleId && crewOf(b).includes(myDriverId()));
      if (act){ data.coDriverId = act.driverId===myDriverId() ? act.coDriverId : act.driverId; data.confirmStatus = 'pending'; }
    }
    if (FUEL_CATS.includes(data.category)){
      const w = $('#dlg-warn');
      if (!data.odometer){ w.textContent = 'Przy tankowaniu wpisz stan licznika – bez niego nie policzymy kilometrów ani spalania.'; w.hidden = false; $('#f-costs-odometer').focus(); return; }
      if (!data.liters){ w.textContent = 'Wpisz ilość zatankowanego paliwa (l) lub energii (kWh).'; w.hidden = false; $('#f-costs-liters').focus(); return; }
      const chk = odoInputCheck(data.odometer, lastRealKm(data.vehicleId, data.date, id));
      if (chk && chk.hard){ w.textContent = chk.hard; w.hidden = false; $('#f-costs-odometer').focus(); return; }
      if (chk && chk.soft && w.dataset.big!==String(data.odometer)){ w.dataset.big = String(data.odometer); w.textContent = chk.soft; w.hidden = false; return; }
    }
    if (col==='costs' && editing.receipt && !(base.photos||[]).length && !($('#f-costs-photos')?.files||[]).length){ const w = $('#dlg-warn'); w.textContent = 'Dziś wylosowano Cię do kontroli paragonów – dodaj zdjęcie paragonu.'; w.hidden = false; return; }

  }
  data.updatedAt = new Date().toISOString();
  if (!id && myId) data.createdBy = myId;
  if (myId) data.updatedBy = myId;
  const btn = $('#dlg-save'); btn.disabled = true;
  if (col==='docs' && !id) data.vehicleId = data.vehicleId || cardId;
  try {
    if (file){
      try { const up = await uploadDocFile(file); data.assetId = up.id; data.contentType = up.contentType; data.size = up.sizeBytes; data.fileName = file.name; }
      catch(err){ toast(err.code==='bad_type' ? 'Dozwolone są pliki PDF i zdjęcia (JPG, PNG, WebP)' : err.code==='too_big' ? 'Plik jest większy niż 20 MB' : err.code==='no_assets' || err.code==='not_granted' ? 'Pliki mogą dodawać osoby z poziomem Edytor' : 'Nie udało się wgrać pliku'); return; }
    }
    if (col==='costs' && base.mode){ try { localStorage.setItem(FUEL_PREFS, JSON.stringify({currency: data.currency, station: base.mode==='quick' ? data.station || '' : fuelPrefs().station || ''})); } catch(_){} }
    if (col==='costs' && !id && P().costs==='own' && !navigator.onLine){ await queueOffline('cost', {data}, filesOf('f-costs')); closeForm(); toast('Brak zasięgu – zapisze się samo po odzyskaniu sieci'); return; }
    if (fields.some(f => f.t==='photos')){
      const ids = await uploadPhotos('f-'+col, (data.photos||[]).length);
      if (ids === null) return;
      data.photos = [...(data.photos||[]), ...ids];
    }
    if (col==='tires'){
      if (data.location==='na_aucie' && !data.vehicleId){ const w = $('#dlg-warn'); if (w){ w.textContent = 'Komplet „na aucie” musi mieć wybrane auto.'; w.hidden = false; } return; }
      // na auto zakładamy nowy komplet → poprzedni z tego auta schodzi do magazynu
      if (data.location==='na_aucie') for (const o of S.tires.filter(x => x.vehicleId===data.vehicleId && x.location==='na_aucie' && x.id!==id)) await db.collection('tires').doc(o.id).update({location:'magazyn'});
      if (data.size) data.size = normTireSize(data.size);
      // auto bez wpisanego rozmiaru dostaje rozmiar z kompletu
      const tv = data.vehicleId && byId('vehicles', data.vehicleId);
      if (tv && data.size && !tv.tireSize && tireSizeOn() && P().vehicles==='rw') await db.collection('vehicles').doc(tv.id).update({tireSize: data.size}).catch(() => {});
    }
    const repeatUntil = data.repeatUntil; delete data.repeatUntil;
    let rn = null;
    if (col==='deadlines' && editing.renew && $('#rn-date')){
      const kmv = Number(String($('#rn-km').value).replace(/\s/g, '')) || null, dd = $('#rn-date').value || today();
      if (dd > today()) throw Object.assign(new Error('Data wykonania nie może być w przyszłości.'), {code: 'check'});
      if (editing.renew.kmStep && !kmv) throw Object.assign(new Error('Wpisz, przy jakim przebiegu wykonano – od niego liczymy kolejny termin.'), {code: 'check'});
      rn = {...editing.renew, date: dd, km: kmv, svc: !!($('#rn-svc') && $('#rn-svc').checked)};
      data.note = renewNote(data.note, dd, kmv);
    }
    const ref = id ? db.collection(col).doc(id) : db.collection(col).doc();
    await ref.set(data);
    let okMsg = '';
    if (col==='bookings' && !id && repeatUntil && repeatUntil > data.from){   // ten sam przydział w kolejne dni robocze (bez sobót, niedziel i zajętych dni)
      let made = 0, skip = 0;
      for (let d = addDays(data.from, 1); d <= repeatUntil && made < 60; d = addDays(d, 1)){
        const wd = parse(d).getDay(); if (wd===0 || wd===6) continue;
        const crew = [data.driverId, data.coDriverId].filter(Boolean);
        if (S.bookings.some(b => b.from<=d && b.to>=d && !b.returned && (b.vehicleId===data.vehicleId || crewOf(b).some(x => crew.includes(x))))){ skip++; continue; }
        await db.collection('bookings').doc().set({...data, from: d, to: d}); made++;
      }
      okMsg = `Zapisano przydział i ${made} ${isPlural(made,'kolejny dzień','kolejne dni','kolejnych dni')}${skip ? ` (pominięto ${skip} – zajęte)` : ''}`;
    }
    if (col==='vehicles' && data.applyModel && data.consGood && data.consOk){
      const same = S.vehicles.filter(v => v.id!==ref.id && String(v.make).trim().toUpperCase()===String(data.make).trim().toUpperCase() && String(v.model).trim().toUpperCase()===String(data.model).trim().toUpperCase());
      for (const v of same) await db.collection('vehicles').doc(v.id).update({consGood: data.consGood, consOk: data.consOk});
      if (same.length) okMsg = `Zapisano – poziomy spalania ustawione także dla ${same.length} ${isPlural(same.length,'auta','aut','aut')} ${data.make} ${data.model}`;
    }
    if (col==='serviceEntries'){ await Promise.all(['costs','issues','deadlines','vehicles'].map(refresh)); okMsg = 'Zapisano wpis serwisowy'; }
    if (rn){ okMsg = 'Zapisano kolejny termin' + await renewAfterSave(rn, ref.id); }
    if (col==='costs' && data.confirmStatus==='pending') okMsg = 'Zapisano – tankowanie czeka na potwierdzenie drugiego kierowcy';
    if (col==='costs' && data.odometer){
      const v = byId('vehicles', data.vehicleId);
      if (v && (!v.km || data.odometer > v.km)) await refresh('vehicles');   // przebieg podnosi baza (wyzwalacz)
    }
    closeForm(); toast(okMsg || (id ? 'Zapisano zmiany' : 'Dodano'));
  } catch(err){
    if (col==='costs' && !id && P().costs==='own' && isNetErr(err)){ await queueOffline('cost', {data}, filesOf('f-costs')); closeForm(); toast('Brak zasięgu – zapisze się samo po odzyskaniu sieci'); return; }
    handleWriteErr(err);
  }
  finally { btn.disabled = false; }
});
$('#dlg-del').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Na pewno usunąć?'; return; }
  if (!editing || !db) return;
  try {
    const doc = byId(editing.col, editing.id);
    await db.collection(editing.col).doc(editing.id).delete();
    if (editing.col==='docs' && doc && doc.assetId && assetsNS) assetsNS.delete(doc.assetId).catch(()=>{});
    if (editing.col==='vehicles' && cardId===editing.id) cardId = null;
    closeForm(); toast('Usunięto');
  }
  catch(err){ handleWriteErr(err); }
});
function handleWriteErr(err){
  const w = $('#dlg-warn');
  if (err && (err.code==='check' || err.code==='duplicate')){ if (w && !$('#scrim').hidden){ w.textContent = err.message; w.hidden = false; } else toast(err.message); return; }
  if (err && err.code==='invalid_argument'){ closeForm(); render(); toast('Twoja rola nie pozwala na tę zmianę'); }
  else if (err && err.code==='quota_exceeded') toast('Baza jest pełna – usuń stare wpisy, aby dodać nowe');
  else toast('Nie udało się zapisać. Spróbuj ponownie.');
}
$('#dialog').addEventListener('click', e => {
  if (e.target.closest('[data-action="import-template"]')) return importTemplate();
  const rm = e.target.closest('[data-rmphoto]'); if (!rm || !editing) return;
  editing.base = {...editing.base, photos: (editing.base.photos||[]).filter(p => p !== rm.dataset.rmphoto)};
  rm.closest('.thumb-edit').remove();
});
$('#scrim').addEventListener('click', e => { if (e.target.id==='scrim' || e.target.closest('[data-action="close"]')) closeForm(); });
document.addEventListener('keydown', e => { if (e.key==='Escape' && !$('#scrim').hidden) closeForm(); });


/* Nowy przydział: po wyborze kierowcy podpowiadamy jego auto (odpowiedzialny albo ostatnio jeżdżone, jeśli wolne) i ostatnią trasę */
document.addEventListener('change', e => {
  if (e.target.id!=='f-bookings-driverId' || !editing || editing.col!=='bookings' || editing.id) return;
  const dr = e.target.value; if (!dr) return;
  const vSel = $('#f-bookings-vehicleId'), rSel = $('#f-bookings-routeId');
  const f = $('#f-bookings-from')?.value || today(), t = $('#f-bookings-to')?.value || f;
  const free = vid => { const v = byId('vehicles', vid); return v && v.status==='aktywny' && vehicleState(v).cls!=='bad' && !S.bookings.some(b => !b.returned && b.vehicleId===vid && b.from<=t && f<=b.to); };
  const past = S.bookings.filter(b => crewOf(b).includes(dr)).sort((a, b) => b.from.localeCompare(a.from));
  const hint = [];
  if (vSel && !vSel.value){
    const resp = S.vehicles.filter(v => respOf(v).includes(dr)).map(v => v.id);
    const cand = [...resp, ...past.map(b => b.vehicleId)].find(free);
    if (cand && [...vSel.options].some(o => o.value===cand)){ vSel.value = cand; hint.push(`auto ${byId('vehicles', cand).plate}`); }
  }
  if (rSel && !rSel.value && past[0] && past[0].routeId && [...rSel.options].some(o => o.value===past[0].routeId)){ rSel.value = past[0].routeId; hint.push(`trasa ${rCode(past[0].routeId)}`); }
  if (hint.length){ toast('Podpowiedź: ' + hint.join(', ') + ' – możesz zmienić'); bookingCheck(); }
});
