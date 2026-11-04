/* Kontrola paragonów: losowanie kierowców, którzy muszą dodać zdjęcie paragonu (ustawienie w Ustawieniach) */
const receiptPercent = () => { const s = S.settings.find(x => x.id==='receipts'); return s && s.percent!=null ? Number(s.percent) : 20; };

function checksSettingsPanel(){
  if (!P().manage) return '';
  return `<div class="panel"><div class="sec-head"><h3>Kontrola paragonów</h3><button class="small" data-action="save-checks">Zapisz</button></div>
    <div style="padding:14px 16px;display:flex;flex-direction:column;gap:8px">
      <label class="field" style="display:flex;flex-direction:column;gap:4px"><span class="label">Losowo % dni pracy</span><input id="sch-rcp" type="number" min="0" max="100" value="${receiptPercent()}" style="width:120px"></label>
      <span class="muted small">System codziennie losuje kierowców, którzy muszą dodać zdjęcie paragonu do tankowania. 0 = wyłączone.</span></div></div>`;
}

async function saveChecks(){
  const rp = Math.min(100, Math.max(0, Math.round(Number($('#sch-rcp').value))));
  if (Number.isNaN(rp)) return toast('Wpisz liczbę od 0 do 100');
  try { await db.collection('settings').doc('receipts').set({percent: rp}); toast('Zapisano kontrolę paragonów'); }
  catch(err){ handleWriteErr(err); }
}
document.addEventListener('click', e => {
  const t = e.target.closest('[data-action="save-checks"]');
  if (t && !t.closest('#dialog')) saveChecks();
});
