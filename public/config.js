/* Emage FLEET — konfiguracja połączenia z Supabase.
   Dwie osobne bazy:
   - emage-fleet.com (docelowa, prawdziwe dane) → projekt EMAGE-FLEET-PROD,
   - każdy inny adres (…workers.dev, podgląd, lokalnie) → projekt testowy EMAGE-FLEET (stare dane, do sprawdzania zmian).
   Klucz „publishable” jest przeznaczony do aplikacji w przeglądarce – dostęp do danych
   chronią reguły bezpieczeństwa (RLS) w bazie. Nigdy nie wpisuj tu klucza secret / service_role. */
(function(){
  const prod = /(^|\.)emage-fleet\.com$/.test(location.hostname);
  window.CONFIG = prod ? {
    env: 'prod',
    supabaseUrl: 'https://lafvsafobvpoiipltdpg.supabase.co',
    supabaseKey: 'sb_publishable_rC9MIovfB2iuRaCA1jVrFg_KV9eCZkA',
  } : {
    env: 'test',
    supabaseUrl: 'https://nsvtnpvpbhnbrmygsbxy.supabase.co',
    supabaseKey: 'sb_publishable_CsKaojgyIrZgDNCm99tkNA_shQR_TJx',
  };
  if (!prod){
    document.documentElement.dataset.env = 'test';
    addEventListener('DOMContentLoaded', () => { const b = document.createElement('div'); b.id = 'env-bar'; b.innerHTML = 'WERSJA TESTOWA<span> – dane testowe · prawdziwa strona: emage-fleet.com</span>'; document.body.prepend(b); });
  }
})();
