/* Emage FLEET — formularz: okno dodawania i edycji wpisów */
'use strict';
/* ---------- forms ---------- */
const vehOpts = () => [['','— wybierz pojazd —'], ...S.vehicles.slice().sort((a,b)=>String(a.plate).localeCompare(b.plate)).map(v => [v.id, v.plate+' · '+v.make+' '+v.model])];
/* Nieaktywni kierowcy nie pojawiają się w wyborze – chyba że są już wpisani w edytowanym wpisie */
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
    {k:'vin',l:'VIN',ph:'17 znaków'},
    {k:'policyNo',l:'Numer polisy',ph:'np. 123/2026'},
    {k:'driverId',l:'Stały kierowca',t:'select',o:drvOpts()},
    {k:'status',l:'Status',t:'select',o:[['aktywny','Aktywny'],['serwis','W serwisie'],['wycofany','Wycofany']]},
    {k:'monthlyLimit',l:'Limit kosztów / mies. (zł)',t:'number',ph:'np. 2500'},
    {k:'consGood',l:'Spalanie bardzo dobre – do (l/100 km)',t:'number',step:'0.1',ph:'np. 9,5'},
    {k:'consOk',l:'Spalanie dobre – do (l/100 km)',t:'number',step:'0.1',ph:'np. 11,0 (powyżej = słabe)'},
    {k:'applyModel',l:'Zastosuj te poziomy spalania do wszystkich aut tego samego modelu',t:'check'},
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
    {k:'note',l:'Notatka',ph:'np. polisa nr, warsztat',full:1},
  ]},
  bookings: { title:['Nowa rezerwacja','Edytuj rezerwację'], fields: () => [
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'driverId',l:'Kierowca',t:'select',o: P().bookings==='own' ? drvOpts('— wybierz kierowcę —').filter(([id])=>id===myDriverId()) : drvOpts('— wybierz kierowcę —'),req:1,full:1},
    {k:'from',l:'Od',t:'date',req:1},
    {k:'to',l:'Do',t:'date',req:1},
    ...(P().bookings==='rw' ? [{k:'routeId',l:'Trasa',t:'select',o:routeOpts(),full:1}] : []),
    {k:'purpose',l:'Cel / uwagi',full:1,ph:'np. Klient w Gnieźnie'},
  ]},
  costs: { title:['Nowy koszt','Edytuj koszt'], fields: () => [
    {k:'date',l:'Data',t:'date',req:1},
    {k:'category',l:'Kategoria',t:'select',o:(P().costs==='own'?DRIVER_CATS:COST_CATS).map(c=>[c,c]),req:1},
    {k:'vehicleId',l:'Pojazd',t:'select',o:vehOpts(),req:1,full:1},
    {k:'amount',l:'Kwota brutto (zł)',t:'number',step:'0.01',req:1},
    {k:'liters',l:'Ilość (l / kWh)',t:'number',step:'0.01',hint:'dla paliwa i ładowania'},
    {k:'odometer',l:'Stan licznika (km) – wymagany przy tankowaniu',t:'number'},
    {k:'full',l:'Zatankowano do pełna (naładowano do 100%)',t:'check'},
    ...(P().costs==='rw' ? [{k:'driverId',l:'Kierowca',t:'select',o:drvOpts('— nie dotyczy —')}] : []),
    {k:'note',l:'Opis',ph:'np. stacja, faktura nr'},
    {k:'photos',t:'photos'},
  ]},
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
  routes: { title:['Nowa trasa','Edytuj trasę'], fields: () => [
    {k:'code',l:'Kod',req:1,ph:'np. R12'},
    {k:'name',l:'Nazwa',req:1,ph:'np. Wrocław – Praga'},
    {k:'tacho',l:'Wymaga tachografu (tylko informacja)',t:'check'},
    {k:'loading',l:'Trasa załadunkowa',t:'check'},
    {k:'active',l:'Aktywna (można ją przypisywać)',t:'check'},
    {k:'note',l:'Notatka',t:'textarea',full:1},
  ]},
  docs: { title:['Dodaj dokument','Edytuj dokument'], fields: () => [
    {k:'kind',l:'Rodzaj',t:'select',o:DOC_KINDS.map(k=>[k,k]),req:1},
    {k:'validUntil',l:'Ważny do',t:'date'},
    {k:'name',l:'Opis',full:1,ph:'np. polisa nr 123/2026'},
    ...(editing && editing.id ? [] : [{k:'file',l:'Plik (PDF lub zdjęcie, do 20 MB)',t:'file',req:1,full:1}]),
  ]},
};
const DEFAULTS = {
  vehicles: () => ({status:'aktywny', fuel:'Diesel'}),
  drivers: () => ({active:true}),
  routes: () => ({active:true}),
  deadlines: () => ({type:'Przegląd techniczny', date: addDays(today(),30), intervalMonths:12}),
  bookings: () => ({from: today(), to: today(), driverId: P().bookings==='own' ? myDriverId() : ''}),
  costs: () => {
    const base = {date: today(), category:'Paliwo', full:true};
    if (P().costs==='own'){
      const me = myDriverId();
      const b = me && S.bookings.find(x => x.driverId===me && !x.returned && (x.pickup || (x.from<=today() && x.to>=today())));
      const v = b ? byId('vehicles', b.vehicleId) : S.vehicles.find(x => x.driverId===me && x.status!=='wycofany');
      return {...base, vehicleId: v ? v.id : '', driverId: me};
    }
    return base;
  },
  issues: () => ({date: today(), severity:'istotna', status:'nowe'}),
  docs: () => ({kind:'Dowód rejestracyjny'}),
};
let editing = null;
function openForm(col, id, preset){
  if (id ? !canEditDoc(col, byId(col, id)) : !canCreate(col)) { if (!id) toast('Twoja rola nie pozwala na tę zmianę'); return; }
  if (!id && col==='bookings' && P().bookings==='own' && !myDriverId()){ toast('Kierownik floty musi najpierw powiązać Twoje konto z kierowcą'); return; }
  if ((col==='deadlines'||col==='bookings'||col==='costs'||col==='issues') && !S.vehicles.length){ toast('Najpierw dodaj pojazd'); return; }
  const cfg = FORMS[col];
  const doc = id ? byId(col, id) : {...DEFAULTS[col](), ...(preset||{})};
  editing = {col, id: id||null, base: doc||{}};
  if (col==='issues' && !id && preset && preset.vehicleId){ const v=byId('vehicles',preset.vehicleId); if (v && v.km) doc.km = v.km; }
  $('#dlg-title').textContent = cfg.title[id?1:0];
  $('#dlg-body').innerHTML = cfg.fields().map(f => {
    if (f.t==='photos') return photoField('f-'+col, (doc && doc.photos) || []);
    if (f.t==='check') return `<div class="field full"><label class="check"><input id="f-${col}-${f.k}" type="checkbox" ${doc && doc[f.k] ? 'checked' : ''}> ${esc(f.l)}</label></div>`;
    const v = doc?.[f.k] ?? '';
    const fid = 'f-'+col+'-'+f.k;
    let ctrl;
    if (f.t==='select') ctrl = `<select id="${fid}" name="${f.k}" ${f.req?'required':''}>${f.o.map(([val,lab])=>`<option value="${esc(val)}" ${String(val)===String(v)?'selected':''}>${esc(lab)}</option>`).join('')}</select>`;
    else if (f.t==='file') ctrl = `<input id="${fid}" name="${f.k}" type="file" accept="${DOC_TYPES.join(',')}">`;
    else if (f.t==='textarea') ctrl = `<textarea id="${fid}" name="${f.k}">${esc(v)}</textarea>`;
    else ctrl = `<input id="${fid}" name="${f.k}" type="${f.t||'text'}" value="${esc(v)}" ${f.step?`step="${f.step}"`:''} ${f.t==='number'?'inputmode="decimal" min="0"':''} placeholder="${esc(f.ph||f.hint||'')}" ${f.req?'required':''}>`;
    return `<div class="field ${f.full?'full':''}"><label for="${fid}">${esc(f.l)}${f.req?' *':''}</label>${ctrl}</div>`;
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
  if (col==='deadlines') $('#f-deadlines-type')?.addEventListener('change', e => {
    const d = DL_INTERVALS[e.target.value]; if (!d) return;
    $('#f-deadlines-intervalMonths').value = d[0] ?? ''; $('#f-deadlines-intervalKm').value = d[1] ?? '';
  });
}
function bookingCheck(){
  if (!editing || editing.col!=='bookings') return;
  const g = n => $('#f-bookings-'+n)?.value;
  const v=g('vehicleId'), f=g('from'), t=g('to'); const w=$('#dlg-warn');
  let msg='';
  if (f && t && t < f) msg='Data końca jest wcześniejsza niż początek.';
  else if (v && f && t){
    const c = S.bookings.find(b => b.id!==editing.id && !b.returned && b.vehicleId===v && b.from<=t && f<=b.to);
    if (c) msg = 'Ten pojazd jest już zarezerwowany '+fdate(c.from)+'–'+fdate(c.to)+' ('+dName(c.driverId)+').';
  }
  w.textContent=msg; w.hidden=!msg;
}
function closeForm(){ $('#scrim').hidden = true; editing = null; $('#dlg-save').textContent = 'Zapisz'; $('#dialog').removeEventListener('input', bookingCheck); }

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
    if (f.t==='photos') continue;
    if (f.t==='check'){ data[f.k] = !!el.checked; continue; }
    if (f.t==='file'){ file = el.files && el.files[0]; if (f.req && !file){ toast('Wybierz plik do wgrania'); return; } continue; }
    let v = el.value.trim();
    if (f.req && !v){ el.focus(); toast('Uzupełnij pole: '+f.l); return; }
    if (f.t==='number') v = v==='' ? null : Number(v.replace(',','.'));
    if (f.k==='plate') v = v.toUpperCase();
    data[f.k] = v;
  }
  if (col==='bookings' && data.to < data.from){ toast('Data końca jest przed początkiem'); return; }
  if (col==='vehicles'){
    if ((data.consGood && !data.consOk) || (!data.consGood && data.consOk)){ const w = $('#dlg-warn'); w.textContent = 'Podaj oba progi spalania albo żaden.'; w.hidden = false; return; }
    if (data.consGood && data.consOk && data.consGood >= data.consOk){ const w = $('#dlg-warn'); w.textContent = 'Próg „bardzo dobre” musi być niższy niż próg „dobre”.'; w.hidden = false; return; }
  }
  if (col==='costs'){
    if (P().costs==='own' && myDriverId()) data.driverId = myDriverId();
    // podwójna obsada: tankowanie w trakcie wspólnego dnia pracy potwierdza drugi kierowca
    if (P().costs==='own' && FUEL_CATS.includes(data.category) && !id){
      const act = S.bookings.find(b => holds(b) && !b.returned && b.coDriverId && b.vehicleId===data.vehicleId && crewOf(b).includes(myDriverId()));
      if (act){ data.coDriverId = act.driverId===myDriverId() ? act.coDriverId : act.driverId; data.confirmStatus = 'pending'; }
    }
    if (FUEL_CATS.includes(data.category)){
      const w = $('#dlg-warn');
      if (!data.odometer){ w.textContent = 'Przy tankowaniu wpisz stan licznika – bez niego nie policzymy kilometrów ani spalania.'; w.hidden = false; $('#f-costs-odometer').focus(); return; }
      if (!data.liters){ w.textContent = 'Wpisz ilość zatankowanego paliwa (l) lub energii (kWh).'; w.hidden = false; $('#f-costs-liters').focus(); return; }
      const prob = odometerProblem(data.vehicleId, data.date, data.odometer, id);
      if (prob){ w.textContent = prob; w.hidden = false; $('#f-costs-odometer').focus(); return; }
    }
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
    if (fields.some(f => f.t==='photos')){
      const ids = await uploadPhotos('f-'+col, (data.photos||[]).length);
      if (ids === null) return;
      data.photos = [...(data.photos||[]), ...ids];
    }
    const ref = id ? db.collection(col).doc(id) : db.collection(col).doc();
    await ref.set(data);
    let okMsg = '';
    logChange(editing && editing.renew ? 'done' : id ? 'edit' : 'add', col, {...data, id: ref.id});
    if (col==='vehicles' && data.applyModel && data.consGood && data.consOk){
      const same = S.vehicles.filter(v => v.id!==ref.id && String(v.make).trim().toUpperCase()===String(data.make).trim().toUpperCase() && String(v.model).trim().toUpperCase()===String(data.model).trim().toUpperCase());
      for (const v of same) await db.collection('vehicles').doc(v.id).update({consGood: data.consGood, consOk: data.consOk});
      if (same.length) okMsg = `Zapisano – poziomy spalania ustawione także dla ${same.length} ${isPlural(same.length,'auta','aut','aut')} ${data.make} ${data.model}`;
    }
    if (col==='costs' && data.confirmStatus==='pending') okMsg = 'Zapisano – tankowanie czeka na potwierdzenie drugiego kierowcy';
    if (col==='costs' && data.odometer){
      const v = byId('vehicles', data.vehicleId);
      if (v && (!v.km || data.odometer > v.km)) await refresh('vehicles');   // przebieg podnosi baza (wyzwalacz)
    }
    closeForm(); toast(okMsg || (id ? 'Zapisano zmiany' : 'Dodano'));
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
});
$('#dlg-del').addEventListener('click', async e => {
  const b = e.currentTarget;
  if (!b.classList.contains('armed')){ b.classList.add('armed'); b.textContent='Na pewno usunąć?'; return; }
  if (!editing || !db) return;
  try {
    const doc = byId(editing.col, editing.id);
    await db.collection(editing.col).doc(editing.id).delete();
    logChange('delete', editing.col, doc);
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

