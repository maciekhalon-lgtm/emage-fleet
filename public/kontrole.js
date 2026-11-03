/* Emage FLEET — kontrole: inspekcje aut (kierownik floty) i harmonogram sprzątania (kierowca zaznacza, kierownik potwierdza) */
'use strict';
const CLEAN_KINDS = {sprzatanie:'Sprzątanie', mycie:'Mycie', oba:'Sprzątanie i mycie'};
const INSPECTION_DEFAULT = ['Opony (bieżnik, ciśnienie)','Oświetlenie','Hamulce','Płyny (olej, chłodzący, spryskiwacze)','Wycieraczki','Szyby i lusterka','Karoseria (uszkodzenia)',
  'Wyposażenie (gaśnica, trójkąt, apteczka, kamizelka)','Dokumenty w aucie','Tachograf (jeśli jest)','Czystość kabiny','Czystość przestrzeni ładunkowej'];
const checkSchedule = () => { const s = S.settings.find(x => x.id==='schedule') || {}; return {insp: Number(s.inspectionDays) || 14, clean: Number(s.cleaningDays) || 14}; };
const receiptPercent = () => { const s = S.settings.find(x => x.id==='receipts'); return s && s.percent!=null ? Number(s.percent) : 20; };
const inspectionItems = () => { const s = S.settings.find(x => x.id==='inspection'); return (s && Array.isArray(s.items) && s.items.length) ? s.items : INSPECTION_DEFAULT; };
const activeVehicles = () => S.vehicles.filter(v => v.status!=='wycofany');
const lastInspection = vid => S.inspections.filter(x => x.vehicleId===vid).sort((a, b) => a.date<b.date?1:-1)[0];
const lastCleaning = vid => { const c = S.cleanings.filter(x => x.vehicleId===vid && x.status==='confirmed').sort((a, b) => a.date<b.date?1:-1)[0];
  const v = byId('vehicles', vid); if (v && v.lastClean && (!c || v.lastClean > c.date)) return {date: v.lastClean, kind: ''};   // kierowca nie widzi cudzych wpisów – data z auta
  return c; };
const pendingCleanings = () => S.cleanings.filter(x => x.status==='pending');
/* Stan względem harmonogramu: {cls, txt, due} */
function dueState(last, days){
  if (!last) return {cls:'bad', txt:'nigdy', over:true};
  const next = addDays(last.date, days), d = diffDays(today(), next);
  return d < 0 ? {cls:'bad', txt:`zaległe ${-d} ${isPlural(-d,'dzień','dni','dni')}`, over:true} : d <= 2 ? {cls:'warn', txt: d ? `za ${d} ${isPlural(d,'dzień','dni','dni')}` : 'dziś', over:false} : {cls:'ok', txt:`do ${fdate(next)}`, over:false};
}
const inspDue = v => dueState(lastInspection(v.id), checkSchedule().insp);
const cleanDue = v => dueState(lastCleaning(v.id), checkSchedule().clean);
const overdueInspections = () => activeVehicles().filter(v => inspDue(v).over);
const overdueCleanings = () => activeVehicles().filter(v => cleanDue(v).over);

function viewChecks(){
  const fleet = !!P().manage, sc = checkSchedule();
  const head = `<div class="bar"><h2>Kontrole</h2><div class="tools">${fleet ? `<button data-new="cleanings">${ic('plus')}Odnotuj sprzątanie</button><button class="primary" data-insp-new="1">${ic('clip')}Inspekcja auta</button>` : ''}</div></div>`;
  const pend = pendingCleanings().sort((a, b) => a.date<b.date?-1:1);
  const pendHtml = pend.length ? `<div class="panel confirms"><div class="sec-head"><h3>Sprzątanie do potwierdzenia</h3><span class="pill warn">${pend.length}</span></div>
    ${pend.map(c => `<div class="confirm"><span>${vPlate(c.vehicleId)} <b>${esc(CLEAN_KINDS[c.kind] || c.kind)}</b> · ${fdate(c.date)}<span class="sub">${esc(c.driverId ? dName(c.driverId) : pName(c.createdBy))}${c.note ? ' · '+esc(c.note) : ''}</span>${photoStrip(c.photos)}</span>
      ${fleet ? `<span class="disp"><button class="small primary" data-cl-ok="${esc(c.id)}">${ic('check')}Potwierdź</button><button class="small" data-cl-no="${esc(c.id)}">Odrzuć</button></span>` : ''}</div>`).join('')}</div>` : '';
  const rows = activeVehicles().slice().sort((a, b) => String(a.plate).localeCompare(b.plate)).map(v => {
    const li = lastInspection(v.id), lc = lastCleaning(v.id), is = inspDue(v), cs = cleanDue(v);
    const bad = li ? (li.items || []).filter(x => !x.ok).length : 0;
    return `<tr><td>${plate(v.plate)}<span class="sub">${esc(v.make)} ${esc(v.model)}</span></td>
      <td>${li ? `<span class="click-link" data-insp-view="${esc(li.id)}">${fdate(li.date)}</span>${bad ? ` <span class="pill warn">${bad} ${isPlural(bad,'uwaga','uwagi','uwag')}</span>` : ''}` : '<span class="muted">—</span>'}<span class="sub"><span class="pill ${is.cls}">${esc(is.txt)}</span></span></td>
      <td>${lc ? `${fdate(lc.date)} <span class="muted small">${esc(CLEAN_KINDS[lc.kind] || '')}</span>` : '<span class="muted">—</span>'}<span class="sub"><span class="pill ${cs.cls}">${esc(cs.txt)}</span></span></td>
      <td class="r">${fleet ? `<span class="row-act"><button class="small" data-insp-new="1" data-veh="${esc(v.id)}">Inspekcja</button><button class="small ghost" data-new="cleanings" data-veh="${esc(v.id)}">Sprzątanie</button></span>` : ''}</td></tr>`;
  }).join('');
  const recent = S.inspections.slice().sort((a, b) => a.date<b.date?1:-1).slice(0, 15).map(x => {
    const bad = (x.items || []).filter(i => !i.ok);
    return `<div class="mini click" data-insp-view="${esc(x.id)}"><span class="num">${fdate(x.date)}</span><span>${vPlate(x.vehicleId)} ${bad.length ? `<span class="muted small">${bad.map(i => esc(i.item)).join(', ')}</span>` : '<span class="muted small">wszystko OK</span>'}</span><span class="pill ${bad.length ? 'warn' : 'ok'}">${bad.length ? bad.length+' uwag' : 'OK'}</span></div>`;
  }).join('');
  const settings = fleet ? `<div class="panel"><div class="sec-head"><h3>Ustawienia kontroli</h3><button class="small" data-action="save-checks">Zapisz</button></div>
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:12px">
      <div class="budget-edit" style="flex-wrap:wrap;gap:12px"><label class="field" style="display:flex;flex-direction:column;gap:4px"><span class="label">Inspekcja co (dni)</span><input id="sch-insp" type="number" min="1" value="${sc.insp}" style="width:120px"></label>
        <label class="field" style="display:flex;flex-direction:column;gap:4px"><span class="label">Sprzątanie co (dni)</span><input id="sch-clean" type="number" min="1" value="${sc.clean}" style="width:120px"></label>
        <label class="field" style="display:flex;flex-direction:column;gap:4px"><span class="label">Kontrola paragonów (% dni pracy)</span><input id="sch-rcp" type="number" min="0" max="100" value="${receiptPercent()}" style="width:120px"></label></div>
      <span class="muted small">Kontrola paragonów: system codziennie losuje kierowców, którzy muszą dodać zdjęcie paragonu do tankowania. 0 = wyłączone.</span>
      <label class="muted small" for="insp-edit">Punkty inspekcji – jeden w linii. Punkt z uwagą trafi do serwisu jako usterka.</label>
      <textarea id="insp-edit" rows="8">${esc(inspectionItems().join('\n'))}</textarea></div></div>` : '';
  return `<div class="section">${head}${pendHtml}
    <div class="panel tablewrap"><table><thead><tr><th>Auto</th><th>Inspekcja (co ${sc.insp} dni)</th><th>Sprzątanie (co ${sc.clean} dni)</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="4" class="muted">Brak aut.</td></tr>'}</tbody></table></div>
    <div class="grid2"><div class="panel"><div class="sec-head"><h3>Ostatnie inspekcje</h3></div>${recent || '<p class="muted sec-empty">Brak inspekcji.</p>'}</div>${settings}</div></div>`;
}

/* ---------- inspekcja: okno ---------- */
function openInspection(vehicleId){
  if (!P().manage) return;
  const items = inspectionItems();
  const v = vehicleId ? byId('vehicles', vehicleId) : null;
  editing = {col:'inspection-new', id:null, base:{}, special: () => saveInspection(items)};
  $('#dlg-title').textContent = 'Inspekcja auta';
  $('#dlg-body').innerHTML = `
    <div class="field full"><label for="in-veh">Pojazd *</label><select id="in-veh">${vehOpts().map(([id, l]) => `<option value="${esc(id)}" ${id===(vehicleId||'')?'selected':''}>${esc(l)}</option>`).join('')}</select></div>
    <div class="field"><label for="in-date">Data *</label><input id="in-date" type="date" value="${today()}"></div>
    <div class="field"><label for="in-km">Przebieg (km)</label><input id="in-km" type="number" inputmode="numeric" min="0" value="${esc(v && v.km ? v.km : '')}"></div>
    <div class="field full"><span class="label">Punkty kontroli</span><div class="checklist">${items.map((it, i) => `
      <div class="ck" data-ck="${i}"><span class="ck-name">${esc(it)}</span>
        <span class="ck-btns"><label><input type="radio" name="ck-${i}" value="ok" checked> OK</label><label><input type="radio" name="ck-${i}" value="bad"> Uwaga</label></span>
        <input class="ck-note" id="ck-note-${i}" type="text" placeholder="Co jest nie tak?" hidden></div>`).join('')}</div>
      <span class="muted small">Punkt z uwagą trafi do serwisu jako zgłoszenie usterki.</span></div>
    <div class="field full"><label for="in-note">Uwagi ogólne</label><textarea id="in-note"></textarea></div>
    ${photoField('in')}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz inspekcję';
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  setTimeout(() => $('#in-veh')?.focus(), 20);
}
document.addEventListener('change', e => {
  if (e.target.id!=='in-veh') return;
  const v = byId('vehicles', e.target.value); const k = $('#in-km'); if (v && k) k.value = v.km || '';
});
async function saveInspection(items){
  const w = $('#dlg-warn'); const warn = t => { w.textContent = t; w.hidden = false; };
  const vehicleId = $('#in-veh').value, date = $('#in-date').value;
  const kmV = $('#in-km').value ? Number($('#in-km').value) : null;
  if (!vehicleId){ $('#in-veh').focus(); return warn('Wybierz auto.'); }
  if (!date) return warn('Podaj datę inspekcji.');
  const list = items.map((item, i) => ({item, ok: (document.querySelector(`input[name="ck-${i}"]:checked`) || {}).value !== 'bad', note: ($('#ck-note-'+i) || {}).value?.trim() || ''}));
  const miss = list.findIndex(x => !x.ok && !x.note);
  if (miss >= 0){ $('#ck-note-'+miss).focus(); return warn(`Opisz, co jest nie tak: „${list[miss].item}”.`); }
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const photos = await uploadPhotos('in');
    if (photos === null) return;
    await db.collection('inspections').doc().set({vehicleId, date, km: kmV, items: list, note: $('#in-note').value.trim(), photos});
    const bad = list.filter(x => !x.ok);
    for (const x of bad) await db.collection('issues').doc().set({vehicleId, status:'nowe', date, km: kmV, title: `${x.item}: ${x.note}`.slice(0, 120), description: 'Zgłoszone z inspekcji auta.', severity: 'istotna', photos});
    closeForm();
    toast(bad.length ? `Zapisano inspekcję · zgłoszono ${bad.length} ${isPlural(bad.length,'usterkę','usterki','usterek')}` : 'Zapisano inspekcję – wszystko OK');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
function viewInspection(id){
  const x = byId('inspections', id); if (!x) return;
  editing = {col:'inspections', id, base:x, special: () => closeForm()};
  $('#dlg-title').textContent = 'Inspekcja ' + fdate(x.date);
  $('#dlg-body').innerHTML = `<div class="field full"><span class="ho-car">${vPlate(x.vehicleId)} <b>${esc(vName(x.vehicleId))}</b></span>
      <span class="muted">${x.km ? 'Przebieg '+km(x.km)+' · ' : ''}${esc(x.createdBy ? pName(x.createdBy) : '')}</span></div>
    <div class="field full"><div class="checklist">${(x.items || []).map(i => `<div class="ck ${i.ok ? '' : 'bad'}"><span>${esc(i.item)}${i.note ? `<span class="sub muted small" style="display:block">${esc(i.note)}</span>` : ''}</span><span class="pill ${i.ok ? 'ok' : 'warn'}">${i.ok ? 'OK' : 'Uwaga'}</span></div>`).join('')}</div></div>
    ${x.note ? `<div class="field full"><span class="label">Uwagi</span><span>${esc(x.note)}</span></div>` : ''}
    ${x.photos && x.photos.length ? `<div class="field full">${photoStrip(x.photos)}</div>` : ''}`;
  $('#dlg-save').textContent = 'Zamknij';
  const del = $('#dlg-del'); del.hidden = !P().manage; del.classList.remove('armed'); del.textContent = 'Usuń';
  $('#scrim').hidden = false;
  hydrateFiles($('#dlg-body'));
}

async function decideCleaning(id, ok){
  try {
    await db.collection('cleanings').doc(id).update({status: ok ? 'confirmed' : 'rejected'});
    toast(ok ? 'Potwierdzono sprzątanie' : 'Odrzucono – kierowca zobaczy to u siebie');
  } catch(err){ handleWriteErr(err); }
}
async function saveChecks(){
  const insp = Math.max(1, Number($('#sch-insp').value) || 14), clean = Math.max(1, Number($('#sch-clean').value) || 14);
  const items = ($('#insp-edit').value || '').split('\n').map(s => s.trim()).filter(Boolean).slice(0, 60);
  if (!items.length) return toast('Lista punktów inspekcji nie może być pusta');
  try {
    await db.collection('settings').doc('schedule').set({inspectionDays: insp, cleaningDays: clean});
    await db.collection('settings').doc('inspection').set({items});
    const rp = Math.min(100, Math.max(0, Math.round(Number($('#sch-rcp').value))));
    if (!Number.isNaN(rp)) await db.collection('settings').doc('receipts').set({percent: rp});
    toast('Zapisano ustawienia kontroli');
  } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-insp-new],[data-insp-view],[data-cl-ok],[data-cl-no],[data-action="save-checks"]');
  if (!t || t.closest('#dialog')) return;
  if (t.dataset.inspNew) return openInspection(t.dataset.veh || '');
  if (t.dataset.inspView) return viewInspection(t.dataset.inspView);
  if (t.dataset.clOk) return decideCleaning(t.dataset.clOk, true);
  if (t.dataset.clNo) return decideCleaning(t.dataset.clNo, false);
  if (t.dataset.action==='save-checks') return saveChecks();
});

/* Kierowca: stan sprzątania jego auta (na karcie auta) */
function myCleaningNote(vid){
  const mineL = S.cleanings.filter(x => x.vehicleId===vid && x.driverId===myDriverId()).sort((a, b) => (a.createdAt||a.date) < (b.createdAt||b.date) ? 1 : -1)[0];
  const v = byId('vehicles', vid); if (!v) return '';
  if (mineL && mineL.status==='pending') return `<div class="mycar-booking"><span>${ic('clip')} Zaznaczone sprzątanie ${fdate(mineL.date)} czeka na potwierdzenie kierownika.</span></div>`;
  if (mineL && mineL.status==='rejected' && diffDays(mineL.date, today()) <= 7) return `<div class="mycar-booking" style="border-color:var(--bad)"><span>Kierownik nie potwierdził sprzątania z ${fdate(mineL.date)}. Posprzątaj auto i zaznacz ponownie.</span></div>`;
  const st = cleanDue(v);
  if (st.over) return `<div class="mycar-booking" style="border-color:var(--warn)"><span><b>Auto do sprzątania</b> – ${lastCleaning(vid) ? 'ostatnio '+fdate(lastCleaning(vid).date) : 'brak zapisu sprzątania'}. </span><button class="small" data-new="cleanings" data-veh="${esc(vid)}">${ic('check')}Posprzątane</button></div>`;
  return '';
}
