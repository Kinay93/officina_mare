import supabase from "./supabase-client.js";

const drawer = document.getElementById("drawer");
const drawerOverlay = document.getElementById("drawerOverlay");
const calendarGrid = document.getElementById("calendarGrid");
const calendarMonthTitle = document.getElementById("calendarMonthTitle");
const calendarStatus = document.getElementById("calendarStatus");

const serviceRuleForm = document.getElementById("serviceRuleForm");
const serviceRulesStatus = document.getElementById("serviceRulesStatus");
const serviceRulesList = document.getElementById("serviceRulesList");

const ruleStartDay = document.getElementById("ruleStartDay");
const ruleEndDay = document.getElementById("ruleEndDay");
const ruleService = document.getElementById("ruleService");
const ruleClosed = document.getElementById("ruleClosed");
const ruleScope = document.getElementById("ruleScope");
const ruleWeekday = document.getElementById("ruleWeekday");
const ruleOpenTime = document.getElementById("ruleOpenTime");
const ruleCloseTime = document.getElementById("ruleCloseTime");
const ruleSlotStep = document.getElementById("ruleSlotStep");
const rulePriority = document.getElementById("rulePriority");
const ruleNote = document.getElementById("ruleNote");

let currentMonthDate = new Date();
let busy = false;
let serviceRulesCache = [];

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

  if (type) {
    calendarStatus.classList.add(type);
  }
}

function setRulesStatus(message, type = "") {
  if (!serviceRulesStatus) return;

  serviceRulesStatus.textContent = message || "";
  serviceRulesStatus.className = "rules-status";

  if (type) {
    serviceRulesStatus.classList.add(type);
  }
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

function normalizeDateToISO(value) {
  if (!value) return "";

  const raw = String(value).trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    return raw;
  }

  let m = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }

  m = raw.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m) {
    return `${m[3]}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
  }

  const parsed = new Date(raw);

  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  return "";
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

function toMinutes(hhmm) {
  const clean = String(hhmm || "").slice(0, 5);
  const [h, m] = clean.split(":").map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 0;
  }

  return h * 60 + m;
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

  if (fixedHolidays.has(mmdd)) {
    return true;
  }

  const easter = getEasterDate(year);
  const easterMonday = new Date(easter);
  easterMonday.setDate(easter.getDate() + 1);

  return dayISO === toISODate(easterMonday);
}

function isSunday(dayISO) {
  return getWeekday(dayISO) === 0;
}

function isMonday(dayISO) {
  return getWeekday(dayISO) === 1;
}

function isHolidayOrSunday(dayISO) {
  return isSunday(dayISO) || isItalianHoliday(dayISO);
}

function isWorkingDay(dayISO) {
  return !isHolidayOrSunday(dayISO);
}

function getDefaultServiceRuleForDay(dayISO, service) {
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

  const weekday = getWeekday(dayISO);
  const scope = String(rule.scope || "custom").toLowerCase();

  if (rule.weekday !== null && rule.weekday !== undefined && rule.weekday !== "") {
    return Number(rule.weekday) === weekday;
  }

  if (scope === "all") return true;
  if (scope === "custom") return true;
  if (scope === "weekday") return true;
  if (scope === "working_days") return isWorkingDay(dayISO);
  if (scope === "feriali") return isWorkingDay(dayISO);
  if (scope === "holidays") return isHolidayOrSunday(dayISO);
  if (scope === "festivi") return isHolidayOrSunday(dayISO);

  return true;
}

function getServiceRuleForDay(dayISO, service, rules = serviceRulesCache) {
  let selected = null;

  for (const rule of rules) {
    if (!ruleMatchesDay(rule, dayISO, service)) {
      continue;
    }

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

      if (ruleStart >= selectedStart) {
        selected = rule;
      }
    }
  }

  const fallback = getDefaultServiceRuleForDay(dayISO, service);

  if (!selected) {
    return fallback;
  }

  return {
    open_time: selected.open_time || fallback.open_time,
    close_time: selected.close_time || fallback.close_time,
    slot_step: Number(selected.slot_step || fallback.slot_step || 15),
    closed: !!selected.closed,
    reason: selected.closed ? (selected.note || "Chiuso da regola") : "",
    source: "rule",
    rule_id: selected.id
  };
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
    if (row.status === "cancelled" || row.hidden) {
      continue;
    }

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

function buildCalendarMap(rows) {
  const map = new Map();

  for (const row of rows) {
    map.set(row.day, {
      lunch_closed: !!row.lunch_closed,
      dinner_closed: !!row.dinner_closed
    });
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
  if (lunchState === "full" || dinnerState === "full") {
    return "day-full";
  }

  if (lunchState === "warning" || dinnerState === "warning") {
    return "day-warning";
  }

  return "day-available";
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

  if (value === null || value === undefined || value === "") {
    return "Non specifico";
  }

  return labels[Number(value)] || "Non specifico";
}

function serviceLabel(service) {
  if (service === "lunch") return "Pranzo";
  if (service === "dinner") return "Cena";
  return service;
}

function scopeLabel(scope) {
  const labels = {
    all: "Tutti i giorni",
    custom: "Data / periodo scelto",
    weekday: "Giorno della settimana",
    working_days: "Feriali",
    feriali: "Feriali",
    holidays: "Festivi e domeniche",
    festivi: "Festivi e domeniche"
  };

  return labels[String(scope || "custom")] || scope || "Personalizzato";
}

function serviceRuleHoursText(rule) {
  if (!rule) {
    return "Orari standard";
  }

  if (rule.closed) {
    return rule.reason || "Chiuso";
  }

  const openTime = String(rule.open_time || "").slice(0, 5);
  const closeTime = String(rule.close_time || "").slice(0, 5);
  const step = Number(rule.slot_step || 15);

  return `${openTime} - ${closeTime} · ogni ${step} min`;
}

async function fetchMonthData(firstISO, lastISO) {
  const [reservationsRes, calendarRes, rulesRes, serviceRulesRes] = await Promise.all([
    supabase
      .from("reservations")
      .select("*")
      .gte("reservation_date", firstISO)
      .lte("reservation_date", lastISO),

    supabase
      .from("booking_calendar")
      .select("day, lunch_closed, dinner_closed")
      .gte("day", firstISO)
      .lte("day", lastISO),

    supabase
      .from("booking_rules")
      .select("*")
      .order("start_day", { ascending: true }),

    supabase
      .from("booking_service_rules")
      .select("*")
      .lte("start_day", lastISO)
      .or(`end_day.is.null,end_day.gte.${firstISO}`)
      .order("start_day", { ascending: true })
  ]);

  if (reservationsRes.error) throw reservationsRes.error;
  if (calendarRes.error) throw calendarRes.error;
  if (rulesRes.error) throw rulesRes.error;

  if (serviceRulesRes.error) {
    console.warn("Regole orarie non caricate:", serviceRulesRes.error.message);
  }

  serviceRulesCache = serviceRulesRes.data || [];

  return {
    reservations: reservationsRes.data || [],
    calendarRows: calendarRes.data || [],
    rules: rulesRes.data || [],
    serviceRules: serviceRulesRes.data || []
  };
}

function renderMonth(days, reservationsMap, calendarMap, rules, serviceRules) {
  calendarGrid.innerHTML = days.map(day => {
    const iso = toISODate(day);

    const dayData = reservationsMap.get(iso) || {
      lunchReservations: 0,
      dinnerReservations: 0,
      lunchCovers: 0,
      dinnerCovers: 0
    };

    const blocks = calendarMap.get(iso);
    const caps = getRuleForDay(iso, rules);

    const lunchRule = getServiceRuleForDay(iso, "lunch", serviceRules);
    const dinnerRule = getServiceRuleForDay(iso, "dinner", serviceRules);

    const lunchBlockedByDay = !!blocks?.lunch_closed;
    const dinnerBlockedByDay = !!blocks?.dinner_closed;

    const lunchBlockedByRule = !!lunchRule.closed;
    const dinnerBlockedByRule = !!dinnerRule.closed;

    const lunchBlocked = lunchBlockedByDay || lunchBlockedByRule;
    const dinnerBlocked = dinnerBlockedByDay || dinnerBlockedByRule;

    const lunchState = serviceStateClass(dayData.lunchCovers, caps.lunch, lunchBlocked);
    const dinnerState = serviceStateClass(dayData.dinnerCovers, caps.dinner, dinnerBlocked);

    const lunchButtonText = lunchBlockedByRule
      ? "Regola globale"
      : lunchBlockedByDay
        ? "Sblocca"
        : "Blocca";

    const dinnerButtonText = dinnerBlockedByRule
      ? "Regola globale"
      : dinnerBlockedByDay
        ? "Sblocca"
        : "Blocca";

    return `
      <article class="day-card ${dayClass(lunchState, dinnerState)}">
        <div class="day-top">
          <div class="day-number">${day.getDate()}</div>
          <div class="day-date-badge">${iso}</div>
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
              class="btn ${lunchBlocked ? "btn-danger" : "btn-soft"} btn-toggle-block"
              data-day="${iso}"
              data-service="lunch"
              data-blocked="${lunchBlockedByDay}"
              ${lunchBlockedByRule ? "disabled" : ""}
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
              class="btn ${dinnerBlocked ? "btn-danger" : "btn-soft"} btn-toggle-block"
              data-day="${iso}"
              data-service="dinner"
              data-blocked="${dinnerBlockedByDay}"
              ${dinnerBlockedByRule ? "disabled" : ""}
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

async function ensureCalendarRow(dayISO) {
  const { data, error } = await supabase
    .from("booking_calendar")
    .select("day, lunch_closed, dinner_closed")
    .eq("day", dayISO)
    .maybeSingle();

  if (error) throw error;

  if (data) {
    return data;
  }

  const { error: insertError } = await supabase
    .from("booking_calendar")
    .insert([{
      day: dayISO,
      lunch_closed: false,
      dinner_closed: false
    }]);

  if (insertError) throw insertError;
}

async function toggleBlock(dayISO, service, blocked) {
  if (busy) return;

  busy = true;

  try {
    setStatus("Aggiornamento in corso...");

    await ensureCalendarRow(dayISO);

    const patch = service === "lunch"
      ? { lunch_closed: !blocked }
      : { dinner_closed: !blocked };

    const { error } = await supabase
      .from("booking_calendar")
      .update(patch)
      .eq("day", dayISO);

    if (error) throw error;

    await loadCalendar(true);
    setStatus("Servizio aggiornato ✅", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Errore aggiornamento servizio: " + (err?.message || err), "bad");
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
    setStatus("Capienza aggiornata per questo giorno e i successivi ✅", "ok");
  } catch (err) {
    console.error(err);
    setStatus("Errore aggiornamento capienza: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

function bindCalendarActions() {
  document.querySelectorAll(".btn-toggle-block").forEach(btn => {
    btn.addEventListener("click", async () => {
      if (btn.disabled) return;

      await toggleBlock(
        btn.dataset.day,
        btn.dataset.service,
        btn.dataset.blocked === "true"
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
      calendarRows,
      rules,
      serviceRules
    } = await fetchMonthData(firstISO, lastISO);

    const reservationsMap = groupReservationsByDay(reservations);
    const calendarMap = buildCalendarMap(calendarRows);

    renderMonth(days, reservationsMap, calendarMap, rules, serviceRules);

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

function getServiceRulePayloadsFromForm() {
  const startDay = normalizeDateToISO(ruleStartDay.value);
  const endDay = normalizeDateToISO(ruleEndDay.value);
  const service = ruleService.value;
  const closed = ruleClosed.value === "true";
  const scope = ruleScope.value || "custom";
  const weekday = ruleWeekday.value === "" ? null : Number(ruleWeekday.value);
  const openTime = ruleOpenTime.value || null;
  const closeTime = ruleCloseTime.value || null;
  const slotStep = Number(ruleSlotStep.value || 15);
  const priority = Number(rulePriority.value || 10);
  const note = String(ruleNote.value || "").trim();

  if (!startDay) {
    throw new Error("Inserisci la data di inizio.");
  }

  if (endDay && endDay < startDay) {
    throw new Error("La data finale non può essere precedente alla data iniziale.");
  }

  if (scope === "weekday" && weekday === null) {
    throw new Error("Se scegli un giorno della settimana, devi indicare quale giorno.");
  }

  if (!closed) {
    if (!openTime || !closeTime) {
      throw new Error("Per un servizio aperto devi inserire apertura e chiusura.");
    }

    if (toMinutes(closeTime) <= toMinutes(openTime)) {
      throw new Error("La chiusura deve essere successiva all'apertura.");
    }
  }

  const services = service === "both" ? ["lunch", "dinner"] : [service];

  return services.map(s => {
    let finalOpenTime = openTime;
    let finalCloseTime = closeTime;

    if (service === "both" && !closed) {
      if (s === "lunch") {
        finalOpenTime = "12:30";
        finalCloseTime = "15:00";
      }

      if (s === "dinner") {
        finalOpenTime = "18:30";
        finalCloseTime = "23:00";
      }
    }

    return {
      start_day: startDay,
      end_day: endDay || null,
      weekday,
      service: s,
      open_time: closed ? null : finalOpenTime,
      close_time: closed ? null : finalCloseTime,
      slot_step: slotStep,
      closed,
      scope,
      note: note || null,
      priority
    };
  });
}

async function insertServiceRules(payloads) {
  const { error } = await supabase
    .from("booking_service_rules")
    .insert(payloads);

  if (error) {
    throw error;
  }
}

async function saveServiceRuleFromForm(e) {
  e?.preventDefault();

  if (busy) return;

  busy = true;

  try {
    setRulesStatus("Salvataggio regola in corso...");

    const payloads = getServiceRulePayloadsFromForm();

    await insertServiceRules(payloads);

    setRulesStatus("Regola salvata ✅", "ok");

    await loadServiceRulesList();
    await loadCalendar(true);
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore salvataggio regola: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

function baseQuickRulePayload({
  service,
  closed,
  scope,
  weekday = null,
  open_time = null,
  close_time = null,
  slot_step = 15,
  note = null,
  priority = 50
}) {
  const startDay = normalizeDateToISO(ruleStartDay.value) || todayISO();
  const endDay = normalizeDateToISO(ruleEndDay.value) || null;

  return {
    start_day: startDay,
    end_day: endDay,
    weekday,
    service,
    open_time: closed ? null : open_time,
    close_time: closed ? null : close_time,
    slot_step,
    closed,
    scope,
    note,
    priority
  };
}

async function saveQuickRules(payloads, successMessage) {
  if (busy) return;

  busy = true;

  try {
    setRulesStatus("Salvataggio regola rapida...");

    await insertServiceRules(payloads);

    setRulesStatus(successMessage || "Regola salvata ✅", "ok");

    await loadServiceRulesList();
    await loadCalendar(true);
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore regola rapida: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function handleQuickRule(type) {
  const step = Number(ruleSlotStep.value || 15);

  if (type === "close-all-lunch") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "lunch",
        closed: true,
        scope: "all",
        note: "Blocco di tutti i pranzi",
        priority: 80
      })
    ], "Tutti i pranzi bloccati ✅");
    return;
  }

  if (type === "close-all-dinner") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "dinner",
        closed: true,
        scope: "all",
        note: "Blocco di tutte le cene",
        priority: 80
      })
    ], "Tutte le cene bloccate ✅");
    return;
  }

  if (type === "close-weekday") {
    let weekday = ruleWeekday.value;

    if (weekday === "") {
      weekday = prompt(
        "Quale giorno vuoi bloccare?\n0 = Domenica\n1 = Lunedì\n2 = Martedì\n3 = Mercoledì\n4 = Giovedì\n5 = Venerdì\n6 = Sabato",
        "1"
      );
    }

    if (weekday === null) return;

    weekday = Number(weekday);

    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) {
      setRulesStatus("Giorno non valido. Usa un numero da 0 a 6.", "bad");
      return;
    }

    await saveQuickRules([
      baseQuickRulePayload({
        service: "lunch",
        closed: true,
        scope: "weekday",
        weekday,
        note: `Blocco pranzo ${weekdayLabel(weekday)}`,
        priority: 90
      }),
      baseQuickRulePayload({
        service: "dinner",
        closed: true,
        scope: "weekday",
        weekday,
        note: `Blocco cena ${weekdayLabel(weekday)}`,
        priority: 90
      })
    ], `${weekdayLabel(weekday)} bloccato a pranzo e cena ✅`);
    return;
  }

  if (type === "close-holiday-lunch") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "lunch",
        closed: true,
        scope: "holidays",
        note: "Blocco pranzi festivi",
        priority: 70
      })
    ], "Pranzi festivi bloccati ✅");
    return;
  }

  if (type === "close-holiday-dinner") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "dinner",
        closed: true,
        scope: "holidays",
        note: "Blocco cene festive",
        priority: 70
      })
    ], "Cene festive bloccate ✅");
    return;
  }

  if (type === "close-working-lunch") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "lunch",
        closed: true,
        scope: "working_days",
        note: "Blocco pranzi feriali",
        priority: 70
      })
    ], "Pranzi feriali bloccati ✅");
    return;
  }

  if (type === "close-working-dinner") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "dinner",
        closed: true,
        scope: "working_days",
        note: "Blocco cene feriali",
        priority: 70
      })
    ], "Cene feriali bloccate ✅");
    return;
  }

  if (type === "open-standard") {
    await saveQuickRules([
      baseQuickRulePayload({
        service: "lunch",
        closed: false,
        scope: "all",
        open_time: "12:30",
        close_time: "15:00",
        slot_step: step,
        note: "Ripristino orario standard pranzo",
        priority: 100
      }),
      baseQuickRulePayload({
        service: "dinner",
        closed: false,
        scope: "all",
        open_time: "18:30",
        close_time: "23:00",
        slot_step: step,
        note: "Ripristino orario standard cena",
        priority: 100
      })
    ], "Orari standard ripristinati ✅");
  }
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
    .order("start_day", { ascending: true });

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
          <div class="rule-row-sub">Puoi crearne una dal modulo sopra.</div>
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
      ? "Servizio bloccato"
      : `${String(row.open_time || "").slice(0, 5)} - ${String(row.close_time || "").slice(0, 5)} · ogni ${Number(row.slot_step || 15)} min`;

    const sub = [
      `Periodo: ${startDay} → ${endDay}`,
      `Applica a: ${scopeLabel(row.scope)}`,
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
          ${closed ? "Bloccato" : "Aperto"}
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
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore eliminazione regola: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

async function deletePastRules() {
  if (!confirm("Vuoi eliminare tutte le regole già scadute?")) {
    return;
  }

  if (busy) return;

  busy = true;

  try {
    setRulesStatus("Eliminazione regole passate...");

    const { error } = await supabase
      .from("booking_service_rules")
      .delete()
      .not("end_day", "is", null)
      .lt("end_day", todayISO());

    if (error) throw error;

    setRulesStatus("Regole passate eliminate ✅", "ok");

    await loadServiceRulesList();
    await loadCalendar(true);
  } catch (err) {
    console.error(err);
    setRulesStatus("Errore eliminazione regole passate: " + (err?.message || err), "bad");
  } finally {
    busy = false;
  }
}

function setDefaultRuleFormValues() {
  const today = todayISO();

  if (ruleStartDay) ruleStartDay.value = today;
  if (ruleEndDay) ruleEndDay.value = "";
  if (ruleService) ruleService.value = "both";
  if (ruleClosed) ruleClosed.value = "false";
  if (ruleScope) ruleScope.value = "all";
  if (ruleWeekday) ruleWeekday.value = "";
  if (ruleOpenTime) ruleOpenTime.value = "12:30";
  if (ruleCloseTime) ruleCloseTime.value = "15:00";
  if (ruleSlotStep) ruleSlotStep.value = "15";
  if (rulePriority) rulePriority.value = "10";
  if (ruleNote) ruleNote.value = "";

  updateRuleTimeDefaults();
  updateWeekdayFieldState();
}

function updateRuleTimeDefaults() {
  if (!ruleService || !ruleOpenTime || !ruleCloseTime) return;

  if (ruleService.value === "dinner") {
    if (ruleOpenTime.value === "12:30" && ruleCloseTime.value === "15:00") {
      ruleOpenTime.value = "18:30";
      ruleCloseTime.value = "23:00";
    }
  }

  if (ruleService.value === "lunch") {
    if (ruleOpenTime.value === "18:30" && ruleCloseTime.value === "23:00") {
      ruleOpenTime.value = "12:30";
      ruleCloseTime.value = "15:00";
    }
  }
}

function updateWeekdayFieldState() {
  if (!ruleScope || !ruleWeekday) return;

  if (ruleScope.value === "weekday") {
    ruleWeekday.disabled = false;
  } else {
    ruleWeekday.value = "";
    ruleWeekday.disabled = true;
  }
}

function bindRuleFormEvents() {
  serviceRuleForm?.addEventListener("submit", saveServiceRuleFromForm);

  serviceRuleForm?.addEventListener("reset", () => {
    setTimeout(() => {
      setDefaultRuleFormValues();
      setRulesStatus("");
    }, 0);
  });

  ruleService?.addEventListener("change", updateRuleTimeDefaults);
  ruleScope?.addEventListener("change", updateWeekdayFieldState);

  document.getElementById("reloadServiceRulesBtn")?.addEventListener("click", async () => {
    await loadServiceRulesList();
    await loadCalendar(true);
    setRulesStatus("Regole aggiornate ✅", "ok");
  });

  document.getElementById("reloadServiceRulesListBtn")?.addEventListener("click", async () => {
    await loadServiceRulesList();
    setRulesStatus("Lista regole aggiornata ✅", "ok");
  });

  document.getElementById("deletePastRulesBtn")?.addEventListener("click", deletePastRules);

  document.querySelectorAll(".quick-rule-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      await handleQuickRule(btn.dataset.quickRule);
    });
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

setDefaultRuleFormValues();
bindRuleFormEvents();

await loadServiceRulesList();
await loadCalendar();
