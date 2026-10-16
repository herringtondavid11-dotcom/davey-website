// Davey marketing site. Edit CONFIG to change prices and the waitlist endpoint.
const CONFIG = {
  // PLACEHOLDER prices (USD). They match the app's StoreKit test products; change before launch.
  prices: { monthly: 7.99, annual: 59.99 },
  // Formspree form endpoint, e.g. "https://formspree.io/f/abcdwxyz". Until it's set, the form opens an email instead.
  formspreeEndpoint: "",
  fallbackEmail: "herringtondavid11@gmail.com",
};

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const money = (n, digits = 2) => n.toLocaleString("en-US", { style: "currency", currency: "USD", minimumFractionDigits: digits, maximumFractionDigits: digits });

// Header: solid with blur after scrolling past the hero top.
const header = document.querySelector(".site-header");
const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 24);
onScroll();
window.addEventListener("scroll", onScroll, { passive: true });

// Mobile menu.
const toggle = document.querySelector(".menu-toggle");
const nav = document.getElementById("site-nav");
const setMenu = (open) => {
  toggle.setAttribute("aria-expanded", String(open));
  toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
  nav.classList.toggle("open", open);
  header.classList.toggle("scrolled", open || window.scrollY > 24);
};
toggle.addEventListener("click", () => setMenu(toggle.getAttribute("aria-expanded") !== "true"));
nav.addEventListener("click", (e) => { if (e.target.closest("a")) setMenu(false); });
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && nav.classList.contains("open")) { setMenu(false); toggle.focus(); } });

// Pricing.
const annualPerMonth = CONFIG.prices.annual / 12;
const savePct = Math.round((1 - CONFIG.prices.annual / (CONFIG.prices.monthly * 12)) * 100);
document.getElementById("save-tag").textContent = `Save ${savePct}%`;
const setBilling = (period) => {
  document.querySelectorAll("[data-billing]").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.billing === period)));
  const annual = period === "annual";
  document.getElementById("price-premium").textContent = money(annual ? CONFIG.prices.annual : CONFIG.prices.monthly);
  document.getElementById("price-unit").textContent = annual ? "/ year" : "/ month";
  document.getElementById("price-note").textContent = annual ? `Just ${money(annualPerMonth)} a month, billed annually` : "Billed monthly. Cancel anytime.";
};
document.querySelectorAll("[data-billing]").forEach((b) => b.addEventListener("click", () => setBilling(b.dataset.billing)));
setBilling("annual");

// FAQ accordion.
document.querySelectorAll(".faq-q").forEach((q) => {
  q.addEventListener("click", () => {
    const open = q.getAttribute("aria-expanded") === "true";
    q.setAttribute("aria-expanded", String(!open));
    document.getElementById(q.getAttribute("aria-controls")).hidden = open;
  });
});

// Waitlist form.
const form = document.getElementById("waitlist-form");
const status = document.getElementById("form-status");
form.addEventListener("submit", async (e) => {
  e.preventDefault();
  status.className = "form-status";
  const email = form.email.value.trim();
  if (form.website.value) return; // honeypot: bots fill it, people never see it
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) {
    status.textContent = "Please enter a valid email address.";
    status.classList.add("error");
    form.email.setAttribute("aria-invalid", "true");
    form.email.focus();
    return;
  }
  form.email.removeAttribute("aria-invalid");
  if (!CONFIG.formspreeEndpoint) {
    window.location.href = `mailto:${CONFIG.fallbackEmail}?subject=${encodeURIComponent("Davey early access")}&body=${encodeURIComponent(`Please add ${email} to the Davey early access list.`)}`;
    status.textContent = "Your email app should open. Send the message to join the list.";
    return;
  }
  const button = form.querySelector("button");
  button.disabled = true;
  try {
    const res = await fetch(CONFIG.formspreeEndpoint, { method: "POST", headers: { Accept: "application/json" }, body: new FormData(form) });
    if (!res.ok) throw new Error(String(res.status));
    form.reset();
    status.textContent = "You're on the list. We'll be in touch when Davey launches.";
  } catch {
    status.textContent = "Something went wrong. Please try again in a moment.";
    status.classList.add("error");
  } finally {
    button.disabled = false;
  }
});

// Sample-data charts (illustrative only).
const categories = [
  { name: "Housing", value: 1650, color: "#2F6DB0" },
  { name: "Groceries", value: 520, color: "#B07A00" },
  { name: "Dining", value: 310, color: "#2A8F5E" },
  { name: "Transport", value: 210, color: "#B4602A" },
  { name: "Shopping", value: 180, color: "#0B87A8" },
  { name: "Other", value: 130, color: "#7A7A10" },
];
const total = categories.reduce((s, c) => s + c.value, 0);
const donut = document.getElementById("donut");
const legend = document.getElementById("legend");
const C = 100; // the circle's circumference with r = 15.915
let offset = 25;
const arcs = categories.map((c) => {
  const len = (c.value / total) * C;
  const arc = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  Object.entries({ cx: 21, cy: 21, r: 15.915, fill: "none", stroke: c.color, "stroke-width": 5, "stroke-dashoffset": offset }).forEach(([k, v]) => arc.setAttribute(k, v));
  arc.dataset.len = Math.max(len - 0.6, 0.1); // gap between slices
  arc.setAttribute("stroke-dasharray", reduceMotion ? `${arc.dataset.len} ${C}` : `0 ${C}`);
  arc.style.transition = "stroke-dasharray 1s cubic-bezier(.2,.7,.2,1)";
  offset -= len;
  donut.appendChild(arc);
  const li = document.createElement("li");
  li.innerHTML = `<i style="background:${c.color}"></i><span>${c.name}</span><b>${money(c.value, 0)}</b>`;
  legend.appendChild(li);
  return arc;
});

const months = [["May", 2880], ["Jun", 3050], ["Jul", 3320], ["Aug", 2940], ["Sep", 2760], ["Oct", 3000]];
const budget = 3100, maxV = 3500;
const barsEl = document.getElementById("bars");
const bars = months.map(([m, v]) => {
  const col = document.createElement("div");
  col.className = "bar-col";
  col.innerHTML = `<div class="bar${v > budget ? " over" : ""}" style="height:${(v / maxV) * 100}%;${reduceMotion ? "" : "transform:scaleY(0)"}" title="${m}: ${money(v, 0)}"></div><span>${m}</span>`;
  barsEl.appendChild(col);
  return col.firstElementChild;
});

const countUp = (el) => {
  const target = Number(el.dataset.count), prefix = el.dataset.prefix ?? "";
  if (reduceMotion) return;
  const start = performance.now(), dur = 1100;
  const tick = (now) => {
    const p = Math.min((now - start) / dur, 1), eased = 1 - Math.pow(1 - p, 3);
    el.textContent = prefix + Math.round(target * eased).toLocaleString("en-US");
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
};

const animateCharts = () => {
  arcs.forEach((a, i) => setTimeout(() => a.setAttribute("stroke-dasharray", `${a.dataset.len} ${C}`), i * 90));
  bars.forEach((b, i) => setTimeout(() => (b.style.transform = "scaleY(1)"), i * 80));
  document.querySelectorAll("[data-count]").forEach(countUp);
};

// Reveal on scroll, and start the charts when they come into view.
if ("IntersectionObserver" in window && !reduceMotion) {
  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add("in");
      if (entry.target.classList.contains("demo-grid")) animateCharts();
      io.unobserve(entry.target);
    });
  }, { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
  document.querySelectorAll(".reveal").forEach((el) => io.observe(el));
} else {
  document.querySelectorAll(".reveal").forEach((el) => el.classList.add("in"));
  animateCharts();
}

// Gentle parallax on the hero phones.
const hero = document.querySelector("[data-parallax]");
if (hero && !reduceMotion) {
  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      const y = Math.min(window.scrollY, 800);
      hero.style.transform = `translateY(${y * 0.08}px)`;
      ticking = false;
    });
  }, { passive: true });
}
