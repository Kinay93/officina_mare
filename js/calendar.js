import supabase from "./supabase-client.js";

const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawerOverlay");

const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthTitle = document.getElementById("calendarMonthTitle");
const calendarStatus = document.getElementById("calendarStatus");

const serviceRulesStatus = document.getElementById("serviceRulesStatus");
const serviceRulesList = document.getElementById("serviceRulesList");

const dayRuleModal = document.getElementById("dayRuleModal");
const dayRuleModalBackdrop = document.getElementById("dayRuleModalBackdrop");
const dayRuleModalClose = document.getElementById("dayRuleModalClose");
const dayRuleModalTitle = document.getElementById("dayRuleModalTitle");
const dayRuleModalSubtitle = document.getElementById("dayRuleModalSubtitle");
const modalLunchToggle = document.getElementById("modalLunchToggle");
const modalDinnerToggle = document.getElementById("modalDinnerToggle");

let currentMonthDate = new Date();
let busy = false;
let serviceRulesCache = [];
let activeModalTarget = null;

async function requireAuth() {
  const { data, error } = await supabase.auth.getSession();

  if (error || !data.session) {
    location.href = "login.html";
    throw new Error("NON_AUTHENTICATED");
  }
}

function openDrawer() {
  drawer?.classList.add("open");
  drawerOverlay?.classList.add("open");
}

function closeDrawer() {
  drawer?.classList.remove("open");
  drawerOverlay?.classList.remove("open");
}

async function doLogout() {
  await supabase.auth.signOut();
  location.href = "login.html";
}

function setStatus(message, type = "") {
  if (!calendarStatus) return;

  calendarStatus.textContent = message || "";
  calendarStatus.className = "calendar-status";

  if (type) calendarStatus.classList.add(type);
}

function setRulesStatus(message, type = "") {
  if (!serviceRulesStatus) return;

  serviceRulesStatus.textContent = message || "";
  serviceRulesStatus.className = "rules-status";

  if (type) serviceRulesStatus.classList.add(type);
}

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toISODate(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return toISODate(d);
}

function getLocalDateFromISO(dayISO) {
  return new Date(dayISO + "T00:00:00");
}

function getWeekday(dayISO) {
  return getLocalDateFromISO(dayISO).getDay();
}

function monthTitle(date) {
  return date.toLocaleDateString("it-IT", {
    month: "long",
    year: "numeric"
  });
}

function monthBounds(date) {
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const last = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { first, last };
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function defaultCapForMonth(monthIndex) {
  return [4, 5, 6, 7, 8].includes(monthIndex) ? 60 : 40;
}

function getRuleForDay(dayISO, rules) {
  let selected = null;

  for (const rule of rules) {
    if (rule.start_day <= dayISO) {
      selected = rule;
    } else {
      break;
    }
  }

  if (selected) {
    return {
      lunch: Number(selected.lunch_max_covers || 0),
      dinner: Number(selected.dinner_max_covers || 0)
    };
  }

  const monthIndex = getLocalDateFromISO(dayISO).getMonth();
  const base = defaultCapForMonth(monthIndex);

  return {
    lunch: base,
    dinner: base
  };
}

function getEasterDate(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;

  return new Date(year, month - 1, day);
}

function isItalianHoliday(dayISO) {
  const d = getLocalDateFromISO(dayISO);
  const year = d.getFullYear();
  const mmdd = `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

  const fixedHolidays = new Set([
    "01-01",
    "01-06",
    "04-25",
    "05-01",
    "06-02",
    "06-29",
    "08-15",
    "11-01",
    "12-08",
    "12-25",
    "12-26"
  ]);

  if (fixedHolidays.has(mmdd)) return true;

  const easter = getEasterDate(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  return dayISO === toISODate(easterMonday);
}

function isMonday(dayISO) {
  return getWeekday(dayISO) === 1;
}

function isSunday(dayISO) {
  return getWeekday(dayISO) === 0;
}

function getDefaultServiceRuleForDay(dayISO, service) {
  /*
    Se è festivo nazionale, viene considerato SOLO festivo.
    Quindi non applica lunedì/domenica come regola automatica.
  */
  if (!isItalianHoliday(dayISO)) {
    if (isMonday(dayISO)) {
      return {
        open_time: service === "dinner" ? "18:30" : "12:30",
        close_time: service === "dinner" ? "23:00" : "15:00",
        slot_step: 15,
        closed: true,
        reason: "Lunedì chiuso",
        source: "default"
      };
    }

    if (isSunday(dayISO) && service === "dinner") {
      return {
        open_time: "18:30",
        close_time: "23:00",
        slot_step: 15,
        closed: true,
        reason: "Domenica sera chiuso",
        source: "default"
      };
    }
  }

  if (service === "dinner") {
    return {
      open_time: "18:30",
      close_time: "23:00",
      slot_step: 15,
      closed: false,
      reason: "",
      source: "default"
    };
  }

  return {
    open_time: "12:30",
    close_time: "15:00",
    slot_step: 15,
    closed: false,
    reason: "",
    source: "default"
  };
}

function ruleMatchesDay(rule, dayISO, service) {
  if (!rule) return false;
  if (rule.service !== service) return false;

  if (rule.start_day && rule.start_day > dayISO) return false;
  if (rule.end_day && rule.end_day < dayISO) return false;

  const scope = String(rule.scope || "custom").toLowerCase();
  const isHoliday = isItalianHoliday(dayISO);

  /*
    Se il giorno è festivo, deve rispondere solo alle regole Festivi
    o alle regole custom su quella data precisa.
    Non deve rispondere a lunedì/martedì/domenica.
  */
  if (isHoliday) {
    if (scope === "holidays" || scope === "festivi") return true;

    if (scope === "custom") {
      return rule.start_day === dayISO && (!rule.end_day || rule.end_day === dayISO);
    }

    if (scope === "all") return true;

    return false;
  }

  if (scope === "holidays" || scope === "festivi") {
    return false;
  }

  if (scope === "all") return true;

  if (scope === "custom") {
    return rule.start_day <= dayISO && (!rule.end_day || rule.end_day >= dayISO);
  }

  if (scope === "weekday") {
    if (rule.weekday === null || rule.weekday === undefined || rule.weekday === "") return false;
    return Number(rule.weekday) === getWeekday(dayISO);
  }

  return true;
}

function getServiceRuleForDay(dayISO, service, rules = serviceRulesCache) {
  let selected = null;

  for (const rule of rules) {
    if (!ruleMatchesDay(rule, dayISO, service)) continue;

    if (!selected) {
      selected = rule;
      continue;
    }

    const selectedPriority = Number(selected.priority || 0);
    const rulePriority = Number(rule.priority || 0);

    if (rulePriority > selectedPriority) {
      selected = rule;
      continue;
    }

    if (rulePriority === selectedPriority) {
      const selectedStart = String(selected.start_day || "");
      const ruleStart = String(rule.start_day || "");

      if (ruleStart > selectedStart) {
        selected = rule;
        continue;
      }

      if (ruleStart === selectedStart) {
        const selectedCreated = String(selected.created_at || "");
        const ruleCreated = String(rule.created_at || "");

        if (ruleCreated >= selectedCreated) {
          selected = rule;
        }
      }
    }
  }

  const fallback = getDefaultServiceRuleForDay(dayISO, service);

  if (!selected) return fallback;

  return {
    open_time: selected.open_time || fallback.open_time,
    close_time: selected.close_time || fallback.close_time,
    slot_step: Number(selected.slot_step || fallback.slot_step || 15),
    closed: !!selected.closed,
    reason: selected.closed ? (selected.note || "Chiuso da regola") : "",
    source: "rule",
    rule_id: selected.id,
    priority: Number(selected.priority || 0)
  };
}

function serviceLabel(service) {
  if (service === "lunch") return "Pranzo";
  if (service === "dinner") return "Cena";
  return service;
}

function weekdayLabel(value) {
  const labels = {
    0: "Domenica",
    1: "Lunedì",
    2: "Martedì",
    3: "Mercoledì",
    4: "Giovedì",
    5: "Venerdì",
    6: "Sabato"
  };

  return labels[Number(value)] || "Giorno";
}

function scopeLabel(scope) {
  const labels = {
    all: "Tutti i giorni",
    custom: "Data precisa",
    weekday: "Giorno della settimana",
    holidays: "Festivi",
    festivi: "Festivi"
  };

  return labels[String(scope || "custom")] || scope || "Personalizzato";
}

function serviceRuleHoursText(rule) {
  if (!rule) return "Orari standard";

  if (rule.closed) {
    return rule.reason || "Chiuso";
  }

  const openTime = String(rule.open_time || "").slice(0, 5);
  const closeTime = String(rule.close_time || "").slice(0, 5);
  const step = Number(rule.slot_step || 15);

  return `${openTime} - ${closeTime} · ogni ${step} min`;
}

function detectService(reservation) {
  if (reservation.service === "lunch" || reservation.service === "dinner") {
    return reservation.service;
  }

  const notes = String(reservation.notes || "").toLowerCase();

  return notes.includes("turno: cena") ? "dinner" : "lunch";
}

function groupReservationsByDay(reservations) {
  const map = new Map();

  for (const row of reservations) {
    if (row.status === "cancelled" || row.hidden) continue;

    const day = row.reservation_date;

    if (!map.has(day)) {
      map.set(day, {
        lunchReservations: 0,
        dinnerReservations: 0,
        lunchCovers: 0,
        dinnerCovers: 0
      });
    }

    const cur = map.get(day);
    const service = detectService(row);

    if (service === "dinner") {
      cur.dinnerReservations += 1;
      cur.dinnerCovers += Number(row.people || 0);
    } else {
      cur.lunchReservations += 1;
      cur.lunchCovers += Number(row.people || 0);
    }
  }

  return map;
}

function serviceStateClass(covers, max, blocked) {
  if (blocked) return "blocked";
  if (covers >= max) return "full";
  if (covers >= Math.floor(max * 0.75)) return "warning";
  return "available";
}

function dayClass(lunchState, dinnerState) {
  if (lunchState === "full" || dinnerState === "full") return "day-full";
  if (lunchState === "warning" || dinnerState === "warning") return "day-warning";
  return "day-available";
}

function getReferenceDateForTarget(target) {
  const today = new Date();

  if (!target) return todayISO();

  if (target.type === "holidays") {
    for (let i = 0; i < 370; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const iso = toISODate(d);

      if (isItalianHoliday(iso)) {
        return iso;
      }
    }

    return todayISO();
  }

  if (target.type === "weekday") {
    for (let i = 0; i < 14; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() + i);

      const iso = toISODate(d);

      if (!isItalianHoliday(iso) && d.getDay() === Number(target.weekday)) {
        return iso;
      }
    }
  }

  return todayISO();
}

function getServiceTimes(service) {
  if (service === "dinner") {
    return {
      open_time: "18:30",
      close_time: "23:00"
    };
  }

  return {
    open_time: "12:30",
    close_time: "15:00"
  };
}

async function insertServiceRule(payload) {
  console.log("Regola da salvare:", payload);

  const { error } = await supabase
    .from("booking_service_rules")
    .insert([payload]);

  if (error) {
    console.error("Errore booking_service_rules:", error);
    throw new Error(`${error.message} ${error.code ? "(" + error.code + ")" : ""}`);
  }
}

async function saveRule({
  service,
  closed,
  scope,
  weekday = null,
  start_day = null,
  end_day = null,
  priority,
  note = null
}) {
  const times = getServiceTimes(service);

  const payload = {
    start_day: start_day || todayISO(),
    end_day: end_day || null,
    weekday,
    service,
    open_time: closed ? null : times.open_time,
    close_time: closed ? null : times.close_time,
    slot_step: 15,
    closed,
    scope,
    note,
    priority
  };

  await insertServiceRule(payload);
}

async function loadServiceRulesList() {
  if (!serviceRulesList) return;

  const today = todayISO();

  serviceRulesList.innerHTML = `
    <div class="rule-row">
      <div class="rule-row-main">
        <div class="rule-row-title">Caricamento regole...</div>
        <div class="rule-row-sub">Attendere.</div>
      </div>
    </div>
  `;

  const { data, error } = await supabase
    .from("booking_service_rules")
    .select("*")
    .or(`end_day.is.null,end_day.gte.${today}`)
    .order("priority", { ascending: true })
    .order("start_day", { ascending: true })
    .order("created_at", { ascending: true });

  if (error) {
    serviceRulesList.innerHTML = `
      <div class="rule-row">
        <div class="rule-row-main">
          <div class="rule-row-title">Errore caricamento regole</div>
          <div class="rule-row-sub">${escapeHtml(error.message)}</div>
        </div>
      </div>
    `;
    return;
  }

  const rows = data || [];
  serviceRulesCache = rows;

  if (!rows.length) {
    serviceRulesList.innerHTML = `
      <div class="rule-row">
        <div class="rule-row-main">
          <div class="rule-row-title">Nessuna regola attiva o futura</div>
          <div class="rule-row-sub">Usa i pulsanti sopra per aprire o chiudere pranzi e cene.</div>
        </div>
      </div>
    `;
    return;
  }

  serviceRulesList.innerHTML = rows.map(row => {
    const startDay = row.start_day || "";
    const endDay = row.end_day || "senza scadenza";
    const closed = !!row.closed;

    const hours = closed
      ? "Servizio chiuso"
      : `${String(row.open_time || "").slice(0, 5)} - ${String(row.close_time || "").slice(0, 5)}`;

    const sub = [
      `Periodo: ${startDay} → ${endDay}`,
      `Tipo: ${scopeLabel(row.scope)}`,
      `Priorità: ${Number(row.priority || 1)}`,
      row.weekday !== null && row.weekday !== undefined ? `Giorno: ${weekdayLabel(row.weekday)}` : "",
      row.note ? `Nota: ${row.note}` : ""
    ].filter(Boolean).join(" · ");

    return `
      <div class="rule-row">
        <div class="rule-row-main">
          <div class="rule-row-title">${escapeHtml(serviceLabel(row.service))}</div>
          <div class="rule-row-sub">${escapeHtml(sub)}</div>
        </div>

        <span class="rule-pill ${closed ? "closed" : "open"}">
          ${closed ? "Chiuso" : "Aperto"}
        </span>

        <span class="rule-pill">
          ${escapeHtml(hours)}
        </span>

        <button
          class="btn btn-danger btn-delete-service-rule"
          type="button"
          data-id="${row.id}"
        >
          Elimina
        </button>
      </div>
    `;
  }).join("");

  document.querySelectorAll(".btn-delete-service-rule").forEach(btn => {
    btn.addEventListener("click", async () => {
      await deleteServiceRule(btn.dataset.id);
    });
  });
}

async function deleteServiceRule(id) {
  if (!id) return;

  if (!confirm("Vuoi eliminare questa regola?")) {
    return;
  }

  if (busy) return;

  busy = true;

  try {
    setRulesStatus("Eliminazione regola...");

    const { error } = await supabase
      .from("booking_service_rules")
      .delete()
      .eq("id", id);

    if (error) throw error;

    setRulesStatus("Regola eliminata ✅", "ok");

    await loadServiceRulesList();
    await loadCalendar(true);
    refreshModalButtons();
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore eliminazione regola: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

function openDayModal(target) {
  activeModalTarget = target;

  dayRuleModalTitle.textContent = target.label;

  if (target.type === "holidays") {
    dayRuleModalSubtitle.textContent = "Gestisci solo i festivi nazionali. Se una data è festiva, vale come Festivi e non come giorno della settimana.";
  } else {
    dayRuleModalSubtitle.textContent = `Gestisci ${target.label}. I festivi non vengono inclusi in questo giorno.`;
  }

  refreshModalButtons();

  dayRuleModal?.classList.add("open");
  document.body.style.overflow = "hidden";
}

function closeDayModal() {
  activeModalTarget = null;
  dayRuleModal?.classList.remove("open");
  document.body.style.overflow = "";
}

function setToggleButtonState(btn, rule) {
  if (!btn) return;

  const state = btn.querySelector(".service-toggle-state");
  const isClosed = !!rule.closed;

  btn.classList.remove("open", "closed");
  btn.classList.add(isClosed ? "closed" : "open");

  if (state) {
    state.textContent = isClosed ? "CHIUSO" : "APERTO";
  }
}

function refreshModalButtons() {
  if (!activeModalTarget) return;

  const refDate = getReferenceDateForTarget(activeModalTarget);

  const lunchRule = getServiceRuleForDay(refDate, "lunch", serviceRulesCache);
  const dinnerRule = getServiceRuleForDay(refDate, "dinner", serviceRulesCache);

  setToggleButtonState(modalLunchToggle, lunchRule);
  setToggleButtonState(modalDinnerToggle, dinnerRule);
}

async function toggleModalService(service) {
  if (!activeModalTarget || busy) return;

  const refDate = getReferenceDateForTarget(activeModalTarget);
  const currentRule = getServiceRuleForDay(refDate, service, serviceRulesCache);
  const newClosed = !currentRule.closed;

  busy = true;

  try {
    setRulesStatus("Salvataggio automatico...");

    if (activeModalTarget.type === "holidays") {
      await saveRule({
        service,
        closed: newClosed,
        scope: "holidays",
        weekday: null,
        priority: 2,
        note: `${newClosed ? "Chiusura" : "Apertura"} ${serviceLabel(service).toLowerCase()} festivi`
      });
    } else {
      await saveRule({
        service,
        closed: newClosed,
        scope: "weekday",
        weekday: Number(activeModalTarget.weekday),
        priority: 2,
        note: `${newClosed ? "Chiusura" : "Apertura"} ${serviceLabel(service).toLowerCase()} ${activeModalTarget.label}`
      });
    }

    await loadServiceRulesList();
    await loadCalendar(true);
    refreshModalButtons();

    setRulesStatus("Salvato automaticamente ✅", "ok");
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore salvataggio: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function saveBulkRule(service, closed) {
  if (busy) return;

  busy = true;

  try {
    setRulesStatus("Salvataggio regola generale...");

    await saveRule({
      service,
      closed,
      scope: "all",
      weekday: null,
      priority: 1,
      note: `${closed ? "Chiusura" : "Apertura"} generale ${serviceLabel(service).toLowerCase()}`
    });

    await loadServiceRulesList();
    await loadCalendar(true);
    refreshModalButtons();

    setRulesStatus("Regola generale salvata ✅", "ok");
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore regola generale: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function saveSpecificDateRule(dayISO, service, closed) {
  if (busy) return;

  busy = true;

  try {
    setStatus("Salvataggio singola data...");

    await saveRule({
      service,
      closed,
      scope: "custom",
      weekday: null,
      start_day: dayISO,
      end_day: dayISO,
      priority: 3,
      note: `${closed ? "Chiusura" : "Apertura"} ${serviceLabel(service).toLowerCase()} del ${dayISO}`
    });

    await loadServiceRulesList();
    await loadCalendar(true);

    setStatus("Singola data aggiornata ✅", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Errore singola data: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function changeCapacityFromDay(dayISO, service, currentValue) {
  const input = prompt(
    `Nuova capienza ${service === "lunch" ? "pranzo" : "cena"} da ${dayISO} in avanti:`,
    String(currentValue)
  );

  if (input === null) return;

  const newValue = Number(input);

  if (!Number.isInteger(newValue) || newValue <= 0) {
    setStatus("Inserisci una capienza valida.", "bad");
    return;
  }

  if (busy) return;

  busy = true;

  try {
    setStatus("Aggiornamento capienza in corso...");

    const { data: allRules, error: rulesError } = await supabase
      .from("booking_rules")
      .select("*")
      .order("start_day", { ascending: true });

    if (rulesError) throw rulesError;

    const currentCaps = getRuleForDay(dayISO, allRules || []);

    const { data: sameDayRule, error: sameDayRuleError } = await supabase
      .from("booking_rules")
      .select("*")
      .eq("start_day", dayISO)
      .maybeSingle();

    if (sameDayRuleError) throw sameDayRuleError;

    if (sameDayRule) {
      const patch = service === "lunch"
        ? { lunch_max_covers: newValue }
        : { dinner_max_covers: newValue };

      const { error: updateSameDayError } = await supabase
        .from("booking_rules")
        .update(patch)
        .eq("id", sameDayRule.id);

      if (updateSameDayError) throw updateSameDayError;
    } else {
      const insertPayload = {
        start_day: dayISO,
        lunch_max_covers: service === "lunch" ? newValue : currentCaps.lunch,
        dinner_max_covers: service === "dinner" ? newValue : currentCaps.dinner
      };

      const { error: insertError } = await supabase
        .from("booking_rules")
        .insert([insertPayload]);

      if (insertError) throw insertError;
    }

    const futurePatch = service === "lunch"
      ? { lunch_max_covers: newValue }
      : { dinner_max_covers: newValue };

    const { error: updateFutureError } = await supabase
      .from("booking_rules")
      .update(futurePatch)
      .gt("start_day", dayISO);

    if (updateFutureError) throw updateFutureError;

    await loadCalendar(true);
    setStatus("Capienza aggiornata ✅", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Errore aggiornamento capienza: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function fetchMonthData(firstISO, lastISO) {
  const [reservationsRes, rulesRes, serviceRulesRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("*")
      .gte("reservation_date", firstISO)
      .lte("reservation_date", lastISO),

    supabase
      .from("booking_rules")
      .select("*")
      .order("start_day", { ascending: true }),

    supabase
      .from("booking_service_rules")
      .select("*")
      .lte("start_day", lastISO)
      .or(`end_day.is.null,end_day.gte.${firstISO}`)
      .order("priority", { ascending: true })
      .order("start_day", { ascending: true })
      .order("created_at", { ascending: true })
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (rulesRes.error) throw rulesRes.error;

  if (serviceRulesRes.error) {
    console.warn("Regole orarie non caricate:", serviceRulesRes.error.message);
  }

  serviceRulesCache = serviceRulesRes.data || [];

  return {
    reservations: reservationsRes.data || [],
    rules: rulesRes.data || [],
    serviceRules: serviceRulesRes.data || []
  };
}

function renderMonth(days, reservationsMap, rules, serviceRules) {
  calendarGrid.innerHTML = days.map(day => {
    const iso = toISODate(day);

    const dayData = reservationsMap.get(iso) || {
      lunchReservations: 0,
      dinnerReservations: 0,
      lunchCovers: 0,
      dinnerCovers: 0
    };

    const caps = getRuleForDay(iso, rules);

    const lunchRule = getServiceRuleForDay(iso, "lunch", serviceRules);
    const dinnerRule = getServiceRuleForDay(iso, "dinner", serviceRules);

    const lunchBlocked = !!lunchRule.closed;
    const dinnerBlocked = !!dinnerRule.closed;

    const lunchState = serviceStateClass(dayData.lunchCovers, caps.lunch, lunchBlocked);
    const dinnerState = serviceStateClass(dayData.dinnerCovers, caps.dinner, dinnerBlocked);

    const isHoliday = isItalianHoliday(iso);

    const lunchButtonText = lunchBlocked ? "Apri" : "Chiudi";
    const dinnerButtonText = dinnerBlocked ? "Apri" : "Chiudi";

    return `
      <article class="day-card ${dayClass(lunchState, dinnerState)}">
        <div class="day-top">
          <div class="day-number">${day.getDate()}</div>
          <div class="day-date-badge ${isHoliday ? "holiday" : ""}">
            ${isHoliday ? "Festivo" : iso}
          </div>
        </div>

        <section class="service-box ${lunchBlocked ? "blocked" : ""}">
          <h3 class="service-title">Pranzo</h3>

          <div class="service-hours-pill">
            🕒 ${escapeHtml(serviceRuleHoursText(lunchRule))}
          </div>

          <div class="service-meta-row">
            <span class="service-meta-pill">🗓 ${dayData.lunchReservations}</span>
            <span class="service-meta-pill">👥 ${dayData.lunchCovers}/${caps.lunch}</span>
          </div>

          <div class="service-actions">
            <button
              class="btn ${lunchBlocked ? "btn-soft" : "btn-danger"} btn-specific-date"
              data-day="${iso}"
              data-service="lunch"
              data-closed="${!lunchBlocked}"
            >
              ${lunchButtonText}
            </button>

            <button
              class="btn btn-soft btn-change-capacity"
              data-day="${iso}"
              data-service="lunch"
              data-current="${caps.lunch}"
            >
              Capienza
            </button>
          </div>
        </section>

        <section class="service-box ${dinnerBlocked ? "blocked" : ""}">
          <h3 class="service-title">Cena</h3>

          <div class="service-hours-pill">
            🕒 ${escapeHtml(serviceRuleHoursText(dinnerRule))}
          </div>

          <div class="service-meta-row">
            <span class="service-meta-pill">🗓 ${dayData.dinnerReservations}</span>
            <span class="service-meta-pill">👥 ${dayData.dinnerCovers}/${caps.dinner}</span>
          </div>

          <div class="service-actions">
            <button
              class="btn ${dinnerBlocked ? "btn-soft" : "btn-danger"} btn-specific-date"
              data-day="${iso}"
              data-service="dinner"
              data-closed="${!dinnerBlocked}"
            >
              ${dinnerButtonText}
            </button>

            <button
              class="btn btn-soft btn-change-capacity"
              data-day="${iso}"
              data-service="dinner"
              data-current="${caps.dinner}"
            >
              Capienza
            </button>
          </div>
        </section>
      </article>
    `;
  }).join("");

  bindCalendarActions();
}

function bindCalendarActions() {
  document.querySelectorAll(".btn-specific-date").forEach(btn => {
    btn.addEventListener("click", async () => {
      await saveSpecificDateRule(
        btn.dataset.day,
        btn.dataset.service,
        btn.dataset.closed === "true"
      );
    });
  });

  document.querySelectorAll(".btn-change-capacity").forEach(btn => {
    btn.addEventListener("click", async () => {
      await changeCapacityFromDay(
        btn.dataset.day,
        btn.dataset.service,
        Number(btn.dataset.current || 0)
      );
    });
  });
}

async function loadCalendar(withFlash = false) {
  const { first, last } = monthBounds(currentMonthDate);
  const firstISO = toISODate(first);
  const lastISO = toISODate(last);

  calendarMonthTitle.textContent = monthTitle(currentMonthDate);

  const days = [];

  for (let d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
    days.push(new Date(d));
  }

  try {
    const {
      reservations,
      rules,
      serviceRules
    } = await fetchMonthData(firstISO, lastISO);

    const reservationsMap = groupReservationsByDay(reservations);

    renderMonth(days, reservationsMap, rules, serviceRules);

    if (withFlash) {
      calendarGrid.style.opacity = "0.65";

      setTimeout(() => {
        calendarGrid.style.opacity = "1";
      }, 180);
    }
  } catch (err) {
    console.error(err);
    setStatus("Errore caricamento calendario: " + (err?.message || err), "bad");
  }
}

function bindSimpleControls() {
  document.querySelectorAll(".weekday-pill").forEach(btn => {
    btn.addEventListener("click", () => {
      const value = btn.dataset.ruleDay;

      if (value === "holidays") {
        openDayModal({
          type: "holidays",
          label: "Festivi"
        });

        return;
      }

      openDayModal({
        type: "weekday",
        weekday: Number(value),
        label: weekdayLabel(value)
      });
    });
  });

  document.querySelectorAll(".big-toggle-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await saveBulkRule(
        btn.dataset.bulkService,
        btn.dataset.bulkClosed === "true"
      );
    });
  });

  modalLunchToggle?.addEventListener("click", async () => {
    await toggleModalService("lunch");
  });

  modalDinnerToggle?.addEventListener("click", async () => {
    await toggleModalService("dinner");
  });

  dayRuleModalClose?.addEventListener("click", closeDayModal);
  dayRuleModalBackdrop?.addEventListener("click", closeDayModal);

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeDayModal();
  });

  document.getElementById("reloadServiceRulesBtn")?.addEventListener("click", async () => {
    await loadServiceRulesList();
    await loadCalendar(true);
    refreshModalButtons();
    setRulesStatus("Regole aggiornate ✅", "ok");
  });

  document.getElementById("reloadServiceRulesListBtn")?.addEventListener("click", async () => {
    await loadServiceRulesList();
    refreshModalButtons();
    setRulesStatus("Lista aggiornata ✅", "ok");
  });
}

document.getElementById("prevMonthBtn")?.addEventListener("click", async () => {
  currentMonthDate = new Date(
    currentMonthDate.getFullYear(),
    currentMonthDate.getMonth() - 1,
    1
  );

  await loadCalendar();
});

document.getElementById("nextMonthBtn")?.addEventListener("click", async () => {
  currentMonthDate = new Date(
    currentMonthDate.getFullYear(),
    currentMonthDate.getMonth() + 1,
    1
  );

  await loadCalendar();
});

document.getElementById("todayBtn")?.addEventListener("click", async () => {
  currentMonthDate = new Date();
  await loadCalendar();
});

document.getElementById("openDrawerBtn")?.addEventListener("click", openDrawer);
document.getElementById("closeDrawerBtn")?.addEventListener("click", closeDrawer);
drawerOverlay?.addEventListener("click", closeDrawer);
document.getElementById("logoutBtn")?.addEventListener("click", doLogout);

await requireAuth();

bindSimpleControls();

await loadServiceRulesList();
await loadCalendar();
