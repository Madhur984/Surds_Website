/* Interactive SURDS city.
   Data pulses run along the real network routes; hover or tap a site to spotlight it
   and read its sample values. Geometry comes from city-map.js, projected out of the
   Blender scene by tools/city_map_export.py, so overlay and render line up exactly. */
(function(){
  const MAP = window.CITY_MAP;
  if (!MAP) return;
  const NS = "http://www.w3.org/2000/svg";
  const still = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // label, base value, unit, decimals, how far it wanders
  const SITES = {
    commercial:{ name:"Commercial Buildings", rows:[["Occupancy",64,"%",0,3],["CO₂",612," ppm",0,14],["HVAC energy saved",18,"%",0,1]] },
    dc:        { name:"Data Centers",         rows:[["Rack inlet",24.2," °C",1,0.3],["Cooling load",71,"%",0,2],["PUE",1.36,"",2,0.02]] },
    clean:     { name:"Clean Rooms & Pharma", rows:[["Room pressure",12.4," Pa",1,0.4],["Particles ≥0.5 µm",2140," /m³",0,60],["Humidity",45,"%",0,1]] },
    energy:    { name:"Energy & Utilities",   rows:[["Grid load",38.6," MW",1,0.6],["Transformer",61," °C",0,1],["Power factor",0.97,"",2,0.01]] },
    health:    { name:"Healthcare & Labs",    rows:[["Vaccine fridge",4.1," °C",1,0.2],["OT air changes",22," /h",0,1],["Open alarms",0,"",0,0]] },
  };
  const ORDER = ["commercial","dc","clean","energy","health"];
  const fmt = (v, d) => v.toLocaleString("en-US", { minimumFractionDigits:d, maximumFractionDigits:d });
  const el = (tag, attrs, parent) => {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  };
  const pts = arr => arr.map(p => p.join(",")).join(" ");

  function stage(host){
    // data-view names this stage; data-map picks which projected render it overlays (defaults to the view)
    const view = host.dataset.view, data = MAP[host.dataset.map || view];
    if (!data) return null;
    const W = data.w || MAP.w, H = data.h || MAP.h, full = view === "network";   // each render has its own size
    const img = host.querySelector("img");
    const svg = el("svg", { class:"city-svg", viewBox:`0 0 ${W} ${H}`, "aria-hidden":"true" });
    img.after(svg);

    // spotlight: everything dims except the active site's outline
    const defs = el("defs", {}, svg);
    const mask = el("mask", { id:`spot-${view}`, maskUnits:"userSpaceOnUse", x:0, y:0, width:W, height:H }, defs);
    el("rect", { x:0, y:0, width:W, height:H, fill:"#fff" }, mask);
    const holes = el("g", { fill:"#000", stroke:"#000", "stroke-width":46, "stroke-linejoin":"round" }, mask);
    el("rect", { class:"dim", x:0, y:0, width:W, height:H, mask:`url(#spot-${view})` }, svg);

    const routes = data.routes.map(r => {
      const p = el("path", { class:"route", d:"M" + r.d.map(q => q.join(" ")).join(" L") }, svg);
      return { k:r.k, p, len:p.getTotalLength() };
    });
    const outlines = el("g", { class:"outlines" }, svg);
    const packets = el("g", { class:"packets" }, svg);
    const hits = el("g", { class:"hits" }, svg);
    // big district first so the smaller sites sit on top of it
    ["commercial","energy","clean","health","dc"].forEach(k => (data.shapes[k] || []).forEach(poly => {
      if (poly.length < 3) return;
      const h = el("polygon", { class:"hit", points:pts(poly) }, hits);
      h.dataset.k = k;
    }));

    // packets: each route carries a couple, the active one carries more and runs faster
    const dots = [];
    routes.forEach(r => {
      for (let i = 0; i < 4; i++) {
        const g = el("g", { class:"pk" + (i > 1 ? " extra" : "") }, packets);
        el("circle", { r:15, class:"halo" }, g); el("circle", { r:6.5, class:"core" }, g);
        dots.push({ r, g, off:i / 4 + Math.random() * 0.08, extra:i > 1 });
      }
    });

    // the reading card
    const card = document.createElement("div");
    card.className = "city-card" + (full ? "" : " mini");
    card.setAttribute("aria-live", "polite");
    host.appendChild(card);

    // labels on the map and the site buttons under it drive the same spotlight
    const scope = host.closest("section") || host;
    const controls = [...scope.querySelectorAll(".net-tag, .net-pick")];
    let active = null, vals = {};
    // labels sit on the anchors exported from the 3D scene (top of each site's tallest building)
    if (data.anchors) host.querySelectorAll(".net-tag").forEach(t => {
      const a = data.anchors[t.dataset.k]; if (!a) return;
      t.style.setProperty("--x", (a[0] / W * 100) + "%"); t.style.setProperty("--y", (a[1] / H * 100) + "%");
    });
    // the card hangs off the site's largest outline
    const area = poly => Math.abs(poly.reduce((s, p, i) => { const q = poly[(i + 1) % poly.length]; return s + p[0] * q[1] - q[0] * p[1]; }, 0)) / 2;
    const main = k => (data.shapes[k] || [[]]).reduce((b, poly) => (area(poly) > area(b) ? poly : b), []);
    const topOf = k => main(k).reduce((b, p) => (!b || p[1] < b[1] ? p : b), null);
    const bottomOf = k => main(k).reduce((b, p) => (!b || p[1] > b[1] ? p : b), null);
    function fill(k){
      const s = SITES[k], rows = full ? s.rows : s.rows.slice(0, 1);
      vals = {};
      card.innerHTML = `<div class="cc-h"><b>${s.name}</b><span class="cc-ok"><i></i>All normal</span></div>` +
        `<dl>${rows.map((r, i) => `<div><dt>${r[0]}</dt><dd data-i="${i}">${fmt(r[1], r[3])}${r[2]}</dd></div>`).join("")}</dl>` +
        (full ? `<p class="cc-f">Sample readings, updated every second</p>` : "");
      rows.forEach((r, i) => vals[i] = r[1]);
    }
    function tick(){
      if (!active) return;
      const rows = SITES[active].rows;
      card.querySelectorAll("dd").forEach(dd => {
        const i = +dd.dataset.i, r = rows[i];
        if (!r[4]) return;
        vals[i] += (Math.random() - 0.5) * r[4];
        vals[i] = Math.min(r[1] + r[4] * 2, Math.max(r[1] - r[4] * 2, vals[i]));   // stay near the normal value
        dd.textContent = fmt(vals[i], r[3]) + r[2];
      });
    }
    setInterval(tick, 1000);

    function set(k){
      if (k === active) return;
      active = k;
      host.toggleAttribute("data-active", !!k);
      holes.innerHTML = ""; outlines.innerHTML = "";
      routes.forEach(r => r.p.classList.toggle("on", r.k === k));
      controls.forEach(t => { const on = (t.dataset.k || null) === k; t.classList.toggle("on", on); if (t.classList.contains("net-pick")) t.setAttribute("aria-pressed", on); });
      if (!k) { card.classList.remove("show"); return; }
      (data.shapes[k] || []).forEach(poly => {
        if (poly.length < 3) return;
        el("polygon", { points:pts(poly) }, holes);
        el("polygon", { class:"outline", points:pts(poly) }, outlines);
      });
      fill(k);
      // card sits above the site, or below it when the site is near the top edge
      let p = topOf(k), below = p[1] / H < 0.32;
      if (below) p = bottomOf(k);
      card.style.left = Math.min(86, Math.max(14, p[0] / W * 100)) + "%";
      card.style.top = (p[1] / H * 100) + "%";
      card.classList.toggle("below", below);
      card.classList.add("show");
    }

    // pointer + keyboard
    let pinned = null, lastUser = 0;
    hits.addEventListener("pointerover", e => { if (e.target.dataset.k && !pinned) { lastUser = performance.now(); set(e.target.dataset.k); } });
    hits.addEventListener("pointerout", e => { if (!pinned && !e.relatedTarget?.dataset?.k) set(null); });
    hits.addEventListener("click", e => {
      const k = e.target.dataset.k; if (!k) return;
      lastUser = performance.now(); pinned = pinned === k ? null : k; set(pinned || k);
    });
    controls.forEach(t => {
      const k = t.dataset.k || null;                 // the "Overview" button carries no site
      t.addEventListener("pointerenter", () => { lastUser = performance.now(); if (!pinned) set(k); });
      t.addEventListener("pointerleave", () => { if (!pinned) set(null); });
      t.addEventListener("focus", () => { lastUser = performance.now(); if (!pinned) set(k); });
      t.addEventListener("blur", () => { if (!pinned) set(null); });
      t.addEventListener("click", () => {
        lastUser = performance.now();
        if (!k || pinned === k) { pinned = null; set(null); } else { pinned = k; set(k); }
        const r = host.getBoundingClientRect();     // buttons under the map: bring the map back into view
        if (t.classList.contains("net-pick") && (r.top < 0 || r.bottom > innerHeight)) host.scrollIntoView({ behavior:"smooth", block:"center" });
      });
    });
    document.addEventListener("click", e => { if (pinned && !scope.contains(e.target)) { pinned = null; set(null); } });
    scope.addEventListener("pointermove", () => { lastUser = performance.now(); });

    // animation, only while on screen
    let visible = false, raf = 0, t0 = performance.now(), tour = 0, nextTour = 0;
    function frame(now){
      raf = 0;
      if (!visible) return;
      const t = (now - t0) / 1000;
      for (const d of dots) {
        const on = d.r.k === active;
        if (d.extra && !on) { d.g.style.display = "none"; continue; }
        d.g.style.display = "";
        const speed = on ? 230 : 120;                         // px per second along the route
        const u = ((t * speed / d.r.len) + d.off) % 1;
        const q = d.r.p.getPointAtLength(u * d.r.len);
        d.g.setAttribute("transform", `translate(${q.x.toFixed(1)} ${q.y.toFixed(1)})`);
        d.g.style.opacity = Math.min(1, Math.min(u, 1 - u) * 8).toFixed(2);   // fade in/out at the ends
      }
      // network panel tours itself while nobody is touching it
      if (full && !pinned && now - lastUser > 5000 && now > nextTour) {
        set(ORDER[tour++ % ORDER.length]); nextTour = now + 3600;
      }
      raf = requestAnimationFrame(frame);
    }
    new IntersectionObserver(es => {
      visible = es[0].isIntersecting;
      if (visible && !raf && !still) raf = requestAnimationFrame(frame);
      if (!visible && full && !pinned) set(null);
    }, { threshold:0.35 }).observe(host);
    if (still) {   // reduced motion: park one packet mid-route, no tour
      for (const d of dots) {
        if (d.extra) { d.g.style.display = "none"; continue; }
        const q = d.r.p.getPointAtLength(((d.off + 0.5) % 1) * d.r.len);
        d.g.setAttribute("transform", `translate(${q.x} ${q.y})`);
      }
    }
    return { set };
  }

  document.querySelectorAll("[data-view]").forEach(stage);

  // soar: the city rises into place on load, then the camera glides in over it as you scroll
  // (hero), and the network panel lifts up to meet you as it scrolls into view
  const heroStage = document.querySelector("#hero .city-stage"), netFig = document.querySelector("#network .net-fig");
  if (!still && (heroStage || netFig)) {
    const ease = t => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
    const t0 = performance.now(), INTRO = 1600;
    let raf = 0;
    const set = (el, y, s, o) => { el.style.setProperty("--soar-y", y.toFixed(1) + "px"); el.style.setProperty("--soar-s", s.toFixed(4)); el.style.setProperty("--soar-o", o.toFixed(3)); };
    function frame(now){
      raf = 0;
      const vh = innerHeight;
      if (heroStage) {
        const intro = ease((now - t0) / INTRO);                                    // 0 -> 1 once, on load
        const p = ease(scrollY / (document.getElementById("hero").offsetHeight || vh));   // 0 at top -> 1 when the hero has scrolled away
        set(heroStage, 40 * (1 - intro) - 0.18 * vh * p, (1.08 - 0.08 * intro) * (1 + 0.32 * p), intro * (1 - 0.6 * p));   // never below 1x: the background always covers
      }
      if (netFig) {
        const r = netFig.getBoundingClientRect();
        const q = ease((vh - r.top) / (vh * 0.75));                                  // 0 below the fold -> 1 once well in view
        set(netFig, 50 * (1 - q), 1.1 - 0.1 * q, 0.3 + 0.7 * q);
      }
      if (now - t0 < INTRO) raf = requestAnimationFrame(frame);
    }
    addEventListener("scroll", () => { if (!raf) raf = requestAnimationFrame(frame); }, { passive:true });
    addEventListener("resize", () => { if (!raf) raf = requestAnimationFrame(frame); });
    raf = requestAnimationFrame(frame);
  }
})();
