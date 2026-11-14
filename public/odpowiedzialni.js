/* Emage FLEET — kierowcy odpowiedzialni za busa (szybkie przypisanie).
   Dane: vehicles.responsible (lista id kierowców, migracja 015). Odpowiedzialny kierowca:
   widzi „swój” bus na ekranie „Moje auto”, jest podpowiadany przy przydziale i przy tankowaniach z karty poza grafikiem.
   Wejścia: karta auta („Przypisz”), Kierowcy → panel „Kto odpowiada za który bus”, karta kierowcy, wyszukiwanie (Ctrl+K). */

const canResp = () => canWrite && (P().manage || P().service);

/* --- okno: kierowcy dla jednego busa --- */
function openResp(vid){
  const v = byId('vehicles', vid); if (!v || !canResp()) return;
  const cur = respOf(v);
  editing = {col:'resp', id: vid, base: v, special: saveResp};
  const ds = S.drivers.filter(d => d.active!==false || cur.includes(d.id)).sort((a, b) => (cur.includes(b.id) - cur.includes(a.id)) || a.name.localeCompare(b.name, 'pl'));
  const other = id => S.vehicles.filter(x => x.id!==vid && x.status!=='wycofany' && respOf(x).includes(id)).map(x => x.plate);
  $('#dlg-title').textContent = `Odpowiedzialni za busa · ${v.plate}`;
  $('#dlg-body').innerHTML = `<div class="field full"><input id="resp-q" placeholder="Szukaj kierowcy…" autocomplete="off" aria-label="Szukaj kierowcy"></div>
    <div class="field full resp-list" id="resp-list">${ds.map(d => { const o = other(d.id);
      return `<label class="resp-it" data-name="${esc(palNorm(d.name))}"><input type="checkbox" value="${esc(d.id)}" ${cur.includes(d.id) ? 'checked' : ''}>
        <span><b>${esc(d.name)}</b>${d.active===false ? ' <span class="pill off">nieaktywny</span>' : ''}<span class="sub">${o.length ? 'odpowiada też za: ' + esc(o.join(', ')) : esc(d.phone || '')}</span></span></label>`; }).join('') || '<p class="muted">Najpierw dodaj kierowców (Ludzie → Kierowcy).</p>'}</div>
    <p class="muted small field full">Odpowiedzialny kierowca widzi ten bus u siebie w „Moje auto”, jest podpowiadany przy nowym przydziale i przypisywany do tankowań z karty w dni bez grafiku. Może ich być kilku (np. dwie zmiany).</p>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  $('#resp-q').focus();
}
async function saveResp(){
  const ids = [...document.querySelectorAll('#resp-list input:checked')].map(x => x.value);
  const vid = editing.id, btn = $('#dlg-save'); btn.disabled = true;
  try {
    // driver_id (stary „stały kierowca”) = pierwszy odpowiedzialny, żeby starsze miejsca też działały
    await db.collection('vehicles').doc(vid).update({responsible: ids, driverId: ids[0] || null});
    closeForm(); toast(ids.length ? `Zapisano: ${ids.map(dName).join(', ')}` : 'Bus bez odpowiedzialnego kierowcy');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}
document.addEventListener('input', e => {
  if (e.target.id!=='resp-q') return;
  const n = palNorm(e.target.value);
  document.querySelectorAll('#resp-list .resp-it').forEach(el => { el.hidden = !!n && !el.dataset.name.includes(n); });
});

/* --- okno: busy dla jednego kierowcy --- */
function openDrvResp(did){
  const d = byId('drivers', did); if (!d || !canResp()) return;
  editing = {col:'resp-drv', id: did, base: d, special: saveDrvResp};
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => (respOf(b).includes(did) - respOf(a).includes(did)) || String(a.plate).localeCompare(b.plate));
  $('#dlg-title').textContent = `Busy kierowcy · ${d.name}`;
  $('#dlg-body').innerHTML = `<div class="field full resp-list" id="resp-list">${vs.map(v => { const o = respOf(v).filter(x => x!==did).map(dName);
    return `<label class="resp-it"><input type="checkbox" value="${esc(v.id)}" ${respOf(v).includes(did) ? 'checked' : ''}>
      <span><b class="num">${esc(v.plate)}</b> <span class="muted small">${esc([v.make, v.model].filter(Boolean).join(' '))}</span><span class="sub">${o.length ? 'też: ' + esc(o.join(', ')) : 'nikt inny'}</span></span></label>`; }).join('')}</div>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Zapisz'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
async function saveDrvResp(){
  const did = editing.id, want = new Set([...document.querySelectorAll('#resp-list input:checked')].map(x => x.value));
  const btn = $('#dlg-save'); btn.disabled = true; let n = 0;
  try {
    for (const v of S.vehicles.filter(v => v.status!=='wycofany')){
      const cur = respOf(v), has = cur.includes(did);
      if (want.has(v.id)===has) continue;
      const ids = has ? cur.filter(x => x!==did) : [...cur, did];
      await db.collection('vehicles').doc(v.id).update({responsible: ids, driverId: ids[0] || null}); n++;
    }
    closeForm(); toast(n ? `Zapisano zmiany (${n} ${isPlural(n,'bus','busy','busów')})` : 'Bez zmian');
  } catch(err){ handleWriteErr(err); }
  finally { btn.disabled = false; }
}

/* --- panel w zakładce Kierowcy: cała flota na jednej liście --- */
function respPanel(){
  if (!canResp() && !P().manage) return '';
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => (respOf(a).length > 0) - (respOf(b).length > 0) || String(a.plate).localeCompare(b.plate));
  if (!vs.length) return '';
  const none = vs.filter(v => !respOf(v).length).length;
  return `<details class="panel fold" ${respOpen ? 'open' : ''}><summary class="sec-head"><h3>Kto odpowiada za który bus</h3><span class="count ${none ? 'bad' : ''}">${none ? none + ' bez kierowcy' : 'wszystkie przypisane'}</span></summary>
    ${vs.map(v => `<div class="mini resp-row">${plate(v.plate)}<span>${respOf(v).length ? respOf(v).map(id => `<span class="pill">${esc(dName(id))}</span>`).join(' ') : '<span class="muted">nikt</span>'}</span>
      <span class="mini-r">${canResp() ? `<button class="small ${respOf(v).length ? 'ghost' : ''}" data-resp="${esc(v.id)}">${respOf(v).length ? 'Zmień' : `${ic('plus')}Przypisz`}</button>` : ''}</span></div>`).join('')}
  </details>`;
}

document.addEventListener('click', e => {
  const a = e.target.closest('[data-resp]'); if (a){ e.preventDefault(); e.stopPropagation(); openResp(a.dataset.resp); return; }
  const b = e.target.closest('[data-resp-drv]'); if (b){ e.preventDefault(); e.stopPropagation(); openDrvResp(b.dataset.respDrv); }
}, true);
/* panel zwinięty (mniej przewijania na liście kierowców); pamiętamy, czy go rozwinięto */
let respOpen = false;
document.addEventListener('toggle', e => { const d = e.target; if (d.matches && d.matches('details.panel.fold') && d.querySelector('summary h3')?.textContent==='Kto odpowiada za który bus') respOpen = d.open; }, true);
