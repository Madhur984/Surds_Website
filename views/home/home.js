/* SURDS home — interactions. Plain script, no build step. */
(function(){
  "use strict";
  const root = document.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(pointer:fine)").matches;
  const clamp = (v,a,b)=>Math.min(Math.max(v,a),b);
  const lerp = (a,b,f)=>a+(b-a)*f;
  const css = n=>getComputedStyle(root).getPropertyValue(n).trim();
  const isMob = ()=>innerWidth <= 900;

  /* ---------- theme ---------- */
  try { const t = localStorage.getItem("surds-theme"); if (t) root.dataset.theme = t; } catch(e){}
  document.getElementById("themeToggle").addEventListener("click", ()=>{
    root.dataset.theme = root.dataset.theme === "dark" ? "light" : "dark";
    try { localStorage.setItem("surds-theme", root.dataset.theme); } catch(e){}
    document.dispatchEvent(new Event("themechange"));
  });

  /* ---------- nav: progress, glass, active section ---------- */
  (function(){
    const bar = document.getElementById("progress"), nav = document.getElementById("nav");
    const links = [...document.querySelectorAll(".nav-links a")];
    const secs = links.map(a=>document.querySelector(a.getAttribute("href")));
    const nights = ["hero", "network"].map(id => document.getElementById(id)).filter(Boolean);
    let q = false;
    function upd(){
      q = false;
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = `scaleX(${max>0 ? scrollY/max : 0})`;
      nav.classList.toggle("scrolled", scrollY > 30);
      // the hero and the network panel are always night: the nav goes dark while it sits over them
      const nb = nav.offsetHeight / 2;
      nav.classList.toggle("on-night", nights.some(s => { const r = s.getBoundingClientRect(); return r.top <= nb && r.bottom > nb; }));
      let on = -1;
      secs.forEach((s,i)=>{ if (s && s.getBoundingClientRect().top < innerHeight*0.4) on = i; });
      links.forEach((a,i)=>a.classList.toggle("active", i===on));
    }
    addEventListener("scroll", ()=>{ if(!q){ q = true; requestAnimationFrame(upd); } }, {passive:true});
    upd();
  })();

  /* ---------- reveal on scroll + count-ups ---------- */
  (function(){
    const io = new IntersectionObserver(es=>es.forEach(e=>{
      if (!e.isIntersecting) return;
      e.target.classList.add("in"); io.unobserve(e.target);
    }), {threshold:0.15});
    document.querySelectorAll(".rv").forEach(el=>io.observe(el));
    const co = new IntersectionObserver(es=>es.forEach(e=>{
      if (!e.isIntersecting) return;
      const el = e.target, to = +el.dataset.count, dec = +(el.dataset.dec||0), suf = el.dataset.suf||"";
      co.unobserve(el);
      if (reduced){ el.textContent = to.toFixed(dec)+suf; return; }
      const t0 = performance.now();
      (function st(now){ const k = Math.min((now-t0)/1600,1), v = to*(1-Math.pow(1-k,4));
        el.textContent = v.toFixed(dec)+suf; if (k<1) requestAnimationFrame(st); })(t0);
    }), {threshold:0.6});
    document.querySelectorAll("[data-count]").forEach(el=>co.observe(el));
  })();

  /* ---------- proof charts: uptime strip + donut fill on view ---------- */
  (function(){
    const up = document.getElementById("uptime");
    if (up) for (let i=0;i<90;i++){ const b = document.createElement("i"); if (i===57) b.className = "w"; up.appendChild(b); }
    const arc = document.querySelector(".donut .arc");
    if (arc) new IntersectionObserver((es,o)=>{ if (es[0].isIntersecting){ arc.style.strokeDashoffset = (301.6*(1-arc.dataset.pct/100)).toFixed(1); o.disconnect(); } }, {threshold:.5}).observe(arc);
  })();

  /* ---------- pointer spotlight on cards ---------- */
  document.querySelectorAll(".spot").forEach(el=>{
    el.addEventListener("pointermove", e=>{
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", (e.clientX-r.left)+"px");
      el.style.setProperty("--my", (e.clientY-r.top)+"px");
    });
  });

  /* =====================================================
     HOW IT WORKS — packets travel probe → gateway → cloud → you.
     Cutting the internet makes the gateway buffer to SD; restoring
     it flushes the buffer.
  ===================================================== */
  (function pipe(){
    const box = document.getElementById("pipe"), svg = document.getElementById("pipeSvg");
    const nodes = [...box.querySelectorAll(".node")];
    const sw = document.getElementById("netSwitch"), lab = document.getElementById("netLabel");
    const cntEl = document.getElementById("pipeCount"), msg = document.getElementById("pipeMsg");
    const st = nodes.map(n=>n.querySelector("[data-st]"));
    let online = true, delivered = 0, buffered = 0, pk = [];
    const NS = "http://www.w3.org/2000/svg";
    const seg = document.createElementNS(NS,"g"); svg.appendChild(seg);
    const stopsG = document.createElementNS(NS,"g"); svg.appendChild(stopsG);
    const Y = 60, SR = 64;   // icon centre height and radius (the icons are the stops)
    let stops = [];
    // stops sit above the centre of each step card
    function xs(){ const b = box.getBoundingClientRect(); return nodes.map(n=>{ const r = n.getBoundingClientRect(); return r.left + r.width/2 - b.left; }); }
    function drawLines(){
      const X = xs(); seg.innerHTML = ""; stopsG.innerHTML = ""; stops = [];
      for (let i=0;i<3;i++){
        const l = document.createElementNS(NS,"line"), down = i===1 && !online;
        l.setAttribute("x1",X[i]+SR); l.setAttribute("x2",X[i+1]-SR); l.setAttribute("y1",Y); l.setAttribute("y2",Y);
        l.setAttribute("stroke", down ? "var(--danger)" : "var(--line)");
        l.setAttribute("stroke-width","2"); l.setAttribute("stroke-dasharray", down ? "5 6" : "0");
        seg.appendChild(l);
      }
    }
    drawLines(); addEventListener("resize", drawLines);
    const icons = nodes.map(n=>n.querySelector(".ic"));
    const flash = i=>{ const c = icons[i]; if (!c) return; c.classList.add("hot"); setTimeout(()=>c.classList.remove("hot"), 260); };
    function setStatus(){
      st[1].textContent = online ? "Checking readings" : `Saving to memory card · ${buffered}`;
      st[1].className = "st" + (online ? "" : " buf");
      st[2].textContent = online ? "Synced" : "Offline for now"; st[2].className = "st" + (online ? "" : " bad");
      st[3].textContent = online ? "Up to date" : "Alarms still work on site"; st[3].className = "st" + (online ? "" : " buf");
      lab.textContent = online ? "Internet connected" : "Internet down";
      msg.innerHTML = online ? `Readings delivered: <b id="pipeCount">${delivered}</b>` :
        `Internet off. Hub is saving: <b>${buffered}</b> readings waiting.`;
    }
    sw.addEventListener("change", ()=>{
      online = sw.checked; drawLines();
      if (online && buffered){ delivered += buffered; const n = buffered; buffered = 0; setStatus();
        for (let i=0;i<Math.min(n,12);i++) setTimeout(()=>spawn(1), i*70); }
      setStatus();
    });
    function spawn(from){
      const c = document.createElementNS(NS,"circle"); c.setAttribute("r","6"); c.setAttribute("class","pkt"); svg.appendChild(c);
      pk.push({c, seg:from, t:0});
    }
    let lastT = performance.now(), acc = 0;
    function loop(now){
      requestAnimationFrame(loop);
      const dt = Math.min((now-lastT)/1000, .05); lastT = now;
      const r = box.getBoundingClientRect(); if (r.bottom<0 || r.top>innerHeight) return;
      acc += dt; if (acc > .7){ acc = 0; spawn(0); flash(0); }
      const X = xs();
      pk = pk.filter(p=>{
        p.t += dt*1.3;
        if (p.t >= 1){
          p.t = 0; p.seg++;
          flash(p.seg);
          if (p.seg === 1 && !online){ buffered++; setStatus(); p.c.remove(); return false; }
          if (p.seg >= 3){ delivered++; const ce = document.getElementById("pipeCount"); if (ce) ce.textContent = delivered; p.c.remove(); return false; }
        }
        const x = lerp(X[p.seg]+SR, X[p.seg+1]-SR, p.t);
        p.c.setAttribute("cx", x); p.c.setAttribute("cy", Y);
        p.c.style.fill = p.seg === 0 ? "var(--mint)" : "var(--acc)";
        return true;
      });
    }
    if (!reduced) requestAnimationFrame(loop);
    setStatus();
  })();

  /* =====================================================
     COLD ROOM — an illustrated cutaway. Door and cooler are toggles;
     four probes react, and a phone shows the texts SURDS would send.
  ===================================================== */
  (function cold(){
    const svg = document.getElementById("coldSvg"); if (!svg) return;
    const NS = "http://www.w3.org/2000/svg";
    const door = document.getElementById("door"), warm = document.getElementById("warmAir");
    const fan = document.getElementById("fan"), air = document.getElementById("coldAir"), led = document.getElementById("coolerLed");
    const tint = document.getElementById("coldTint"), stateEl = document.getElementById("coldState"), avgEl = document.getElementById("coldAvg");
    const msgs = document.getElementById("phMsgs"), clock = document.getElementById("phClock");
    const P = [
      {id:"A", where:"by the door",      x:196, y:214, k:1.0, b:4.4},
      {id:"B", where:"on the top shelf", x:470, y:150, k:0.55, b:4.0},
      {id:"C", where:"on the back shelf",x:430, y:330, k:0.35, b:3.7},
      {id:"D", where:"by the cooler",    x:620, y:188, k:0.18, b:3.2}
    ];
    const g = document.getElementById("probes");
    P.forEach(p=>{
      p.v = p.b;
      const el = document.createElementNS(NS,"g"); el.setAttribute("class","probe-tag");
      el.innerHTML = `<circle cx="${p.x}" cy="${p.y}" r="7" stroke="#fff" stroke-width="2.5"/>
        <rect x="${p.x+13}" y="${p.y-15}" width="104" height="30" rx="4" fill="#141414"/>
        <text x="${p.x+23}" y="${p.y+5}" font-family=Inter, system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-size="14" fill="#fff"></text>`;
      g.appendChild(el); p.dot = el.querySelector("circle"); p.txt = el.querySelector("text"); p.box = el.querySelector("rect");
    });
    let doorOpen = false, coolerOff = false, doorT = 0, offT = 0, alerted = {}, anyAlert = false, warnedDoor = false, warnedCooler = false;
    const hhmm = ()=>new Date().toLocaleTimeString([], {hour:"numeric", minute:"2-digit"});
    function text(t, cls){
      const m = document.createElement("div"); m.className = "msg " + (cls||"");
      m.innerHTML = `<small>SURDS · ${hhmm()}</small>${t}`;
      msgs.appendChild(m); msgs.scrollTop = msgs.scrollHeight;
      while (msgs.children.length > 14) msgs.firstChild.remove();
    }
    const col = v=> v > 8 ? "#D23B3B" : v > 6.5 ? "#D9661F" : "#0F9D6E";
    function render(){
      let sum = 0;
      P.forEach(p=>{ sum += p.v; p.dot.setAttribute("fill", col(p.v)); p.txt.textContent = `${p.id} · ${p.v.toFixed(1)} °C`; p.box.setAttribute("fill", p.v > 8 ? "#8E2323" : "#141414"); });
      const avg = sum/P.length, worst = Math.max(...P.map(p=>p.v));
      avgEl.textContent = avg.toFixed(1)+" °C";
      stateEl.textContent = worst > 8 ? "Unsafe" : worst > 6.5 ? "Warming up" : "Safe";
      stateEl.className = "cold-state" + (worst > 8 ? " bad" : worst > 6.5 ? " warn" : "");
      tint.setAttribute("opacity", Math.min(Math.max((avg-5)/12, 0), .28).toFixed(3));
      clock.textContent = hhmm();
    }
    function step(){
      if (doorOpen) doorT++; else doorT = 0;
      if (coolerOff) offT++; else offT = Math.max(0, offT - 6);
      P.forEach(p=>{
        const goal = p.b + (doorOpen ? 6.2*p.k : 0) + Math.min(offT*0.05, 11)*(0.65 + 0.35*p.k);
        p.v += (goal - p.v)*(coolerOff ? 0.05 : 0.09) + (Math.random()-.5)*0.04;
        if (p.v > 8 && !alerted[p.id]){ alerted[p.id] = 1; anyAlert = true;
          text(`<b>Alert:</b> Probe ${p.id} ${p.where} is at ${p.v.toFixed(1)} °C, above the safe limit of 8 °C. The on-call technician has been called.`, "a"); }
      });
      if (doorOpen && doorT === 20 && !warnedDoor){ warnedDoor = true; text("The cold room door has been open for a while. Please close it.", "w"); }
      if (coolerOff && offT === 12 && !warnedCooler){ warnedCooler = true; text("The cooler in Cold Room 1 has stopped. Temperature is rising. A repair request has been raised.", "w"); }
      if (anyAlert && P.every(p=>p.v < 7.5)){
        anyAlert = false; alerted = {};
        text(`All clear. Cold Room 1 is back to ${(P.reduce((a,p)=>a+p.v,0)/P.length).toFixed(1)} °C. This event has been saved for your audit report.`, "ok");
      }
      render();
    }
    document.querySelectorAll("#demo [data-ev]").forEach(b=>b.addEventListener("click", ()=>{
      const ev = b.dataset.ev;
      if (ev === "door"){ doorOpen = !doorOpen; warnedDoor = false;
        b.textContent = doorOpen ? "Close the door" : "Open the door"; b.setAttribute("aria-pressed", doorOpen);
        door.classList.toggle("open", doorOpen); warm.classList.toggle("on", doorOpen); }
      if (ev === "comp"){ coolerOff = !coolerOff; warnedCooler = false;
        b.textContent = coolerOff ? "Switch the cooler back on" : "Switch off the cooler"; b.setAttribute("aria-pressed", coolerOff);
        fan.classList.toggle("off", coolerOff); air.classList.toggle("off", coolerOff); led.setAttribute("fill", coolerOff ? "#D23B3B" : "#10B981");
        if (!coolerOff) text("The cooler is running again. Cooling the room back down.", "ok"); }
      if (ev === "reset"){
        doorOpen = coolerOff = false; offT = 0; alerted = {}; anyAlert = false;
        P.forEach(p=>p.v = p.b); door.classList.remove("open"); warm.classList.remove("on"); fan.classList.remove("off"); air.classList.remove("off"); led.setAttribute("fill","#10B981");
        document.querySelectorAll("#demo [data-ev]").forEach(x=>x.setAttribute("aria-pressed","false"));
        document.querySelector('#demo [data-ev="door"]').textContent = "Open the door";
        document.querySelector('#demo [data-ev="comp"]').textContent = "Switch off the cooler";
        msgs.innerHTML = ""; text("Cold Room 1 is safe at 3.8 °C. We'll text you if anything changes.", "ok");
      }
    }));
    let vis = false; new IntersectionObserver(es=>{ vis = es[0].isIntersecting; }).observe(svg);
    text("Cold Room 1 is safe at 3.8 °C. We'll text you if anything changes.", "ok");
    render();
    setInterval(()=>{ if (vis && !document.hidden) step(); }, 200);
  })();

  /* =====================================================
     SOLUTIONS — continuous 3D card flow (kept from the original site)
  ===================================================== */
  (function solutions(){
    const IND = [
      {name:"Cold Storage & Pharma", g:"Cold chain", c1:"#38BDF8", c2:"#0369A1",
       today:"Temperatures are checked on a clipboard twice a day. Excursions are found after the stock is gone.", stat:"2–8 °C", sl:"vaccine window, held 24/7",
       withS:"Multi-probe nodes in every room. Excursions caught in seconds, logged for audit automatically.", pts:["Door and compressor alerts","Automatic compliance log"]},
      {name:"Buildings & HVAC", g:"Buildings", c1:"#4D9BFF", c2:"#1D4ED8",
       today:"HVAC runs on schedules, not reality. Most of the energy goes to empty rooms.", stat:"40%", sl:"of building energy is HVAC",
       withS:"Climate that senses occupancy and weather, then acts first.", pts:["Occupancy-driven setpoints","Empty zones scaled down"]},
      {name:"Data Centers", g:"Data centers", c1:"#9B7BFF", c2:"#5B21B6",
       today:"Cooling is sized for the worst case. Hot spots surface after the alert.", stat:"~40%", sl:"of facility power is cooling",
       withS:"Rack-level thermal intelligence. Cooling that moves before heat does.", pts:["Per-rack inlet temperature","Proven at PARAM Shakti"]},
      {name:"Clean Rooms", g:"Clean rooms", c1:"#2DD4BF", c2:"#0F766E",
       today:"Contamination shows up at inspection, after the batch is at risk.", stat:"ISO 5–8", sl:"environments verified live",
       withS:"Excursions predicted before they happen. Compliance, continuously verified.", pts:["Particle, RH and pressure","Continuous verification"]},
      {name:"Manufacturing", g:"Manufacturing", c1:"#FBBF24", c2:"#B45309",
       today:"Downtime announces itself. Defects surface at the end of the line.", stat:"OEE", sl:"from the shop floor up",
       withS:"Machines that report their own condition. Vibration and current become forecasts.", pts:["Vibration signatures","Idle-load detection"]},
      {name:"Healthcare & Labs", g:"Labs", c1:"#FB7185", c2:"#BE123C",
       today:"Critical spaces are checked on rounds. Between checks, nobody is watching.", stat:"24/7", sl:"verification, always on",
       withS:"Air, cold chain and environment verified around the clock.", pts:["Freezers and incubators","Air quality in wards"]}
    ];
    const N = IND.length;
    const slidesEl = document.getElementById("slides"), ghostsEl = document.getElementById("ghosts"), rail = document.getElementById("rail");
    const wrap = document.getElementById("solWrap"), sticky = document.getElementById("solSticky"), spacer = document.getElementById("solSpacer");
    const spot = document.getElementById("solSpot"), nm = document.getElementById("indName"), nx = document.getElementById("indNext");
    const slides = [], ghosts = [];
    IND.forEach((d,i)=>{
      const g = document.createElement("div"); g.className = "ghost"; g.style.setProperty("--gc", d.c1); g.textContent = d.g; ghostsEl.appendChild(g); ghosts.push(g);
      const s = document.createElement("div"); s.className = "ind-slide";
      s.innerHTML = `<div class="cards">
        <div class="cw" data-side="l"><div class="fc today"><span class="k">Today</span><h4>${d.today}</h4><div><div class="stat">${d.stat}</div><div class="sl">${d.sl}</div></div></div></div>
        <div class="cw" data-side="r"><div class="fc with" style="--c1:${d.c1};--c2:${d.c2}"><span class="k">With SURDS</span><div><h4>${d.withS}</h4><ul>${d.pts.map(p=>`<li>${p}</li>`).join("")}</ul></div><a class="go" href="#contact">Start a ${d.g.toLowerCase()} pilot ↗</a></div></div>
      </div>`;
      slidesEl.appendChild(s); slides.push(s);
      const b = document.createElement("button"); b.type = "button"; b.style.setProperty("--acc2", d.c1);
      b.innerHTML = `<span class="lb">${d.name}</span><span class="tk"></span>`;
      b.addEventListener("click", ()=>{ const tot = wrap.offsetHeight-innerHeight; scrollTo({top: wrap.offsetTop + (i/(N-1))*tot + 2, behavior: reduced?"auto":"smooth"}); });
      rail.appendChild(b);
    });
    const rb = [...rail.children];
    const size = ()=>{ spacer.style.height = (N*(isMob()?0.95:1.05)*innerHeight)+"px"; };
    size(); addEventListener("resize", size);
    let target = 0, shown = 0, tx = 0, ty = 0, active = -1, spx = innerWidth/2, spy = innerHeight/2, stx = spx, sty = spy;
    addEventListener("scroll", ()=>{ const tot = wrap.offsetHeight-innerHeight; target = clamp(-wrap.getBoundingClientRect().top/tot,0,1)*(N-1); }, {passive:true});
    if (fine && !reduced){
      sticky.addEventListener("mousemove", e=>{ const r = sticky.getBoundingClientRect();
        ty = ((e.clientX-r.left)/r.width-.5)*6; tx = -((e.clientY-r.top)/r.height-.5)*5; stx = e.clientX-r.left; sty = e.clientY-r.top; });
      sticky.addEventListener("mouseleave", ()=>{ tx = 0; ty = 0; });
    }
    const hex = (h,a)=>`rgba(${parseInt(h.substr(1,2),16)},${parseInt(h.substr(3,2),16)},${parseInt(h.substr(5,2),16)},${a})`;
    function mix(h,pct){ const dark = root.dataset.theme==="dark", B = dark?[7,8,10]:[246,247,249];
      const c=[1,3,5].map(o=>parseInt(h.substr(o,2),16)); return `rgb(${c.map((v,i)=>Math.round(v*pct+B[i]*(1-pct))).join(",")})`; }
    function setActive(i){
      if (i===active) return; active = i;
      rb.forEach((b,j)=>b.classList.toggle("on", j===i));
      nm.textContent = IND[i].name; nx.textContent = i<N-1 ? "Next: "+IND[i+1].name : "Next: talk to us";
      spot.style.background = `radial-gradient(closest-side, ${hex(IND[i].c1, root.dataset.theme==="dark"?.22:.18)}, transparent 70%)`;
    }
    function render(){
      requestAnimationFrame(render);
      const r = wrap.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      shown += (target-shown)*(reduced?1:.085); spx += (stx-spx)*.06; spy += (sty-spy)*.06;
      const idx = Math.round(clamp(shown,0,N-1)); setActive(idx);
      sticky.style.backgroundColor = mix(IND[idx].c1, root.dataset.theme==="dark" ? .1 : .08);
      spot.style.transform = `translate(${spx}px,${spy}px) translate(-50%,-50%)`;
      const m = isMob();
      for (let i=0;i<N;i++){
        const loc = shown-i, a = Math.abs(loc), s = slides[i], g = ghosts[i];
        if (a > 1.15){ s.style.visibility = "hidden"; g.style.opacity = 0; continue; }
        s.style.visibility = "visible";
        const op = Math.pow(Math.max(1-a,0),1.3);
        g.style.opacity = op*(m?.25:.38);
        g.style.transform = `translate(calc(-50% + ${-loc*(m?26:36) - ty*.9}vw), calc(-50% + ${tx*.9}vh))`;
        s.querySelectorAll(".cw").forEach(w=>{
          const side = w.dataset.side==="l" ? 1 : -1;
          const rotY = (m?side*5:side*13) + loc*(m?-18:-42) + ty, rotX = loc*(m?3:6) + tx;
          w.style.opacity = op;
          w.style.transform = `perspective(1400px) translateY(${loc*(m?-10:-16)}vh) translateZ(${-a*(m?90:180)}px) rotateY(${rotY}deg) rotateX(${rotX}deg)`;
          w.style.pointerEvents = a < .35 ? "auto" : "none";
        });
      }
    }
    requestAnimationFrame(render);
  })();

  /* =====================================================
     OFFICE 3D — the real office model, loaded only when you scroll near it.
     Heat view recolours every material to a dark blue and shows people as
     glowing heat; normal view restores the original materials. People are
     model-viewer hotspots walking between seats (model-space metres).
  ===================================================== */
  (function office(){
    const box = document.getElementById("office3d"); if (!box) return;
    const sumEl = document.getElementById("thermSummary"), saveEl = document.getElementById("thermSave");
    const V = (x,y,z)=>({x,y,z});
    const ROOMS = [
      {name:"Conference room", tag:V(-8.1,2.6,8.4), seats:[V(-8.1,1,8.6),V(-7.6,1,8.1),V(-8.6,1,9.0),V(-7.4,1,8.9)]},
      {name:"Manager's cabin", tag:V(-4.3,2.6,8.6), seats:[V(-4.0,1,8.7),V(-4.6,1,8.2)]},
      {name:"Open desks",      tag:V(-4.8,2.6,3.8), seats:[V(-4.8,1,4.0),V(-4.3,1,3.5),V(-5.3,1,4.5)]},
      {name:"Team desks",      tag:V(-1.1,2.6,2.0), seats:[V(-1.1,1,1.9),V(-1.6,1,2.6),V(-0.8,1,3.0)]},
      {name:"Reception",       tag:V(-1.2,2.6,5.8), seats:[V(-1.6,1,4.6),V(-0.6,1,6.8)]},
      {name:"Huddle room",     tag:V(-6.6,2.6,1.6), seats:[V(-6.6,1,1.75),V(-6.2,1,1.3)]}
    ];
    const EXIT = V(-0.8,1,9.4), MAX = 14;
    const pos = v=>`${v.x.toFixed(3)}m ${v.y.toFixed(3)}m ${v.z.toFixed(3)}m`;
    let mv = null, started = false, heat = true, mats = [], people = [];

    function load(){
      if (started) return; started = true;
      self.ModelViewerElement = Object.assign(self.ModelViewerElement || {}, {meshoptDecoderLocation:"https://cdn.jsdelivr.net/npm/meshoptimizer@0.22.0/meshopt_decoder.js"});
      const sc = document.createElement("script"); sc.type = "module";
      sc.src = "https://cdn.jsdelivr.net/npm/@google/model-viewer@4.0.0/dist/model-viewer.min.js";
      document.head.appendChild(sc);
      mv = document.createElement("model-viewer");
      Object.entries({src:"/models/isometric-office-web.glb", alt:"3D model of an office floor monitored by SURDS",
        "camera-orbit":"40deg 56deg 19.5m", "camera-target":"-5.04m 0.5m 4.94m", "field-of-view":"30deg",
        "min-camera-orbit":"auto 25deg auto", "max-camera-orbit":"auto 72deg auto", "camera-controls":"", "disable-zoom":"", "disable-pan":"",
        "interaction-prompt":"none", "shadow-intensity":"0.6", exposure:"1", "touch-action":"pan-y"}).forEach(([k,v])=>mv.setAttribute(k,v));
      for (let i=0;i<MAX;i++){ const b = document.createElement("button"); b.className = "ppl gone"; b.slot = "hotspot-p"+i; b.tabIndex = -1;
        b.setAttribute("aria-hidden","true"); b.dataset.position = pos(EXIT); b.dataset.normal = "0m 1m 0m"; mv.appendChild(b); }
      ROOMS.forEach((r,i)=>{ const t = document.createElement("div"); t.className = "rt"; t.slot = "hotspot-r"+i; t.dataset.position = pos(r.tag); t.dataset.normal = "0m 1m 0m"; mv.appendChild(t); r.el = t; });
      box.appendChild(mv);
      mv.addEventListener("load", ()=>{
        document.getElementById("oLoading").remove();
        mats = mv.model.materials.map(m=>{ const pbr = m.pbrMetallicRoughness;
          return {m, f:pbr.baseColorFactor.slice(), t:pbr.baseColorTexture ? pbr.baseColorTexture.texture : null}; });
        applyView();
        [0,0,2,3,4].forEach(ri=>add(ri));
        requestAnimationFrame(loop);
      });
    }
    function applyView(){
      box.classList.toggle("heat", heat); box.classList.toggle("normal", !heat);
      mats.forEach(({m,f,t})=>{ const pbr = m.pbrMetallicRoughness;
        if (heat){ pbr.setBaseColorFactor([0.09,0.11,0.24,1]); if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(null); }
        else { pbr.setBaseColorFactor(f); if (pbr.baseColorTexture) pbr.baseColorTexture.setTexture(t); } });
      if (mv) mv.exposure = heat ? 0.9 : 1;
      summary();
    }
    const seat = ri=>{ const s = ROOMS[ri].seats; return s[Math.floor(Math.random()*s.length)]; };
    function add(ri, from){
      if (people.length >= MAX) return;
      const t = seat(ri), f = from || t;
      people.push({i:people.length, x:f.x, y:f.y, z:f.z, t, room:ri, leaving:false, next:4+Math.random()*6});
    }
    function counts(){
      const c = ROOMS.map(()=>0);
      people.forEach(p=>{ if (!p.leaving && Math.hypot(p.t.x-p.x, p.t.z-p.z) < 0.25) c[p.room]++; });
      return c;
    }
    function summary(){
      if (!mv) return;
      const c = counts(); let on = 0;
      ROOMS.forEach((r,i)=>{ const n = c[i]; if (n) on++;
        r.el.className = "rt" + (n ? "" : " off");
        r.el.innerHTML = `<b>${r.name}</b><span>${n ? n+(n===1?" person":" people")+" · AC on" : "Empty · AC off"}</span>`; });
      const total = c.reduce((a,b)=>a+b,0), off = ROOMS.length - on;
      sumEl.textContent = total === 0 ? "Nobody is in. SURDS has switched the AC off in every room."
        : `${total} ${total===1?"person is":"people are"} in the office. AC is running in the ${on} ${on===1?"room":"rooms"} in use and switched off in ${off} empty ${off===1?"room":"rooms"}.`;
      saveEl.textContent = Math.round(off/ROOMS.length*100)+"%";
    }
    let vis = false, last = performance.now(), acc = 0;
    new IntersectionObserver(es=>{ vis = es[0].isIntersecting; }).observe(box);
    new IntersectionObserver(es=>{ if (es[0].isIntersecting) load(); }, {rootMargin:"900px 0px"}).observe(box);
    function loop(now){
      requestAnimationFrame(loop);
      const dt = Math.min((now-last)/1000, .05); last = now;
      if (!vis) return;
      people.forEach((p,idx)=>{
        const k = Math.min(1, dt*0.8);
        p.x += (p.t.x-p.x)*k; p.y += (p.t.y-p.y)*k; p.z += (p.t.z-p.z)*k;
        if (!p.leaving){ p.next -= dt; if (p.next <= 0){ p.room = Math.floor(Math.random()*ROOMS.length); p.t = seat(p.room); p.next = 6+Math.random()*8; } }
      });
      people = people.filter(p=>!(p.leaving && Math.hypot(p.t.x-p.x, p.t.z-p.z) < 0.2));
      for (let i=0;i<MAX;i++){
        const p = people[i], el = mv.querySelector(`[slot="hotspot-p${i}"]`);
        el.classList.toggle("gone", !p);
        if (p) mv.updateHotspot({name:"hotspot-p"+i, position:pos(p)});
      }
      acc += dt; if (acc > .5){ acc = 0; summary(); }
    }
    document.querySelectorAll("#privacy [data-view]").forEach(b=>b.addEventListener("click", ()=>{
      heat = b.dataset.view === "heat";
      document.querySelectorAll("#privacy [data-view]").forEach(o=>o.classList.toggle("on", o===b));
      applyView();
    }));
    document.getElementById("addPerson").addEventListener("click", ()=>add(Math.floor(Math.random()*ROOMS.length), EXIT));
    document.getElementById("clearPeople").addEventListener("click", ()=>people.forEach(p=>{ p.leaving = true; p.t = EXIT; }));
  })();

  /* ---------- contact form: submit in place ---------- */
  (function(){
    const f = document.getElementById("ctaForm"), st = document.getElementById("ctaStatus");
    f.addEventListener("submit", async e=>{
      e.preventDefault(); const b = f.querySelector("button[type=submit]"); b.disabled = true;
      st.className = "status"; st.textContent = "Sending…";
      try {
        const r = await fetch(f.action, {method:"POST", headers:{Accept:"application/json"}, body:new FormData(f)});
        const j = await r.json();
        if (j.success){ st.className = "status ok"; st.textContent = "Thanks. We'll be in touch within 2 business days."; f.reset(); }
        else throw new Error(j.message || "failed");
      } catch(err){ st.className = "status err"; st.textContent = "Couldn't send. Email automate@surds.co.in instead."; }
      b.disabled = false;
    });
  })();
})();
