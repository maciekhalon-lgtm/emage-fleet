/* Emage FLEET — wydania: przejęcie auta (checklista, przebieg, paliwo) i zdanie pojazdu */
'use strict';
const FUEL_LV = [['0','Rezerwa'],['25','1/4'],['50','1/2'],['75','3/4'],['100','Pełny']];
const fuelLabel = v => (FUEL_LV.find(x => x[0]===String(v)) || [,'—'])[1];
const fuelTxt = v => v===null || v===undefined || v==='' ? '' : ` · paliwo ${fuelLabel(v)}`;
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
  if (b.pickup) return (P().manage ? `<button class="small" data-transfer="${esc(b.id)}">Przekaż</button>` : '') + `<button class="small primary" data-ho="return" data-id="${esc(b.id)}">Zdaj pojazd</button>`;
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
  return `<span class="sub num">Przejęto ${fdate(p.at)} · ${km(p.km)}${fuelTxt(p.fuel)}${r?` → zdano ${fdate(r.at)} · ${km(r.km)}${fuelTxt(r.fuel)}${dist!==null?` · <b>${new Intl.NumberFormat('pl-PL').format(dist)} km</b>`:''}`:''}</span>`
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
  const check = kind==='pickup' ? `<div class="field full ck-wrap"><span class="label">Checklista</span><div class="ck-all"><span>${ic('check')} Wszystkie punkty OK <span class="muted">(${items.length})</span></span><button type="button" class="small" data-ck-expand>Mam uwagi</button></div><div class="checklist" hidden>${items.map((it, i) => `
      <div class="ck" data-ck="${i}"><span class="ck-name">${esc(it)}</span>
        <span class="ck-btns"><label><input type="radio" name="ck-${i}" value="ok" checked> OK</label><label><input type="radio" name="ck-${i}" value="bad"> Uwaga</label></span>
        <input class="ck-note" id="ck-note-${i}" type="text" placeholder="Co jest nie tak?" hidden></div>`).join('')}</div>
      <span class="muted small">Punkt z uwagą trafi do serwisu jako zgłoszenie usterki.</span></div>` : '';
  $('#dlg-body').innerHTML = `
    <div class="field full"><span class="ho-car">${plate(v.plate)} <b>${esc(v.make)} ${esc(v.model)}</b></span>
      ${b ? `<span class="muted">${esc(dName(b.driverId))} · ${fdate(b.from)}${b.to!==b.from?'–'+fdate(b.to):''}${b.purpose?' · '+esc(b.purpose):''}</span>` : '<span class="muted">Auto na dzisiejszy dzień pracy</span>'}</div>
    <div class="field"><label for="ho-km">Stan licznika (km) *</label><input id="ho-km" type="number" inputmode="numeric" min="${minKm}" placeholder="${minKm ? 'co najmniej '+new Intl.NumberFormat('pl-PL').format(minKm) : ''}" required><span class="muted small">Ostatni zapis: ${km(minKm)}</span></div>
    ${kind==='pickup' && S.routes.some(r => r.active!==false) ? `<div class="field full"><label for="ho-route">Trasa</label>${routeSelect('ho-route', b && b.routeId)}${b && b.routeId ? '<span class="muted small">Podpowiedziana przez kierownika – możesz zmienić.</span>' : ''}</div>` : ''}
    ${kind==='pickup' ? crewField(b ? b.driverId : myDriverId(), b && b.coDriverId) : (b && b.coDriverId ? `<div class="field full"><span class="pill info">Podwójna obsada: ${esc(crewName(b))}</span><span class="muted small">Zdanie musi potwierdzić drugi kierowca – do tego czasu auto czeka.</span></div>` : '')}
    ${check}
    <div class="field full"><label for="ho-note">${kind==='pickup' ? 'Inne uwagi o stanie auta' : 'Uwagi po dniu pracy'}</label><textarea id="ho-note" placeholder="${kind==='pickup'?'np. rysa na tylnym zderzaku – już była':'np. kontrolka oleju, stuki z zawieszenia'}"></textarea></div>
    ${kind==='pickup' ? `<details class="field full ho-more"><summary>Dodaj zdjęcia (opcjonalnie)</summary>${photoField('ho')}</details>` : ''}
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
  const opts = S.drivers.filter(d => d.id!==mainDriver && (d.active!==false || d.id===current) && (!busy.has(d.id) || d.id===current)).sort((a, c) => a.name.localeCompare(c.name, 'pl'));
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
  const routeId = $('#ho-route') ? $('#ho-route').value : null;
  if (crew && !coDriverId){ $('#ho-co').focus(); return warn('Wybierz drugiego kierowcę albo odznacz „Podwójna obsada”.'); }
  const kmV = Number(String($('#ho-km').value).replace(',','.'));
  if (!kmV){ $('#ho-km').focus(); return warn('Wpisz aktualny stan licznika – to pole jest obowiązkowe.'); }
  { const chk = odoInputCheck(kmV, minKm); if (chk && chk.hard){ $('#ho-km').focus(); return warn(chk.hard); } }
  if (kmV < minKm) return warn(`Stan licznika nie może być niższy niż ostatni zapis (${km(minKm)}). Sprawdź licznik.`);
  if (kmV - minKm > 2000 && minKm) { if (!w.dataset.big){ w.dataset.big = '1'; return warn(`To ${new Intl.NumberFormat('pl-PL').format(kmV - minKm)} km więcej niż ostatni zapis. Jeśli to prawda, kliknij jeszcze raz.`); } }
  let checklist = [];
  if (kind==='pickup'){
    checklist = items.map((item, i) => ({item, ok: (document.querySelector(`input[name="ck-${i}"]:checked`) || {}).value !== 'bad', note: ($('#ck-note-'+i) || {}).value?.trim() || ''}));
    const miss = checklist.findIndex(x => !x.ok && !x.note);
    if (miss >= 0){ $('#ck-note-'+miss).focus(); return warn(`Opisz, co jest nie tak: „${checklist[miss].item}”.`); }
  }
  if (kind==='return' && !navigator.onLine){
    const iss = $('#ho-issue')?.checked ? {title: $('#ho-note').value.trim().slice(0, 120), description: $('#ho-note').value.trim(), severity: $('#ho-sev').value} : null;
    if (iss && !iss.title){ $('#ho-note').focus(); return warn('Opisz usterkę w polu „Uwagi po dniu pracy”.'); }
    await queueOffline('return', {bookingId: id, vehicleId, rec: {km: kmV, fuel: ($('#ho-fuel') ? $('#ho-fuel').value : null), note: $('#ho-note').value.trim(), at: today(), photos: [], by: myId}, issue: iss}, filesOf('ho'));
    const bk = byId('bookings', id); if (bk) bk.returned = {km: kmV, fuel: ($('#ho-fuel') ? $('#ho-fuel').value : null), note: $('#ho-note').value.trim(), at: today(), photos: [], by: myId};   // od razu widać, że auto zdane
    closeForm(); render(); return toast('Brak zasięgu – zdanie auta zapisze się samo po odzyskaniu sieci');
  }
  const note = $('#ho-note').value.trim();
  if (kind==='return' && $('#ho-issue')?.checked && !note){ $('#ho-note').focus(); return warn('Opisz usterkę w polu „Uwagi po dniu pracy”.'); }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const photos = await uploadPhotos('ho');
    if (photos === null) return;
    const rec = {km: kmV, fuel: ($('#ho-fuel') ? $('#ho-fuel').value : null), note, at: today(), photos, by: myId};
    if (kind==='pickup') rec.checklist = checklist;
    let bid = id;
    if (!bid){
      // przejęcie wolnego auta: rezerwacja na dziś tworzy się sama
      const ref = db.collection('bookings').doc();
      await ref.set({vehicleId, driverId: myDriverId(), coDriverId: coDriverId || null, routeId: routeId || null, from: today(), to: today(), purpose: 'Dzień pracy', pickup: rec});
      bid = ref.id;
    } else {
      await db.collection('bookings').doc(bid).update(kind==='pickup' ? {pickup: rec, coDriverId: coDriverId || null, ...($('#ho-route') ? {routeId: routeId || null} : {})} : {returned: rec});
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
    toast(kind==='pickup' ? (issues.length ? `Przejęto auto · zgłoszono ${issues.length} ${isPlural(issues.length,'usterkę','usterki','usterek')}` : 'Przejęto auto – szerokiej drogi!') : (issues.length ? 'Zdano pojazd i zgłoszono usterkę' : (bk.pickup && bk.pickup.km && kmV > bk.pickup.km ? `Zdano pojazd – przejechane ${new Intl.NumberFormat('pl-PL').format(kmV - bk.pickup.km)} km. Dziękujemy!` : 'Zdano pojazd – dziękujemy')));
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

/* ---------- przekazanie auta innemu kierowcy (kierownik floty) ---------- */
const TRANSFER_REASONS = ['Awaria auta','Choroba kierowcy','Zmiana trasy','Koniec zmiany kierowcy','Inne'];
function openTransfer(id){
  const b = byId('bookings', id);
  if (!b || !P().manage || !b.pickup || b.returned) return;
  const v = byId('vehicles', b.vehicleId) || {};
  const minKm = Math.max(Number(b.pickup.km) || 0, 0);
  const busy = new Set(S.bookings.filter(x => holds(x) && x.id!==b.id).flatMap(crewOf));
  const opts = S.drivers.filter(d => d.active!==false && !busy.has(d.id) && !(d.id===b.driverId && !b.coDriverId))
    .sort((a, c) => a.name.localeCompare(c.name, 'pl'));
  editing = {col:'transfer', id, base:{}, special: () => saveTransfer(b, minKm)};
  $('#dlg-title').textContent = 'Przekaż auto innemu kierowcy';
  $('#dlg-body').innerHTML = `
    <div class="field full"><span class="ho-car">${plate(v.plate)} <b>${esc(v.make||'')} ${esc(v.model||'')}</b></span>
      <span class="muted">Teraz: ${esc(crewName(b))} · przejęte ${fdate(b.pickup.at)} przy ${km(b.pickup.km)}</span></div>
    <div class="field full"><label for="tr-to">Nowy kierowca *</label><select id="tr-to" required><option value="">— wybierz kierowcę —</option>${opts.map(d => `<option value="${esc(d.id)}">${esc(d.name)}</option>`).join('')}</select>
      <span class="muted small">${opts.length ? 'Lista pokazuje aktywnych kierowców, którzy nie mają teraz innego auta.' : '<b>Wszyscy aktywni kierowcy mają teraz auto</b> – najpierw ktoś musi zdać swoje.'}</span></div>
    <div class="field"><label for="tr-km">Stan licznika teraz (km) *</label><input id="tr-km" type="number" inputmode="numeric" min="${minKm}" value="${esc(v.km && v.km >= minKm ? v.km : '')}" required><span class="muted small">Przy przejęciu: ${km(minKm)}</span></div>
    <div class="field"><label for="tr-why">Powód *</label><select id="tr-why">${TRANSFER_REASONS.map(r => `<option>${esc(r)}</option>`).join('')}</select></div>
    <div class="field full"><label for="tr-note">Opis</label><input id="tr-note" type="text" placeholder="np. kontrolka silnika, auto jedzie na lawecie"></div>
    <p class="muted small field full" style="margin:0">Dzień pracy obecnego kierowcy zakończy się na tym przebiegu${b.coDriverId ? ' (bez czekania na potwierdzenie drugiego kierowcy)' : ''}. Nowy kierowca zobaczy auto u siebie i przyjmie je z checklistą i przebiegiem.</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Przekaż auto';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  setTimeout(() => $('#tr-to')?.focus(), 20);
}
async function saveTransfer(b, minKm){
  const w = $('#dlg-warn'); const warn = t => { w.textContent = t; w.hidden = false; };
  const to = $('#tr-to').value;
  const kmV = Number(String($('#tr-km').value).replace(',', '.'));
  const why = $('#tr-why').value, note = $('#tr-note').value.trim();
  if (!to){ $('#tr-to').focus(); return warn('Wybierz kierowcę, który przejmie auto.'); }
  if (!kmV){ $('#tr-km').focus(); return warn('Wpisz aktualny stan licznika – to pole jest obowiązkowe.'); }
  if (kmV < minKm) return warn(`Stan licznika nie może być niższy niż przy przejęciu (${km(minKm)}).`);
  if (why==='Inne' && !note){ $('#tr-note').focus(); return warn('Przy powodzie „Inne” opisz, co się stało.'); }
  const reason = note ? `${why} – ${note}` : why;
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const {error} = await sb.rpc('transfer_vehicle', {booking_id: b.id, new_driver: to, odometer: kmV, reason});
    if (error) return warn(dbErr(error).message || 'Nie udało się przekazać auta.');
    await Promise.all(['bookings', 'vehicles', 'crewChanges'].map(refresh));
    closeForm();
    toast(`Przekazano auto – ${dName(to)} przyjmie je u siebie`);
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

/* Historia zmian obsady: przekazania i zdania wykonane przez kierownika (ostatnie 50) */
function crewChangesPanel(){
  if (!P().manage) return '';
  const list = S.crewChanges.slice().sort((a, b) => a.at < b.at ? 1 : -1).slice(0, 50);
  const rows = list.map(c => {
    const from = [c.fromDriverId, c.fromCoDriverId].filter(Boolean).map(dName).join(' + ') || '—';
    const d = new Date(c.at);
    return `<tr><td class="num">${fdate(isoOf(d))}<span class="sub">${pad(d.getHours())}:${pad(d.getMinutes())}</span></td>
      <td>${vPlate(c.vehicleId)}</td>
      <td>${esc(from)}${c.kind==='przekazanie' ? ` → <b>${esc(dName(c.toDriverId))}</b>` : ''}<span class="sub">${c.kind==='przekazanie' ? 'przekazanie' : 'zdanie przez kierownika'}</span></td>
      <td class="r num">${km(c.km)}</td>
      <td>${esc(c.reason || '—')}<span class="sub">${esc(c.actor ? pName(c.actor) : '')}</span></td></tr>`;
  }).join('');
  return `<div class="section crew-hist"><div class="bar"><h2>Zmiany obsady</h2><span class="muted small">ostatnie 50 · widzi tylko kierownik floty</span></div>
    ${rows ? `<div class="panel tablewrap"><table><thead><tr><th>Kiedy</th><th>Auto</th><th>Kierowca</th><th class="r">Przebieg</th><th>Powód / kto</th></tr></thead><tbody>${rows}</tbody></table></div>`
      : '<div class="panel empty"><p>Brak zmian obsady. Przekazanie auta zrobisz przyciskiem „Przekaż” przy aucie w trasie (Grafik → Teraz w trasie albo karta pojazdu).</p></div>'}</div>`;
}
