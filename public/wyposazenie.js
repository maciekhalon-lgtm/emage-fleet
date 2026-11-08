/* Emage FLEET — wyposażenie aut: gaśnica (ważność), apteczka, trójkąt, kamizelki, koło zapasowe, podnośnik, pasy.
   Dane: tabela equipment (migracja 028), jeden wiersz na auto i rzecz. Serwis → Wyposażenie: tabela auto × rzecz,
   „Sprawdzone dziś” dla całego auta jednym kliknięciem, ostrzeżenia o gaśnicy po terminie i brakach. */
'use strict';
const EQ_ITEMS = [['Gaśnica', true], ['Apteczka', true], ['Trójkąt', false], ['Kamizelki', false], ['Koło zapasowe / zestaw', false], ['Podnośnik i klucz', false], ['Pasy do ładunku', false]];
const EQ_SHORT = {'Gaśnica':'Gaśnica', 'Apteczka':'Apteczka', 'Trójkąt':'Trójkąt', 'Kamizelki':'Kamizelki', 'Koło zapasowe / zestaw':'Koło / zestaw', 'Podnośnik i klucz':'Podnośnik', 'Pasy do ładunku':'Pasy'};
const eqOn = () => typeof optOn==='function' && optOn('equipment') && (P().manage || P().service);
const canEq = () => canWrite && P().equipment==='rw';
const eqOf = (vid, item) => S.equipment.find(e => e.vehicleId===vid && e.item===item) || null;
/* stan jednej rzeczy: bad = brak / gaśnica po terminie, warn = ważność ≤ 30 dni, ok, none = nie sprawdzano */
function eqState(e){
  if (!e) return {cls:'none', txt:'nie sprawdzano'};
  if (!e.ok) return {cls:'bad', txt:'brak / niesprawne'};
  if (e.validUntil){ const d = diffDays(today(), e.validUntil);
    if (d < 0) return {cls:'bad', txt:`ważne do ${fdate(e.validUntil)} – po terminie`};
    if (d <= 30) return {cls:'warn', txt:`ważne do ${fdate(e.validUntil)} (${d} dni)`}; return {cls:'ok', txt:`ważne do ${fdate(e.validUntil)}`}; }
  return {cls:'ok', txt: e.checkedAt ? `sprawdzone ${fdate(e.checkedAt)}` : 'jest'};
}
const eqVehicles = () => S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => String(a.plate).localeCompare(b.plate));
function eqProblems(){
  const out = [];
  eqVehicles().forEach(v => S.equipment.filter(e => e.vehicleId===v.id).forEach(e => { const s = eqState(e); if (s.cls==='bad' || s.cls==='warn') out.push({v, e, s}); }));
  return out;
}
let eqFilter = 'all';
function viewEquipment(){
  if (!eqOn()) return `<div class="bar"><h2>Wyposażenie aut</h2></div><div class="panel empty"><h3>Moduł czeka na bazę</h3><p>Uruchom w Supabase migrację <b>028_wyposazenie.sql</b>.</p></div>`;
  const vs = eqVehicles(), probs = eqProblems();
  const fireBad = probs.filter(x => x.e.item==='Gaśnica' && x.s.cls==='bad').length, fireSoon = probs.filter(x => x.e.item==='Gaśnica' && x.s.cls==='warn').length;
  const never = vs.filter(v => !S.equipment.some(e => e.vehicleId===v.id)), old = vs.filter(v => { const d = S.equipment.filter(e => e.vehicleId===v.id && e.checkedAt).map(e => e.checkedAt).sort().pop(); return d && diffDays(d, today()) > 90; });
  const tile = (k, n, l, cls) => `<button class="fc-tile ${cls} ${eqFilter===k ? 'on' : ''}" data-eqf="${k}"><b>${n}</b><span>${l}</span></button>`;
  const list = eqFilter==='prob' ? vs.filter(v => probs.some(x => x.v.id===v.id)) : eqFilter==='never' ? never : eqFilter==='old' ? old : vs;
  const cell = (v, item) => { const e = eqOf(v.id, item), s = eqState(e);
    return `<td class="eq-c ${s.cls}"><button type="button" class="eq-b" ${canEq() ? `data-eq="${esc(v.id)}" data-item="${esc(item)}"` : 'disabled'} title="${esc(item)}: ${esc(s.txt)}${e && e.note ? ' · ' + esc(e.note) : ''}">${s.cls==='none' ? '—' : s.cls==='bad' ? '✕' : '✓'}${e && e.validUntil ? `<small>${esc(e.validUntil.slice(5, 7) + '.' + e.validUntil.slice(2, 4))}</small>` : ''}</button></td>`; };
  return `<div class="bar"><h2>Wyposażenie aut</h2></div>
    <div class="fc-tiles">${tile('all', vs.length, 'aut', '')}${tile('prob', probs.length, 'braki i terminy', probs.length ? 'bad' : 'ok')}${tile('fire', fireBad, 'gaśnice po terminie', fireBad ? 'bad' : 'ok')}${fireSoon ? tile('fire', fireSoon, 'gaśnice ≤ 30 dni', 'warn') : ''}${tile('never', never.length, 'nigdy nie sprawdzane', never.length ? 'warn' : 'ok')}${tile('old', old.length, 'sprawdzane ponad 90 dni temu', old.length ? 'warn' : '')}</div>
    <div class="panel tablewrap"><table class="eq-tbl"><thead><tr><th>Auto</th>${EQ_ITEMS.map(([i]) => `<th class="c">${esc(EQ_SHORT[i] || i)}</th>`).join('')}<th>Sprawdzone</th><th></th></tr></thead><tbody>
      ${(eqFilter==='fire' ? vs.filter(v => probs.some(x => x.v.id===v.id && x.e.item==='Gaśnica')) : list).map(v => { const last = S.equipment.filter(e => e.vehicleId===v.id && e.checkedAt).map(e => e.checkedAt).sort().pop();
        return `<tr><td>${plate(v.plate)}</td>${EQ_ITEMS.map(([i]) => cell(v, i)).join('')}<td class="num small">${last ? fdate(last) : '<span class="muted">—</span>'}</td>
          <td class="r">${canEq() ? `<button class="small" data-eq-all="${esc(v.id)}">${ic('check')}Sprawdzone dziś</button>` : ''}</td></tr>`; }).join('') || `<tr><td colspan="${EQ_ITEMS.length + 3}" class="muted">Brak aut dla tego filtra.</td></tr>`}
    </tbody></table></div>
    <p class="muted small" style="margin:0;max-width:90ch">Kliknij pole, aby oznaczyć brak, wpisać datę ważności (gaśnica, apteczka) albo notatkę. „Sprawdzone dziś” zaznacza wszystkie rzeczy auta jako obecne – braki popraw potem pojedynczo. Gaśnica: przegląd co 12 miesięcy (data na etykiecie).</p>`;
}
function openEq(vid, item){
  const v = byId('vehicles', vid), e = eqOf(vid, item); if (!v || !canEq()) return;
  const dated = (EQ_ITEMS.find(x => x[0]===item) || [])[1];
  editing = {col:'equipment', id: e ? e.id : null, base:{}, special: () => saveEq(vid, item)};
  $('#dlg-title').textContent = `${item} · ${v.plate}`;
  $('#dlg-body').innerHTML = `<div class="field full seg eq-seg" role="radiogroup" aria-label="Stan"><button type="button" class="${!e || e.ok ? 'on' : ''}" data-eq-ok="1">Jest, sprawna</button><button type="button" class="${e && !e.ok ? 'on' : ''}" data-eq-ok="0">Brak / niesprawna</button></div>
    ${dated ? `<label class="field"><span class="label">Ważna do</span><input id="eq-valid" type="date" value="${esc(e && e.validUntil || '')}"></label>` : ''}
    <label class="field"><span class="label">Sprawdzone dnia</span><input id="eq-checked" type="date" value="${esc(today())}"></label>
    <label class="field full"><span class="label">Notatka</span><input id="eq-note" value="${esc(e && e.note || '')}" placeholder="np. gaśnica 2 kg, wymieniona w Auto-Serwis"></label>
    <div class="warnline" id="dlg-warn" hidden></div>`;
  const del = $('#dlg-del'); del.hidden = !e; del.classList.remove('armed'); del.textContent = 'Usuń';
  $('#dlg-save').textContent = 'Zapisz'; $('#scrim').hidden = false;
}
async function saveEq(vid, item){
  const e = eqOf(vid, item), ok = document.querySelector('[data-eq-ok].on')?.dataset.eqOk!=='0';
  const row = {vehicleId: vid, item, ok, validUntil: ($('#eq-valid') || {}).value || null, checkedAt: $('#eq-checked').value || today(), note: $('#eq-note').value.trim() || null};
  const btn = $('#dlg-save'); btn.disabled = true;
  try { await db.collection('equipment').doc(e ? e.id : undefined).set(row); closeForm(); toast(`${item}: ${ok ? 'jest' : 'brak'}`); }
  catch(err){ handleWriteErr(err); } finally { btn.disabled = false; }
}
async function eqCheckAll(vid){
  const v = byId('vehicles', vid); if (!v || !canEq()) return;
  let n = 0;
  try { for (const [item] of EQ_ITEMS){ const e = eqOf(vid, item);
      if (e) await db.collection('equipment').doc(e.id).update({checkedAt: today()});
      else await db.collection('equipment').doc().set({vehicleId: vid, item, ok: true, checkedAt: today()}); n++; }
    toast(`${v.plate}: sprawdzone (${n})`);
  } catch(err){ handleWriteErr(err); }
}
function equipmentFact(v){
  if (!eqOn()) return null;
  const mine = S.equipment.filter(e => e.vehicleId===v.id); if (!mine.length) return '<span class="muted">nie sprawdzano</span>';
  const bad = mine.filter(e => ['bad', 'warn'].includes(eqState(e).cls));
  return bad.length ? bad.map(e => `<span class="pill ${eqState(e).cls}">${esc(e.item)}: ${esc(eqState(e).txt)}</span>`).join(' ') : `<span class="pill ok">komplet</span> <span class="muted small">${fdate(mine.map(e => e.checkedAt).filter(Boolean).sort().pop() || '')}</span>`;
}
document.addEventListener('click', e => {
  const f = e.target.closest('[data-eqf]'); if (f){ eqFilter = f.dataset.eqf===eqFilter ? 'all' : f.dataset.eqf; render(); return; }
  const o = e.target.closest('[data-eq-ok]'); if (o){ o.parentNode.querySelectorAll('button').forEach(b => b.classList.toggle('on', b===o)); return; }
  const c = e.target.closest('[data-eq]'); if (c){ e.preventDefault(); openEq(c.dataset.eq, c.dataset.item); return; }
  const a = e.target.closest('[data-eq-all]'); if (a){ e.preventDefault(); eqCheckAll(a.dataset.eqAll); }
});
