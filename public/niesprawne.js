/* Emage FLEET — „Niesprawne” jednym kliknięciem (kierownik floty i serwisu).
   Oznaczenie auta = zlecenie naprawy: powstaje zgłoszenie z wagą „stop” (auto niesprawne – kierowcy go nie wybiorą)
   i od razu zlecenie dla warsztatu (domyślnie EMAGE SERWIS). „Przywróć jako sprawne” = Zakończ naprawę tego zlecenia. */
'use strict';
const brkOn = () => (P().manage || P().service) && typeof woOn==='function' && woOn();
/* otwarte zlecenie z niesprawnością auta (jeśli jest) */
function brkOrder(vid){
  const si = stopIssue(vid); if (!si) return null;
  const it = S.woItems.find(x => x.issueId===si.id && x.status==='zlecone');
  const o = it && S.workOrders.find(w => w.id===it.orderId && w.status==='otwarte');
  return {issue: si, order: o || null};
}
function brkButton(v, small = true){
  if (!brkOn() || v.status==='wycofany') return '';
  const b = brkOrder(v.id);
  return b ? `<button type="button" class="${small ? 'small ' : ''}ghost" data-brk-fix="${esc(v.id)}" title="Zakończ naprawę – auto wraca do użytku">${ic('check')}Przywróć jako sprawne</button>`
    : `<button type="button" class="${small ? 'small ' : ''}danger-ghost" data-brk="${esc(v.id)}" title="Auto stoi zepsute – powstanie zlecenie naprawy">${ic('wrench')}Oznacz jako niesprawny</button>`;
}
function openBroken(vid){
  const v = byId('vehicles', vid); if (!v) return;
  const ws = S.workshops.slice().sort((a, b) => a.name.localeCompare(b.name, 'pl')), own = ws.find(w => normTxt(w.name)===normTxt(WO_OWN));
  const busy = S.bookings.filter(b => b.vehicleId===vid && !b.pickup && b.to >= today() && b.from <= addDays(today(), 7));
  editing = {col: 'brk', base: {}, special: async () => {
    const w = $('#dlg-warn'), title = $('#brk-title').value.trim(), note = $('#brk-note').value.trim(), wsId = $('#brk-ws').value, wsTxt = $('#brk-ws-txt').value.trim();
    const wsObj = byId('workshops', wsId), wsName = wsObj ? wsObj.name : (wsTxt || WO_OWN);
    if (!title){ w.textContent = 'Wpisz krótko, co się stało (np. nie odpala).'; w.hidden = false; return; }
    const btn = $('#dlg-save'); btn.disabled = true;
    try {
      const iid = newId(), oid = newId();
      let r = await sb.from('issues').insert({id: iid, vehicle_id: vid, title: title.slice(0, 200), description: note || null, severity: 'stop', status: 'naprawa', date: today(), km: lastKm(vid) || null}); if (r.error) throw dbErr(r.error);
      r = await sb.from('work_orders').insert({id: oid, workshop_id: wsObj ? wsObj.id : null, workshop: wsName, date: today(), note: note || null, status: 'otwarte'}); if (r.error) throw dbErr(r.error);
      r = await sb.from('work_order_items').insert({order_id: oid, vehicle_id: vid, issue_id: iid, kind: 'usterka', title: title.slice(0, 200), status: 'zlecone'}); if (r.error) throw dbErr(r.error);
      await Promise.all(['issues', 'workOrders', 'woItems'].map(c => refresh(c)));
      closeForm(); toast(`${v.plate}: niesprawne – zlecenie naprawy zapisane`); render();
    } catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
  }};
  $('#dlg-title').textContent = `${v.plate} – niesprawne`;
  $('#dlg-body').innerHTML = `<div class="field full"><label for="brk-title">Co się stało? *</label><input id="brk-title" maxlength="200" placeholder="np. nie odpala, wyciek oleju, kontrolka silnika"></div>
    <div class="field full"><label for="brk-note">Szczegóły (opcjonalnie)</label><textarea id="brk-note" placeholder="gdzie stoi auto, co już sprawdzono"></textarea></div>
    <div class="field"><label for="brk-ws">Warsztat</label><select id="brk-ws"><option value="" ${own ? '' : 'selected'}>${own ? 'inny – wpisz obok' : esc(WO_OWN) + ' (nasz warsztat)'}</option>${ws.map(w => `<option value="${esc(w.id)}" ${own && w.id===own.id ? 'selected' : ''}>${esc(w.name)}</option>`).join('')}</select></div>
    <div class="field"><label for="brk-ws-txt">Inny warsztat</label><input id="brk-ws-txt" placeholder="nazwa warsztatu"></div>
    <p class="muted small field full">Auto od razu będzie niesprawne – kierowcy nie będą mogli go wybrać. Powstanie zgłoszenie i zlecenie naprawy w Serwis → Zlecenia. Auto wróci do użytku po „Zakończ naprawę” (albo „Przywróć jako sprawne”).</p>
    ${busy.length ? `<div class="notice warn field full"><span>${ic('alert')} Auto jest w grafiku: ${busy.map(b => `${fdate(b.from)} – ${esc(dName(b.driverId))}`).join(', ')}. Przydziel tym kierowcom inne auto w Grafiku.</span></div>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Oznacz jako niesprawne'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  setTimeout(() => $('#brk-title') && $('#brk-title').focus(), 50);
}
async function brkFix(vid){
  const b = brkOrder(vid); if (!b) return;
  if (b.order){ openWoFinish(b.order.id); return; }
  // zgłoszenie „stop” bez zlecenia (np. zgłoszone przez kierowcę) – naprawione od ręki
  try { const {error} = await sb.from('issues').update({status: 'naprawione', resolved_at: new Date().toISOString()}).eq('id', b.issue.id); if (error) throw dbErr(error);
    await refresh('issues'); toast('Auto znów sprawne'); render(); } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  const a = e.target.closest('[data-brk],[data-brk-fix]'); if (!a) return;
  e.preventDefault(); e.stopPropagation();
  if (a.dataset.brk) openBroken(a.dataset.brk); else brkFix(a.dataset.brkFix);
}, true);
