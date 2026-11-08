// Emage FLEET — funkcja „powiadomienia” (Supabase Edge Function, Deno)
//
// Wywołania:
//  • codziennie rano z harmonogramu (pg_cron) z nagłówkiem x-cron-secret
//    → każda osoba dostaje jedno podsumowanie spraw na dziś (o ile coś jest),
//  • z aplikacji przyciskiem „Wyślij test” (zalogowany użytkownik)
//    → testowe powiadomienie tylko do tej osoby,
//  • od razu z bazy przy zdarzeniu (auto niesprawne, podejrzane tankowanie, spory, sprawy do potwierdzenia)
//    z nagłówkiem x-cron-secret i treścią {mode:'event', roles, users, title, body, tag}.
//
// Sekrety funkcji (Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (np. mailto:flota@firma.pl), CRON_SECRET
// SUPABASE_URL i SUPABASE_SERVICE_ROLE_KEY Supabase dodaje sam.

import webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.49.4';

// ===== LOGIKA (bez zależności – testowana osobno) =====
export type Row = Record<string, any>;
export type Data = {profiles: Row[]; drivers: Row[]; vehicles: Row[]; deadlines: Row[]; bookings: Row[]; issues: Row[]; costs: Row[]; settings: Row[]; cardRows?: Row[]};

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

const json = (o: unknown, status = 200) => new Response(JSON.stringify(o), {status, headers: {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'}});

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return json({ok: true});
  const env = (k: string) => (Deno.env.get(k) || '').trim();
  // klucze wklejane ręcznie w sekretach: usuwamy spacje, entery, cudzysłowy i końcowe „=”
  const key = (k: string) => env(k).replace(/\s+/g, '').replace(/^["']|["']$/g, '').replace(/=+$/, '');
  const sb = createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {auth: {persistSession: false}});
  if (!key('VAPID_PUBLIC_KEY') || !key('VAPID_PRIVATE_KEY')) return json({error: 'Brak kluczy VAPID w sekretach funkcji'}, 500);
  try { webpush.setVapidDetails(env('VAPID_SUBJECT') || 'mailto:flota@example.com', key('VAPID_PUBLIC_KEY'), key('VAPID_PRIVATE_KEY')); }
  catch (e) { return json({error: 'Zły klucz w sekretach funkcji: ' + String((e as Error).message || e) + ' (VAPID_PUBLIC_KEY ma ok. 87 znaków, VAPID_PRIVATE_KEY ok. 43)'}, 500); }

  const isCron = !!key('CRON_SECRET') && (req.headers.get('x-cron-secret') || '').trim() === key('CRON_SECRET');
  const body = await req.json().catch(() => ({}));
  let testUser: string | null = null;
  if (!isCron){
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    const {data} = token ? await sb.auth.getUser(token) : {data: {user: null}};
    if (!data?.user) return json({error: 'Brak uprawnień'}, 401);
    testUser = data.user.id;
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

  if (testUser){
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
  const report: Record<string, unknown>[] = [];
  for (const p of d.profiles.filter(x => x.status === 'active')){
    const items = itemsFor(p, d, today);
    if (!items.length) continue;
    const r = await send(p.id, {...digest(items), url: './', tag: 'podsumowanie-' + today});
    report.push({user: p.id, items: items.length, ...r});
  }
  return json({today, users: report.length, report});
});
