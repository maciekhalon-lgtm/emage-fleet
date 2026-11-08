/* Emage FLEET — moduły do włączenia i wyłączenia (Ustawienia → Moduły).
   Wyłączony moduł znika z ekranów (kierowcy i kierowników), dane zostają w bazie i wracają po włączeniu.
   Bez zapisanego ustawienia moduł jest włączony tylko wtedy, gdy ma już jakieś dane. */
'use strict';
const MODULES = [
  ['zaladunek', 'Załadunek', 'kierowca zgłasza załadunek na trasach załadunkowych; panel w Grafiku', () => (S.loadings || []).length > 0 || (S.loadingReports || []).length > 0],
  ['przystanki', 'Przystanki tras', 'lista klientów i adresów trasy u kierowcy, nawigacja w Mapach', () => (S.routeStops || []).length > 0],
  ['obsada', 'Podwójna obsada', 'drugi kierowca w przydziale i przy przejęciu auta, potwierdzenia drugiego kierowcy', () => S.bookings.some(b => b.coDriverId)],
];
const modSaved = () => S.settings.find(x => x.id==='modules') || {};
function modOn(k){
  const v = modSaved()[k]; if (v===true || v===false) return v;
  const m = MODULES.find(x => x[0]===k); return m ? !!m[3]() : true;
}
function modulesPanel(){
  if (!P().manage) return '';
  return `<div class="panel"><div class="sec-head"><h3>Moduły</h3><span class="muted small">wyłączone znikają z ekranów, dane zostają</span></div>
    <div class="dl">${MODULES.map(([k, l, d]) => `<label class="mini mod-row"><span><b>${l}</b><span class="sub">${d}</span></span><span></span>
      <span class="mini-r"><input type="checkbox" data-mod="${k}" ${modOn(k) ? 'checked' : ''} ${canWrite ? '' : 'disabled'} aria-label="${esc(l)}"></span></label>`).join('')}</div></div>`;
}
document.addEventListener('change', async e => {
  const t = e.target.closest('[data-mod]'); if (!t) return;
  const all = Object.fromEntries(MODULES.map(([k]) => [k, modOn(k)])); all[t.dataset.mod] = t.checked;
  try { await db.collection('settings').doc('modules').set(all); toast(`${MODULES.find(m => m[0]===t.dataset.mod)[1]}: ${t.checked ? 'włączony' : 'wyłączony'}`); }
  catch(err){ t.checked = !t.checked; handleWriteErr(err); }
});

/* ---------- Kalendarz terminów w telefonie (subskrypcja .ics) ----------
   Link z tajnym kluczem: przeglądy, OC, serwisy aut i ważność dokumentów kierowców jako wydarzenia całodniowe.
   Kalendarz w telefonie sam pobiera zmiany (Google co kilka godzin, iPhone wg ustawień). */
const calToken = () => String((S.settings.find(x => x.id==='calendar') || {}).token || '');
const calUrl = t => `${CONFIG.supabaseUrl}/functions/v1/powiadomienia?kal=${t}`;
function calendarPanel(){
  if (!P().manage) return '';
  return `<div class="panel"><div class="sec-head"><h3>Terminy w kalendarzu telefonu</h3><button class="small" data-action="cal-open">${ic('cal')}${calToken() ? 'Pokaż link' : 'Utwórz link'}</button></div>
    <p class="muted sec-empty">Przeglądy, OC, serwisy i ważność dokumentów kierowców w Twoim kalendarzu Google lub iPhone – z przypomnieniem tydzień wcześniej. Zmiany w aplikacji same trafiają do kalendarza.</p></div>`;
}
async function openCalendar(renew){
  if (!P().manage) return;
  let t = calToken();
  if (!t || renew){
    if (!canWrite) return toast('Brak uprawnień do zapisu');
    const a = new Uint8Array(24); crypto.getRandomValues(a); t = [...a].map(x => x.toString(16).padStart(2, '0')).join('');
    try { await db.collection('settings').doc('calendar').set({token: t}); } catch(err){ return handleWriteErr(err); }
  }
  const url = calUrl(t), web = url.replace(/^https:/, 'webcal:');
  editing = {col:'calendar', id: null, base:{}, special: () => closeForm()};
  $('#dlg-title').textContent = 'Terminy w kalendarzu telefonu';
  $('#dlg-body').innerHTML = `<div class="field full"><span class="label">Link do kalendarza</span><input id="cal-url" readonly value="${esc(url)}"><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:8px">
      <button type="button" class="small" data-action="cal-copy">${ic('clip')}Kopiuj link</button><a class="btn small" href="${esc(web)}">${ic('cal')}Otwórz w kalendarzu (iPhone, Mac)</a></div></div>
    <div class="field full"><span class="label">Google (Android)</span><span class="small">Na komputerze: calendar.google.com → <b>Inne kalendarze</b> „+” → <b>Z adresu URL</b> → wklej link. Pojawi się też w telefonie.</span></div>
    <div class="field full"><span class="label">iPhone</span><span class="small">Przycisk „Otwórz w kalendarzu” albo Ustawienia → Kalendarz → Konta → Dodaj konto → Inne → <b>Dodaj subskrybowany kalendarz</b> → wklej link.</span></div>
    <p class="muted small field full">Kto ma ten link, widzi terminy floty – nie wysyłaj go poza firmę. <button type="button" class="link" data-action="cal-renew">Utwórz nowy link</button> (stary przestanie działać).</p>`;
  $('#dlg-save').textContent = 'Zamknij'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-action="cal-open"]')){ e.preventDefault(); openCalendar(false); return; }
  if (e.target.closest('[data-action="cal-renew"]')){ e.preventDefault(); openCalendar(true); return; }
  if (e.target.closest('[data-action="cal-copy"]')){ e.preventDefault(); try { await navigator.clipboard.writeText($('#cal-url').value); toast('Skopiowano link'); } catch(_){ $('#cal-url').select(); toast('Zaznaczono – skopiuj Ctrl+C'); } }
});
