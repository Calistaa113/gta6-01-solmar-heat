// Drawing only: the world's state and the current screen in, pixels out.
// A camera follows the player across the city; the 1280x720 view is scaled
// to fit the window and centred. Flat shapes, canvas text for the HUD and
// the panels, and a minimap drawn from the same city data.
import { PALETTE, VIEW, WORLD } from './config.js';
import { blockDistrict } from './city.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';

const PANEL = { width: 640, line: 32, bottom: 64 };
const MAP_W = 208;
const MAP_H = 152;

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const fonts = new Map();

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  function text(value, x, y, size, color, align, weight) {
    const key = `${size}:${weight || ''}`;
    if (!fonts.has(key)) fonts.set(key, `${weight || ''} ${size}px system-ui, sans-serif`);
    context.font = fonts.get(key);
    context.fillStyle = color;
    context.textAlign = align || 'left';
    context.fillText(value, x, y);
  }

  function rr(x, y, w, h, r) {
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + w, y, x + w, y + h, r);
    context.arcTo(x + w, y + h, x, y + h, r);
    context.arcTo(x, y + h, x, y, r);
    context.arcTo(x, y, x + w, y, r);
    context.closePath();
  }

  function drawCity(state) {
    const city = state.city;
    const cam = state.camera;
    const x0 = cam.x - VIEW.width / 2 - 40;
    const y0 = cam.y - VIEW.height / 2 - 40;
    const x1 = cam.x + VIEW.width / 2 + 40;
    const y1 = cam.y + VIEW.height / 2 + 40;

    // ground
    context.fillStyle = PALETTE.grass;
    context.fillRect(x0, y0, x1 - x0, y1 - y0);
    // beach and water along the south edge
    context.fillStyle = PALETTE.sand;
    context.fillRect(x0, city.roadsH[city.roadsH.length - 1] + 34, x1 - x0, WORLD.height - city.roadsH[city.roadsH.length - 1] - 34);
    context.fillStyle = PALETTE.water;
    context.fillRect(x0, city.waterY, x1 - x0, WORLD.height - city.waterY);

    // blocks (sidewalk slabs) with district tint
    const roadsV = city.roadsV;
    const roadsH = city.roadsH;
    for (let col = 0; col < roadsV.length - 1; col += 1) {
      for (let row = 0; row < roadsH.length - 1; row += 1) {
        const bx = roadsV[col] + 34;
        const by = roadsH[row] + 34;
        if (bx > x1 || by > y1 || bx + 332 < x0 || by + 332 < y0) continue;
        const d = blockDistrict(col, row);
        context.fillStyle = d === 'park' ? PALETTE.park : (d === 'beach' ? PALETTE.sand : PALETTE.sidewalk);
        context.fillRect(bx, by, 332, 332);
      }
    }

    // roads
    context.fillStyle = PALETTE.road;
    for (const rx of roadsV) context.fillRect(rx - 34, y0, 68, y1 - y0);
    for (const ry of roadsH) context.fillRect(x0, ry - 34, x1 - x0, 68);
    // centre dashes
    context.fillStyle = PALETTE.roadLine;
    for (const rx of roadsV) {
      for (let y = Math.floor(y0 / 44) * 44; y < y1; y += 44) context.fillRect(rx - 2, y, 4, 22);
    }
    for (const ry of roadsH) {
      for (let x = Math.floor(x0 / 44) * 44; x < x1; x += 44) context.fillRect(x, ry - 2, 22, 4);
    }

    // trees
    for (const t of city.trees) {
      if (t.x < x0 || t.x > x1 || t.y < y0 || t.y > y1) continue;
      context.fillStyle = '#4a7d3a';
      context.beginPath();
      context.arc(t.x, t.y, t.r, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#5d9a48';
      context.beginPath();
      context.arc(t.x - 3, t.y - 3, t.r * 0.6, 0, Math.PI * 2);
      context.fill();
    }

    // buildings with a drop shadow and windows on tall ones
    for (const b of city.buildings) {
      if (b.x > x1 || b.y > y1 || b.x + b.w < x0 || b.y + b.h < y0) continue;
      context.fillStyle = 'rgba(0,0,0,0.25)';
      context.fillRect(b.x + 6, b.y + 8, b.w, b.h);
      context.fillStyle = b.color;
      context.fillRect(b.x, b.y, b.w, b.h);
      context.fillStyle = 'rgba(255,255,255,0.10)';
      context.fillRect(b.x, b.y, b.w, 6);
      if (b.tall > 12) {
        context.fillStyle = PALETTE.buildingGlass;
        const cols = Math.floor(b.w / 26);
        const rows = Math.floor(b.h / 26);
        for (let cx = 0; cx < cols; cx += 1) {
          for (let cy = 0; cy < rows; cy += 1) {
            context.fillRect(b.x + 10 + cx * 26, b.y + 10 + cy * 26, 14, 16);
          }
        }
      }
    }

    // named places: a signpost each
    drawPlaceSign(state, 'safehouse', 'H', '#3fae5a');
    drawPlaceSign(state, 'spray', 'S', '#ff9f1c');
    drawPlaceSign(state, 'arms', 'A', '#c94f43');
    drawPlaceSign(state, 'hospital', '+', '#f2f0e6');
    drawPlaceSign(state, 'marina', 'M', '#2f6f9e');
  }

  function drawPlaceSign(state, name, letter, color) {
    const p = state.city.places[name];
    if (!p) return;
    const cam = state.camera;
    if (Math.abs(p.x - cam.x) > VIEW.width || Math.abs(p.y - cam.y) > VIEW.height) return;
    context.fillStyle = color;
    context.beginPath();
    context.arc(p.x, p.y, 13, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#101318';
    text(letter, p.x, p.y + 5, 15, '#101318', 'center', 'bold');
  }

  function drawPickups(state) {
    for (const p of state.pickups) {
      if (p.respawn > 0) continue;
      context.fillStyle = '#3fae5a';
      rr(p.x - 11, p.y - 8, 22, 16, 3);
      context.fill();
      context.fillStyle = '#f2f0e6';
      text('$', p.x, p.y + 5, 13, '#f2f0e6', 'center', 'bold');
    }
    // mission bags
    const bags = state.missions.state.bags;
    for (const b of bags) {
      if (b.taken) continue;
      context.fillStyle = '#ff9f1c';
      rr(b.x - 12, b.y - 9, 24, 18, 3);
      context.fill();
      context.fillStyle = '#101318';
      text('$', b.x, b.y + 6, 14, '#101318', 'center', 'bold');
    }
  }

  function drawCar(car, time) {
    context.save();
    context.translate(car.x, car.y);
    context.rotate(car.angle);
    // shadow
    context.fillStyle = 'rgba(0,0,0,0.28)';
    rr(-27, -11, 54, 26, 6);
    context.fill();
    // wheels
    context.fillStyle = '#14161a';
    context.fillRect(-19, -15, 12, 5);
    context.fillRect(9, -15, 12, 5);
    context.fillRect(-19, 10, 12, 5);
    context.fillRect(9, 10, 12, 5);
    // body
    context.fillStyle = car.color;
    rr(-27, -13, 54, 26, 7);
    context.fill();
    // roof + windshield
    context.fillStyle = 'rgba(0,0,0,0.25)';
    rr(-6, -11, 20, 22, 4);
    context.fill();
    context.fillStyle = '#bfe3ea';
    context.fillRect(14, -10, 5, 20);
    // headlights
    context.fillStyle = '#ffe9a8';
    context.fillRect(25, -10, 3, 4);
    context.fillRect(25, 6, 3, 4);
    if (car.driver === 'police') {
      const phase = Math.floor(time * 2.4) % 2 === 0;
      context.fillStyle = phase ? '#ff2e2e' : '#2e6bff';
      context.fillRect(-2, -13, 8, 5);
      context.fillStyle = phase ? '#2e6bff' : '#ff2e2e';
      context.fillRect(-2, 8, 8, 5);
      context.fillStyle = '#e8e8e8';
      context.fillRect(-27, -13, 54, 26);
      context.fillStyle = '#222831';
      rr(-6, -11, 20, 22, 4);
      context.fill();
      context.fillStyle = '#bfe3ea';
      context.fillRect(14, -10, 5, 20);
    }
    if (car.type === 'taxi') {
      context.fillStyle = '#101318';
      for (let i = 0; i < 5; i += 1) context.fillRect(-18 + i * 10, -2, 5, 4);
    }
    context.restore();
  }

  function drawPerson(x, y, angle, shirt, pants, radius) {
    context.fillStyle = 'rgba(0,0,0,0.25)';
    context.beginPath();
    context.ellipse(x, y + radius * 0.7, radius, radius * 0.45, 0, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = pants;
    context.beginPath();
    context.arc(x, y, radius, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = shirt;
    context.beginPath();
    context.arc(x, y, radius * 0.72, 0, Math.PI * 2);
    context.fill();
    // facing tick
    context.strokeStyle = shirt;
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(x + Math.cos(angle) * radius * 0.7, y + Math.sin(angle) * radius * 0.7);
    context.lineTo(x + Math.cos(angle) * (radius + 6), y + Math.sin(angle) * (radius + 6));
    context.stroke();
  }

  function drawMissionMarker(state, time) {
    const target = state.missions.target();
    if (!target) return;
    const pulse = 1 + Math.sin(time * 4) * 0.12;
    context.strokeStyle = PALETTE.mission;
    context.lineWidth = 3;
    context.beginPath();
    context.arc(target.x, target.y, 26 * pulse, 0, Math.PI * 2);
    context.stroke();
    context.fillStyle = PALETTE.mission;
    context.beginPath();
    context.arc(target.x, target.y, 5, 0, Math.PI * 2);
    context.fill();
    // beacon
    context.strokeStyle = 'rgba(255,159,28,0.35)';
    context.lineWidth = 2;
    context.beginPath();
    context.moveTo(target.x, target.y - 90);
    context.lineTo(target.x, target.y - 30);
    context.stroke();
  }

  function drawWorld(state, time) {
    drawCity(state);
    drawPickups(state);
    drawMissionMarker(state, time);
    for (const ped of state.peds) {
      if (ped.state === 'down') {
        context.fillStyle = ped.shirt;
        context.beginPath();
        context.ellipse(ped.x, ped.y, 12, 6, ped.angle, 0, Math.PI * 2);
        context.fill();
        continue;
      }
      drawPerson(ped.x, ped.y, ped.angle, ped.shirt, ped.pants, 9);
    }
    for (const cop of state.cops) {
      drawPerson(cop.x, cop.y, cop.angle, '#2f6fd0', '#1c2a44', 10);
      context.fillStyle = '#f2c94c';
      context.beginPath();
      context.arc(cop.x, cop.y - 2, 2.5, 0, Math.PI * 2);
      context.fill();
    }
    for (const car of state.cars) drawCar(car, time);
    const player = state.player;
    if (!player.car) {
      drawPerson(player.x, player.y, player.angle, PALETTE.player, '#2e3a4a', 11);
      if (player.punchTimer > 0.2) {
        context.strokeStyle = '#f2f0e6';
        context.lineWidth = 4;
        context.beginPath();
        context.arc(player.x, player.y, 24, player.angle - 0.6, player.angle + 0.6);
        context.stroke();
      }
    }
    // bullets
    context.strokeStyle = '#ffe9a8';
    context.lineWidth = 3;
    for (const b of state.bullets) {
      context.beginPath();
      context.moveTo(b.x - Math.cos(b.angle) * 12, b.y - Math.sin(b.angle) * 12);
      context.lineTo(b.x, b.y);
      context.stroke();
    }
    // particles
    for (const p of state.particles) {
      context.globalAlpha = Math.max(0, p.life / p.max);
      context.fillStyle = p.color;
      context.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
    }
    context.globalAlpha = 1;
    // day tint: warm at dawn/dusk, neutral at noon
    const t = state.timeOfDay;
    const warmth = Math.abs(t - 0.5) * 2; // 0 noon, 1 dawn/dusk
    if (warmth > 0.25) {
      context.fillStyle = `rgba(255,150,60,${(warmth - 0.25) * 0.10})`;
      const cam = state.camera;
      context.fillRect(cam.x - VIEW.width / 2, cam.y - VIEW.height / 2, VIEW.width, VIEW.height);
    }
  }

  function drawMinimap(state) {
    const mx = VIEW.width - MAP_W - 16;
    const my = 16;
    const sx = MAP_W / WORLD.width;
    const sy = MAP_H / WORLD.height;
    context.fillStyle = 'rgba(16,19,24,0.82)';
    rr(mx - 6, my - 6, MAP_W + 12, MAP_H + 12, 8);
    context.fill();
    context.save();
    context.beginPath();
    context.rect(mx, my, MAP_W, MAP_H);
    context.clip();
    context.fillStyle = '#3d6a45';
    context.fillRect(mx, my, MAP_W, MAP_H);
    context.fillStyle = '#2f6f9e';
    context.fillRect(mx, my + MAP_H - 4, MAP_W, 4);
    context.strokeStyle = '#5a5e66';
    context.lineWidth = 2;
    for (const rx of state.city.roadsV) {
      context.beginPath();
      context.moveTo(mx + rx * sx, my);
      context.lineTo(mx + rx * sx, my + MAP_H);
      context.stroke();
    }
    for (const ry of state.city.roadsH) {
      context.beginPath();
      context.moveTo(mx, my + ry * sy);
      context.lineTo(mx + MAP_W, my + ry * sy);
      context.stroke();
    }
    // places
    for (const name of ['safehouse', 'spray', 'arms', 'hospital', 'marina']) {
      const p = state.city.places[name];
      context.fillStyle = '#f2f0e6';
      context.fillRect(mx + p.x * sx - 2, my + p.y * sy - 2, 4, 4);
    }
    // cash pickups
    context.fillStyle = '#3fae5a';
    for (const p of state.pickups) {
      if (p.respawn > 0) continue;
      context.fillRect(mx + p.x * sx - 1, my + p.y * sy - 1, 3, 3);
    }
    // police
    context.fillStyle = '#ff2e2e';
    for (const car of state.cars) {
      if (car.driver !== 'police') continue;
      context.beginPath();
      context.arc(mx + car.x * sx, my + car.y * sy, 3, 0, Math.PI * 2);
      context.fill();
    }
    // mission target
    const target = state.missions.target();
    if (target) {
      context.fillStyle = PALETTE.mission;
      context.beginPath();
      context.arc(mx + target.x * sx, my + target.y * sy, 4, 0, Math.PI * 2);
      context.fill();
    }
    // player arrow
    const pl = state.player;
    context.save();
    context.translate(mx + pl.x * sx, my + pl.y * sy);
    context.rotate(pl.angle);
    context.fillStyle = '#ffffff';
    context.beginPath();
    context.moveTo(7, 0);
    context.lineTo(-5, -5);
    context.lineTo(-5, 5);
    context.closePath();
    context.fill();
    context.restore();
    context.restore();
    // viewport rectangle
    context.strokeStyle = 'rgba(242,240,230,0.5)';
    context.lineWidth = 1;
    const cam = state.camera;
    context.strokeRect(
      mx + (cam.x - VIEW.width / 2) * sx, my + (cam.y - VIEW.height / 2) * sy,
      VIEW.width * sx, VIEW.height * sy,
    );
  }

  function drawHud(state, time) {
    const player = state.player;
    const wanted = state.wanted.state;
    context.textBaseline = 'top';
    // money
    context.fillStyle = 'rgba(16,19,24,0.72)';
    rr(12, 12, 190, 64, 8);
    context.fill();
    text(`$${state.money}`, 24, 20, 30, PALETTE.gold, 'left', 'bold');
    // health bar
    context.fillStyle = '#3a3f46';
    context.fillRect(24, 56, 120, 10);
    context.fillStyle = player.health > 30 ? PALETTE.green : PALETTE.red;
    context.fillRect(24, 56, 120 * Math.max(0, player.health / 100), 10);
    // wanted stars
    if (wanted.stars > 0) {
      let stars = '';
      for (let i = 0; i < wanted.stars; i += 1) stars += '★';
      text(stars, VIEW.width - MAP_W - 28, 20, 30, PALETTE.gold, 'right', 'bold');
    }
    // mission objective
    const mission = state.missions.mission();
    const target = state.missions.target();
    if (mission && !state.storyDone) {
      context.fillStyle = 'rgba(16,19,24,0.72)';
      const label = target ? target.label : mission.title;
      rr(VIEW.width / 2 - 210, 12, 420, 56, 8);
      context.fill();
      text(mission.title, VIEW.width / 2, 18, 20, PALETTE.mission, 'center', 'bold');
      text(label, VIEW.width / 2, 42, 16, PALETTE.text, 'center');
      if (state.missions.state.timer > 0) {
        text(`${Math.ceil(state.missions.state.timer)}s`, VIEW.width / 2 + 226, 20, 24, PALETTE.red, 'left', 'bold');
      }
      if (state.missions.state.surviveLeft > 0) {
        text(`${Math.ceil(state.missions.state.surviveLeft)}s`, VIEW.width / 2 + 226, 20, 24, PALETTE.red, 'left', 'bold');
      }
    }
    if (state.storyDone) {
      text('KING OF SOLMAR — free roam', VIEW.width / 2, 18, 18, PALETTE.gold, 'center', 'bold');
    }
    // ammo / speed
    if (player.car) {
      const kmh = Math.round(Math.abs(player.speed) * 0.36);
      text(`${kmh} km/h`, VIEW.width - 24, VIEW.height - 44, 26, PALETTE.text, 'right', 'bold');
      text(player.car.type.toUpperCase(), VIEW.width - 24, VIEW.height - 72, 16, PALETTE.muted, 'right');
    } else {
      text(`AMMO ${player.ammo}`, VIEW.width - 24, VIEW.height - 44, 22, PALETTE.text, 'right', 'bold');
    }
    // banner
    const banner = state.missions.state.banner;
    if (state.missions.state.bannerTimer > 0 && banner) {
      context.fillStyle = 'rgba(16,19,24,0.78)';
      const bw = 560;
      rr(VIEW.width / 2 - bw / 2, 92, bw, 44, 8);
      context.fill();
      text(banner, VIEW.width / 2, 102, 22, PALETTE.gold, 'center', 'bold');
    }
    // context prompt
    const prompt = contextPrompt(state);
    if (prompt) {
      text(prompt, VIEW.width / 2, VIEW.height - 40, 20, PALETTE.text, 'center', 'bold');
    }
    drawMinimap(state);
    // off-screen waypoint arrow
    if (target) {
      const cam = state.camera;
      const dx = target.x - cam.x;
      const dy = target.y - cam.y;
      if (Math.abs(dx) > VIEW.width / 2 - 40 || Math.abs(dy) > VIEW.height / 2 - 40) {
        const ang = Math.atan2(dy, dx);
        const ax = VIEW.width / 2 + Math.cos(ang) * 300;
        const ay = VIEW.height / 2 + Math.sin(ang) * 200;
        context.save();
        context.translate(ax, ay);
        context.rotate(ang);
        context.fillStyle = PALETTE.mission;
        context.beginPath();
        context.moveTo(18, 0);
        context.lineTo(-10, -11);
        context.lineTo(-10, 11);
        context.closePath();
        context.fill();
        context.restore();
        text(`${Math.round(Math.hypot(dx, dy))}m`, ax, ay + 22, 15, PALETTE.mission, 'center', 'bold');
      }
    }
  }

  function contextPrompt(state) {
    const player = state.player;
    if (player.car) return '';
    const city = state.city;
    let best = null;
    let bd = 74;
    for (const car of state.cars) {
      const d = Math.hypot(car.x - player.x, car.y - player.y);
      if (d < bd) { bd = d; best = car; }
    }
    if (best) return best.driver === 'police' ? '' : 'Press E to get in the car';
    const arms = city.places.arms;
    if (Math.hypot(player.x - arms.x, player.y - arms.y) < 80 && state.money >= 60 && player.ammo < 120) {
      return 'Press E to buy ammo — $60';
    }
    const hospital = city.places.hospital;
    if (Math.hypot(player.x - hospital.x, player.y - hospital.y) < 80 && state.money >= 120 && player.health < 100) {
      return 'Press E to heal — $120';
    }
    return '';
  }

  function drawPanel(title, lines, prompt, accent) {
    const height = 150 + lines.length * 34 + 64;
    const x = (VIEW.width - PANEL.width) / 2;
    const y = (VIEW.height - height) / 2;
    context.fillStyle = 'rgba(16,19,24,0.92)';
    rr(x, y, PANEL.width, height, 12);
    context.fill();
    context.strokeStyle = accent || PALETTE.gold;
    context.lineWidth = 3;
    rr(x, y, PANEL.width, height, 12);
    context.stroke();
    context.textBaseline = 'alphabetic';
    text(title, VIEW.width / 2, y + 72, 46, accent || PALETTE.gold, 'center', 'bold');
    for (let index = 0; index < lines.length; index += 1) {
      text(lines[index], VIEW.width / 2, y + 122 + index * 34, 20, PALETTE.muted, 'center');
    }
    text(prompt, VIEW.width / 2, y + height - 30, 22, PALETTE.text, 'center', 'bold');
  }

  /** Paint one frame: the world, then the HUD or a panel for the screen. */
  function draw(state, screen, save, time) {
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = '#101318';
    context.fillRect(0, 0, canvas.width, canvas.height);
    const cam = state.camera;
    context.setTransform(view.scale, 0, 0, view.scale,
      view.x - (cam.x - VIEW.width / 2) * view.scale,
      view.y - (cam.y - VIEW.height / 2) * view.scale);
    drawWorld(state, time);
    // HUD and panels live in view space
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_TITLE) {
      context.fillStyle = 'rgba(10,12,16,0.55)';
      context.fillRect(0, 0, VIEW.width, VIEW.height);
      context.textBaseline = 'alphabetic';
      text('SOLMAR HEAT', VIEW.width / 2, 168, 84, PALETTE.gold, 'center', 'bold');
      text('An open-world crime story in the sun-soaked city of Solmar', VIEW.width / 2, 208, 24, PALETTE.text, 'center');
      const lines = [
        'WASD / arrows — walk and drive    Shift — run',
        'E — steal a car / get out    F — punch    Click — shoot',
        'Missions from Vera pay cash. The cops pay attention.',
        'P — pause    M — mute',
      ];
      for (let i = 0; i < lines.length; i += 1) {
        text(lines[i], VIEW.width / 2, 268 + i * 32, 20, PALETTE.muted, 'center');
      }
      text('Press Enter or click to start', VIEW.width / 2, 452, 26, PALETTE.text, 'center', 'bold');
      if (save && save.best > 0) {
        text(`Best haul $${save.best}  •  ${save.missions} jobs done`, VIEW.width / 2, 500, 18, PALETTE.muted, 'center');
      }
      return;
    }
    drawHud(state, time);
    if (screen === SCREEN_PAUSED) {
      drawPanel('Paused', ['Solmar waits for no one. Well — right now it does.'], 'Press P to resume');
    } else if (screen === SCREEN_OVER) {
      if (state.over === 'busted') {
        drawPanel('BUSTED', ['The Solmar PD took $200 in fines.', `Haul so far: $${state.earned}`], 'Press Enter to walk free', PALETTE.cop);
      } else {
        drawPanel('DOWN', ['You wake up at St. Marina Hospital, lighter by $120.', `Haul so far: $${state.earned}`], 'Press Enter to get back out there', PALETTE.red);
      }
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return {
    draw,
    view,
    /** Convert a pointer position in CSS pixels to world coordinates. */
    screenToWorld(clientX, clientY, camX, camY) {
      const rect = canvas.getBoundingClientRect();
      const deviceX = (clientX - rect.left) * (canvas.width / rect.width);
      const deviceY = (clientY - rect.top) * (canvas.height / rect.height);
      return {
        x: (deviceX - view.x) / view.scale + (camX - VIEW.width / 2),
        y: (deviceY - view.y) / view.scale + (camY - VIEW.height / 2),
      };
    },
  };
}
