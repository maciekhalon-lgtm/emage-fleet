/* Emage FLEET — komunikaty kierownika dla kierowców (np. „jutro kontrola ITD”, „zmiana godziny załadunku”).
   Zapis: settings, klucz 'announce' ({items:[{id,text,until,at,by}]}) – kierowcy czytają go dzięki migracji 023.
   Kierowca widzi aktywne komunikaty na górze swojego ekranu i oznacza je jako przeczytane (pamięta to jego przeglądarka). */

const annItems = () => (((S.settings.find(s => s.id==='announce') || {}).items) || []);
const annActive = () => annItems().filter(x => !x.until || x.until >= today()).sort((a, b) => (b.at || '').localeCompare(a.at || ''));
const annReadKey = 'ef-ann-read';
const annRead = () => { try { return new Set(JSON.parse(localStorage.getItem(annReadKey) || '[]')); } catch(_){ return new Set(); } };
function annMarkRead(id){ const s = annRead(); s.add(id); try { localStorage.setItem(annReadKey, JSON.stringify([...s].slice(-100))); } catch(_){} render(); }

/* ---------- kierowca ---------- */
function myAnnouncements(){
  const rd = annRead(), xs = annActive().filter(x => !rd.has(x.id));
  if (!xs.length) return '';
  return xs.map(x => `<div class="ann">${ic('bell')}<div class="ann-t"><span class="ann-h">Komunikat od kierownika · ${esc(fdate((x.at || '').slice(0, 10)))}</span><p>${esc(x.text).replace(/\n/g, '<br>')}</p></div>
    <button class="small" data-ann-read="${esc(x.id)}">${ic('check')}Przeczytane</button></div>`).join('');
}

/* ---------- kierownik ---------- */
function openAnnounce(){
  editing = {col:'announce', id: null, base:{}, special: saveAnnounce};
  const act = annActive();
  $('#dlg-title').textContent = 'Komunikat do kierowców';
  $('#dlg-body').innerHTML = `<div class="field full"><label for="ann-text">Treść</label><textarea id="ann-text" rows="4" maxlength="600" placeholder="np. Jutro od 6:00 kontrola ITD na A4 – sprawdźcie apteczki, gaśnice i karty kierowcy."></textarea></div>
    <div class="field"><label for="ann-until">Pokazuj do</label><input id="ann-until" type="date" value="${addDays(today(), 3)}"></div>
    <div class="field"><span class="label">Kto zobaczy</span><span class="muted small" style="padding-top:8px">wszyscy kierowcy – na górze ekranu „Moje auto”, dopóki nie klikną „Przeczytane”</span></div>
    ${act.length ? `<div class="field full"><span class="label">Aktywne komunikaty</span>${act.map(x => `<div class="mini"><span class="num">${fdate((x.at || '').slice(0, 10))}</span><span>${esc(x.text.length > 90 ? x.text.slice(0, 90) + '…' : x.text)}<span class="sub">do ${x.until ? fdate(x.until) : 'odwołania'}${x.by ? ' · ' + esc(x.by) : ''}</span></span><span class="mini-r"><button type="button" class="small ghost" data-ann-del="${esc(x.id)}">Usuń</button></span></div>`).join('')}</div>` : ''}
    <div class="warnline" id="dlg-warn" hidden></div>`;
  $('#dlg-save').textContent = 'Wyślij komunikat'; $('#dlg-del').hidden = true; $('#scrim').hidden = false;
  $('#ann-text').focus();
}
async function annWrite(items){ await db.collection('settings').doc('announce').set({items}); }
async function saveAnnounce(){
  const text = ($('#ann-text').value || '').trim(), until = $('#ann-until').value || null, w = $('#dlg-warn');
  if (!text){ w.textContent = 'Wpisz treść komunikatu.'; w.hidden = false; return; }
  const keep = annItems().filter(x => !x.until || x.until >= addDays(today(), -30)).slice(0, 30);   // stare po 30 dniach znikają
  try {
    await annWrite([{id: Math.random().toString(36).slice(2, 10), text, until, at: new Date().toISOString(), by: me.full_name || ''}, ...keep]);
    closeForm(); toast('Komunikat wysłany do kierowców');
  } catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', async e => {
  const r = e.target.closest('[data-ann-read]'); if (r){ e.preventDefault(); annMarkRead(r.dataset.annRead); return; }
  if (e.target.closest('[data-action="announce"]')){ e.preventDefault(); openAnnounce(); return; }
  const d = e.target.closest('[data-ann-del]');
  if (d){ e.preventDefault(); try { await annWrite(annItems().filter(x => x.id!==d.dataset.annDel)); toast('Komunikat usunięty'); openAnnounce(); } catch(err){ handleWriteErr(err); } }
});
