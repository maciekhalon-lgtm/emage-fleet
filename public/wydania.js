/* Emage FLEET — wydania: przejęcie auta (checklista, przebieg, paliwo) i zdanie pojazdu */
'use strict';
const FUEL_LV = [['0','Rezerwa'],['25','1/4'],['50','1/2'],['75','3/4'],['100','Pełny']];
const fuelLabel = v => (FUEL_LV.find(x => x[0]===String(v)) || [,'—'])[1];
const DEFAULT_CHECKLIST = ['Opony (stan, ciśnienie)', 'Światła i kierunkowskazy', 'Płyny (olej, chłodzący, spryskiwacze)', 'Szyby i wycieraczki', 'Nadwozie bez nowych uszkodzeń', 'Czystość wnętrza', 'Dokumenty (dowód rejestracyjny, OC)', 'Gaśnica', 'Trójkąt ostrzegawczy', 'Apteczka', 'Kamizelka odblaskowa'];
const checklistItems = () => { const s = S.settings.find(x => x.id==='checklist'); return (s && Array.isArray(s.items) && s.items.length) ? s.items : DEFAULT_CHECKLIST; };

/* Ostatni znany stan licznika auta (z ewidencji, tankowań i wydań). */
function lastKm(vehId){
  const v = byId('vehicles', vehId);
  const xs = [Number((v && v.km) || 0)];
  S.bookings.forEach(b => { if (b.vehicleId!==vehId) return; if (b.pickup) xs.push(Number(b.pickup.km)); if (b.returned) xs.push(Number(b.returned.km)); });
  return Math.max(...xs);
}

function handoverBtn(b){
  if (!canEditDoc('bookings', b) || b.returned) return '';
  if (b.pickup) return `<button class="small primary" data-ho="return" data-id="${esc(b.id)}">Zdaj pojazd</button>`;
  if (b.from <= addDays(today(), 1) && b.to >= today()) return `<button class="small" data-ho="pickup" data-id="${esc(b.id)}">Przyjmij auto</button>`;
  return '';
}
function checklistSummary(list){
  if (!list || !list.length) return '';
  const bad = list.filter(x => !x.ok);
  return bad.length
    ? `<span class="sub" style="color:var(--warn)">Checklista: ${list.length - bad.length}/${list.length} OK · ${bad.map(x => esc(x.item)+(x.note?' – '+esc(x.note):'')).join('; ')}</span>`
    : `<span class="sub">Checklista: wszystko OK (${list.length})</span>`;
}
function handoverInfo(b){
  const p = b.pickup, r = b.returned;
  if (!p) return '';
  const dist = r && r.km && p.km ? r.km - p.km : null;
  return `<span class="sub num">Przejęto ${fdate(p.at)} · ${km(p.km)} · paliwo ${fuelLabel(p.fuel)}${r?` → zdano ${fdate(r.at)} · ${km(r.km)} · paliwo ${fuelLabel(r.fuel)}${dist!==null?` · <b>${new Intl.NumberFormat('pl-PL').format(dist)} km</b>`:''}`:''}</span>`
    + checklistSummary(p.checklist)
    + (r && r.note ? `<span class="sub">Uwagi przy zdaniu: ${esc(r.note)}</span>` : p.note ? `<span class="sub">Uwagi przy przejęciu: ${esc(p.note)}</span>` : '')
    + photoStrip([...(p.photos||[]), ...((r&&r.photos)||[])]);
}

/* Okno przejęcia albo zdania auta.
   kind = 'pickup' | 'return'; id = rezerwacja; dla przejęcia wolnego auta id = null i vehicleId = auto. */
function openHandover(id, kind, vehicleId){
  const b = id ? byId('bookings', id) : null;
  if (b && !canEditDoc('bookings', b)) return;
  const vid = b ? b.vehicleId : vehicleId;
  const v = byId('vehicles', vid); if (!v) return;
  const ev = v.fuel==='Elektryczny';
  const minKm = kind==='return' ? Math.max((b && b.pickup && b.pickup.km) || 0, 0) : lastKm(vid);
  const items = checklistItems();
  editing = {col:'handover', id: id || null, base:{}, special: () => saveHandover({id, kind, vehicleId: vid, minKm, items})};
  $('#dlg-title').textContent = kind==='pickup' ? 'Przejęcie auta' : 'Zdanie pojazdu';
  const check = kind==='pickup' ? `<div class="field full"><span class="label">Checklista</span><div class="checklist">${items.map((it, i) => `
      <div class="ck" data-ck="${i}"><span class="ck-name">${esc(it)}</span>
        <span class="ck-btns"><label><input type="radio" name="ck-${i}" value="ok" checked> OK</label><label><input type="radio" name="ck-${i}" value="bad"> Uwaga</label></span>
        <input class="ck-note" id="ck-note-${i}" type="text" placeholder="Co jest nie tak?" hidden></div>`).join('')}</div>
      <span class="muted small">Punkt z uwagą trafi do serwisu jako zgłoszenie usterki.</span></div>` : '';
  $('#dlg-body').innerHTML = `
    <div class="field full"><span class="ho-car">${plate(v.plate)} <b>${esc(v.make)} ${esc(v.model)}</b></span>
      ${b ? `<span class="muted">${esc(dName(b.driverId))} · ${fdate(b.from)}${b.to!==b.from?'–'+fdate(b.to):''}${b.purpose?' · '+esc(b.purpose):''}</span>` : '<span class="muted">Auto na dzisiejszy dzień pracy</span>'}</div>
    <div class="field"><label for="ho-km">Stan licznika (km) *</label><input id="ho-km" type="number" inputmode="numeric" min="${minKm}" placeholder="${minKm ? 'co najmniej '+new Intl.NumberFormat('pl-PL').format(minKm) : ''}" required><span class="muted small">Ostatni zapis: ${km(minKm)}</span></div>
    <div class="field"><label for="ho-fuel">${ev?'Poziom baterii':'Poziom paliwa'} *</label><select id="ho-fuel">${FUEL_LV.map(([k,l]) => `<option value="${k}" ${k==='100'?'selected':''}>${ev && k!=='0' ? k+'%' : l}</option>`).join('')}</select></div>
    ${kind==='pickup' ? crewField(b ? b.driverId : myDriverId(), b && b.coDriverId) : (b && b.coDriverId ? `<div class="field full"><span class="pill info">Podwójna obsada: ${esc(crewName(b))}</span><span class="muted small">Zdanie musi potwierdzić drugi kierowca – do tego czasu auto czeka.</span></div>` : '')}
    ${check}
    <div class="field full"><label for="ho-note">${kind==='pickup' ? 'Inne uwagi o stanie auta' : 'Uwagi po dniu pracy'}</label><textarea id="ho-note" placeholder="${kind==='pickup'?'np. rysa na tylnym zderzaku – już była':'np. kontrolka oleju, stuki z zawieszenia'}"></textarea></div>
    ${photoField('ho')}
    ${kind==='return' ? `<div class="field full"><label class="check"><input id="ho-issue" type="checkbox"> Zgłoś usterkę na podstawie uwag</label>
      <select id="ho-sev" aria-label="Waga usterki"><option value="drobna">Drobna</option><option value="istotna" selected>Istotna</option><option value="stop">Auto niesprawne – nie wydawać</option></select></div>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = kind==='pickup' ? 'Przyjmij auto' : 'Zdaj pojazd';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  setTimeout(() => $('#ho-km')?.focus(), 20);
}
document.addEventListener('change', e => {
  const r = e.target.closest('.ck input[type=radio]'); if (!r) return;
  const row = r.closest('.ck'), note = row.querySelector('.ck-note');
  note.hidden = r.value!=='bad'; row.classList.toggle('bad', r.value==='bad');
  if (r.value==='bad') note.focus();
});

/* Wybór drugiego kierowcy (podwójna obsada) przy przejęciu */
function crewField(mainDriver, current){
  const busy = new Set(S.bookings.filter(holds).flatMap(crewOf));
  const opts = S.drivers.filter(d => d.id!==mainDriver && (!busy.has(d.id) || d.id===current)).sort((a, c) => a.name.localeCompare(c.name, 'pl'));
  return `<div class="field full"><label class="check"><input id="ho-crew" type="checkbox" ${current?'checked':''}> Podwójna obsada (drugi kierowca jedzie razem)</label>
    <select id="ho-co" ${current?'':'hidden'} aria-label="Drugi kierowca"><option value="">— wybierz drugiego kierowcę —</option>${opts.map(d => `<option value="${esc(d.id)}" ${d.id===current?'selected':''}>${esc(d.name)}</option>`).join('')}</select>
    <span class="muted small" id="ho-crew-info" ${current?'':'hidden'}>Drugi kierowca potwierdzi u siebie przejęcie, tankowania i zdanie pojazdu.</span></div>`;
}
document.addEventListener('change', e => {
  if (e.target.id!=='ho-crew') return;
  $('#ho-co').hidden = !e.target.checked; $('#ho-crew-info').hidden = !e.target.checked;
  if (e.target.checked) $('#ho-co').focus();
});

async function saveHandover({id, kind, vehicleId, minKm, items}){
  const w = $('#dlg-warn');
  const warn = t => { w.textContent = t; w.hidden = false; };
  const crew = kind==='pickup' && $('#ho-crew') && $('#ho-crew').checked;
  const coDriverId = crew ? ($('#ho-co').value || '') : null;
  if (crew && !coDriverId){ $('#ho-co').focus(); return warn('Wybierz drugiego kierowcę albo odznacz „Podwójna obsada”.'); }
  const kmV = Number(String($('#ho-km').value).replace(',','.'));
  if (!kmV){ $('#ho-km').focus(); return warn('Wpisz aktualny stan licznika – to pole jest obowiązkowe.'); }
  if (kmV < minKm) return warn(`Stan licznika nie może być niższy niż ostatni zapis (${km(minKm)}). Sprawdź licznik.`);
  if (kmV - minKm > 2000 && minKm) { if (!w.dataset.big){ w.dataset.big = '1'; return warn(`To ${new Intl.NumberFormat('pl-PL').format(kmV - minKm)} km więcej niż ostatni zapis. Jeśli to prawda, kliknij jeszcze raz.`); } }
  let checklist = [];
  if (kind==='pickup'){
    checklist = items.map((item, i) => ({item, ok: (document.querySelector(`input[name="ck-${i}"]:checked`) || {}).value !== 'bad', note: ($('#ck-note-'+i) || {}).value?.trim() || ''}));
    const miss = checklist.findIndex(x => !x.ok && !x.note);
    if (miss >= 0){ $('#ck-note-'+miss).focus(); return warn(`Opisz, co jest nie tak: „${checklist[miss].item}”.`); }
  }
  const note = $('#ho-note').value.trim();
  if (kind==='return' && $('#ho-issue')?.checked && !note){ $('#ho-note').focus(); return warn('Opisz usterkę w polu „Uwagi po dniu pracy”.'); }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const photos = await uploadPhotos('ho');
    if (photos === null) return;
    const rec = {km: kmV, fuel: $('#ho-fuel').value, note, at: today(), photos, by: myId};
    if (kind==='pickup') rec.checklist = checklist;
    let bid = id;
    if (!bid){
      // przejęcie wolnego auta: rezerwacja na dziś tworzy się sama
      const ref = db.collection('bookings').doc();
      await ref.set({vehicleId, driverId: myDriverId(), coDriverId: coDriverId || null, from: today(), to: today(), purpose: 'Dzień pracy', pickup: rec});
      bid = ref.id;
    } else {
      await db.collection('bookings').doc(bid).update(kind==='pickup' ? {pickup: rec, coDriverId: coDriverId || null} : {returned: rec});
    }
    const issues = [];
    if (kind==='pickup') checklist.filter(x => !x.ok).forEach(x => issues.push({title: `${x.item}: ${x.note}`.slice(0, 120), description: 'Zgłoszone z checklisty przy przejęciu auta.', severity: 'istotna', photos}));
    if (kind==='return' && $('#ho-issue')?.checked) issues.push({title: note.slice(0, 120), description: note, severity: $('#ho-sev').value, photos});
    for (const i of issues) await db.collection('issues').doc().set({vehicleId, status:'nowe', date: today(), km: kmV, ...i});
    await refresh('vehicles');
    closeForm();
    const bk = byId('bookings', bid) || {};
    const partner = coDriverId ? dName(coDriverId) : (bk.coDriverId ? dName(crewOf(bk).find(d => d!==myDriverId()) || bk.coDriverId) : '');
    if (partner) return toast(kind==='pickup' ? `Przejęto auto – ${partner} musi potwierdzić przejęcie u siebie` : `Zdano pojazd – ${partner} musi potwierdzić zdanie u siebie`);
    toast(kind==='pickup' ? (issues.length ? `Przejęto auto · zgłoszono ${issues.length} ${isPlural(issues.length,'usterkę','usterki','usterek')}` : 'Przejęto auto – szerokiej drogi!') : (issues.length ? 'Zdano pojazd i zgłoszono usterkę' : 'Zdano pojazd – dziękujemy'));
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

/* ---------- edycja checklisty (kierownik floty, zakładka Użytkownicy) ---------- */
function checklistPanel(){
  if (!P().manage) return '';
  return `<div class="panel"><div class="sec-head"><h3>Checklista przy przejęciu auta</h3><button class="small" data-action="save-checklist">Zapisz</button></div>
    <div style="padding:14px;display:flex;flex-direction:column;gap:6px"><label class="muted small" for="ck-edit">Jeden punkt w linii. Kierowca zaznacza każdy jako OK albo Uwaga.</label>
    <textarea id="ck-edit" rows="8">${esc(checklistItems().join('\n'))}</textarea></div></div>`;
}
async function saveChecklist(){
  const items = ($('#ck-edit').value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 40);
  if (!items.length) return toast('Checklista nie może być pusta');
  try { await db.collection('settings').doc('checklist').set({items}); toast('Zapisano checklistę'); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => { if (e.target.closest('[data-action="save-checklist"]')) saveChecklist(); });
