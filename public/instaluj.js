/* Emage FLEET — zachęta do dodania aplikacji do ekranu telefonu (ikona jak zwykła aplikacja, pełny ekran,
   na iPhonie warunek powiadomień). Pokazujemy na ekranie kierowcy, tylko w przeglądarce, do czasu „Nie teraz”. */
let installEvt = null;
const isIOSDev = () => /iphone|ipad|ipod/i.test(navigator.userAgent || '') || (navigator.platform==='MacIntel' && navigator.maxTouchPoints > 1);
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; if (typeof render==='function' && /#moje$|^$/.test(location.hash)) render(); });
addEventListener('appinstalled', () => { installEvt = null; try { localStorage.setItem('ef-install-off', '1'); } catch(_){} render(); });

function installHint(){
  if (isStandalone()) return '';
  try { if (localStorage.getItem('ef-install-off')) return ''; } catch(_){}
  const mobile = matchMedia('(max-width:900px)').matches || isIOSDev();
  if (!mobile) return '';
  const how = installEvt ? `<button class="small" data-install>${ic('plus')}Dodaj do ekranu</button>`
    : isIOSDev() ? `<span class="small">W Safari: <b>Udostępnij</b> (kwadrat ze strzałką) → <b>Do ekranu początkowego</b>.</span>`
    : `<span class="small">W menu przeglądarki (⋮) wybierz <b>Dodaj do ekranu głównego</b> / <b>Zainstaluj aplikację</b>.</span>`;
  return `<div class="inst">${ic('truck')}<div><b>Dodaj Emage FLEET do ekranu telefonu</b><span>Otwierasz jednym dotknięciem, jak zwykłą aplikację – i działają powiadomienia.</span><div class="inst-a">${how}<button class="small ghost" data-install-off>Nie teraz</button></div></div></div>`;
}
document.addEventListener('click', async e => {
  if (e.target.closest('[data-install]') && installEvt){ installEvt.prompt(); try { await installEvt.userChoice; } catch(_){} installEvt = null; render(); return; }
  if (e.target.closest('[data-install-off]')){ try { localStorage.setItem('ef-install-off', '1'); } catch(_){} render(); }
});
