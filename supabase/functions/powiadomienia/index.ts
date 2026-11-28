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
        if (t.type === 'Koniec gwarancji' && (diffDays(today, t.date) < 0 || (t.km_due && (v.km_svc ?? v.km) && t.km_due - (v.km_svc ?? v.km) <= 0))) return;   // zakończona gwarancja to nie alarm
        const dd = diffDays(today, t.date);
        if (dd < 0) out.push({pri: 0, text: `Twój bus ${v.plate}: ${t.type} po terminie (${dm(t.date)})`});
        else if (dd <= 7) out.push({pri: 1, text: `Twój bus ${v.plate}: ${t.type} ${dm(t.date)}`});
        if (t.km_due && (v.km_svc ?? v.km)){
          const left = t.km_due - (v.km_svc ?? v.km);
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
      if (t.type === 'Koniec gwarancji' && (diffDays(today, t.date) < 0 || (t.km_due && (v.km_svc ?? v.km) && t.km_due - (v.km_svc ?? v.km) <= 0))) return;   // zakończona gwarancja to nie alarm
      const dd = diffDays(today, t.date);
      if (dd < 0) out.push({pri: 0, text: `${v.plate}: ${t.type} po terminie (${dm(t.date)})`});
      else if (dd === 0) out.push({pri: 0, text: `${v.plate}: ${t.type} dziś`});
      else if (dd <= 7) out.push({pri: 1, text: `${v.plate}: ${t.type} ${dm(t.date)}`});
      if (t.km_due && (v.km_svc ?? v.km)){
        const left = t.km_due - (v.km_svc ?? v.km);
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
  const soon = d.deadlines.filter(t => { const v = d.vehicles.find(x => x.id === t.vehicle_id); if (!v || v.status === 'wycofany') return false;
    if (t.date && diffDays(today, t.date) <= 14) return true;
    const cur = v.km_svc ?? v.km;   // olej, rozrząd, przegląd gwarancyjny – tylko na km
    return !!(t.km_due && cur && t.km_due - cur <= Number(t.remind_km || 1000)); }).length;
  const ch = prev ? Math.round((now - prev) / prev * 100) : null;
  const lines = [
    `• Koszty: ${zl(now)}${ch !== null ? ` (${ch > 0 ? '+' : ''}${ch}% wobec poprzedniego tygodnia)` : ''}`,
    `• Tankowania: ${fills}`,
    `• Nowe usterki: ${newIss}`,
    `• Terminy w ciągu 14 dni lub blisko przebiegu (albo po terminie): ${soon}`,
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
/* Licznik z Geotab: StatusData zawsze w metrach (nowe auta < 3000 km też – wcześniej zostawały w metrach) */
export const odoKm = (v: number) => v / 1000;
/* Dopasowanie urządzenia do auta: ręczna mapa → numer rejestracyjny → nazwa urządzenia → VIN */
export function matchDevices(devices: Row[], vehicles: Row[], manual: Record<string, string>){
  const byPlate = new Map(vehicles.filter(v => v.status !== 'wycofany').map(v => [normPlate(v.plate), v]));
  const byVin = new Map(vehicles.filter(v => v.vin && v.status !== 'wycofany').map(v => [String(v.vin).toUpperCase(), v]));
  const map = new Map<string, Row>(), unmatched: string[] = [];
  for (const d of devices){
    let v: Row | undefined = manual[d.id] ? vehicles.find(x => x.id === manual[d.id] && x.status !== 'wycofany') : undefined;
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

/* ---------- Tankowanie a pozycja busa (migracja 034) ---------- */
export const haversineKm = (a: {lat: number; lng: number}, b: {lat: number; lng: number}) => {
  const R = 6371, r = (x: number) => x * Math.PI / 180, dLat = r(b.lat - a.lat), dLng = r(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(r(a.lat)) * Math.cos(r(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
/* czas lokalny (Polska) z karty → UTC ISO */
export function warsawToUtc(date: string, time: string){
  const t = /^(\d{1,2}):(\d{2})/.exec(time || '') ; const hh = t ? Number(t[1]) : 12, mm = t ? Number(t[2]) : 0;
  const guess = Date.UTC(+date.slice(0, 4), +date.slice(5, 7) - 1, +date.slice(8, 10), hh, mm);
  const parts = new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Warsaw', hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(new Date(guess)).split(':').map(Number);
  const off = ((parts[0] * 60 + parts[1]) - (hh * 60 + mm) + 1440) % 1440;   // przesunięcie strefy w minutach (60 lub 120)
  return new Date(guess - (off > 720 ? off - 1440 : off) * 60000).toISOString();
}
export const normTown = (x: string) => String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ł/g, 'l').replace(/[^a-z0-9]+/g, ' ').trim();
/* Ocena: bus daleko od stacji = false; blisko albo ta sama miejscowość = true; brak danych = null */
export function judge(dist: number | null, place: string, station: string){
  const p = normTown(place), st = normTown(station);
  const sameTown = !!p && !!st && (st.includes(p) || p.includes(st.split(' ')[0]));
  if (dist != null) return dist <= 30 || sameTown ? true : (dist > 50 ? false : null);
  return sameTown ? true : null;
}
/* Położenie stacji: geokodowanie nazwy, chyba że busy (co najmniej 2 różne) zgodnie tankowały gdzie indziej –
   wtedy środek ich pozycji. Jeden bus nie może „przesunąć” stacji, więc nie ukryje to kradzieży na jednej karcie. */
export function stationPoint(g: {lat: number; lng: number} | null, pts: [number, number, string, string?][]){
  if (pts.length < 3) return g;
  const P = pts.map(p => ({lat: p[0], lng: p[1], v: p[2]}));
  let best = P[0], bestSum = Infinity;
  for (const a of P){ const sum = P.reduce((s, b) => s + haversineKm(a, b), 0); if (sum < bestSum){ bestSum = sum; best = a; } }
  const near = P.filter(b => haversineKm(best, b) <= 15);
  if (near.length / P.length < 0.6 || new Set(near.map(b => b.v)).size < 2) return g;
  if (g && haversineKm(g, best) <= 20) return g;
  return {lat: best.lat, lng: best.lng};
}
async function fuelGpsCheck(sb: any, rpc: (h: string, m: string, p: Record<string, unknown>) => Promise<any>, host: string, cred: unknown, devOf: Map<string, string>, limit: number){
  await sb.from('fuel_card_rows').update({gps_checked_at: null}).eq('gps_ok', false).gte('tx_date', new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10));
  const {data: rows} = await sb.from('fuel_card_rows').select('id, vehicle_id, tx_date, tx_time, station, kind').is('gps_checked_at', null).neq('kind', 'other').not('vehicle_id', 'is', null)
    .gte('tx_date', new Date(Date.now() - 120 * DAY).toISOString().slice(0, 10)).order('tx_date', {ascending: false}).limit(limit);
  const todo = (rows || []).filter((r: Row) => devOf.has(r.vehicle_id) && r.tx_time);
  if (!todo.length) return {fuelChecked: 0};
  // 1) pozycja busa: najbliższy zapis GPS w oknie ±20 min
  const pos = new Map<string, {lat: number; lng: number; dt: string} | null>();
  for (let i = 0; i < todo.length; i += 100){
    const part = todo.slice(i, i + 100);
    const calls = part.map((r: Row) => { const t = Date.parse(warsawToUtc(r.tx_date, r.tx_time));
      return {method: 'Get', params: {typeName: 'LogRecord', resultsLimit: 200, search: {deviceSearch: {id: devOf.get(r.vehicle_id)}, fromDate: new Date(t - 20 * 60000).toISOString(), toDate: new Date(t + 20 * 60000).toISOString()}}}; });
    const res: Row[][] = await rpc(host, 'ExecuteMultiCall', {calls, credentials: cred});
    part.forEach((r: Row, j: number) => { const t = Date.parse(warsawToUtc(r.tx_date, r.tx_time));
      const best = (res[j] || []).filter(x => x && x.latitude && x.longitude).sort((a, b) => Math.abs(Date.parse(a.dateTime) - t) - Math.abs(Date.parse(b.dateTime) - t))[0];
      pos.set(r.id, best ? {lat: best.latitude, lng: best.longitude, dt: best.dateTime} : null); });
  }
  // 2) miejscowość busa (odwrotne geokodowanie)
  const withPos = todo.filter((r: Row) => pos.get(r.id));
  const place = new Map<string, string>();
  for (let i = 0; i < withPos.length; i += 100){
    const part = withPos.slice(i, i + 100);
    const addr: Row[] = await rpc(host, 'GetAddresses', {coordinates: part.map((r: Row) => ({x: pos.get(r.id)!.lng, y: pos.get(r.id)!.lat})), movingAddresses: true, credentials: cred}).catch(() => []);
    part.forEach((r: Row, j: number) => { const a = addr && addr[j]; place.set(r.id, a ? String(a.city || a.formattedAddress || '').slice(0, 80) : ''); });
  }
  // 3) położenie stacji (geokodowanie nazwy, pamiętane w ustawieniach 'station_geo')
  const {data: gRow} = await sb.from('settings').select('value').eq('key', 'station_geo').maybeSingle();
  const geo: Record<string, {lat: number; lng: number} | null> = (gRow && gRow.value && gRow.value.map) || {};
  // gdzie faktycznie stały busy przy tankowaniu na danej stacji (do 40 ostatnich) – poprawia geokodowanie
  // nazw, które w Polsce się powtarzają (np. Łagów pod Zgorzelcem i Łagów w lubuskim)
  const seen: Record<string, [number, number, string, string][]> = (gRow && gRow.value && gRow.value.seen) || {};
  todo.forEach((r: Row) => { const p = pos.get(r.id), st = String(r.station || '').trim(); if (!p || !st) return;
    const id = String(r.id).slice(0, 8);
    seen[st] = [...(seen[st] || []).filter(x => x[3] !== id), [Math.round(p.lat * 1e4) / 1e4, Math.round(p.lng * 1e4) / 1e4, r.vehicle_id, id] as [number, number, string, string]].slice(-40); });
  const names = [...new Set(todo.map((r: Row) => String(r.station || '').trim()).filter(n => n && !(n in geo)))];
  for (let i = 0; i < names.length; i += 50){
    const part = names.slice(i, i + 50);
    const co: Row[] = await rpc(host, 'GetCoordinates', {addresses: part.map(n => n + ', Polska'), credentials: cred}).catch(() => []);
    part.forEach((n, j) => { const c = co && co[j]; geo[n] = c && c.x != null && c.y != null ? {lat: c.y, lng: c.x} : null; });
  }
  await sb.from('settings').upsert({key: 'station_geo', value: {map: geo, seen}}, {onConflict: 'key'});
  const point = (st: string) => stationPoint(geo[st] || null, seen[st] || []);
  // 4) zapis wyniku
  let bad = 0;
  const now = new Date().toISOString();
  for (const r of todo){
    const p = pos.get(r.id), st = String(r.station || '').trim(), g = st ? point(st) : null;
    const dist = p && g ? Math.round(haversineKm(p, g) * 10) / 10 : null;
    const ok = p ? judge(dist, place.get(r.id) || '', st) : null;
    if (ok === false) bad++;
    await sb.from('fuel_card_rows').update({gps_place: p ? (place.get(r.id) || null) : null, gps_dist_km: dist, gps_ok: ok, gps_checked_at: now}).eq('id', r.id);
  }
  return {fuelChecked: todo.length, fuelFar: bad, noPosition: todo.length - withPos.length};
}

/* ---------- Kontrola liczników (migracja 036): licznik GPS w chwili wpisu kierowcy / tankowania z karty ---------- */
const warsawDay = (iso: string) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date(iso));
// odczyt licznika GPS 10 min po zdarzeniu (lokalizator wysyła dane z kilkuminutowym opóźnieniem); harmonogram emage-fleet-gps co 5 min (migracja 070)
async function odoGpsCheck(sb: any, rpc: (h: string, m: string, p: Record<string, unknown>) => Promise<any>, host: string, cred: unknown, devOf: Map<string, string>, limit: number){
  const since = new Date(Date.now() - 120 * DAY).toISOString();
  const {data: done} = await sb.from('odo_gps').select('source, ref_id, at, gps_km').gte('at', since);
  // brak odczytu GPS ponawiamy przez 3 dni (lokalizator czasem wysyła dane z opóźnieniem)
  const have = new Set((done || []).filter((x: Row) => x.gps_km != null || Date.parse(x.at) < Date.now() - 3 * DAY).map((x: Row) => x.source + '|' + x.ref_id));
  const ev: {source: string; ref_id: string; vehicle_id: string; at: string}[] = [];
  const add = (source: string, ref_id: string, vehicle_id: string, at: string) => { if (vehicle_id && devOf.has(vehicle_id) && at && !have.has(source + '|' + ref_id) && Date.parse(at) < Date.now() - 10 * 60000) ev.push({source, ref_id, vehicle_id, at}); };
  // 1) tankowania z karty – godzina z wyciągu
  const {data: card} = await sb.from('fuel_card_rows').select('id, vehicle_id, tx_date, tx_time, odometer, cost_id').not('odometer', 'is', null).not('tx_time', 'is', null).gte('tx_date', since.slice(0, 10)).limit(3000);
  (card || []).forEach((r: Row) => add('karta', r.id, r.vehicle_id, warsawToUtc(r.tx_date, r.tx_time)));
  const fromCard = new Set((card || []).map((r: Row) => r.cost_id).filter(Boolean));
  // 2) tankowania wpisane w aplikacji – chwila wpisu, tylko gdy wpisane tego samego dnia (inaczej nie znamy godziny)
  const {data: costs} = await sb.from('costs').select('id, vehicle_id, date, odometer, created_at, category').in('category', ['Paliwo', 'Ładowanie']).not('odometer', 'is', null).gte('created_at', since).limit(3000);
  (costs || []).forEach((c: Row) => { if (!fromCard.has(c.id) && warsawDay(c.created_at) === c.date) add('tankowanie', c.id, c.vehicle_id, c.created_at); });
  // 3) przejęcie i zdanie auta – chwila wpisania licznika
  const {data: bk} = await sb.from('bookings').select('id, vehicle_id, pickup_ts, return_ts').or(`pickup_ts.gte.${since},return_ts.gte.${since}`).limit(3000);
  (bk || []).forEach((b: Row) => { if (b.pickup_ts) add('przejecie', b.id, b.vehicle_id, b.pickup_ts); if (b.return_ts) add('zdanie', b.id, b.vehicle_id, b.return_ts); });
  ev.sort((a, b) => b.at.localeCompare(a.at));
  const todo = ev.slice(0, limit);
  if (!todo.length) return {odoChecked: 0};
  const km = new Map<number, number>();
  for (const diag of ['DiagnosticOdometerAdjustmentId', 'DiagnosticOdometerId']){
    const left = todo.map((e, i) => i).filter(i => !km.has(i));
    for (let i = 0; i < left.length; i += 100){
      const part = left.slice(i, i + 100);
      const res: Row[][] = await rpc(host, 'ExecuteMultiCall', {calls: part.map(j => ({method: 'Get', params: {typeName: 'StatusData', search: {deviceSearch: {id: devOf.get(todo[j].vehicle_id)}, diagnosticSearch: {id: diag}, fromDate: todo[j].at, toDate: todo[j].at}}})), credentials: cred});
      part.forEach((j, n) => { const r = (res[n] || []).find(x => x && x.data != null); const v = r ? Math.round(odoKm(Number(r.data)) * 10) / 10 : 0; if (v >= 50) km.set(j, v); });
    }
  }
  // odczyt z chwili zdarzenia musi zgadzać się z dziennymi licznikami tego auta (±2000 km) – inaczej to błąd lokalizatora
  { const vids = [...new Set(todo.map(e => e.vehicle_id))];
    const {data: dd} = await sb.from('gps_odometer').select('vehicle_id, day, km').in('vehicle_id', vids).gte('day', since.slice(0, 10));
    const byV = new Map<string, Row[]>(); (dd || []).forEach((r: Row) => { if (!byV.has(r.vehicle_id)) byV.set(r.vehicle_id, []); byV.get(r.vehicle_id)!.push(r); });
    todo.forEach((e, i) => { if (!km.has(i)) return; const d = warsawDay(e.at), xs = (byV.get(e.vehicle_id) || []).filter(r => Math.abs(diffDays(r.day, d)) <= 3);
      if (xs.length && !xs.some(r => Math.abs(Number(r.km) - (km.get(i) as number)) <= 2000)) km.delete(i); }); }
  const now = new Date().toISOString();
  const rows = todo.map((e, i) => ({...e, gps_km: km.has(i) ? km.get(i) : null, checked_at: now}));
  for (let i = 0; i < rows.length; i += 500){
    const {error} = await sb.from('odo_gps').upsert(rows.slice(i, i + 500), {onConflict: 'source,ref_id'});
    if (error) throw new Error('zapis: ' + error.message);
  }
  return {odoChecked: rows.length, odoNoGps: rows.filter(r => r.gps_km == null).length, odoLeft: ev.length - todo.length};
}

// ===== KARTA PRACY: logika (bez zależności – testowana osobno) =====
/* Granice krajów z world-atlas (TopoJSON, Natural Earth 1:50m): id ISO numeryczne → kod ISO 2 */
export const WORK_COUNTRIES: Record<string, string> = {'616': 'PL', '276': 'DE', '203': 'CZ', '703': 'SK', '040': 'AT', '528': 'NL', '056': 'BE', '442': 'LU', '250': 'FR',
  '208': 'DK', '440': 'LT', '428': 'LV', '348': 'HU', '756': 'CH', '380': 'IT', '705': 'SI', '804': 'UA', '112': 'BY', '752': 'SE', '578': 'NO', '233': 'EE', '642': 'RO', '191': 'HR'};
export type Country = {iso: string; bbox: [number, number, number, number]; polys: number[][][][]};
export function topoCountries(topo: any, wanted: Record<string, string> = WORK_COUNTRIES): Country[] {
  const tr = topo.transform, kx = tr ? tr.scale[0] : 1, ky = tr ? tr.scale[1] : 1, dx = tr ? tr.translate[0] : 0, dy = tr ? tr.translate[1] : 0;
  const arcs: number[][][] = topo.arcs.map((a: number[][]) => { let x = 0, y = 0; return a.map(([p, q]) => { if (tr){ x += p; y += q; return [x * kx + dx, y * ky + dy]; } return [p, q]; }); });
  const ring = (ids: number[]) => { const out: number[][] = [];
    ids.forEach((i, n) => { const a = i < 0 ? arcs[~i].slice().reverse() : arcs[i]; (n ? a.slice(1) : a).forEach(p => out.push(p)); }); return out; };
  const out: Country[] = [];
  for (const g of topo.objects.countries.geometries){
    const iso = wanted[String(g.id).padStart(3, '0')]; if (!iso) continue;
    const polys: number[][][][] = g.type === 'Polygon' ? [g.arcs.map(ring)] : g.type === 'MultiPolygon' ? g.arcs.map((p: number[][]) => p.map(ring)) : [];
    let x0 = 180, y0 = 90, x1 = -180, y1 = -90;
    polys.forEach(p => p[0].forEach(([x, y]) => { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }));
    out.push({iso, bbox: [x0, y0, x1, y1], polys});
  }
  return out;
}
const inRing = (x: number, y: number, r: number[][]) => { let c = false;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++){ const [xi, yi] = r[i], [xj, yj] = r[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; }
  return c; };
const inCountry = (x: number, y: number, c: Country) => x >= c.bbox[0] && x <= c.bbox[2] && y >= c.bbox[1] && y <= c.bbox[3]
  && c.polys.some(p => inRing(x, y, p[0]) && !p.slice(1).some(h => inRing(x, y, h)));
export function countryAt(lng: number, lat: number, cs: Country[], hint?: string | null): string | null {
  const h = hint ? cs.find(c => c.iso === hint) : null;
  if (h && inCountry(lng, lat, h)) return h.iso;
  for (const c of cs) if (c !== h && inCountry(lng, lat, c)) return c.iso;
  return null;
}
/* Przekroczenia granic z punktów GPS (posortowanych po czasie). Nowy kraj liczy się, gdy potwierdzą go 2 kolejne punkty
   (albo jeden, gdy to ostatni punkt); godzina = środek między ostatnim punktem w starym i pierwszym w nowym kraju. */
export function borderCrossings(pts: {t: number; lat: number; lng: number}[], cs: Country[]){
  let cur: string | null = null, startCountry: string | null = null, lastT = 0;
  const crossings: {t: number; from: string; to: string}[] = [];
  const cc = pts.map(p => countryAt(p.lng, p.lat, cs, null));
  for (let i = 0; i < pts.length; i++){
    const c = cc[i]; if (!c){ continue; }
    if (cur == null){ cur = c; startCountry = c; lastT = pts[i].t; continue; }
    if (c !== cur){
      const next = cc.slice(i + 1).find(x => x != null);
      if (next == null || next === c){ crossings.push({t: Math.round((lastT + pts[i].t) / 2), from: cur, to: c}); cur = c; }
    }
    if (c === cur) lastT = pts[i].t;
  }
  return {startCountry, crossings};
}
export type WorkTrip = {start: number; stop: number; km: number; lat?: number; lng?: number};
export type WorkEv = {kind: 'jazda' | 'praca' | 'postoj' | 'gotowosc'; start: number; end: number; km: number; country: string | null; cross_country: string | null; cross_ts: number | null};
/* Oś dnia od przejęcia (P) do zdania (R, a bez zdania – teraz): przejazdy = jazda; przerwy < 15 min wliczone w jazdę;
   zatrzymanie ≥ 2 min u klienta / na bazie (≤ 400 m od punktu z Planera) = praca inna, gdzie indziej ≥ 15 min = postój;
   przed pierwszym wyjazdem i po ostatnim przejeździe do zdania = praca inna. */
export function buildWork(P: number, R: number, returned: boolean, trips0: WorkTrip[], places: {lat: number; lng: number}[], cross: {startCountry: string | null; crossings: {t: number; to: string}[]}, near: (a: {lat: number; lng: number}, b: {lat: number; lng: number}) => number){
  const MIN = 60000, GAP = 15 * MIN;
  const trips = trips0.filter(t => t.stop > P && t.start < R).sort((a, b) => a.start - b.start)
    .map(t => ({...t, start: Math.max(t.start, P), stop: Math.min(t.stop, R)})).filter(t => t.stop > t.start);
  const ev: WorkEv[] = [];
  const push = (kind: WorkEv['kind'], s: number, e: number, km = 0) => {
    if (e - s < MIN && kind !== 'jazda') return;
    const last = ev[ev.length - 1];
    if (last && last.kind === kind && s - last.end <= MIN){ last.end = Math.max(last.end, e); last.km += km; return; }
    ev.push({kind, start: s, end: e, km, country: null, cross_country: null, cross_ts: null});
  };
  if (!trips.length){ push('praca', P, R); }
  else {
    if (trips[0].start - P >= MIN) push('praca', P, trips[0].start);
    trips.forEach((t, i) => {
      push('jazda', t.start, t.stop, t.km || 0);
      const nx = trips[i + 1];
      if (nx){
        const gap = nx.start - t.stop, atPlace = t.lat != null && t.lng != null && places.some(p => near({lat: t.lat as number, lng: t.lng as number}, p) <= 0.4);
        if (atPlace && gap >= 2 * MIN) push('praca', t.stop, nx.start);   // u klienta / na bazie: rozładunek, załadunek – także krótki
        else if (gap < GAP) push('jazda', t.stop, nx.start);
        else push('postoj', t.stop, nx.start);
      } else if (R - t.stop >= MIN){
        if (returned) push('praca', t.stop, R);
        else push(t.lat != null && t.lng != null && places.some(p => near({lat: t.lat as number, lng: t.lng as number}, p) <= 0.4) ? 'praca' : 'postoj', t.stop, R);
      }
    });
  }
  // podział na przekroczeniach granic + kraj każdego wpisu
  const cr = cross.crossings.filter(c => c.t > P && c.t < R).sort((a, b) => a.t - b.t);
  const out: WorkEv[] = [];
  for (const e of ev){
    let cur = {...e};
    for (const c of cr){
      if (c.t > cur.start + MIN && c.t < cur.end - MIN){
        const f = (c.t - cur.start) / (cur.end - cur.start);
        out.push({...cur, end: c.t, km: cur.km * f});
        cur = {...cur, start: c.t, km: cur.km * (1 - f), cross_country: c.to, cross_ts: c.t};
      } else if (Math.abs(c.t - cur.start) <= MIN && !cur.cross_country){ cur.cross_country = c.to; cur.cross_ts = c.t; }
    }
    out.push(cur);
  }
  let country = cross.startCountry;
  out.forEach((e, i) => { const before = cr.filter(c => c.t <= e.start + MIN); if (before.length) country = before[before.length - 1].to; else country = cross.startCountry;
    e.country = country; if (i === 0 && !e.cross_country && cross.startCountry){ e.cross_country = cross.startCountry; e.cross_ts = e.start; } });
  return out;
}
// ===== KARTA PRACY: koniec logiki =====

async function geotabSync(sb: any, key: (k: string) => string, days: number, fuelLimit = 300){
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
  let step = '';
  try {
    step = 'logowanie';
    const auth = await rpc(host0, 'Authenticate', {database: db, userName: user, password: pass});
    const host = !auth.path || auth.path === 'ThisServer' ? host0 : String(auth.path).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
    const cred = auth.credentials;
    step = 'lista urządzeń';
    const devices: Row[] = await rpc(host, 'Get', {typeName: 'Device', credentials: cred, resultsLimit: 5000}).catch(e => { throw new Error(step + ': ' + e.message); });
    const {data: vehicles} = await sb.from('vehicles').select('id, plate, vin, status');
    const {data: mrow} = await sb.from('settings').select('value').eq('key', 'geotab_map').maybeSingle();
    const {map, unmatched} = matchDevices(devices, vehicles || [], (mrow && mrow.value && mrow.value.map) || {});
    // jeden stan licznika na koniec każdego dnia (Geotab interpoluje wartość, gdy fromDate = toDate) – mało danych, mało pamięci
    const DIAGS = ['DiagnosticOdometerAdjustmentId', 'DiagnosticOdometerId'];
    const devIds = [...map.keys()], errs: string[] = [], daily: {vehicle_id: string; day: string; km: number; device: string}[] = [];
    const todayW = new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date());
    const dayList: string[] = []; for (let i = days; i >= 0; i--) dayList.push(addDays(todayW, -i));
    const at = (d: string) => d === todayW ? new Date().toISOString() : d + 'T22:00:00.000Z';   // ok. północ czasu polskiego
    const need = new Map<string, string>();   // urządzenie|dzień → dzień
    devIds.forEach(id => dayList.forEach(d => need.set(id + '|' + d, d)));
    // dni już zapisane pomijamy (oprócz dwóch ostatnich – wtedy licznik jeszcze rośnie); oszczędza limit Geotab (1000 zapytań/min)
    const {data: have} = await sb.from('gps_odometer').select('device, day').gte('day', dayList[0]).lt('day', addDays(todayW, -1));
    (have || []).forEach((h: Row) => need.delete(h.device + '|' + h.day));
    let readings = 0;
    for (const diag of DIAGS){
      step = `liczniki (${diag === DIAGS[0] ? 'skorygowany' : 'z silnika'})`;
      const keys = [...need.keys()];
      for (let i = 0; i < keys.length; i += 100){
        const part = keys.slice(i, i + 100);
        const calls = part.map(k => { const [id, d] = k.split('|'); return {method: 'Get', params: {typeName: 'StatusData', search: {deviceSearch: {id}, diagnosticSearch: {id: diag}, fromDate: at(d), toDate: at(d)}}}; });
        let res: Row[][] = [];
        try { res = await rpc(host, 'ExecuteMultiCall', {calls, credentials: cred}); }
        catch (e) { errs.push(step + ': ' + (e as Error).message.slice(0, 100)); continue; }
        res.forEach((list, j) => {
          const r = (list || []).find(x => x && x.data != null); if (!r) return;
          const [id, d] = part[j].split('|'), v = map.get(id); const km = Math.round(odoKm(Number(r.data)) * 10) / 10;
          if (!v || !(km >= 50)) return;   // odczyt bliski 0 = urządzenie bez licznika auta
          readings++; need.delete(part[j]);
          const o = daily.find(x => x.vehicle_id === v.id && x.day === d);
          if (!o) daily.push({vehicle_id: v.id, day: d, km, device: id}); else if (km > o.km) o.km = km;
        });
      }
    }
    step = 'kontrola odczytów';
    // odrzucamy niewiarygodne odczyty (np. lokalizator po odłączeniu czyta licznik z komputera auta w złym formacie):
    // skok o ponad 1500 km na dzień albo cofnięcie o ponad 50 km względem ostatniego przyjętego odczytu
    { const vids = [...new Set(daily.map(x => x.vehicle_id))], first = daily.reduce((m, x) => x.day < m ? x.day : m, todayW);
      const {data: prevRows} = vids.length ? await sb.from('gps_odometer').select('vehicle_id, day, km').in('vehicle_id', vids).lt('day', first).gte('day', addDays(first, -60)) : {data: []};
      const ref = new Map<string, {day: string; km: number}>();
      (prevRows || []).forEach((r: Row) => { const o = ref.get(r.vehicle_id); if (!o || r.day > o.day) ref.set(r.vehicle_id, {day: r.day, km: Number(r.km)}); });
      daily.sort((a, b) => a.vehicle_id.localeCompare(b.vehicle_id) || a.day.localeCompare(b.day));
      const ok: typeof daily = [];
      for (const x of daily){
        const r = ref.get(x.vehicle_id), gap = r ? Math.max(1, diffDays(r.day, x.day)) : 1;
        if (r && (x.km - r.km > 1500 * gap || x.km < r.km - 50)){
          const v = (vehicles || []).find((y: Row) => y.id === x.vehicle_id);
          errs.push(`${v ? v.plate : '?'}: niewiarygodny licznik z lokalizatora ${x.day.slice(8, 10)}.${x.day.slice(5, 7)} (${Math.round(x.km)} km, poprzednio ${Math.round(r.km)} km) – pominięty`);
          continue;
        }
        ok.push(x); ref.set(x.vehicle_id, {day: x.day, km: x.km});
      }
      daily.length = 0; daily.push(...ok); }
    step = 'zapis';

    for (let i = 0; i < daily.length; i += 500){
      const {error} = await sb.from('gps_odometer').upsert(daily.slice(i, i + 500).map(x => ({...x, updated_at: new Date().toISOString()})), {onConflict: 'vehicle_id,day'});
      if (error) throw new Error('zapis: ' + error.message);
    }
    // aktualny przebieg auta: ostatni licznik z GPS, jeśli większy niż zapisany
    const last = new Map<string, number>(); daily.forEach(x => { if (!last.has(x.vehicle_id) || x.km > (last.get(x.vehicle_id) as number)) last.set(x.vehicle_id, x.km); });
    let upd = 0;
    for (const [vid, km] of last){ const v = (vehicles || []).find((x: Row) => x.id === vid); const {data: cur} = await sb.from('vehicles').select('km').eq('id', vid).maybeSingle();
      if (v && (!cur || !cur.km || Number(cur.km) < km)){ await sb.from('vehicles').update({km: Math.round(km)}).eq('id', vid); upd++; } }
    step = 'tankowania a pozycja';
    const devOf = new Map<string, string>(); map.forEach((v, id) => { if (!devOf.has(v.id)) devOf.set(v.id, id); });
    let fuel: Record<string, unknown> = {};
    try { fuel = await fuelGpsCheck(sb, rpc, host, cred, devOf, fuelLimit); } catch (e) { errs.push(step + ': ' + String((e as Error).message || e).slice(0, 120)); }
    step = 'kontrola liczników';
    try { fuel = {...fuel, ...await odoGpsCheck(sb, rpc, host, cred, devOf, 400)}; } catch (e) { errs.push(step + ': ' + String((e as Error).message || e).slice(0, 120)); }
    return await status({ok: true, devices: devices.length, matched: map.size, unmatched, readings, days: daily.length, kmUpdated: upd, warnings: errs.slice(0, 12), ...fuel,
      deviceList: devices.map(d => ({id: d.id, name: d.name || '', plate: d.licensePlate || '', vehicle: map.get(d.id) ? map.get(d.id)!.plate : null}))});
  } catch (e) {
    return await status({ok: false, error: (step ? step + ': ' : '') + String((e as Error).message || e).slice(0, 300)});
  }
}

/* ===== Karta pracy z GPS (tryb „work”, harmonogram emage-fleet-praca) =====
   Dla każdego przejęcia auta (od settings 'workcard'.from, otwartego albo zdanego w ciągu 36 h): przejazdy (Trip) i punkty GPS (LogRecord)
   z Geotab → wpisy work_events (źródło 'gps'). Dni poprawione ręcznie (wpisy 'manual') zostają bez zmian.
   body.dry = true – tylko zwraca wyliczone wpisy, nic nie zapisuje; body.booking – jedno przejęcie. */
let bordersCache: Country[] | null = null;
async function workConn(sb: any, key: (k: string) => string){
  const db = key('GEOTAB_DATABASE'), user = (Deno.env.get('GEOTAB_USER') || '').trim(), pass = (Deno.env.get('GEOTAB_PASSWORD') || '').trim();
  if (!db || !user || !pass) return null;
  const host0 = (Deno.env.get('GEOTAB_SERVER') || 'my.geotab.com').trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const rpc = async (host: string, method: string, params: Record<string, unknown>) => {
    const r = await fetch(`https://${host}/apiv1`, {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({method, params})});
    const j = await r.json().catch(() => ({}));
    if (j.error) throw new Error((j.error.errors && j.error.errors[0] && j.error.errors[0].name ? j.error.errors[0].name + ': ' : '') + (j.error.message || 'błąd Geotab'));
    return j.result;
  };
  const auth = await rpc(host0, 'Authenticate', {database: db, userName: user, password: pass});
  const host = !auth.path || auth.path === 'ThisServer' ? host0 : String(auth.path).replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const cred = auth.credentials;
  const devices: Row[] = await rpc(host, 'Get', {typeName: 'Device', credentials: cred, resultsLimit: 5000});
  const {data: vehicles} = await sb.from('vehicles').select('id, plate, vin, status');
  const {data: mrow} = await sb.from('settings').select('value').eq('key', 'geotab_map').maybeSingle();
  const {map} = matchDevices(devices, vehicles || [], (mrow && mrow.value && mrow.value.map) || {});
  const devOf = new Map<string, string>(); map.forEach((v: Row, d: string) => devOf.set(v.id, d));
  if (!bordersCache){
    const topo = await (await fetch('https://cdn.jsdelivr.net/npm/world-atlas@2.0.2/countries-50m.json')).json();
    bordersCache = topoCountries(topo);
  }
  return {rpc, host, cred, map, devOf};
}
async function workSync(sb: any, key: (k: string) => string, opt: {dry?: boolean; booking?: string; limit?: number} = {}){
  const cn = await workConn(sb, key); if (!cn) return {work: 'brak sekretów Geotab'};
  const {rpc, host, cred, map, devOf} = cn;
  const {data: cfg} = await sb.from('settings').select('value').eq('key', 'workcard').maybeSingle();
  const from = String((cfg && cfg.value && cfg.value.from) || '2026-11-28');
  let q = sb.from('bookings').select('id, vehicle_id, driver_id, pickup_ts, return_ts, return_km').not('pickup_ts', 'is', null);
  q = opt.booking ? q.eq('id', opt.booking) : q.gte('pickup_ts', from + 'T00:00:00+01:00');
  const {data: all} = await q.order('pickup_ts', {ascending: false}).limit(opt.limit || 400);
  const ids0 = (all || []).map((b: Row) => b.id);
  const {data: have} = ids0.length ? await sb.from('work_events').select('booking_id, source').in('booking_id', ids0) : {data: []};
  const manual = new Set((have || []).filter((m: Row) => m.source === 'manual').map((m: Row) => m.booking_id)), done = new Set((have || []).map((m: Row) => m.booking_id));
  // liczymy: przejęcia trwające, zdane w ciągu 36 h i te bez żadnych wpisów (np. po „Przywróć dane z GPS”); najwyżej 25 na raz
  const recent = Date.now() - 36 * 3600000;
  const bks = (all || []).filter((b: Row) => opt.booking || !b.return_ts || Date.parse(b.return_ts) > recent || !done.has(b.id)).slice(0, opt.booking ? 1 : 25);
  const {data: cl} = await sb.from('clients').select('lat, lng').not('lat', 'is', null);
  const places = (cl || []).filter((c: Row) => c.lat && c.lng).map((c: Row) => ({lat: Number(c.lat), lng: Number(c.lng)}));
  const out: Row[] = []; let saved = 0;
  for (const b of bks){
    if (manual.has(b.id) && !opt.dry) continue;
    const dev = devOf.get(b.vehicle_id); if (!dev) continue;
    const P = Date.parse(b.pickup_ts), returned = !!b.return_ts, R = returned ? Date.parse(b.return_ts) : Date.now();
    if (!(R > P)) continue;
    const [trips, logs]: Row[][] = await rpc(host, 'ExecuteMultiCall', {credentials: cred, calls: [
      {method: 'Get', params: {typeName: 'Trip', resultsLimit: 1000, search: {deviceSearch: {id: dev}, fromDate: new Date(P - 6 * 3600000).toISOString(), toDate: new Date(R).toISOString()}}},
      {method: 'Get', params: {typeName: 'LogRecord', resultsLimit: 50000, search: {deviceSearch: {id: dev}, fromDate: new Date(P).toISOString(), toDate: new Date(R).toISOString()}}}]});
    const tr: WorkTrip[] = (trips || []).filter((t: Row) => t.start && t.stop).map((t: Row) => ({start: Date.parse(t.start), stop: Date.parse(t.stop), km: Number(t.distance) || 0,
      lat: t.stopPoint ? Number(t.stopPoint.y) : undefined, lng: t.stopPoint ? Number(t.stopPoint.x) : undefined}));
    // przejazd zaczęty przed wpisaniem przejęcia (kierowca wyjechał, potem wpisał) – dzień zaczyna się od startu tego przejazdu
    const first = tr.filter(t => t.stop > P && t.start < P).sort((a, c) => a.start - c.start)[0];
    const P2 = first && P - first.start <= 3 * 3600000 ? first.start : P;
    const pts = (logs || []).filter((l: Row) => l.latitude && l.longitude && l.dateTime).map((l: Row) => ({t: Date.parse(l.dateTime), lat: Number(l.latitude), lng: Number(l.longitude)})).sort((a, c) => a.t - c.t);
    const cross = borderCrossings(pts, bordersCache);
    const ev = buildWork(P2, R, returned, tr, places, cross, haversineKm);
    const rows = ev.map(e => ({booking_id: b.id, driver_id: b.driver_id, vehicle_id: b.vehicle_id, kind: e.kind, start_ts: new Date(e.start).toISOString(), end_ts: new Date(e.end).toISOString(),
      country: e.country, cross_country: e.cross_country, cross_ts: e.cross_ts ? new Date(e.cross_ts).toISOString() : null, km: Math.round(e.km * 10) / 10, source: 'gps'}));
    if (opt.dry){ out.push({booking: b.id, plate: (map.get(dev) || {}).plate, trips: tr.length, points: pts.length, startCountry: cross.startCountry, crossings: cross.crossings.length, rows}); continue; }
    const del = await sb.from('work_events').delete().eq('booking_id', b.id).eq('source', 'gps');
    if (del.error) return {work: 'błąd zapisu: ' + del.error.message};
    if (rows.length){ const ins = await sb.from('work_events').insert(rows); if (ins.error) return {work: 'błąd zapisu: ' + ins.error.message}; }
    saved += rows.length; out.push({booking: b.id, rows: rows.length, crossings: cross.crossings.length});
  }
  return {work: true, bookings: bks.length, saved, report: out};
}

/* ===== Karta pracy wstecz – tylko z GPS (tryb „workHistory”, np. listopad 2026) =====
   Przejazdy auta z całego okresu dzielimy na zmiany (przerwa ≥ 4 h). Zmiana, w czasie której ktoś miał auto przejęte w aplikacji,
   jest liczona zwykłym trybem „work” i tu ją pomijamy. Pozostałe zmiany przypisujemy kierowcy z grafiku tego auta:
   dzień rozpoczęcia zmiany, a dla nocnych – dzień następny (start ≥ 18:00) albo poprzedni (start < 6:00).
   Wpisy mają notatkę 'gps-historia'; ponowne uruchomienie je zastępuje. */
async function workHistory(sb: any, key: (k: string) => string, opt: {vehicle: string; from: string; to: string}){
  const cn = await workConn(sb, key); if (!cn) return {work: 'brak sekretów Geotab'};
  const {rpc, host, cred, devOf} = cn, dev = devOf.get(opt.vehicle);
  if (!dev) return {vehicle: opt.vehicle, work: 'auto bez lokalizatora'};
  const W = (iso: string, h: number) => Date.parse(new Date(Date.parse(iso + 'T00:00:00Z')).toISOString()) + h * 3600000 - 3600000;   // północ czasu polskiego (zima) + h
  const t0 = W(opt.from, 0), t1 = W(addDays(opt.to, 1), 0);
  const trips: Row[] = await rpc(host, 'Get', {typeName: 'Trip', credentials: cred, resultsLimit: 5000, search: {deviceSearch: {id: dev}, fromDate: new Date(t0).toISOString(), toDate: new Date(t1).toISOString()}});
  const tr: WorkTrip[] = (trips || []).filter((t: Row) => t.start && t.stop).map((t: Row) => ({start: Date.parse(t.start), stop: Date.parse(t.stop), km: Number(t.distance) || 0,
    lat: t.stopPoint ? Number(t.stopPoint.y) : undefined, lng: t.stopPoint ? Number(t.stopPoint.x) : undefined})).filter(t => t.start >= t0 && t.start < t1).sort((a, b) => a.start - b.start);
  const shifts: WorkTrip[][] = [];
  tr.forEach(t => { const cur = shifts[shifts.length - 1]; if (cur && t.start - cur[cur.length - 1].stop < 4 * 3600000) cur.push(t); else shifts.push([t]); });
  const {data: bks} = await sb.from('bookings').select('id, driver_id, date_from, date_to, pickup_ts, return_ts').eq('vehicle_id', opt.vehicle).lte('date_from', addDays(opt.to, 1)).gte('date_to', addDays(opt.from, -1));
  const picked = (bks || []).filter((b: Row) => b.pickup_ts).map((b: Row) => [Date.parse(b.pickup_ts), b.return_ts ? Date.parse(b.return_ts) : Date.now()]);
  const {data: cl} = await sb.from('clients').select('lat, lng').not('lat', 'is', null);
  const places = (cl || []).filter((c: Row) => c.lat && c.lng).map((c: Row) => ({lat: Number(c.lat), lng: Number(c.lng)}));
  const wday = (ms: number) => new Intl.DateTimeFormat('sv-SE', {timeZone: 'Europe/Warsaw'}).format(new Date(ms));
  const whour = (ms: number) => Number(new Intl.DateTimeFormat('en-GB', {timeZone: 'Europe/Warsaw', hour: '2-digit', hour12: false}).format(new Date(ms)));
  const ids = (bks || []).map((k: Row) => k.id);
  const {data: man} = ids.length ? await sb.from('work_events').select('booking_id').in('booking_id', ids).eq('source', 'manual') : {data: []};
  const manual = new Set((man || []).map((m: Row) => m.booking_id));
  const rows: Row[] = [], unmatched: string[] = []; let skipped = 0, matched = 0;
  const todo: {sh: WorkTrip[]; b: Row}[] = [];
  for (const sh of shifts){
    const s0 = sh[0].start, s1 = sh[sh.length - 1].stop;
    if (sh.reduce((a, t) => a + t.km, 0) < 3) continue;   // samo przestawienie auta
    if (picked.some(([p, r]) => Math.min(s1, r) - Math.max(s0, p) > 30 * 60000)){ skipped++; continue; }
    const d = wday(s0), h = whour(s0), days = [d, ...(h >= 18 ? [addDays(d, 1)] : h < 6 ? [addDays(d, -1)] : [])];
    let b: Row | undefined; for (const x of days){ b = (bks || []).find((k: Row) => !k.pickup_ts && k.date_from <= x && k.date_to >= x); if (b) break; }
    if (!b){ unmatched.push(d + ' ' + String(h).padStart(2, '0') + ':00'); continue; }
    if (manual.has(b.id)){ skipped++; continue; }   // kierownik poprawił ręcznie – nie nadpisujemy
    todo.push({sh, b});
  }
  for (let i = 0; i < todo.length; i += 8){
    const part = todo.slice(i, i + 8);
    const res: Row[][] = await rpc(host, 'ExecuteMultiCall', {credentials: cred, calls: part.map(x => ({method: 'Get', params: {typeName: 'LogRecord', resultsLimit: 50000,
      search: {deviceSearch: {id: dev}, fromDate: new Date(x.sh[0].start).toISOString(), toDate: new Date(x.sh[x.sh.length - 1].stop).toISOString()}}}))});
    part.forEach((x, j) => {
      const pts = (res[j] || []).filter((l: Row) => l.latitude && l.longitude && l.dateTime).map((l: Row) => ({t: Date.parse(l.dateTime), lat: Number(l.latitude), lng: Number(l.longitude)})).sort((a, c) => a.t - c.t);
      const cross = borderCrossings(pts, bordersCache as Country[]);
      const ev = buildWork(x.sh[0].start, x.sh[x.sh.length - 1].stop, true, x.sh, places, cross, haversineKm);
      matched++;
      ev.forEach(e => rows.push({booking_id: x.b.id, driver_id: x.b.driver_id, vehicle_id: opt.vehicle, kind: e.kind, start_ts: new Date(e.start).toISOString(), end_ts: new Date(e.end).toISOString(),
        country: e.country, cross_country: e.cross_country, cross_ts: e.cross_ts ? new Date(e.cross_ts).toISOString() : null, km: Math.round(e.km * 10) / 10, source: 'gps', note: 'gps-historia'}));
    });
  }
  const del = await sb.from('work_events').delete().eq('vehicle_id', opt.vehicle).eq('note', 'gps-historia').eq('source', 'gps').gte('start_ts', new Date(t0 - 86400000).toISOString()).lt('start_ts', new Date(t1 + 86400000).toISOString());
  if (del.error) return {vehicle: opt.vehicle, work: 'błąd zapisu: ' + del.error.message};
  for (let i = 0; i < rows.length; i += 500){ const ins = await sb.from('work_events').insert(rows.slice(i, i + 500)); if (ins.error) return {vehicle: opt.vehicle, work: 'błąd zapisu: ' + ins.error.message}; }
  return {history: true, vehicle: opt.vehicle, trips: tr.length, shifts: shifts.length, matched, skippedPickup: skipped, unmatched, rows: rows.length};
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

  // karta pracy wstecz z samego GPS: {mode:'workHistory', vehicle:'…', from:'2026-11-01', to:'2026-11-30'}
  if (isCron && body && body.mode === 'workHistory' && body.vehicle && /^\d{4}-\d{2}-\d{2}$/.test(String(body.from)) && /^\d{4}-\d{2}-\d{2}$/.test(String(body.to))){
    try { return json(await workHistory(sb, key, {vehicle: String(body.vehicle), from: String(body.from), to: String(body.to)})); }
    catch (e) { return json({vehicle: body.vehicle, work: 'błąd: ' + String((e as Error).message || e)}); }
  }
  // karta pracy z GPS (harmonogram emage-fleet-praca); {mode:'work', dry:true, booking:'…'} – podgląd bez zapisu
  if (isCron && body && body.mode === 'work'){
    try { return json(await workSync(sb, key, {dry: !!body.dry, booking: body.booking ? String(body.booking) : undefined, limit: Number(body.limit) || undefined})); }
    catch (e) { return json({work: 'błąd: ' + String((e as Error).message || e)}); }
  }
  // co godzinę (harmonogram emage-fleet-gps): tylko przebiegi z lokalizatorów, bez powiadomień
  if (isCron && body && body.mode === 'gps'){
    if (!key('GEOTAB_DATABASE')) return json({gps: 'brak sekretów Geotab'});
    return json({gps: await geotabSync(sb, key, 2)});
  }
  const gpsReq = !!(testUser && body && body.geotabSync);
  if (gpsReq){
    const {data: me} = await sb.from('profiles').select('role, status').eq('id', testUser).maybeSingle();
    if (!me || me.role !== 'floty' || me.status !== 'active') return json({error: 'Synchronizację GPS uruchamia kierownik floty'}, 403);
    const {count} = await sb.from('gps_odometer').select('id', {count: 'exact', head: true});
    return json(await geotabSync(sb, key, Math.min(Number(body.days) || (count ? 7 : 31), 120), Math.min(Number(body.fuel) || 300, 600)));
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
  // przebieg do terminów na km (olej, rozrząd): licznik GPS z ostatnich 3 dni, a bez niego najwyższy zapisany (jak w aplikacji)
  { const gps = await load('gps_odometer', b => b.gte('day', addDays(today, -3)));
    const last = new Map<string, Row>(); gps.forEach((g: Row) => { if (Number(g.km) > 0 && (!last.has(g.vehicle_id) || g.day > (last.get(g.vehicle_id) as Row).day)) last.set(g.vehicle_id, g); });
    d.vehicles.forEach((v: Row) => { const g = last.get(v.id); if (g) v.km_svc = Math.round(Number(g.km)); }); }
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
    const app = String(cfg.app || ((Deno.env.get('SUPABASE_URL') || '').includes('nsvtnpvpbhnbrmygsbxy') ? 'https://emage-fleet.maciekhalon.workers.dev' : 'https://emage-fleet.com'));
    const html = `<div style="font-family:Arial,sans-serif;font-size:15px;line-height:1.5;color:#16130e;max-width:640px">
      <h2 style="margin:0 0 12px">${esc(w.title)}</h2>
      <p style="margin:0 0 14px">${w.body.split('\n').map(esc).join('<br>')}</p>
      ${items.length ? `<h3 style="margin:18px 0 8px">Do zrobienia</h3><ul style="padding-left:18px;margin:0">${items.map(i => `<li style="margin:3px 0">${esc(i.text)}</li>`).join('')}</ul>` : ''}
      <p style="margin:20px 0 0"><a href="${app}" style="color:#16130e;font-weight:bold">Otwórz Emage FLEET</a></p></div>`;
    const r = await fetch('https://api.resend.com/emails', {method: 'POST', headers: {'Authorization': 'Bearer ' + key('RESEND_API_KEY'), 'Content-Type': 'application/json'},
      body: JSON.stringify({from: String(cfg.from || ((Deno.env.get('SUPABASE_URL') || '').includes('nsvtnpvpbhnbrmygsbxy') ? 'Emage FLEET <onboarding@resend.dev>' : 'Emage FLEET <flota@emage-fleet.com>')), to, subject: w.title, html,
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
