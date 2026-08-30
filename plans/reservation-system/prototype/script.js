const params = new URLSearchParams(window.location.search);
const requestedTheme = params.get("theme");
if (requestedTheme === "dark" || requestedTheme === "light") {
  document.documentElement.classList.toggle("dark", requestedTheme === "dark");
  document.documentElement.classList.toggle("light", requestedTheme === "light");
}

const services = {
  "my-number-card": {
    name: "マイナンバーカード交付・更新",
    method: "DATETIME",
    methodLabel: "日時予約",
    description: "平日の9:00から17:00まで、30分単位で来庁日時を予約できます。",
    weekdays: [1, 2, 3, 4, 5],
    slots: createTimedSlots(9 * 60, 17 * 60, 30, 3),
  },
  "legal-consultation": {
    name: "無料法律相談",
    method: "DATETIME",
    methodLabel: "日時予約",
    description: "毎週水曜日の午後に、60分単位で弁護士相談枠を予約できます。",
    weekdays: [3],
    slots: createTimedSlots(13 * 60, 16 * 60, 60, 1),
  },
  "bulky-waste": {
    name: "粗大ごみ収集",
    method: "DATE",
    methodLabel: "日付予約",
    description: "月曜日から土曜日まで、収集日を日単位で予約できます。",
    weekdays: [1, 2, 3, 4, 5, 6],
    slots: [{ startMinute: 0, endMinute: 1440, capacity: 20, label: "収集日" }],
  },
  "civic-facility": {
    name: "公民館・市民会館・会議室利用",
    method: "DATETIME",
    methodLabel: "施設利用枠",
    description: "午前・午後・夜間の施設利用枠から予約できます。",
    weekdays: [0, 1, 2, 3, 4, 5, 6],
    slots: [
      { startMinute: 9 * 60, endMinute: 12 * 60, capacity: 2, label: "午前" },
      { startMinute: 13 * 60, endMinute: 17 * 60, capacity: 2, label: "午後" },
      { startMinute: 18 * 60, endMinute: 21 * 60, capacity: 2, label: "夜間" },
    ],
  },
};

const prototypeToday = new Date(2026, 7, 30);
const minimumMonth = new Date(2026, 7, 1);
const maximumMonth = new Date(2027, 6, 1);
let displayedMonth = parseMonth(params.get("month")) ?? new Date(2026, 8, 1);
let selectedServiceKey = services[params.get("service")] ? params.get("service") : "my-number-card";
let selectedDateKey = params.get("date") ?? "2026-09-08";
const readOnly = params.get("state") === "view-only";
const occupancy = new Map();

seedOccupancy();

const serviceSelect = document.getElementById("service-select");
const calendarGrid = document.getElementById("calendar-grid");
const randomFillButton = document.getElementById("random-fill-button");
const feedback = document.getElementById("generation-feedback");
const readOnlyNotice = document.getElementById("read-only-notice");

serviceSelect.value = selectedServiceKey;
randomFillButton.disabled = readOnly;
readOnlyNotice.hidden = !readOnly;

serviceSelect.addEventListener("change", () => {
  selectedServiceKey = serviceSelect.value;
  selectedDateKey = firstBookableDateKey(displayedMonth, services[selectedServiceKey]);
  feedback.hidden = true;
  render();
});

document.getElementById("previous-month").addEventListener("click", () => {
  displayedMonth = addMonths(displayedMonth, -1);
  selectedDateKey = firstBookableDateKey(displayedMonth, services[selectedServiceKey]);
  feedback.hidden = true;
  render();
});

document.getElementById("next-month").addEventListener("click", () => {
  displayedMonth = addMonths(displayedMonth, 1);
  selectedDateKey = firstBookableDateKey(displayedMonth, services[selectedServiceKey]);
  feedback.hidden = true;
  render();
});

document.getElementById("current-month").addEventListener("click", () => {
  displayedMonth = new Date(minimumMonth);
  selectedDateKey = firstBookableDateKey(displayedMonth, services[selectedServiceKey]);
  feedback.hidden = true;
  render();
});

randomFillButton.addEventListener("click", () => {
  randomFillButton.disabled = true;
  randomFillButton.setAttribute("aria-busy", "true");
  feedback.hidden = true;
  window.setTimeout(() => {
    fillDisplayedMonth();
    randomFillButton.disabled = readOnly;
    randomFillButton.removeAttribute("aria-busy");
    feedback.hidden = false;
    render();
    randomFillButton.focus();
  }, 250);
});

const menuTriggers = [...document.querySelectorAll("[data-admin-menu-trigger]")];
function closeMenus(exceptTrigger = null) {
  for (const trigger of menuTriggers) {
    if (trigger === exceptTrigger) continue;
    const menu = document.getElementById(trigger.getAttribute("aria-controls"));
    trigger.setAttribute("aria-expanded", "false");
    if (menu) menu.hidden = true;
  }
}

for (const trigger of menuTriggers) {
  const menu = document.getElementById(trigger.getAttribute("aria-controls"));
  trigger.addEventListener("click", () => {
    const open = trigger.getAttribute("aria-expanded") !== "true";
    closeMenus(open ? trigger : null);
    trigger.setAttribute("aria-expanded", String(open));
    menu.hidden = !open;
  });
  trigger.parentElement.addEventListener("focusout", (event) => {
    if (!trigger.parentElement.contains(event.relatedTarget)) closeMenus();
  });
}

document.addEventListener("mousedown", (event) => {
  if (!menuTriggers.some((trigger) => trigger.parentElement.contains(event.target))) closeMenus();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  const trigger = menuTriggers.find((item) => item.getAttribute("aria-expanded") === "true");
  closeMenus();
  trigger?.focus();
});

function render() {
  const service = services[selectedServiceKey];
  document.getElementById("booking-method-badge").textContent = service.methodLabel;
  document.getElementById("service-description").textContent = service.description;
  document.getElementById("calendar-month-heading").textContent = formatMonth(displayedMonth);
  document.getElementById("previous-month").disabled = displayedMonth <= minimumMonth;
  document.getElementById("next-month").disabled = displayedMonth >= maximumMonth;
  renderCalendar(service);
  renderSelectedDate(service);
}

function renderCalendar(service) {
  calendarGrid.replaceChildren();
  const year = displayedMonth.getFullYear();
  const month = displayedMonth.getMonth();
  const leading = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = Math.ceil((leading + days) / 7) * 7;

  for (let index = 0; index < cells; index += 1) {
    const day = index - leading + 1;
    if (day < 1 || day > days) {
      const empty = document.createElement("span");
      empty.className = "min-h-24 bg-surface-raised sm:min-h-28";
      empty.setAttribute("aria-hidden", "true");
      calendarGrid.append(empty);
      continue;
    }

    const date = new Date(year, month, day);
    const dateKey = toDateKey(date);
    const past = date < prototypeToday;
    const bookable = service.weekdays.includes(date.getDay()) && !past;
    const summary = bookable ? summarizeDate(service, dateKey) : null;
    const selected = selectedDateKey === dateKey;
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.day = dateKey;
    button.disabled = !bookable;
    button.setAttribute("role", "gridcell");
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute(
      "aria-label",
      `${formatFullDate(date)}。${summary ? statusLabel(summary.status) : "受付なし"}`,
    );
    button.className = selected
      ? "min-h-24 cursor-pointer bg-surface-selected p-1.5 text-left ring-2 ring-inset ring-accent focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent sm:min-h-28 sm:p-2"
      : bookable
        ? "min-h-24 cursor-pointer bg-surface-raised p-1.5 text-left transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-3px] focus-visible:outline-accent sm:min-h-28 sm:p-2"
        : "min-h-24 cursor-not-allowed bg-surface p-1.5 text-left text-fg-muted opacity-60 sm:min-h-28 sm:p-2";

    const dayNumber = document.createElement("span");
    dayNumber.className = "block text-sm font-bold";
    dayNumber.textContent = String(day);
    button.append(dayNumber);

    if (summary) {
      const status = document.createElement("span");
      status.className = `mt-2 block text-[11px] font-bold leading-4 ${statusTextClass(summary.status)}`;
      status.textContent = statusLabel(summary.status);
      const count = document.createElement("span");
      count.className = "mt-1 block text-[10px] leading-4 text-fg-muted sm:text-xs";
      count.textContent = service.method === "DATE"
        ? `${summary.booked}/${summary.capacity}件`
        : `空き${summary.remaining}枠`;
      button.append(status, count);
    } else {
      const unavailable = document.createElement("span");
      unavailable.className = "mt-2 block text-[11px] font-semibold leading-4";
      unavailable.textContent = "受付なし";
      button.append(unavailable);
    }

    button.addEventListener("click", () => {
      selectedDateKey = dateKey;
      render();
    });
    calendarGrid.append(button);
  }
}

function renderSelectedDate(service) {
  const date = parseDateKey(selectedDateKey);
  document.getElementById("selected-service-name").textContent = service.name;
  document.getElementById("selected-date-heading").textContent = formatFullDate(date);
  document.getElementById("selected-date-summary").textContent = service.method === "DATE"
    ? "この日の収集予約状況です。"
    : "予約可能な時間を選択できます。";
  const slotList = document.getElementById("slot-list");
  const noSlots = document.getElementById("no-slots-message");
  slotList.replaceChildren();

  if (!service.weekdays.includes(date.getDay()) || date < prototypeToday) {
    noSlots.hidden = false;
    slotList.hidden = true;
    return;
  }

  noSlots.hidden = true;
  slotList.hidden = false;
  for (const slot of service.slots) {
    const booked = occupancy.get(slotKey(selectedServiceKey, selectedDateKey, slot.startMinute)) ?? 0;
    const remaining = Math.max(0, slot.capacity - booked);
    const status = capacityStatus(slot.capacity, remaining);
    const article = document.createElement("article");
    article.className = "rounded-md border border-line bg-surface p-3";
    article.dataset.slot = String(slot.startMinute);
    const row = document.createElement("div");
    row.className = "flex items-start justify-between gap-3";
    const label = document.createElement("div");
    const title = document.createElement("h3");
    title.className = "font-bold";
    title.textContent = service.method === "DATE"
      ? slot.label
      : `${slot.label ? `${slot.label} ` : ""}${formatTime(slot.startMinute)}–${formatTime(slot.endMinute)}`;
    const count = document.createElement("p");
    count.className = "mt-1 text-sm text-fg-muted";
    count.textContent = `予約 ${booked}/${slot.capacity}件・残り ${remaining}件`;
    const badge = document.createElement("span");
    badge.className = `shrink-0 rounded-full px-2.5 py-1 text-xs font-bold ${statusBadgeClass(status)}`;
    badge.textContent = statusLabel(status);
    label.append(title, count);
    row.append(label, badge);
    article.append(row);
    slotList.append(article);
  }
}

function createTimedSlots(start, end, interval, capacity) {
  const slots = [];
  for (let minute = start; minute < end; minute += interval) {
    slots.push({ startMinute: minute, endMinute: minute + interval, capacity, label: "" });
  }
  return slots;
}

function seedOccupancy() {
  for (const [serviceKey, service] of Object.entries(services)) {
    forEachBookableDate(displayedMonth, service, (dateKey, dateIndex) => {
      service.slots.forEach((slot, slotIndex) => {
        const values = slot.capacity === 1 ? [0, 1, 0, 1] : [0, Math.ceil(slot.capacity / 2), slot.capacity - 1, slot.capacity];
        occupancy.set(slotKey(serviceKey, dateKey, slot.startMinute), values[(dateIndex + slotIndex) % values.length]);
      });
    });
  }
}

function fillDisplayedMonth() {
  for (const [serviceKey, service] of Object.entries(services)) {
    forEachBookableDate(displayedMonth, service, (dateKey) => {
      service.slots.forEach((slot) => {
        const candidates = slot.capacity === 1
          ? [0, 1]
          : [0, Math.ceil(slot.capacity / 2), slot.capacity - 1, slot.capacity];
        occupancy.set(slotKey(serviceKey, dateKey, slot.startMinute), candidates[Math.floor(Math.random() * candidates.length)]);
      });
    });
  }
}

function forEachBookableDate(month, service, callback) {
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  let bookableIndex = 0;
  for (let day = 1; day <= days; day += 1) {
    const date = new Date(month.getFullYear(), month.getMonth(), day);
    if (date < prototypeToday || !service.weekdays.includes(date.getDay())) continue;
    callback(toDateKey(date), bookableIndex);
    bookableIndex += 1;
  }
}

function summarizeDate(service, dateKey) {
  let capacity = 0;
  let booked = 0;
  for (const slot of service.slots) {
    capacity += slot.capacity;
    booked += occupancy.get(slotKey(selectedServiceKey, dateKey, slot.startMinute)) ?? 0;
  }
  const remaining = Math.max(0, capacity - booked);
  return { capacity, booked, remaining, status: capacityStatus(capacity, remaining) };
}

function capacityStatus(capacity, remaining) {
  if (remaining === 0) return "FULL";
  if (remaining <= Math.max(1, Math.ceil(capacity * 0.25))) return "LIMITED";
  return "AVAILABLE";
}

function statusLabel(status) {
  return status === "FULL" ? "満員" : status === "LIMITED" ? "残りわずか" : "空きあり";
}

function statusTextClass(status) {
  return status === "FULL"
    ? "text-red-700 dark:text-red-300"
    : status === "LIMITED"
      ? "text-amber-700 dark:text-amber-300"
      : "text-green-700 dark:text-green-300";
}

function statusBadgeClass(status) {
  return status === "FULL"
    ? "bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-200"
    : status === "LIMITED"
      ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200"
      : "bg-green-100 text-green-800 dark:bg-green-950/60 dark:text-green-200";
}

function firstBookableDateKey(month, service) {
  let result = null;
  forEachBookableDate(month, service, (dateKey) => {
    if (result === null) result = dateKey;
  });
  return result ?? toDateKey(new Date(month.getFullYear(), month.getMonth(), 1));
}

function slotKey(serviceKey, dateKey, startMinute) {
  return `${serviceKey}:${dateKey}:${startMinute}`;
}

function parseMonth(value) {
  if (!/^\d{4}-\d{2}$/.test(value ?? "")) return null;
  const [year, month] = value.split("-").map(Number);
  const parsed = new Date(year, month - 1, 1);
  return parsed >= minimumMonth && parsed <= maximumMonth ? parsed : null;
}

function parseDateKey(value) {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function addMonths(date, amount) {
  return new Date(date.getFullYear(), date.getMonth() + amount, 1);
}

function toDateKey(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatMonth(date) {
  return `${date.getFullYear()}年${date.getMonth() + 1}月`;
}

function formatFullDate(date) {
  return new Intl.DateTimeFormat("ja-JP", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(date);
}

function formatTime(minutes) {
  if (minutes === 1440) return "24:00";
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

render();
