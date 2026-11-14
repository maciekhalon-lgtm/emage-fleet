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

/* ---------- Raport e-mail w poniedziałek (funkcja „powiadomienia” + Resend) ---------- */
const reportEmail = () => (S.settings.find(x => x.id==='report_email') || {});
function reportEmailPanel(){
  if (!P().manage) return '';
  const r = reportEmail();
  return `<div class="panel"><div class="sec-head"><h3>Raport e-mail w poniedziałek</h3>${r.to ? '<span class="pill ok">włączony</span>' : '<span class="pill off">wyłączony</span>'}</div>
    <div class="re-box">
      <p class="muted" style="margin:0">W poniedziałek rano na podany adres przychodzi podsumowanie tygodnia: koszty, tankowania, usterki, terminy na 14 dni, wyposażenie i opony oraz lista spraw do zrobienia.</p>
      <label class="field"><span class="label">Adresy e-mail (po przecinku)</span><input id="re-to" type="text" inputmode="email" autocomplete="email" value="${esc(r.to || '')}" placeholder="np. flota@firma.pl"></label>
      <span class="re-btns"><button class="small" data-action="re-save">Zapisz</button>${r.to ? `<button class="small ghost" data-action="re-test">Wyślij próbny teraz</button>` : ''}</span>
      <p class="muted small" style="margin:0">Wysyłka idzie przez serwis Resend (darmowy do 3000 e-maili miesięcznie). Jednorazowo: załóż konto na resend.com, utwórz klucz API i wklej go w Supabase → Edge Functions → Secrets jako <b>RESEND_API_KEY</b>. Bez własnej domeny Resend wysyła tylko na adres, na który założysz konto.</p>
    </div></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action="re-save"],[data-action="re-test"]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  if (b.dataset.action==='re-save'){
    const to = ($('#re-to').value || '').split(/[,;\s]+/).map(x => x.trim()).filter(Boolean);
    const bad = to.filter(x => !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (bad.length){ toast('Niepoprawny adres: ' + bad.join(', ')); return; }
    try { const {id: _i, ...rest} = reportEmail(); await db.collection('settings').doc('report_email').set({...rest, to: to.join(', ')}); toast(to.length ? 'Zapisano – raport przyjdzie w poniedziałek' : 'Raport e-mail wyłączony'); }
    catch(err){ handleWriteErr(err); }
    return;
  }
  b.disabled = true; const old = b.textContent; b.textContent = 'Wysyłam…';
  try {
    const {data, error} = await sb.functions.invoke('powiadomienia', {body: {emailTest: true}});
    if (error) throw error;
    toast(data && data.email ? 'Raport e-mail: ' + data.email : 'Brak odpowiedzi funkcji');
  } catch(err){ toast('Nie udało się: ' + (err.message || err)); }
  finally { b.disabled = false; b.textContent = old; }
}, true);

/* ---------- Lokalizatory Geotab: status synchronizacji, ręczne przypisanie urządzeń ---------- */
const geotabSt = () => (S.settings.find(x => x.id==='geotab') || {});
const geotabMap = () => ((S.settings.find(x => x.id==='geotab_map') || {}).map) || {};
function geotabPanel(){
  if (!P().manage) return '';
  const st = geotabSt(), map = geotabMap(), gpsOn = optOn('gpsOdometer');
  const vs = S.vehicles.filter(v => v.status!=='wycofany').sort((a, b) => a.plate.localeCompare(b.plate));
  const last = gpsOn && S.gpsOdometer.length ? S.gpsOdometer.reduce((m, g) => g.day > m ? g.day : m, '') : '';
  const badge = !gpsOn ? '<span class="pill off">wymaga migracji 033</span>' : st.ok ? '<span class="pill ok">działa</span>' : st.error ? '<span class="pill bad">błąd</span>' : '<span class="pill off">nie podłączono</span>';
  const devs = Array.isArray(st.deviceList) ? st.deviceList : [];
  return `<div class="panel"><div class="sec-head"><h3>Lokalizatory GPS (Geotab)</h3>${badge}</div><div class="re-box">
    ${st.ok ? `<p style="margin:0">Ostatnia synchronizacja: <b>${esc(new Date(st.at).toLocaleString('pl-PL'))}</b> · urządzeń ${st.devices}, przypisanych do aut ${st.matched}${last ? ` · przebiegi do ${fdate(last)}` : ''}.</p>` : ''}
    ${st.error ? `<p class="warnline" style="margin:0">Geotab: ${esc(st.error)}</p>` : ''}
    <p class="muted" style="margin:0">Co rano aplikacja pobiera z Geotab stan licznika każdego busa. Z tego liczy przejechane km (Rozliczenie aut, rentowność, spalanie) i wyłapuje liczniki wpisane na stacji niezgodnie z GPS.</p>
    ${gpsOn ? `<span class="re-btns"><button class="small" data-action="geo-sync">Synchronizuj teraz</button></span>` : ''}
    ${typeof odoCfg==='function' ? (() => { const c = odoCfg(); return `<div class="odo-set"><b>Przebiegi – skąd brać km</b>
      <p class="muted small" style="margin:0">Terminy serwisowe na km (olej, rozrząd, przeglądy) zawsze liczą się z GPS; bez aktualnego odczytu – z najwyższego wpisanego licznika (oznaczone „przebieg bez GPS”). Poniżej wybierasz domyślne źródło km dla spalania, Rozliczenia aut i Rentowności – na tych ekranach możesz je chwilowo zmienić przełącznikiem „Km z:”.</p>
      <div class="field"><label for="odo-def">Domyślne źródło km</label><select id="odo-def" data-odo-set="def">${ODO_SRCS.map(([k, l]) => `<option value="${k}" ${c.def===k ? 'selected' : ''}>${k==='auto' ? 'Wszystkie liczniki razem' : l}</option>`).join('')}</select></div>
      <div class="field"><label for="odo-tol">Kontrola liczników: dopuszczalna różnica (km)</label><input id="odo-tol" type="number" inputmode="numeric" min="5" step="5" value="${c.tol}" data-odo-set="tol" style="max-width:140px"></div></div>`; })() : ''}
    ${devs.length ? `<div class="tablewrap"><table><thead><tr><th>Urządzenie</th><th>Auto</th></tr></thead><tbody>${devs.map(d => `<tr><td>${esc(d.name || d.plate || d.id)}${d.plate && d.plate!==d.name ? `<span class="sub muted">${esc(d.plate)}</span>` : ''}</td>
      <td><select data-geo-dev="${esc(d.id)}" aria-label="Auto dla ${esc(d.name || d.id)}"><option value="">${d.vehicle && !map[d.id] ? `auto: ${esc(d.vehicle)}` : '— nie przypisano —'}</option>${vs.map(v => `<option value="${esc(v.id)}" ${map[d.id]===v.id ? 'selected' : ''}>${esc(v.plate)}</option>`).join('')}</select></td></tr>`).join('')}</tbody></table></div>
      <p class="muted small" style="margin:0">Urządzenia przypisują się same po numerze rejestracyjnym, nazwie albo VIN. Jeśli któreś się nie dopasowało, wybierz auto ręcznie – zmiana działa od następnej synchronizacji.</p>` : ''}
    <details><summary class="small"><b>Jak podłączyć</b> (jednorazowo)</summary><ol class="small muted" style="margin:8px 0 0;padding-left:18px">
      <li>W MyGeotab: Administracja → Użytkownicy → dodaj użytkownika tylko do odczytu (np. „emage-fleet”, rola z podglądem pojazdów i danych silnika).</li>
      <li>W Supabase → Edge Functions → Secrets dodaj: <b>GEOTAB_DATABASE</b> (nazwa bazy z adresu MyGeotab), <b>GEOTAB_USER</b> (login), <b>GEOTAB_PASSWORD</b> (hasło). Hasło wpisujesz tylko Ty.</li>
      <li>Kliknij „Synchronizuj teraz” – za pierwszym razem pobierze ostatni miesiąc.</li></ol></details>
  </div></div>`;
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-action="geo-sync"]'); if (!b) return;
  e.preventDefault(); e.stopPropagation();
  b.disabled = true; const old = b.textContent; b.textContent = 'Pobieram z Geotab…';
  try {
    const {data, error} = await sb.functions.invoke('powiadomienia', {body: {geotabSync: true}});
    if (error) throw error;
    if (data && data.ok){ toast(`Geotab: ${data.matched} z ${data.devices} urządzeń, ${data.days} dni przebiegów${data.fuelChecked ? ', ' + data.fuelChecked + ' tankowań porównanych z GPS' : ''}`); await Promise.all(['settings', 'gpsOdometer', 'vehicles', 'fuelCardRows', 'odoGps'].map(c => refresh(c))); render(); }
    else toast('Geotab: ' + ((data && (data.error || data.geotab)) || 'brak odpowiedzi'));
  } catch(err){ toast('Nie udało się: ' + (err.message || err)); }
  finally { b.disabled = false; b.textContent = old; }
}, true);
document.addEventListener('change', async e => {
  const o = e.target.closest && e.target.closest('[data-odo-set]'); if (!o) return;
  const c = {...odoCfg()}; if (o.dataset.odoSet==='def') c.def = o.value; else { const n = Math.round(Number(o.value)); if (!(n >= 5 && n <= 2000)) return toast('Podaj różnicę od 5 do 2000 km'); c.tol = n; }
  try { await db.collection('settings').doc('odo_source').set(c); odoPick = null; toast('Zapisano'); } catch(err){ handleWriteErr(err); }
});
document.addEventListener('change', async e => {
  const s = e.target.closest && e.target.closest('[data-geo-dev]'); if (!s) return;
  const map = {...geotabMap()}; if (s.value) map[s.dataset.geoDev] = s.value; else delete map[s.dataset.geoDev];
  try { await db.collection('settings').doc('geotab_map').set({map}); toast('Zapisano – zadziała przy następnej synchronizacji'); } catch(err){ handleWriteErr(err); }
});
