// Generates compositions/route.html (the map scene). Re-run after changing the layout:
//   node tools/build-route.mjs
// The map is an illustration of Taman Indah KLIA, not to scale.
import { writeFileSync } from "node:fs";

// ---- World layout (world px) ----
const MAIN_X = 600; // main road, vertical
const H = [700, 1100, 1500, 1900]; // horizontal taman streets (IK 3/1 = 700, IK 3/3 = 1500)
const V = [1400, 2200, 3000]; // vertical taman streets (IK 3/6 = 2200)
const X_END = 3000;
const ROAD = 56;
const MAIN = 100;

// Route: north on main road, right IK 3/1, right IK 3/6, right IK 3/3, stop at No. 31
const START = [MAIN_X, 1800];
const J1 = [MAIN_X, 700];
const J2 = [2200, 700];
const J3 = [2200, 1500];
const HOUSE_X = 1549; // centre of lot 31
const DEST = [HOUSE_X, 1500];

// ---- Lots: rows of terrace houses facing each horizontal street ----
const LOT_W = 62, LOT_GAP = 8, LOT_D = 150, SETBACK = 22;
const lots = [];
let target = null;
const xStops = [MAIN_X, ...V];
for (let hi = 0; hi < H.length; hi++) {
  const y = H[hi];
  for (let vi = 0; vi < xStops.length; vi++) {
    const x0 = xStops[vi] + (vi === 0 ? MAIN / 2 : ROAD / 2) + 20;
    const x1 = (xStops[vi + 1] ?? X_END + 340) - ROAD / 2 - 20;
    for (let x = x0; x + LOT_W <= x1; x += LOT_W + LOT_GAP) {
      // north side of street (rear toward previous street) and south side
      const north = { x, y: y - ROAD / 2 - SETBACK - LOT_D };
      const south = { x, y: y + ROAD / 2 + SETBACK };
      if (hi > 0 || true) lots.push(north);
      if (hi < H.length - 1) lots.push(south);
      if (y === 1500 && !target && x <= HOUSE_X && HOUSE_X < x + LOT_W + LOT_GAP) target = north;
    }
  }
}
// trim lots that would sit above the first street's top row edge
const lotRects = lots
  .filter((l) => l !== target)
  .map((l) => `<rect x="${l.x}" y="${l.y}" width="${LOT_W}" height="${LOT_D}" rx="6"/>`)
  .join("");

const hRoads = H.map((y) => `<line x1="${MAIN_X}" y1="${y}" x2="${X_END + 340}" y2="${y}"/>`).join("");
const vRoads = V.map((x) => `<line x1="${x}" y1="${H[0]}" x2="${x}" y2="${H[H.length - 1]}"/>`).join("");

const tx = target.x, ty = target.y;
const pinX = tx + LOT_W / 2, pinY = ty + 40;

const svg = `
<svg id="map-svg" xmlns="http://www.w3.org/2000/svg" width="3600" height="2500" viewBox="0 0 3600 2500">
  <rect x="0" y="0" width="3600" height="2500" fill="#E9E6DF"/>
  <rect x="70" y="380" width="460" height="1040" rx="24" fill="#C9DDB8"/>
  <rect x="70" y="1520" width="460" height="560" rx="24" fill="#C9DDB8"/>
  <g fill="#D8D2C6">${lotRects}</g>
  <g stroke="#CFCAC0" stroke-width="${ROAD + 8}" stroke-linecap="round">${hRoads}${vRoads}</g>
  <g stroke="#FFFFFF" stroke-width="${ROAD}" stroke-linecap="round">${hRoads}${vRoads}</g>
  <line x1="${MAIN_X}" y1="0" x2="${MAIN_X}" y2="2500" stroke="#DDB24B" stroke-width="${MAIN + 10}"/>
  <line x1="${MAIN_X}" y1="0" x2="${MAIN_X}" y2="2500" stroke="#F3CF6B" stroke-width="${MAIN}"/>
  <g font-family="Inter" font-weight="700" font-size="34" fill="#5B6168">
    <text x="1000" y="712" text-anchor="middle">Jalan IK 3/1</text>
    <text x="1000" y="1512" text-anchor="middle">Jalan IK 3/3</text>
    <text x="1900" y="1512" text-anchor="middle">Jalan IK 3/3</text>
    <text transform="translate(2212 1100) rotate(-90)" text-anchor="middle">Jalan IK 3/6</text>
    <text transform="translate(${MAIN_X + 13} 1250) rotate(-90)" text-anchor="middle" fill="#6E5A1E">Jalan utama</text>
    <text transform="translate(${MAIN_X + 13} 400) rotate(-90)" text-anchor="middle" fill="#6E5A1E">Jalan utama</text>
  </g>
  <g id="lot31">
    <rect id="lot31-fill" x="${tx}" y="${ty}" width="${LOT_W}" height="${LOT_D}" rx="6" fill="#D8D2C6"/>
    <text id="lot31-num" x="${tx + LOT_W / 2}" y="${ty + LOT_D - 22}" text-anchor="middle" font-family="Inter" font-weight="900" font-size="34" fill="#1B1F24">31</text>
  </g>
  <path id="route-under" d="M${START} L${J1} L${J2} L${J3} L${DEST}" pathLength="100" fill="none" stroke="#FFFFFF" stroke-width="34" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="100 120" stroke-dashoffset="110"/>
  <path id="route" d="M${START} L${J1} L${J2} L${J3} L${DEST}" pathLength="100" fill="none" stroke="#E5482B" stroke-width="20" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="100 120" stroke-dashoffset="110"/>
  <g id="pin-wrap" transform="translate(${pinX} ${pinY})">
    <ellipse id="pin-shadow" cx="0" cy="6" rx="26" ry="9" fill="#1B1F24" opacity="0.25"/>
    <g id="pin">
      <path d="M0 0 C -14 -26 -46 -52 -46 -88 A 46 46 0 1 1 46 -88 C 46 -52 14 -26 0 0 Z" fill="#E5482B" stroke="#FFFFFF" stroke-width="6"/>
      <circle cx="0" cy="-88" r="17" fill="#FFFFFF"/>
    </g>
  </g>
  <g id="car-pos">
    <g id="car" opacity="0">
      <circle r="36" fill="#FFFFFF" stroke="#1B1F24" stroke-opacity="0.15" stroke-width="4"/>
      <path d="M0 -22 L17 16 L0 7 L-17 16 Z" fill="#E5482B"/>
    </g>
  </g>
</svg>`;

// ---- Camera ----
const SX = 1180, SY = 560;
const cam = (c, s) => ({ x: +(SX - c[0] * s).toFixed(1), y: +(SY - c[1] * s).toFixed(1), scale: s });
const OVER = { x: +(1340 - 1400 * 0.55).toFixed(1), y: +(560 - 1250 * 0.55).toFixed(1), scale: 0.55 }; // whole route, right of the panels
const D = 0.9; // drive scale

// cumulative route percentages
const seg = [
  Math.abs(J1[1] - START[1]),
  Math.abs(J2[0] - J1[0]),
  Math.abs(J3[1] - J2[1]),
  Math.abs(DEST[0] - J3[0]),
];
const tot = seg.reduce((a, b) => a + b);
let acc = 0;
const off = seg.map((l) => +(100 - ((acc += l) / tot) * 100).toFixed(3));

const arrowRight = `<svg viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="26" fill="#E5482B"/><path d="M38 92 V58 Q38 44 52 44 H78" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/><path d="M68 30 L84 44 L68 58" fill="none" stroke="#fff" stroke-width="12" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const pinIcon = `<svg viewBox="0 0 120 120" width="120" height="120"><rect width="120" height="120" rx="26" fill="#E5482B"/><path d="M60 98 C52 84 34 70 34 50 A26 26 0 1 1 86 50 C86 70 68 84 60 98 Z" fill="#fff"/><circle cx="60" cy="50" r="10" fill="#E5482B"/></svg>`;

const card = (id, start, dur, icon, small, big) => `
    <div id="${id}" class="clip card" data-start="${start}" data-duration="${dur}" data-track-index="3">
      <div id="${id}-in" class="card-in">
        ${icon}
        <div class="card-text">
          <div id="${id}-small" class="card-small" data-var-text="${id}-small">${small}</div>
          <div id="${id}-big" class="card-big" data-var-text="${id}-big">${big}</div>
        </div>
      </div>
    </div>`;

const html = `<template>
  <style>
    #root { position: absolute; inset: 0; overflow: hidden; background: #E9E6DF; font-family: Inter, sans-serif; color: #1B1F24; }
    #map-world { position: absolute; left: 0; top: 0; width: 3600px; height: 2500px; transform-origin: 0 0; }
    .card { position: absolute; left: 96px; top: 716px; width: 640px; height: 248px; }
    .card-in { position: absolute; inset: 0; display: flex; align-items: center; gap: 36px; padding: 0 44px; background: #FFFFFF; border-radius: 28px; box-shadow: 0 18px 40px rgba(27,31,36,0.18); }
    .card-in > svg { flex: none; }
    .card-small { font-weight: 700; font-size: 40px; color: #5B6168; line-height: 1.1; }
    .card-big { font-weight: 900; font-size: 72px; letter-spacing: -0.02em; line-height: 1.05; margin-top: 6px; white-space: nowrap; }
    .panel { position: absolute; left: 96px; top: 96px; width: 760px; }
    .panel-in { position: absolute; left: 0; top: 0; right: 0; background: #FFFFFF; border-radius: 32px; box-shadow: 0 18px 40px rgba(27,31,36,0.18); padding: 52px 56px; }
    #title { height: 330px; }
    #title-in { height: 330px; }
    #title-big { font-weight: 900; font-size: 110px; letter-spacing: -0.02em; line-height: 1; }
    #title-small { font-weight: 700; font-size: 40px; color: #5B6168; margin-top: 26px; line-height: 1.25; }
    #endc { top: 96px; height: 560px; }
    #endc-in { height: 560px; }
    #endc-addr { font-weight: 900; font-size: 76px; letter-spacing: -0.02em; line-height: 1.05; }
    #endc-area { font-weight: 700; font-size: 44px; color: #5B6168; margin-top: 14px; }
    .endc-line { font-weight: 700; font-size: 40px; margin-top: 40px; display: flex; align-items: center; gap: 20px; }
    #endc-dist { color: #E5482B; font-weight: 900; font-size: 56px; margin-top: 24px; }
    #note { position: absolute; right: 96px; bottom: 60px; font-weight: 700; font-size: 28px; color: #5B6168; background: rgba(255,255,255,0.85); padding: 10px 20px; border-radius: 14px; }
  </style>
  <div id="root" data-composition-id="route" data-width="1920" data-height="1080">
    <div id="map" class="clip" data-start="0" data-duration="22" data-track-index="1" data-layout-allow-overflow data-layout-ignore>
      <div id="map-world">${svg}
      </div>
    </div>

    <div id="title" class="clip panel" data-start="0" data-duration="2.6" data-track-index="2">
      <div id="title-in" class="panel-in">
        <div id="title-big" data-var-text="title-big">Ke No. 31</div>
        <div id="title-small" data-var-text="title-small">Jalan IK 3/3,<br/>Taman Indah KLIA</div>
      </div>
    </div>
${card("card1", 4.4, 2.2, arrowRight, "Belok kanan", "Jalan IK 3/1")}
${card("card2", 8.2, 1.9, arrowRight, "Belok kanan", "Jalan IK 3/6")}
${card("card3", 10.8, 1.9, arrowRight, "Belok kanan", "Jalan IK 3/3")}
${card("card4", 13.9, 2.3, pinIcon, "Sampai", "No. 31")}

    <div id="endc" class="clip panel" data-start="16.6" data-duration="5.4" data-track-index="2">
      <div id="endc-in" class="panel-in">
        <div id="endc-addr" data-var-text="endc-addr">No. 31,<br/>Jalan IK 3/3</div>
        <div id="endc-area" data-var-text="endc-area">Taman Indah KLIA</div>
        <div id="endc-line" class="endc-line">${arrowRight.replace('width="120" height="120"', 'width="64" height="64"')}<span data-var-text="endc-line">3 kali belok kanan dari jalan utama</span></div>
        <div id="endc-dist" data-var-text="endc-dist">± 410 m</div>
      </div>
    </div>

    <div id="note" class="clip" data-start="0" data-duration="22" data-track-index="4" data-layout-ignore>Peta ilustrasi, tidak mengikut skala</div>
  </div>
  <script>
    const tl = gsap.timeline({ paused: true });
    const W = "#map-world";
    const OVER = ${JSON.stringify(OVER)};
    const C = {
      start: ${JSON.stringify(cam(START, D))},
      j1: ${JSON.stringify(cam(J1, D))},
      j2: ${JSON.stringify(cam(J2, D))},
      j3: ${JSON.stringify(cam(J3, D))},
      dest: ${JSON.stringify(cam(DEST, D))},
      house: ${JSON.stringify(cam([pinX, pinY - 40], 1.25))},
    };
    const R = ["#route", "#route-under"];
    const OFF = ${JSON.stringify(off)};

    // frame 0: overview, pin already marks the house
    tl.set(W, { x: OVER.x, y: OVER.y, scale: OVER.scale }, 0);
    tl.set("#car", { rotation: 0, transformOrigin: "50% 50%" }, 0);
    tl.set("#car-pos", { x: ${START[0]}, y: ${START[1]} }, 0);
    tl.set("#pin", { y: 0 }, 0);
    tl.set("#pin-shadow", { opacity: 0.25 }, 0);

    // title card holds, then wipes away
    tl.fromTo("#title-in", { clipPath: "inset(0% 0% 0% 0% round 32px)" }, { clipPath: "inset(0% 100% 0% 0% round 32px)", duration: 0.3, ease: "power3.in" }, 2.2);

    // dive to the start
    tl.to(W, { ...C.start, duration: 1.2, ease: "power3.inOut" }, 2.4);
    tl.set("#pin", { y: -2000 }, 2.4); // pin lifts away to drop again on arrival
    tl.set("#pin-shadow", { opacity: 0 }, 2.4);
    tl.fromTo("#car", { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, 3.25);

    // drive helper: car, route head and camera share one ease
    function drive(t, dur, to, camTo, off) {
      tl.to("#car-pos", { x: to[0], y: to[1], duration: dur, ease: "power1.inOut" }, t);
      tl.to(W, { ...camTo, duration: dur, ease: "power1.inOut" }, t);
      tl.to(R, { strokeDashoffset: off, duration: dur, ease: "power1.inOut" }, t);
    }
    tl.set(R, { strokeDashoffset: 100 }, 3.6);
    drive(3.6, 2.0, ${JSON.stringify(J1)}, C.j1, OFF[0]);
    tl.to("#car", { rotation: 90, duration: 0.4, ease: "power2.inOut" }, 5.8);
    drive(6.4, 2.8, ${JSON.stringify(J2)}, C.j2, OFF[1]);
    tl.to("#car", { rotation: 180, duration: 0.4, ease: "power2.inOut" }, 9.4);
    drive(10.0, 1.6, ${JSON.stringify(J3)}, C.j3, OFF[2]);
    tl.to("#car", { rotation: 270, duration: 0.4, ease: "power2.inOut" }, 11.8);
    drive(12.4, 1.4, ${JSON.stringify(DEST)}, C.dest, OFF[3]);

    // arrival: push in on the house, pin drops, lot fills
    tl.to(W, { ...C.house, duration: 0.9, ease: "power2.inOut" }, 13.6);
    tl.fromTo("#pin", { y: -700 }, { y: 0, duration: 0.47, ease: "bounce.out" }, 13.8);
    tl.to("#pin-shadow", { opacity: 0.25, duration: 0.25 }, 13.95);
    tl.to("#lot31-fill", { fill: "#F6C9BE", duration: 0.2 }, 14.1);
    tl.to("#car", { scale: 0.3, opacity: 0, duration: 0.25, ease: "power2.in" }, 14.1);

    // cards wipe in from the left, then hold still
    for (const [id, t] of [["#card1-in", 4.4], ["#card2-in", 8.2], ["#card3-in", 10.8], ["#card4-in", 13.9]]) {
      tl.fromTo(id, { clipPath: "inset(0% 100% 0% 0% round 28px)" }, { clipPath: "inset(0% 0% 0% 0% round 28px)", duration: 0.33, ease: "power3.out" }, t);
    }
    for (const [id, t] of [["#card1-in", 6.3], ["#card2-in", 9.8], ["#card3-in", 12.4], ["#card4-in", 15.9]]) {
      tl.to(id, { clipPath: "inset(0% 100% 0% 0% round 28px)", duration: 0.28, ease: "power3.in" }, t);
    }

    // pull back to the whole route, end card builds line by line
    tl.to(W, { ...OVER, duration: 1.4, ease: "power2.inOut" }, 16.0);
    tl.fromTo("#endc-in", { clipPath: "inset(0% 100% 0% 0% round 32px)" }, { clipPath: "inset(0% 0% 0% 0% round 32px)", duration: 0.4, ease: "power3.out" }, 16.6);
    for (const [id, t] of [["#endc-addr", 16.75], ["#endc-area", 17.05], ["#endc-line", 17.5], ["#endc-dist", 17.9]]) {
      tl.fromTo(id, { clipPath: "inset(0% 100% 0% 0%)" }, { clipPath: "inset(0% 0% 0% 0%)", duration: 0.3, ease: "power3.out" }, t);
    }

    window.__timelines["route"] = tl;
  </script>
</template>
`;

writeFileSync(new URL("../compositions/route.html", import.meta.url), html);
console.log("wrote compositions/route.html", { lots: lots.length, target, off });
