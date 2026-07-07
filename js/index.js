import supabase from "./supabase-client.js";

const form = document.getElementById("bookingForm");
const statusBox = document.getElementById("bookingStatus");
const dateEl = document.getElementById("date");
const turnoEl = document.getElementById("turno");
const timeEl = document.getElementById("time");

const eventsSection = document.getElementById("eventsSection");
const eventCardsWrap = document.getElementById("eventCardsWrap");

const dayMenuPanel = document.getElementById("dayMenuPanel");
const dayMenuContent = document.getElementById("dayMenuContent");
const toggleDayMenuBtn = document.getElementById("toggleDayMenuBtn");

let closedServiceMap = new Map();
let rulesCache = [];
let serviceRulesCache = [];

function pad(n) {
  return String(n).padStart(2, "0");
}

function todayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function addDaysISO(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toMinutes(hhmm) {
  const clean = String(hhmm || "").slice(0, 5);
  const [h, m] = clean.split(":").map(Number);

  if (!Number.isFinite(h) || !Number.isFinite(m)) {
    return 0;
  }

  return h * 60 + m;
}

function fromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

function buildSlots(start, end, step) {
  const slots = [];

  const startMinutes = toMinutes(start);
  const endMinutes = toMinutes(end);
  const safeStep = Number(step || 15);

  if (!startMinutes || !endMinutes || endMinutes < startMinutes || safeStep <= 0) {
    return slots;
  }

  for (let t = startMinutes; t <= endMinutes; t += safeStep) {
    slots.push(fromMinutes(t));
  }

  return slots;
}

function normalizeDateToISO(value) {
  if (!value) return "";

  const rawOriginal = String(value).trim();
  const raw = rawOriginal.toLowerCase().replace(/\s+/g, " ");

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

  const monthMap = {
    gen: "01", gennaio: "01", jan: "01", january: "01",
    feb: "02", febbraio: "02", february: "02",
    mar: "03", marzo: "03", march: "03",
    apr: "04", aprile: "04", april: "04",
    mag: "05", maggio: "05", may: "05",
    giu: "06", giugno: "06", jun: "06", june: "06",
    lug: "07", luglio: "07", jul: "07", july: "07",
    ago: "08", agosto: "08", aug: "08", august: "08",
    set: "09", sett: "09", settembre: "09", sep: "09", sept: "09", september: "09",
    ott: "10", ottobre: "10", oct: "10", october: "10",
    nov: "11", novembre: "11", november: "11",
    dic: "12", dicembre: "12", dec: "12", december: "12"
  };

  m = raw.match(/^(\d{1,2})\s+([a-zà-ù]+)\.?\s+(\d{4})$/i);
  if (m) {
    const dd = pad(Number(m[1]));
    const mm = monthMap[m[2].replace(/\.$/, "")];
    const yyyy = m[3];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  m = raw.match(/^([a-zà-ù]+)\.?\s+(\d{1,2}),?\s+(\d{4})$/i);
  if (m) {
    const mm = monthMap[m[1].replace(/\.$/, "")];
    const dd = pad(Number(m[2]));
    const yyyy = m[3];
    if (mm) return `${yyyy}-${mm}-${dd}`;
  }

  const parsed = new Date(rawOriginal);
  if (!Number.isNaN(parsed.getTime())) {
    return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
  }

  console.warn("normalizeDateToISO: formato non riconosciuto →", JSON.stringify(rawOriginal));
  return "";
}

function getLocalDateFromISO(dayISO) {
  return new Date(dayISO + "T00:00:00");
}

function getWeekday(dayISO) {
  return getLocalDateFromISO(dayISO).getDay();
}

function isMonday(dateStr) {
  if (!dateStr) return false;
  return getWeekday(dateStr) === 1;
}

function isSunday(dateStr) {
  if (!dateStr) return false;
  return getWeekday(dateStr) === 0;
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

  const easterMondayISO = `${easterMonday.getFullYear()}-${pad(easterMonday.getMonth() + 1)}-${pad(easterMonday.getDate())}`;

  return dayISO === easterMondayISO;
}

function isHolidayOrSunday(dayISO) {
  return isSunday(dayISO) || isItalianHoliday(dayISO);
}

function isWorkingDay(dayISO) {
  return !isHolidayOrSunday(dayISO);
}

function defaultMaxCoversForMonth(monthIndex) {
  return [4, 5, 6, 7, 8].includes(monthIndex) ? 60 : 40;
}

function getRuleForDay(dayISO, rules) {
  let selected = null;

  for (const rule of rules) {
    if (rule.start_day <= dayISO) selected = rule;
    else break;
  }

  if (selected) {
    return {
      lunch: Number(selected.lunch_max_covers || 0),
      dinner: Number(selected.dinner_max_covers || 0)
    };
  }

  const monthIndex = getLocalDateFromISO(dayISO).getMonth();
  const d = defaultMaxCoversForMonth(monthIndex);

  return { lunch: d, dinner: d };
}

function getDefaultServiceRuleForDay(dayISO, service) {
  const isDinner = service === "dinner";

  if (isMonday(dayISO)) {
    return {
      open_time: isDinner ? "18:30" : "12:30",
      close_time: isDinner ? "23:00" : "15:00",
      slot_step: 15,
      closed: true,
      reason: "Il lunedì il ristorante è chiuso."
    };
  }

  if (isSunday(dayISO) && isDinner) {
    return {
      open_time: "18:30",
      close_time: "23:00",
      slot_step: 15,
      closed: true,
      reason: "La domenica sera non è disponibile."
    };
  }

  if (service === "dinner") {
    return {
      open_time: "18:30",
      close_time: "23:00",
      slot_step: 15,
      closed: false,
      reason: ""
    };
  }

  return {
    open_time: "12:30",
    close_time: "15:00",
    slot_step: 15,
    closed: false,
    reason: ""
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
  if (scope === "all_lunch" && service === "lunch") return true;
  if (scope === "all_dinner" && service === "dinner") return true;
  if (scope === "weekday") return true;
  if (scope === "weekdays") return weekday >= 1 && weekday <= 5;
  if (scope === "working_days") return isWorkingDay(dayISO);
  if (scope === "feriali") return isWorkingDay(dayISO);
  if (scope === "holiday") return isHolidayOrSunday(dayISO);
  if (scope === "holidays") return isHolidayOrSunday(dayISO);
  if (scope === "festivi") return isHolidayOrSunday(dayISO);
  if (scope === "custom") return true;

  return true;
}

function getServiceRuleForDay(dayISO, turno) {
  const service = turno === "cena" || turno === "dinner" ? "dinner" : "lunch";

  let selected = null;

  for (const rule of serviceRulesCache) {
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

    if (rulePriority === selectedPriority && String(rule.start_day || "") >= String(selected.start_day || "")) {
      selected = rule;
    }
  }

  const fallback = getDefaultServiceRuleForDay(dayISO, service);

  if (!selected) return fallback;

  return {
    open_time: selected.open_time || fallback.open_time,
    close_time: selected.close_time || fallback.close_time,
    slot_step: Number(selected.slot_step || fallback.slot_step || 15),
    closed: !!selected.closed,
    reason: selected.closed
      ? (selected.note || "Questo servizio non è prenotabile.")
      : ""
  };
}

async function loadClosedServicesForNextYear() {
  const fromISO = todayISO();
  const toISO = addDaysISO(365);

  const [{ data: calendarData, error: calendarError }, { data: rulesData, error: rulesError }] = await Promise.all([
    supabase
      .from("booking_calendar")
      .select("day, lunch_closed, dinner_closed, lunch_max_covers, dinner_max_covers")
      .gte("day", fromISO)
      .lte("day", toISO),

    supabase
      .from("booking_rules")
      .select("*")
      .lte("start_day", toISO)
      .order("start_day", { ascending: true })
  ]);

  if (calendarError) throw calendarError;
  if (rulesError) throw rulesError;

  rulesCache = rulesData || [];
  closedServiceMap = new Map();

  (calendarData || []).forEach(row => {
    closedServiceMap.set(row.day, {
      lunch_closed: !!row.lunch_closed,
      dinner_closed: !!row.dinner_closed,
      lunch_max_covers: row.lunch_max_covers,
      dinner_max_covers: row.dinner_max_covers
    });
  });
}

async function loadServiceRulesForNextYear() {
  const fromISO = todayISO();
  const toISO = addDaysISO(365);

  const { data, error } = await supabase
    .from("booking_service_rules")
    .select("*")
    .lte("start_day", toISO)
    .or(`end_day.is.null,end_day.gte.${fromISO}`)
    .order("start_day", { ascending: true });

  if (error) {
    console.warn("Regole orarie non caricate. Uso orari predefiniti:", error.message);
    serviceRulesCache = [];
    return;
  }

  serviceRulesCache = data || [];
}

function getServiceState(dateStr, turno) {
  const row = closedServiceMap.get(dateStr);
  const base = getRuleForDay(dateStr, rulesCache);

  if (!row) {
    return {
      closed: false,
      max: turno === "cena" ? Number(base.dinner) : Number(base.lunch)
    };
  }

  if (turno === "cena") {
    return {
      closed: !!row.dinner_closed,
      max: row.dinner_max_covers !== null && row.dinner_max_covers !== undefined
        ? Number(row.dinner_max_covers)
        : Number(base.dinner)
    };
  }

  return {
    closed: !!row.lunch_closed,
    max: row.lunch_max_covers !== null && row.lunch_max_covers !== undefined
      ? Number(row.lunch_max_covers)
      : Number(base.lunch)
  };
}

async function getCurrentBookedCovers(dateStr, turno) {
  const service = turno === "cena" ? "dinner" : "lunch";

  const { data, error } = await supabase
    .from("reservations")
    .select("people, service, notes, status, hidden")
    .eq("reservation_date", dateStr);

  if (error) throw error;

  const rows = (data || []).filter(r => r.status !== "cancelled" && !r.hidden);

  let covers = 0;

  for (const row of rows) {
    let rowService = row.service;

    if (rowService !== "lunch" && rowService !== "dinner") {
      const notes = String(row.notes || "").toLowerCase();
      rowService = notes.includes("turno: cena") ? "dinner" : "lunch";
    }

    if (rowService === service) {
      covers += Number(row.people || 0);
    }
  }

  return covers;
}

async function isBlockedOrFull(dateStr, turno) {
  const serviceRule = getServiceRuleForDay(dateStr, turno);

  if (serviceRule.closed) {
    return {
      blocked: true,
      reason: serviceRule.reason || "Questo servizio non è prenotabile."
    };
  }

  const serviceState = getServiceState(dateStr, turno);

  if (serviceState.closed) {
    return {
      blocked: true,
      reason: "Questo servizio è bloccato e non è prenotabile."
    };
  }

  const covers = await getCurrentBookedCovers(dateStr, turno);

  if (covers >= serviceState.max) {
    return {
      blocked: true,
      reason: "Questo servizio è al completo."
    };
  }

  return {
    blocked: false,
    reason: "",
    covers,
    max: serviceState.max
  };
}

async function refreshSlots() {
  const normalizedDate = normalizeDateToISO(dateEl.value);
  const turno = turnoEl.value;

  timeEl.innerHTML = `<option value="">Seleziona prima data e turno</option>`;

  if (!normalizedDate || !turno) return;

  const state = await isBlockedOrFull(normalizedDate, turno);

  if (state.blocked) {
    timeEl.innerHTML = `<option value="">${escapeHtml(state.reason)}</option>`;
    return;
  }

  const serviceRule = getServiceRuleForDay(normalizedDate, turno);

  if (serviceRule.closed) {
    timeEl.innerHTML = `<option value="">${escapeHtml(serviceRule.reason || "Servizio chiuso")}</option>`;
    return;
  }

  const openTime = String(serviceRule.open_time || "").slice(0, 5);
  const closeTime = String(serviceRule.close_time || "").slice(0, 5);
  const step = Number(serviceRule.slot_step || 15);

  const slots = buildSlots(openTime, closeTime, step);

  if (!slots.length) {
    timeEl.innerHTML = `<option value="">Nessun orario disponibile</option>`;
    return;
  }

  timeEl.innerHTML = `<option value="">Seleziona orario</option>` + slots.map(slot => `
    <option value="${slot}">${slot}</option>
  `).join("");
}

function normalizeSpaces(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, "");
}

function containsDangerousPattern(value) {
  const v = String(value || "").toLowerCase();

  return (
    v.includes("<script") ||
    v.includes("</script") ||
    v.includes("javascript:") ||
    v.includes("data:text/html") ||
    v.includes("onerror=") ||
    v.includes("onload=") ||
    v.includes("onclick=") ||
    v.includes("onmouseover=") ||
    v.includes("iframe") ||
    v.includes("svg") ||
    v.includes("document.cookie") ||
    v.includes("window.location") ||
    v.includes("alert(")
  );
}

function sanitizeText(value, maxLen = 120) {
  let v = normalizeSpaces(value);
  v = stripHtml(v);
  v = v.slice(0, maxLen);
  return v;
}

function validateName(value) {
  const v = sanitizeText(value, 80);

  if (!v) return { ok: false, msg: "Inserisci il nome." };
  if (containsDangerousPattern(v)) return { ok: false, msg: "Nome non valido." };

  if (!/^[A-Za-zÀ-ÖØ-öø-ÿ''.\- ]{2,80}$/.test(v)) {
    return { ok: false, msg: "Il nome contiene caratteri non validi." };
  }

  return { ok: true, value: v };
}

function validatePhone(value) {
  let v = normalizeSpaces(value).replace(/[^\d+ ]/g, "");
  v = v.slice(0, 20);

  if (!v) return { ok: false, msg: "Inserisci il telefono." };
  if (containsDangerousPattern(v)) return { ok: false, msg: "Telefono non valido." };

  if (!/^\+?[0-9 ]{6,20}$/.test(v)) {
    return { ok: false, msg: "Numero di telefono non valido." };
  }

  return { ok: true, value: v };
}

function validateEmail(value) {
  let v = normalizeSpaces(value).toLowerCase().slice(0, 120);

  if (!v) return { ok: false, msg: "Inserisci l'email." };
  if (containsDangerousPattern(v)) return { ok: false, msg: "Email non valida." };

  const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;

  if (!emailRegex.test(v)) {
    return { ok: false, msg: "Formato email non valido." };
  }

  return { ok: true, value: v };
}

function validateNotes(value) {
  let v = sanitizeText(value, 500);

  if (containsDangerousPattern(v)) {
    return { ok: false, msg: "Le note contengono testo non consentito." };
  }

  return { ok: true, value: v };
}

function showError(msg) {
  statusBox.className = "booking-status bad";
  statusBox.textContent = msg;
}

function showOk(msg) {
  statusBox.className = "booking-status ok";
  statusBox.textContent = msg;
}

function clearStatus() {
  statusBox.className = "booking-status";
  statusBox.textContent = "";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function getEventServiceFromTime(startTime) {
  const clean = String(startTime || "").slice(0, 5);

  if (!clean || !clean.includes(":")) {
    return "pranzo";
  }

  const hour = Number(clean.split(":")[0]);

  if (Number.isFinite(hour) && hour >= 18) {
    return "cena";
  }

  return "pranzo";
}

function setTimeIfAvailableOrAppend(timeValue) {
  const cleanTime = String(timeValue || "").slice(0, 5);

  if (!cleanTime || !/^\d{2}:\d{2}$/.test(cleanTime)) return;

  const options = Array.from(timeEl.options || []);
  const exists = options.some(opt => opt.value === cleanTime);

  if (exists) {
    timeEl.value = cleanTime;
    return;
  }

  const hasUsableOptions = options.some(opt => opt.value && opt.value.includes(":"));

  if (hasUsableOptions) {
    const option = document.createElement("option");
    option.value = cleanTime;
    option.textContent = `${cleanTime} - orario evento`;
    timeEl.appendChild(option);
    timeEl.value = cleanTime;
  }
}

async function handleEventBooking(btn) {
  const eventDate = normalizeDateToISO(btn.dataset.date || "");
  const eventTime = String(btn.dataset.time || "").slice(0, 5);
  const eventService = btn.dataset.service || getEventServiceFromTime(eventTime);

  if (!eventDate) {
    showError("Data evento non valida.");
    return;
  }

  dateEl.value = eventDate;
  turnoEl.value = eventService;

  clearStatus();

  await refreshSlots();

  if (eventTime) {
    setTimeIfAvailableOrAppend(eventTime);
  }

  const eventTitle = btn.dataset.title || "";

  if (eventTitle) {
    const notesEl = document.getElementById("notes");
    const currentNotes = normalizeSpaces(notesEl.value || "");
    const eventNote = `Evento: ${eventTitle}`;

    if (!currentNotes.toLowerCase().includes(eventNote.toLowerCase())) {
      notesEl.value = currentNotes ? `${eventNote} | ${currentNotes}` : eventNote;
    }
  }

  document.querySelector(".booking-card")?.scrollIntoView({
    behavior: "smooth",
    block: "start"
  });
}

document.getElementById("notes")?.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[<>]/g, "");
});

document.getElementById("name")?.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^A-Za-zÀ-ÖØ-öø-ÿ''.\- ]/g, "");
});

document.getElementById("phone")?.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[^\d+ ]/g, "");
});

document.getElementById("email")?.addEventListener("input", (e) => {
  e.target.value = e.target.value.replace(/[<>"' ]/g, "");
});

dateEl?.addEventListener("change", async () => {
  const normalizedDate = normalizeDateToISO(dateEl.value);

  if (normalizedDate && turnoEl.value) {
    const state = await isBlockedOrFull(normalizedDate, turnoEl.value);

    if (state.blocked) {
      showError(state.reason);
    } else {
      clearStatus();
    }
  } else {
    clearStatus();
  }

  await refreshSlots();
});

turnoEl?.addEventListener("change", async () => {
  const normalizedDate = normalizeDateToISO(dateEl.value);

  if (normalizedDate && turnoEl.value) {
    const state = await isBlockedOrFull(normalizedDate, turnoEl.value);

    if (state.blocked) {
      showError(state.reason);
    } else {
      clearStatus();
    }
  } else {
    clearStatus();
  }

  await refreshSlots();
});

form?.addEventListener("reset", () => {
  setTimeout(() => {
    timeEl.innerHTML = `<option value="">Seleziona prima data e turno</option>`;
    clearStatus();
  }, 0);
});

toggleDayMenuBtn?.addEventListener("click", async () => {
  dayMenuPanel.classList.toggle("open");

  if (dayMenuPanel.classList.contains("open")) {
    const day = todayISO();

    const { data, error } = await supabase
      .from("menu_day")
      .select("*")
      .eq("day", day)
      .maybeSingle();

    if (error) {
      dayMenuContent.textContent = "Errore caricamento menù del giorno.";
      return;
    }

    if (data?.image_url) {
      dayMenuContent.innerHTML = `<img src="${escapeHtml(data.image_url)}" alt="Menù del giorno">`;
    } else if (data?.text) {
      dayMenuContent.textContent = data.text;
    } else {
      dayMenuContent.textContent = "Nessun menù del giorno disponibile.";
    }
  }
});

async function loadEvents() {
  const fromISO = todayISO();
  const toISO = addDaysISO(31);

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("is_active", true)
    .gte("end_date", fromISO)
    .lte("start_date", toISO)
    .order("start_date", { ascending: true });

  if (error) {
    console.warn("Eventi non caricati:", error.message);
    return;
  }

  const eventsData = data || [];

  if (!eventsData.length) {
    eventsSection?.classList.remove("show");
    if (eventCardsWrap) eventCardsWrap.innerHTML = "";
    return;
  }

  eventsSection?.classList.add("show");

  if (eventCardsWrap) {
    eventCardsWrap.innerHTML = eventsData.map((ev, index) => {
      const startDate = normalizeDateToISO(ev.start_date || "");
      const endDate = normalizeDateToISO(ev.end_date || ev.start_date || "");
      const startTime = ev.start_time ? String(ev.start_time).slice(0, 5) : "";
      const endTime = ev.end_time ? String(ev.end_time).slice(0, 5) : "";
      const service = getEventServiceFromTime(startTime);
      const title = ev.title || "Evento";
      const description = ev.description || "Dettagli evento disponibili a breve.";
      const preview = description.slice(0, 90);
      const dateText = `${startDate}${endDate && endDate !== startDate ? " → " + endDate : ""}`;
      const timeText = startTime ? ` · 🕒 ${startTime}${endTime ? " - " + endTime : ""}` : "";

      return `
        <article class="event-card-mini" data-event-index="${index}">
          <img
            class="event-card-cover"
            src="${escapeHtml(ev.image_url || "assets/fondo.webp")}"
            alt="${escapeHtml(title)}"
          >
          <div class="event-card-body">
            <div class="event-card-date">
              📅 ${escapeHtml(dateText)}${escapeHtml(timeText)}
            </div>

            <div class="event-card-title">${escapeHtml(title)}</div>

            <div class="event-card-preview">
              ${escapeHtml(preview)}
              ${description.length > 90 ? "..." : ""}
            </div>

            <div class="event-card-full">
              ${escapeHtml(description)}

              <div class="event-card-actions">
                <button
                  type="button"
                  class="btn btn-primary btn-book-event"
                  data-date="${escapeHtml(startDate)}"
                  data-time="${escapeHtml(startTime)}"
                  data-service="${escapeHtml(service)}"
                  data-title="${escapeHtml(title)}"
                >
                  Prenota evento
                </button>
              </div>
            </div>
          </div>
        </article>
      `;
    }).join("");

    document.querySelectorAll(".event-card-mini").forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target.closest(".btn-book-event")) return;
        card.classList.toggle("open");
      });

      card.addEventListener("touchstart", (e) => {
        if (e.target.closest(".btn-book-event")) return;
        card.classList.toggle("open");
      }, { passive: true });
    });

    document.querySelectorAll(".btn-book-event").forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await handleEventBooking(btn);
      });

      btn.addEventListener("touchstart", (e) => {
        e.stopPropagation();
      }, { passive: true });
    });
  }
}

form?.addEventListener("submit", async (e) => {
  e.preventDefault();

  const normalizedDate = normalizeDateToISO(dateEl.value);

  if (!normalizedDate) {
    showError("Data non valida.");
    return;
  }

  if (!turnoEl.value) {
    showError("Seleziona un turno.");
    return;
  }

  const serviceRule = getServiceRuleForDay(normalizedDate, turnoEl.value);

  if (serviceRule.closed) {
    showError(serviceRule.reason || "Questo servizio non è prenotabile.");
    return;
  }

  const serviceState = await isBlockedOrFull(normalizedDate, turnoEl.value);

  if (serviceState.blocked) {
    showError(serviceState.reason);
    return;
  }

  if (!timeEl.value) {
    showError("Seleziona un orario valido.");
    return;
  }

  const nameCheck = validateName(document.getElementById("name").value);
  if (!nameCheck.ok) {
    showError(nameCheck.msg);
    return;
  }

  const phoneCheck = validatePhone(document.getElementById("phone").value);
  if (!phoneCheck.ok) {
    showError(phoneCheck.msg);
    return;
  }

  const emailCheck = validateEmail(document.getElementById("email").value);
  if (!emailCheck.ok) {
    showError(emailCheck.msg);
    return;
  }

  const notesCheck = validateNotes(document.getElementById("notes").value);
  if (!notesCheck.ok) {
    showError(notesCheck.msg);
    return;
  }

  const people = Number(document.getElementById("people").value || 0);

  if (!people || people < 1 || people > 12) {
    showError("Numero persone non valido.");
    return;
  }

  const bookedAfterInsert = Number(serviceState.covers || 0) + people;

  if (bookedAfterInsert > Number(serviceState.max || 0)) {
    showError("Con questa prenotazione il servizio supererebbe la capienza disponibile.");
    return;
  }

  const safeNotes = [
    "Turno: " + turnoEl.value,
    notesCheck.value,
    "Email: " + emailCheck.value
  ].filter(Boolean).join(" | ");

  const payload = {
    customer_name: nameCheck.value,
    customer_phone: phoneCheck.value,
    reservation_date: normalizedDate,
    reservation_time: timeEl.value,
    people,
    notes: safeNotes,
    status: "pending",
    source: "web",
    service: turnoEl.value === "cena" ? "dinner" : "lunch",
    hidden: false
  };

  try {
    statusBox.className = "booking-status";
    statusBox.textContent = "Invio in corso...";

    const { error } = await supabase
      .from("reservations")
      .insert([payload]);

    if (error) throw error;

    console.log("Prenotazione salvata");

    try {
      console.log("Invio richiesta mail...");

      const { data: mailData, error: mailError } = await supabase.functions.invoke("notify-booking", {
        body: {
          reservation_id: null,
          customer_name: payload.customer_name,
          customer_phone: payload.customer_phone,
          customer_email: emailCheck.value,
          reservation_date: payload.reservation_date,
          reservation_time: payload.reservation_time,
          people: payload.people,
          service: payload.service,
          notes: payload.notes || ""
        }
      });

      console.log("Risposta mail:", mailData);

      if (mailError) {
        console.error("Errore mail:", mailError);
      }
    } catch (mailErr) {
      console.error("Errore invoke:", mailErr);
    }

    form.reset();
    timeEl.innerHTML = `<option value="">Seleziona prima data e turno</option>`;
    showOk("La prenotazione verrà confermata via mail.");

    await loadClosedServicesForNextYear();
    await loadServiceRulesForNextYear();
    await loadEvents();
  } catch (err) {
    showError("Errore invio: " + (err?.message || err));
  }
});

if (dateEl) {
  dateEl.min = todayISO();
}

await loadClosedServicesForNextYear();
await loadServiceRulesForNextYear();
await loadEvents();
