// Emage FLEET — funkcja „powiadomienia” (Supabase Edge Function, Deno)
//
// Wywołania:
//  • codziennie rano z harmonogramu (pg_cron) z nagłówkiem x-cron-secret
//    → każda osoba dostaje jedno podsumowanie spraw na dziś (o ile coś jest),
//  • z aplikacji przyciskiem „Wyślij test” (zalogowany użytkownik)
//    → testowe powiadomienie tylko do tej osoby,
//  • od razu z bazy przy zdarzeniu (auto niesprawne, podejrzane tankowanie, spory, sprawy do potwierdzenia)
//    z nagłówkiem x-cron-secret i treścią {mode:'event', roles, users, title, body, tag}.
//  • w poniedziałek poranne wywołanie wysyła kierownikom floty dodatkowo „Tydzień floty” (koszty, tankowania, usterki, terminy),
//  • GET ?kal=<token> – kalendarz terminów (.ics) do subskrypcji w Google / iPhone; token tworzy aplikacja (Ustawienia).
//
// Sekrety funkcji (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (np. mailto:flota@firma.pl); CRON_SECRET już niepotrzebny (klucz w bazie, migracja 031)
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase dodaje sam.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2';

// ===== LOGIKA (bez zależności – testowana osobno) =====
export type Row = Record<string, any>;
export type Data = {profiles: Row[]; drivers: Row[]; vehicles: Row[]; deadlines: Row[]; bookings: Row[]; issues: Row[]; costs: Row[]; settings: Row[]; cardRows?: Row[]; contracts?: Row[]; equipment?: Row[]; tires?: Row[]};

const DAY = 864e5;
export const addDays = (iso: string, n: number) => new Date(Date.parse(iso + 'T12:00:00Z') + n * DAY).toISOString().slice(0, 10);
export const diffDays = (a: string, b: string) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / DAY);
const dm = (iso: string) => iso ? `${iso.slice(8, 10)}.${iso.slice(5, 7)}` : '';
const zl = (n: number) => new Intl.NumberFormat('pl-PL', {maximumFractionDigits: 0}).format(n) + ' zł';
const kmf = (n: number) => new Intl.NumberFormat('pl-PL').format(n) + ' km';

/* Lista spraw na dziś dla jednej osoby; najpilniejsze najpierw (priorytet 0 = pilne). */
export function itemsFor(p: Row, d: Data, today: string): {pri: number; text: string}[] {
  const out: {pri: number; text: string}[] = [];
  const veh = (id: string) => d.vehicles.find(v => v.id === id);
  const plate = (id: string) => veh(id)?.plate || 'auto';
  const drvName = (id: string) => d.drivers.find(x => x.id === id)?.full_name || 'kierowca';
  const tomorrow = addDays(today, 1);

  if (p.role === 'kierowca' && p.driver_id){
    const mine = d.bookings.filter(b => b.driver_id === p.driver_id);
    mine.filter(b => b.date_from === tomorrow && b.pickup_km == null)
      .forEach(b => out.push({pri: 1, text: `Jutro odbierasz ${plate(b.vehicle_id)}${b.purpose ? ' – ' + b.purpose : ''}`}));
    mine.filter(b => b.date_from === today && b.pickup_km == null)
      .forEach(b => out.push({pri: 1, text: `Dziś odbierasz ${plate(b.vehicle_id)}${b.purpose ? ' – ' + b.purpose : ''}`}));
    mine.filter(b => b.pickup_km != null && b.return_km == null && b.date_to < today)
      .forEach(b => out.push({pri: 0, text: `Oddaj ${plate(b.vehicle_id)} – rezerwacja skończyła się ${dm(b.date_to)}`}));
    mine.filter(b => b.pickup_km != null && b.return_km == null && b.date_to === today)
      .forEach(b => out.push({pri: 1, text: `Dziś oddajesz ${plate(b.vehicle_id)}`}));
    const me = d.drivers.find(x => x.id === p.driver_id);
    for (const [k, label, lost, valid] of [['license_expiry', 'Prawo jazdy', 'straciło', 'ważne'], ['medical_expiry', 'Badania lekarskie', 'straciły', 'ważne'], ['psych_expiry', 'Badania psychologiczne', 'straciły', 'ważne']] as const){
      const x = me?.[k]; if (!x) continue;
      const dd = diffDays(today, x);
      if (dd < 0) out.push({pri: 0, text: `${label} ${lost} ważność ${dm(x)}`});
      else if ([30, 14, 7, 3, 1, 0].includes(dd)) out.push({pri: dd <= 7 ? 0 : 2, text: `${label} ${valid} do ${dm(x)}`});
    }
    // busy, za które kierowca odpowiada: terminy, przebieg, niesprawność
    d.vehicles.filter(v => v.status !== 'wycofany' && (v.responsible || []).includes(p.driver_id)).forEach(v => {
      d.deadlines.filter(t => t.vehicle_id === v.id).forEach(t => {
        if (t.type === 'Koniec gwarancji' && (diffDays(today, t.date) < 0 || (t.km_due && v.km && t.km_due - v.km <= 0))) return;   // zakończona gwarancja to nie alarm
        const dd = diffDays(today, t.date);
        if (dd < 0) out.push({pri: 0, text: `Twój bus ${v.plate}: ${t.type} po terminie (${dm(t.date)})`});
        else if (dd <= 7) out.push({pri: 1, text: `Twój bus ${v.plate}: ${t.type} ${dm(t.date)}`});
        if (t.km_due && v.km){
          const left = t.km_due - v.km;
          if (left <= 0) out.push({pri: 0, text: `Twój bus ${v.plate}: ${t.type} – przebieg przekroczony`});
          else if (left <= (t.remind_km || 1000)) out.push({pri: 1, text: `Twój bus ${v.plate}: ${t.type} za ${kmf(left)}`});
        }
      });
      d.issues.filter(i => i.vehicle_id === v.id && i.status !== 'naprawione' && i.severity === 'stop')
        .forEach(i => out.push({pri: 0, text: `Twój bus ${v.plate} niesprawny: ${i.title}`}));
    });
    return out;
  }

  if (p.role === 'floty' || p.role === 'serwisu'){
    // auta zablokowane (przegląd / OC po terminie)
    d.vehicles.filter(v => v.status !== 'wycofany').forEach(v => {
      const late = d.deadlines.filter(t => t.vehicle_id === v.id && ['Przegląd techniczny', 'Ubezpieczenie OC'].includes(t.type) && t.date < today);
      if (late.length) out.push({pri: 0, text: `${v.plate} zablokowane: ${late.map(t => t.type + ' po terminie').join(', ')}`});
    });
    // opony sezonowe
    const md = today.slice(5);
    const tl = md >= '10-01' && md <= '12-31' ? d.vehicles.filter(v => v.status !== 'wycofany' && v.tires === 'letnie')
             : md >= '04-01' && md <= '05-31' ? d.vehicles.filter(v => v.status !== 'wycofany' && v.tires === 'zimowe') : [];
    if (tl.length) out.push({pri: md >= '10-15' || (md >= '04-20' && md <= '05-31') ? 1 : 2, text: `${tl.length} ${tl.length === 1 ? 'auto' : 'aut(a)'} do wymiany opon na ${md >= '10-01' ? 'zimowe' : 'letnie'}: ${tl.slice(0, 5).map(v => v.plate).join(', ')}`});
    d.deadlines.forEach(t => {
      const v = veh(t.vehicle_id); if (!v || v.status === 'wycofany') return;
      if (t.type === 'Koniec gwarancji' && (diffDays(today, t.date) < 0 || (t.km_due && v.km && t.km_due - v.km <= 0))) return;   // zakończona gwarancja to nie alarm
      const dd = diffDays(today, t.date);
      if (dd < 0) out.push({pri: 0, text: `${v.plate}: ${t.type} po terminie (${dm(t.date)})`});
      else if (dd === 0) out.push({pri: 0, text: `${v.plate}: ${t.type} dziś`});
      else if (dd <= 7) out.push({pri: 1, text: `${v.plate}: ${t.type} ${dm(t.date)}`});
      if (t.km_due && v.km){
        const left = t.km_due - v.km;
        if (left <= 0) out.push({pri: 0, text: `${v.plate}: ${t.type} – przebieg przekroczony o ${kmf(-left)}`});
        else if (left <= (t.remind_km || 1000)) out.push({pri: 1, text: `${v.plate}: ${t.type} za ${kmf(left)}`});
      }
    });
    d.issues.filter(i => i.status !== 'naprawione' && i.severity === 'stop')
      .forEach(i => out.push({pri: 0, text: `${plate(i.vehicle_id)} niesprawne: ${i.title}`}));
    d.issues.filter(i => i.status === 'nowe' && i.severity !== 'stop' && i.date >= addDays(today, -1))
      .forEach(i => out.push({pri: 2, text: `Nowa usterka ${plate(i.vehicle_id)}: ${i.title}`}));
    d.bookings.filter(b => b.pickup_km != null && b.return_km == null && b.date_to < today)
      .forEach(b => out.push({pri: 1, text: `${plate(b.vehicle_id)} nie wróciło – ${drvName(b.driver_id)}, termin ${dm(b.date_to)}`}));
  }

  if (p.role === 'floty'){
    const fl = d.costs.filter(c => c.flag_state === 'open').length;
    if (fl) out.push({pri: 1, text: `${fl} ${fl === 1 ? 'tankowanie' : 'tankowań/tankowania'} do wyjaśnienia`});
    // tankowania z kart: więcej niż bak, jeszcze nie oznaczone jako sprawdzone (ostatnie 35 dni)
    const checked = new Set<string>(d.settings.find(s => s.key === 'fc_checked')?.value?.ids || []);
    const over = (d.cardRows || []).filter(r => r.kind !== 'other' && !checked.has(r.id) && Number(r.liters) > Number(veh(r.vehicle_id)?.tank_l || 90) * 1.05);
    if (over.length) out.push({pri: 1, text: `${over.length} ${over.length === 1 ? 'tankowanie' : 'tankowań/tankowania'} z karty ponad pojemność baku – Paliwo → Karty paliwowe`});
    const pend = d.profiles.filter(x => x.status === 'pending').length;
    if (pend) out.push({pri: 1, text: `${pend} ${pend === 1 ? 'konto czeka' : pend < 5 ? 'konta czekają' : 'kont czeka'} na zatwierdzenie`});
    const month = today.slice(0, 7);
    const inM = d.costs.filter(c => String(c.date).startsWith(month));
    d.vehicles.forEach(v => {
      if (!v.monthly_limit) return;
      const s = inM.filter(c => c.vehicle_id === v.id).reduce((a, c) => a + Number(c.amount || 0), 0);
      if (s > Number(v.monthly_limit)) out.push({pri: 1, text: `${v.plate}: limit kosztów przekroczony (${zl(s)} z ${zl(Number(v.monthly_limit))})`});
    });
    const budget = Number(d.settings.find(s => s.key === 'budget')?.value?.monthly || 0);
    if (budget){
      const s = inM.reduce((a, c) => a + Number(c.amount || 0), 0);
      if (s > budget) out.push({pri: 1, text: `Budżet floty przekroczony: ${zl(s)} z ${zl(budget)}`});
    }
    const soon = d.bookings.filter(b => b.return_km == null && b.date_to >= today && b.date_from <= addDays(today, 7));
    const clash = new Set<string>();
    for (let i = 0; i < soon.length; i++) for (let j = i + 1; j < soon.length; j++){
      const a = soon[i], b = soon[j];
      if (a.vehicle_id === b.vehicle_id && a.date_from <= b.date_to && b.date_from <= a.date_to) clash.add(a.vehicle_id);
    }
    clash.forEach(id => out.push({pri: 1, text: `${plate(id)}: nakładające się rezerwacje w najbliższym tygodniu`}));
    // dziś / jutro w grafiku: auto niesprawne lub w serwisie, albo kierowca z nieważnymi dokumentami
    const tm = addDays(today, 1);
    d.bookings.filter(b => b.pickup_km == null && b.return_km == null && b.date_to >= today && b.date_from <= tm).forEach(b => {
      const when = b.date_from <= today ? 'dziś' : 'jutro', v = veh(b.vehicle_id);
      const day = b.date_from <= today ? today : tm;
      if ((v && v.status === 'serwis') || d.issues.some(i => i.vehicle_id === b.vehicle_id && i.status !== 'naprawione' && i.severity === 'stop'))
        out.push({pri: 0, text: `${plate(b.vehicle_id)} niesprawne, a ${when} w grafiku (${drvName(b.driver_id)}) – zmień auto`});
      [b.driver_id, b.co_driver_id].filter(Boolean).forEach(id => { const dr = d.drivers.find(x => x.id === id); if (!dr) return;
        const bad = [['license_expiry', 'prawo jazdy'], ['medical_expiry', 'badania lekarskie'], ['psych_expiry', 'badania psych.']].filter(([k]) => dr[k] && dr[k] < day).map(([, l]) => l);
        if (bad.length) out.push({pri: 0, text: `${dr.full_name} ${when} w grafiku, a ma nieważne: ${bad.join(', ')}`}); });
    });
  }
  return out;
}

/* Podsumowanie tygodnia dla kierownika floty (wysyłane w poniedziałek rano). */
export function weekly(d: Data, today: string, costs: Row[]){
  const w0 = addDays(today, -7), w1 = addDays(today, -14);
  const sum = (a: string, b: string) => costs.filter(c => c.date >= a && c.date < b).reduce((s, c) => s + Number(c.amount || 0), 0);
  const now = sum(w0, today), prev = sum(w1, w0);
  const fills = costs.filter(c => c.date >= w0 && c.date < today && c.category === 'Paliwo').length
    + (d.cardRows || []).filter(r => r.kind !== 'other' && r.tx_date >= w0 && r.tx_date < today && !r.cost_id).length;
  const newIss = d.issues.filter(i => i.date >= w0).length;
  const soon = d.deadlines.filter(t => { const v = d.vehicles.find(x => x.id === t.vehicle_id); return v && v.status !== 'wycofany' && diffDays(today, t.date) <= 14; }).length;
  const ch = prev ? Math.round((now - prev) / prev * 100) : null;
  const lines = [
    `• Koszty: ${zl(now)}${ch !== null ? ` (${ch > 0 ? '+' : ''}${ch}% wobec poprzedniego tygodnia)` : ''}`,
    `• Tankowania: ${fills}`,
    `• Nowe usterki: ${newIss}`,
    `• Terminy w ciągu 14 dni (lub po terminie): ${soon}`,
  ];
  // moduły z migracji 027–029 (gdy tabel nie ma – listy są puste i linie się nie pokazują)
  const active = (vid: string) => { const v = d.vehicles.find(x => x.id === vid); return v && v.status !== 'wycofany'; };
  const fire = (d.equipment || []).filter(e => active(e.vehicle_id) && (!e.ok || (e.valid_until && diffDays(today, e.valid_until) <= 30))).length;
  if (fire) lines.push(`• Wyposażenie do poprawy (braki, gaśnice ≤ 30 dni): ${fire}`);
  const worn = (d.tires || []).filter(t => t.location === 'na_aucie' && active(t.vehicle_id) && t.tread_mm != null && Number(t.tread_mm) < (t.season === 'letnie' ? 3 : 4)).length;
  if (worn) lines.push(`• Auta na zużytych oponach: ${worn}`);
  const ending = (d.contracts || []).filter(c => active(c.vehicle_id) && c.end_date && diffDays(today, c.end_date) >= 0 && diffDays(today, c.end_date) <= 90).length;
  if (ending) lines.push(`• Umowy leasingu / najmu kończące się w 90 dni: ${ending}`);
  return {title: `Emage FLEET – tydzień ${dm(w0)}–${dm(addDays(today, -1))}`, body: lines.join('\n')};
}

/* Kalendarz terminów (iCalendar) – aut i dokumentów kierowców. */
export function ics(d: Data, stamp: string){
  const esc = (t: string) => String(t).replace(/\\/g, '\\\\').replace(/[,;]/g, m => '\\' + m).replace(/\n/g, '\\n');
  const day = (iso: string) => iso.replace(/-/g, '');
  const ev: string[] = [];
  const add = (uid: string, date: string, title: string, desc: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return;
    ev.push(['BEGIN:VEVENT', `UID:${uid}@emage-fleet`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${day(date)}`, `DTEND;VALUE=DATE:${day(addDays(date, 1))}`,
      `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, 'TRANSP:TRANSPARENT',
      'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-P7D', 'END:VALARM', 'END:VEVENT'].join('\r\n'));
  };
  d.deadlines.forEach(t => { const v = d.vehicles.find(x => x.id === t.vehicle_id); if (!v || v.status === 'wycofany') return;
    add('dl-' + t.id, t.date, `${v.plate}: ${t.type}`, `${[v.make, v.model].filter(Boolean).join(' ')}${t.km_due ? ' · lub przy ' + kmf(t.km_due) : ''}${t.note ? ' · ' + t.note : ''}`); });
  d.drivers.filter(x => x.active !== false).forEach(x => [['license_expiry', 'prawo jazdy'], ['medical_expiry', 'badania lekarskie'], ['psych_expiry', 'badania psychologiczne']]
    .forEach(([k, l]) => x[k] && add(`dr-${x.id}-${k}`, x[k], `${x.full_name}: ${l}`, `ważne do ${x[k].split('-').reverse().join('.')}`)));
  // linie dłuższe niż 75 bajtów zawijamy (wymóg formatu), licząc bajty UTF-8 – polskie litery mają 2
  (d.contracts || []).forEach(c => { const v = d.vehicles.find(x => x.id === c.vehicle_id); if (!v || v.status === 'wycofany' || !c.end_date) return;
    add('ct-' + c.id, c.end_date, `${v.plate}: koniec umowy (${c.kind})`, [c.provider, c.contract_no].filter(Boolean).join(' · ')); });
  (d.equipment || []).forEach(e => { const v = d.vehicles.find(x => x.id === e.vehicle_id); if (!v || v.status === 'wycofany' || !e.valid_until) return;
    add('eq-' + e.id, e.valid_until, `${v.plate}: ${e.item} – ważność`, e.note || ''); });
  const fold = (line: string) => { const enc = new TextEncoder(), out: string[] = []; let cur = '', n = 0;
    for (const ch of line){ const b = enc.encode(ch).length; if (n + b > 73){ out.push(cur); cur = ' '; n = 1; } cur += ch; n += b; }
    out.push(cur); return out.join('\r\n'); };
  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Emage Group//Emage FLEET//PL', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'X-WR-CALNAME:Emage FLEET – terminy', 'X-WR-TIMEZONE:Europe/Warsaw', 'REFRESH-INTERVAL;VALUE=DURATION:PT6H', 'X-PUBLISHED-TTL:PT6H',
    ...ev.flatMap(e => e.split('\r\n')).map(fold), 'END:VCALENDAR'].join('\r\n') + '\r\n';
}

/* Jedno powiadomienie z listy spraw. */
export function digest(items: {pri: number; text: string}[], title?: string){
  const s = items.slice().sort((a, b) => a.pri - b.pri);
  const n = s.length;
  const word = n === 1 ? 'sprawa' : (n % 10 >= 2 && n % 10 <= 4 && (n % 100 < 10 || n % 100 >= 20)) ? 'sprawy' : 'spraw';
  const lines = s.slice(0, 4).map(x => '• ' + x.text);
  if (n > 4) lines.push(`…i ${n - 4} więcej`);
  return {title: title || `Emage FLEET – ${n} ${word} na dziś`, body: lines.join('\n')};
}
// ===== KONIEC LOGIKI =====


/* ---------- Geotab (lokalizatory GPS): dzienne stany licznika → tabela gps_odometer (migracja 033) ---------- */
export const normPlate = (x: string) => String(x || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
/* Licznik z Geotab: StatusData w metrach; gdy wartość wygląda na km (auta < 3 mln km), zostawiamy */
export const odoKm = (v: number) => v > 3e6 ? v / 1000 : v;
/* Dopasowanie urządzenia do auta: ręczna mapa → numer rejestracyjny → nazwa urządzenia → VIN */
export function matchDevices(devices: Row[], vehicles: Row[], manual: Record<string, string>){
  const byPlate = new Map(vehicles.filter(v => v.status !== 'wycofany').map(v => [normPlate(v.plate), v]));
  const byVin = new Map(vehicles.filter(v => v.vin).map(v => [String(v.vin).toUpperCase(), v]));
  const map = new Map<string, Row>(), unmatched: string[] = [];
  for (const d of devices){
    let v: Row | undefined = manual[d.id] ? vehicles.find(x => x.id === manual[d.id]) : undefined;
    if (!v) v = byPlate.get(normPlate(d.licensePlate)) || byPlate.get(normPlate(d.name));
    if (!v){ const n = normPlate(d.name); v = vehicles.find(x => x.status !== 'wycofany' && n && n.includes(normPlate(x.plate))); }
    if (!v && d.vehicleIdentificationNumber) v = byVin.get(String(d.vehicleIdentificationNumber).toUpperCase());
    if (v) map.set(d.id, v); else unmatched.push(String(d.name || d.licensePlate || d.serialNumber || d.id));
  }
  return {map, unmatched};
}
/* Najwyższy licznik na auto i dzień (strefa Europe/Warsaw) */
export function dailyMax(readings: Row[], map: Map<string, Row>){
  const day = (iso: string) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date(iso));
  const out = new Map<string, {vehicle_id: string; day: string; km: number; device: string}>();
  for (const r of readings){
    const v = map.get(r.device && r.device.id); if (!v || r.data == null || !r.dateTime) continue;
    const km = Math.round(odoKm(Number(r.data)) * 10) / 10; if (!(km > 0)) continue;
    const k = v.id + '|' + day(r.dateTime), o = out.get(k);
    if (!o || km > o.km) out.set(k, {vehicle_id: v.id, day: day(r.dateTime), km, device: r.device.id});
  }
  return [...out.values()];
}
async function geotabSync(sb: any, key: (k: string) => string, days: number){
  const db = key('GEOTAB_DATABASE'), user = (Deno.env.get('GEOTAB_USER') || '').trim(), pass = (Deno.env.get('GEOTAB_PASSWORD') || '').trim();
  const status = async (o: Record<string, unknown>) => { await sb.from('settings').upsert({key: 'geotab', value: {...o, at: new Date().toISOString()}}, {onConflict: 'key'}); return o; };
  if (!db || !user || !pass) return {geotab: 'brak sekretów GEOTAB_DATABASE / GEOTAB_USER / GEOTAB_PASSWORD'};
  const host0 = (Deno.env.get('GEOTAB_SERVER') || 'my.geotab.com').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const rpc = async (host: string, method: string, params: Record<string, unknown>) => {
    const r = await fetch(`https://${host}/apiv1`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({method, params})});
    const j = await r.json().catch(() => ({}));
    if (j.error) throw new Error((j.error.errors && j.error.errors[0] && j.error.errors[0].name ? j.error.errors[0].name + ': ' : '') + (j.error.message || 'błąd Geotab'));
    return j.result;
  };
  try {
    const auth = await rpc(host0, 'Authenticate', {database: db, userName: user, password: pass});
    const host = !auth.path || auth.path === 'ThisServer' ? host0 : String(auth.path).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cred = auth.credentials;
    const devices: Row[] = await rpc(host, 'Get', {typeName: 'Device', credentials: cred, resultsLimit: 5000});
    const {data: vehicles} = await sb.from('vehicles').select('id, plate, vin, status');
    const {data: mrow} = await sb.from('settings').select('value').eq('key', 'geotab_map').maybeSingle();
    const {map, unmatched} = matchDevices(devices, vehicles || [], (mrow && mrow.value && mrow.value.map) || {});
    const to = new Date(), rows: Row[] = [];
    // po 10 dni naraz, oba liczniki (skorygowany pierwszy – ten pokazuje MyGeotab)
    for (let back = days; back > 0; back -= 10){
      const fromDate = new Date(to.getTime() - back * DAY).toISOString(), toDate = new Date(to.getTime() - Math.max(0, back - 10) * DAY).toISOString();
      for (const diag of ['DiagnosticOdometerAdjustmentId', 'DiagnosticOdometerId']){
        const got: Row[] = await rpc(host, 'Get', {typeName: 'StatusData', credentials: cred, resultsLimit: 50000, search: {diagnosticSearch: {id: diag}, fromDate, toDate}});
        // licznik surowy tylko dla urządzeń bez skorygowanego
        const have = new Set(rows.map(r => r.device && r.device.id));
        got.forEach(r => { if (diag === 'DiagnosticOdometerAdjustmentId' || !have.has(r.device && r.device.id)) rows.push(r); });
      }
    }
    const daily = dailyMax(rows, map);
    for (let i = 0; i < daily.length; i += 500){
      const {error} = await sb.from('gps_odometer').upsert(daily.slice(i, i + 500).map(x => ({...x, updated_at: new Date().toISOString()})), {onConflict: 'vehicle_id,day'});
      if (error) throw new Error('zapis: ' + error.message);
    }
    // aktualny przebieg auta: ostatni licznik z GPS, jeśli większy niż zapisany
    const last = new Map<string, number>(); daily.forEach(x => { if (!last.has(x.vehicle_id) || x.km > (last.get(x.vehicle_id) as number)) last.set(x.vehicle_id, x.km); });
    let upd = 0;
    for (const [vid, km] of last){ const v = (vehicles || []).find((x: Row) => x.id === vid); const {data: cur} = await sb.from('vehicles').select('km').eq('id', vid).maybeSingle();
      if (v && (!cur || !cur.km || Number(cur.km) < km)){ await sb.from('vehicles').update({km: Math.round(km)}).eq('id', vid); upd++; } }
    return await status({ok: true, devices: devices.length, matched: map.size, unmatched, readings: rows.length, days: daily.length, kmUpdated: upd,
      deviceList: devices.map(d => ({id: d.id, name: d.name || '', plate: d.licensePlate || '', vehicle: map.get(d.id) ? map.get(d.id)!.plate : null}))});
  } catch (e) {
    return await status({ok: false, error: String((e as Error).message || e).slice(0, 300)});
  }
}

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'}});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ok: true});
  const env = (k: string) => (Deno.env.get(k) || '').trim();
  // klucze wklejane ręcznie w sekretach: usuwamy spacje, entery, cudzysłowy i końcowe „=”
  const key = (k: string) => env(k).replace(/\s+/g, '').replace(/^["']|["']$/g, '').replace(/=+$/, '');
  // klucz serwisowy: nowe projekty mają SUPABASE_SECRET_KEYS (JSON), starsze SUPABASE_SERVICE_ROLE_KEY – bierzemy, co jest
  const secretKey = (() => { try { const o = JSON.parse(env('SUPABASE_SECRET_KEYS') || '{}'); return String(o.default || Object.values(o)[0] || ''); } catch { return ''; } })() || env('SUPABASE_SERVICE_ROLE_KEY');
  const sb = createClient(env('SUPABASE_URL'), secretKey, {auth: {persistSession: false}});

  // kalendarz terminów: GET ?kal=<token> (token z ustawień „calendar”, tworzony w aplikacji)
  const kal = new URL(req.url).searchParams.get('kal');
  if (req.method === 'GET' && kal){
    const {data: cal} = await sb.from('settings').select('value').eq('key', 'calendar').maybeSingle();
    const tok = String(cal?.value?.token || '');
    if (!tok || tok.length < 20 || kal !== tok) return new Response('Nieprawidłowy link kalendarza', {status: 403});
    const all = async (t: string) => { const {data} = await sb.from(t).select('*').limit(20000); return data || []; };   // brak tabeli → pusta lista
    const dd = {profiles: [], vehicles: await all('vehicles'), drivers: await all('drivers'), deadlines: await all('deadlines'), bookings: [], issues: [], costs: [], settings: [],
      contracts: await all('vehicle_contracts'), equipment: await all('equipment')} as Data;
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    return new Response(ics(dd, stamp), {headers: {'Content-Type': 'text/calendar; charset=utf-8', 'Content-Disposition': 'inline; filename="emage-fleet.ics"', 'Cache-Control': 'max-age=1800'}});
  }

  if (!key('VAPID_PUBLIC_KEY') || !key('VAPID_PRIVATE_KEY')) return json({error: 'Brak kluczy VAPID w sekretach funkcji'}, 500);
  // klucz publiczny: ten zapisany przez aplikację w bazie (settings 'push') jest pewny – sekret VAPID_PUBLIC_KEY tylko awaryjnie
  const {data: pushRow} = await sb.from('settings').select('value').eq('key', 'push').maybeSingle();
  const pubKey = String(pushRow?.value?.vapidPublicKey || '').trim() || key('VAPID_PUBLIC_KEY');
  const subject = /^(mailto:|https:)/.test(env('VAPID_SUBJECT')) ? env('VAPID_SUBJECT') : 'mailto:flota@example.com';
  try { webpush.setVapidDetails(subject, pubKey, key('VAPID_PRIVATE_KEY')); }
  catch (e) { return json({error: 'Zły klucz w sekretach funkcji: ' + String((e as Error).message || e) + ' (VAPID_PRIVATE_KEY ma ok. 43 znaki – skopiuj go z aplikacji po „Wygeneruj klucze”)'}, 500); }

  // nagłówek z harmonogramu czyścimy tak samo jak sekret (spacje, cudzysłowy, końcowe „=”), inaczej sekret base64 nigdy się nie zgadza
  const norm = (x: string) => x.replace(/\s+/g, '').replace(/^["']|["']$/g, '').replace(/=+$/, '');
  // harmonogram: klucz losowany w bazie (migracja 031, private.cron_token) albo – dla zgodności – CRON_SECRET z sekretów funkcji
  const hdr = norm(req.headers.get('x-cron-secret') || '');
  let isCron = !!hdr && !!key('CRON_SECRET') && hdr === key('CRON_SECRET');
  if (!isCron && hdr){ const {data: ok} = await sb.rpc('cron_token_ok', {t: hdr}); isCron = ok === true; }
  const body = await req.json().catch(() => ({}));
  let testUser: string | null = null;
  if (!isCron){
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return json({error: 'Brak uprawnień (brak tokenu)'}, 401);
    // podpis tokenu sprawdzamy kluczami projektu (JWKS) – nie zależy od sesji na serwerze logowania
    let uid = '';
    const auth: any = sb.auth;
    const {data: cl, error: clErr} = typeof auth.getClaims === 'function' ? await auth.getClaims(token) : {data: null, error: null};
    if (cl?.claims?.sub && cl.claims.role === 'authenticated') uid = String(cl.claims.sub);
    if (!uid){ const {data} = await sb.auth.getUser(token); uid = data?.user?.id || ''; }
    if (!uid) return json({error: 'Brak uprawnień' + (clErr ? ' (' + clErr.message + ')' : '')}, 401);
    testUser = uid;
  }

  const send = async (userId: string, payload: Record<string, unknown>) => {
    const {data: subs} = await sb.from('push_subscriptions').select('*').eq('user_id', userId);
    let ok = 0;
    for (const s of subs || []){
      try {
        await webpush.sendNotification({endpoint: s.endpoint, keys: {p256dh: s.p256dh, auth: s.auth}}, JSON.stringify(payload), {TTL: 6 * 3600});
        ok++;
      } catch (e: any) {
        if (e?.statusCode === 404 || e?.statusCode === 410) await sb.from('push_subscriptions').delete().eq('id', s.id);
      }
    }
    return {devices: (subs || []).length, sent: ok};
  };

  if (isCron && body && body.mode === 'event'){
    const roles: string[] = Array.isArray(body.roles) ? body.roles : [];
    const users: string[] = Array.isArray(body.users) ? body.users : [];
    const {data: profs} = await sb.from('profiles').select('id, role, status').eq('status', 'active');
    const to = (profs || []).filter((x: Row) => roles.includes(x.role) || users.includes(x.id));
    const out: Record<string, unknown>[] = [];
    for (const x of to) out.push({user: x.id, ...(await send(x.id, {title: String(body.title || 'Emage FLEET').slice(0, 120), body: String(body.body || '').slice(0, 300), url: './', tag: String(body.tag || 'zdarzenie')}))});
    return json({event: true, users: out.length, report: out});
  }

  const gpsReq = !!(testUser && body && body.geotabSync);
  if (gpsReq){
    const {data: me} = await sb.from('profiles').select('role, status').eq('id', testUser).maybeSingle();
    if (!me || me.role !== 'floty' || me.status !== 'active') return json({error: 'Synchronizację GPS uruchamia kierownik floty'}, 403);
    const {count} = await sb.from('gps_odometer').select('id', {count: 'exact', head: true});
    return json(await geotabSync(sb, key, Math.min(Number(body.days) || (count ? 7 : 92), 120)));
  }
  const emailTest = !!(testUser && body && body.emailTest);
  if (testUser && !emailTest){
    const r = await send(testUser, {title: 'Emage FLEET', body: 'Powiadomienia działają na tym urządzeniu.', url: './', tag: 'test'});
    return json({test: true, ...r});
  }

  const today = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date());
  const monthStart = today.slice(0, 7) + '-01';
  const load = async (t: string, q?: (x: any) => any) => { const b = sb.from(t).select('*').limit(20000); const {data} = await (q ? q(b) : b); return data || []; };
  const d: Data = {
    profiles: await load('profiles'), drivers: await load('drivers'), vehicles: await load('vehicles'),
    deadlines: await load('deadlines'), bookings: await load('bookings', b => b.gte('date_to', addDays(today, -60))),
    issues: await load('issues', b => b.neq('status', 'naprawione')), costs: await load('costs', b => b.gte('date', monthStart)),
    settings: await load('settings'),
    cardRows: await load('fuel_card_rows', b => b.gte('tx_date', addDays(today, -35))),
  };
  // raport e-mail (Resend): adresy w ustawieniach 'report_email', klucz RESEND_API_KEY w sekretach funkcji
  const mailWeekly = async () => {
    const cfg = (d.settings.find(x => x.key === 'report_email') || {}).value || {};
    const to = String(cfg.to || '').split(/[,;\s]+/).map((x: string) => x.trim()).filter((x: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x));
    if (!to.length) return {email: 'brak adresu w ustawieniach'};
    if (!key('RESEND_API_KEY')) return {email: 'brak sekretu RESEND_API_KEY w funkcji'};
    const c14 = await load('costs', b => b.gte('date', addDays(today, -14)));
    d.contracts = await load('vehicle_contracts'); d.equipment = await load('equipment'); d.tires = await load('tires');
    const w = weekly(d, today, c14);
    const boss = d.profiles.find(x => x.status === 'active' && x.role === 'floty');
    const items = boss ? itemsFor(boss, d, today).sort((a, b) => a.pri - b.pri).slice(0, 25) : [];
    const esc = (x: string) => x.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'}[c] as string));
    const app = String(cfg.app || 'https://emage-fleet.maciekhalon.workers.dev');
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#16130e;max-width:640px">
      <h2 style="margin:0 0 12px">${esc(w.title)}</h2>
      <p style="margin:0 0 14px">${w.body.split('\n').map(esc).join('<br>')}</p>
      ${items.length ? `<h3 style="margin:18px 0 8px">Do zrobienia</h3><ul style="padding-left:18px;margin:0">${items.map(i => `<li style="margin:3px 0">${esc(i.text)}</li>`).join('')}</ul>` : ''}
      <p style="margin:20px 0 0"><a href="${app}" style="color:#16130e;font-weight:bold">Otwórz Emage FLEET</a></p></div>`;
    const r = await fetch('https://api.resend.com/emails', {method: 'POST', headers: {'Authorization': 'Bearer ' + key('RESEND_API_KEY'), 'Content-Type': 'application/json'},
      body: JSON.stringify({from: String(cfg.from || 'Emage FLEET <onboarding@resend.dev>'), to, subject: w.title, html,
        text: w.title + '\n\n' + w.body + (items.length ? '\n\nDo zrobienia:\n' + items.map(i => '• ' + i.text).join('\n') : '') + '\n\n' + app})});
    const t = await r.text();
    return {email: r.ok ? 'wysłano' : 'błąd ' + r.status + ': ' + t.slice(0, 300), to: to.length};
  };
  if (emailTest){
    const me = d.profiles.find(x => x.id === testUser);
    if (!me || me.role !== 'floty' || me.status !== 'active') return json({error: 'Raport e-mail może wysłać tylko kierownik floty'}, 403);
    return json({emailTest: true, ...(await mailWeekly())});
  }
  const report: Record<string, unknown>[] = [];
  if (key('GEOTAB_DATABASE')) report.push({geotab: await geotabSync(sb, key, 3)});
  for (const p of d.profiles.filter(x => x.status === 'active')){
    const items = itemsFor(p, d, today);
    if (!items.length) continue;
    const r = await send(p.id, {...digest(items), url: './', tag: 'podsumowanie-' + today});
    report.push({user: p.id, items: items.length, ...r});
  }
  // poniedziałek: „Tydzień floty” dla kierowników floty
  if (new Date(today + 'T12:00:00Z').getUTCDay() === 1){
    const c14 = await load('costs', b => b.gte('date', addDays(today, -14)));
    d.contracts = await load('vehicle_contracts'); d.equipment = await load('equipment'); d.tires = await load('tires');
    const w = weekly(d, today, c14);
    for (const p of d.profiles.filter(x => x.status === 'active' && x.role === 'floty'))
      report.push({user: p.id, weekly: true, ...(await send(p.id, {...w, url: './#raporty', tag: 'tydzien-' + today}))});
    report.push({weeklyEmail: true, ...(await mailWeekly())});
  }
  return json({today, users: report.length, report});
});
