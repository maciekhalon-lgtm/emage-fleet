/* Emage FLEET — wydania: wydanie i zwrot auta (przebieg, paliwo, stan) */
'use strict';
const FUEL_LV = [['0','Rezerwa'],['25','1/4'],['50','1/2'],['75','3/4'],['100','Pełny']];
const fuelLabel = v => (FUEL_LV.find(x => x[0]===String(v)) || [,'—'])[1];

function handoverBtn(b){
  if (!canEditDoc('bookings', b) || b.returned) return '';
  if (b.pickup) return `<button class="small primary" data-ho="return" data-id="${esc(b.id)}">Zwrot auta</button>`;
  if (b.from <= addDays(today(), 1) && b.to >= today()) return `<button class="small" data-ho="pickup" data-id="${esc(b.id)}">Wydaj auto</button>`;
  return '';
}
function handoverInfo(b){
  const p = b.pickup, r = b.returned;
  if (!p) return '';
  const dist = r && r.km && p.km ? r.km - p.km : null;
  return `<span class="sub num">Wydano ${fdate(p.at)} · ${km(p.km)} · paliwo ${fuelLabel(p.fuel)}${r?` → zwrot ${fdate(r.at)} · ${km(r.km)} · paliwo ${fuelLabel(r.fuel)}${dist!==null?` · <b>${new Intl.NumberFormat('pl-PL').format(dist)} km</b>`:''}`:''}</span>`
    + (r && r.note ? `<span class="sub">Uwagi: ${esc(r.note)}</span>` : p.note ? `<span class="sub">Uwagi przy wydaniu: ${esc(p.note)}</span>` : '')
    + photoStrip([...(p.photos||[]), ...((r&&r.photos)||[])]);
}

function openHandover(id, kind){
  const b = byId('bookings', id); if (!b || !canEditDoc('bookings', b)) return;
  const v = byId('vehicles', b.vehicleId);
  const ev = v && v.fuel==='Elektryczny';
  const minKm = kind==='return' ? (b.pickup && b.pickup.km) || 0 : 0;
  const defKm = (v && v.km) || minKm || '';
  editing = {col:'handover', id, base:{}, photos:[], special: () => saveHandover(id, kind, minKm)};
  $('#dlg-title').textContent = kind==='pickup' ? 'Wydanie auta' : 'Zwrot auta';
  $('#dlg-body').innerHTML = `
    <div class="field full"><span class="label">${esc(v ? v.plate+' · '+v.make+' '+v.model : 'Pojazd')}</span><span class="muted">${esc(dName(b.driverId))} · ${fdate(b.from)}–${fdate(b.to)}</span></div>
    <div class="field"><label for="ho-km">Stan licznika (km) *</label><input id="ho-km" type="number" inputmode="numeric" min="${minKm}" value="${esc(defKm)}" required></div>
    <div class="field"><label for="ho-fuel">${ev?'Poziom baterii':'Poziom paliwa'} *</label><select id="ho-fuel">${FUEL_LV.map(([k,l]) => `<option value="${k}" ${k==='100'?'selected':''}>${ev && k!=='0' ? k+'%' : l}</option>`).join('')}</select></div>
    <div class="field full"><label for="ho-note">Uwagi o stanie auta</label><textarea id="ho-note" placeholder="${kind==='pickup'?'np. rysa na tylnym zderzaku – już była':'np. brudne wnętrze, kontrolka oleju'}"></textarea></div>
    ${photoField('ho')}
    ${kind==='return' ? `<div class="field full"><label class="check"><input id="ho-issue" type="checkbox"> Zgłoś też usterkę na podstawie uwag</label></div>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-del').hidden = true;
  $('#scrim').hidden = false;
  setTimeout(() => $('#ho-km')?.focus(), 20);
}

async function saveHandover(id, kind, minKm){
  const kmV = Number(String($('#ho-km').value).replace(',','.'));
  const w = $('#dlg-warn');
  if (!kmV){ w.textContent = 'Wpisz stan licznika.'; w.hidden = false; return; }
  if (kmV < minKm){ w.textContent = 'Stan licznika przy zwrocie nie może być niższy niż przy wydaniu ('+km(minKm)+').'; w.hidden = false; return; }
  const note = $('#ho-note').value.trim();
  const btn = $('#dlg-save'); btn.disabled = true;
  try {
    const photos = await uploadPhotos('ho');
    if (photos === null) return;
    const rec = {km: kmV, fuel: $('#ho-fuel').value, note, at: today(), photos};
    if (myId) rec.by = myId;
    const b = byId('bookings', id);
    await db.collection('bookings').doc(id).update({[kind==='pickup'?'pickup':'returned']: rec, updatedAt: new Date().toISOString()});
    const v = b && byId('vehicles', b.vehicleId);
    if (v && (!v.km || kmV > v.km)) await refresh('vehicles');   // przebieg podnosi baza (wyzwalacz)
    if (kind==='return' && $('#ho-issue')?.checked && note && b){
      const issue = {vehicleId: b.vehicleId, title: note.slice(0, 80), description: note, severity: 'istotna', status: 'nowe', date: today(), km: kmV, photos, updatedAt: new Date().toISOString()};
      if (myId){ issue.createdBy = myId; issue.updatedBy = myId; }
      await db.collection('issues').doc().set(issue);
    }
    logChange(kind==='pickup' ? 'pickup' : 'return', 'bookings', {...b, id}, {km: kmV});
    closeForm(); toast(kind==='pickup' ? 'Wydano auto' : 'Przyjęto zwrot auta');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
