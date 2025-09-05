// --- Canvas & constants
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;

// --- Persistent settings
const settings = {
  particles: getBool('dodge_particles', true),
  shake: getBool('dodge_shake', true),
  sfx: getBool('dodge_sfx', true),
  highHUD: getBool('dodge_highhud', false),
  lefty: getBool('dodge_lefty', false),
  touchPad: getBool('dodge_touch', false),
};

// UI refs
const ui = {
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  mult: document.getElementById('mult'),
  play: document.getElementById('play'),
  pause: document.getElementById('pause'),
  reset: document.getElementById('reset'),
  left: document.getElementById('left'),
  right: document.getElementById('right'),
  leftPad: document.getElementById('leftPad'),
  rightPad: document.getElementById('rightPad'),
  settings: document.getElementById('settings'),
  modal: document.getElementById('modal'),
  optParticles: document.getElementById('optParticles'),
  optShake: document.getElementById('optShake'),
  optSfx: document.getElementById('optSfx'),
  optHUD: document.getElementById('optHUD'),
  optLH: document.getElementById('optLH'),
  optTouch: document.getElementById('optTouch'),
};

// Apply settings to modal
ui.optParticles.checked = settings.particles;
ui.optShake.checked = settings.shake;
ui.optSfx.checked = settings.sfx;
ui.optHUD.checked = settings.highHUD;
ui.optLH.checked = settings.lefty;
ui.optTouch.checked = settings.touchPad;

// --- Game state
const state = {
  running: false,
  paused: false,
  score: 0,
  best: Number(localStorage.getItem('dodge_best')||0),
  baseSpeed: 2.4,
  spawnEvery: 900,
  lastSpawn: 0,
  lastFrame: 0,
  t: 0,
  multi: 1,
  comboTime: 0,
  comboMax: 4000,
  slowmo: 0,
  shield: 0,
  shake: 0,
  keys: new Set(),
  obstacles: [],
  particles: [],
  powerups: [],
  stars: makeStars(70),
  player: {x: W/2-18, y: H-80, w: 36, h: 36, speed: 4.5, hue: 190}
};
ui.best.textContent = state.best;

// --- WebAudio minimal SFX (no assets)
const AudioCtx = window.AudioContext||window.webkitAudioContext; let actx;
function beep(type='sine', freq=440, dur=0.08, vol=0.04){
  if(!settings.sfx) return;
  actx = actx || new AudioCtx();
  const o=actx.createOscillator(), g=actx.createGain();
  o.type=type; o.frequency.setValueAtTime(freq, actx.currentTime);
  g.gain.setValueAtTime(vol, actx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+dur);
  o.connect(g).connect(actx.destination); o.start(); o.stop(actx.currentTime+dur);
}

// --- Helpers
function rnd(min,max){return Math.random()*(max-min)+min}
function aabb(a,b){return a.x<b.x+b.w && a.x+a.w>b.x && a.y<b.y+b.h && a.y+a.h>b.y}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function choice(arr){return arr[(Math.random()*arr.length)|0]}
function getBool(k,def){return (localStorage.getItem(k)??String(def))==='true'}
function setBool(k,v){localStorage.setItem(k,String(v))}

function makeStars(n){
  return Array.from({length:n},(_,i)=>({
    x: rnd(0,W), y: rnd(0,H), s: 1+(i%3), a: 0.05+(i%6)/40, vx: rnd(-0.03,0.03), vy: rnd(0.02,0.08)
  }))
}

// --- Input
addEventListener('keydown', e=>{
  if(["ArrowLeft","ArrowRight","Space","KeyA","KeyD","KeyP"].includes(e.code)) e.preventDefault()
  if(e.code==='Space') start()
  if(e.code==='KeyP') togglePause()
  if(e.code==='ArrowLeft'||e.code==='KeyA') state.keys.add('left')
  if(e.code==='ArrowRight'||e.code==='KeyD') state.keys.add('right')
})
addEventListener('keyup', e=>{
  if(e.code==='ArrowLeft'||e.code==='KeyA') state.keys.delete('left')
  if(e.code==='ArrowRight'||e.code==='KeyD') state.keys.delete('right')
})

ui.play.onclick = start;
ui.pause.onclick = togglePause;
ui.reset.onclick = resetGame;
ui.left.ontouchstart = ()=>state.keys.add('left');
ui.left.ontouchend = ()=>state.keys.delete('left');
ui.right.ontouchstart = ()=>state.keys.add('right');
ui.right.ontouchend = ()=>state.keys.delete('right');

ui.settings.onclick = ()=> ui.modal.showModal();
ui.modal.addEventListener('close', ()=>{
  if(ui.modal.returnValue!=='cancel'){
    settings.particles = ui.optParticles.checked; setBool('dodge_particles', settings.particles)
    settings.shake = ui.optShake.checked; setBool('dodge_shake', settings.shake)
    settings.sfx = ui.optSfx.checked; setBool('dodge_sfx', settings.sfx)
    settings.highHUD = ui.optHUD.checked; setBool('dodge_highhud', settings.highHUD)
    settings.lefty = ui.optLH.checked; setBool('dodge_lefty', settings.lefty)
    settings.touchPad = ui.optTouch.checked; setBool('dodge_touch', settings.touchPad)
  }
  // Apply touch pad buttons on toolbar
  ui.leftPad.style.display = settings.touchPad ? 'inline-block' : 'none';
  ui.rightPad.style.display = settings.touchPad ? 'inline-block' : 'none';
  if(settings.lefty){
    ui.leftPad.parentElement.insertBefore(ui.rightPad, ui.leftPad);
  }
});
ui.leftPad.onpointerdown = ()=>state.keys.add('left');
ui.leftPad.onpointerup = ()=>state.keys.delete('left');
ui.rightPad.onpointerdown = ()=>state.keys.add('right');
ui.rightPad.onpointerup = ()=>state.keys.delete('right');

// --- Game API
function start(){
  if(!state.running){
    Object.assign(state, {
      running:true, paused:false, score:0, baseSpeed:2.4, spawnEvery:900,
      lastSpawn:0, lastFrame:0, t:0, multi:1, comboTime:0, slowmo:0, shield:0, shake:0,
      obstacles:[], particles:[], powerups:[], player:{x:W/2-18,y:H-80,w:36,h:36,speed:4.7,hue:190}
    })
    countdown(3, ()=>loop(0));
    beep('triangle', 660, .12, .06)
  } else if(state.paused){ state.paused=false; beep('square', 520, .08, .05) }
}
function togglePause(){ if(state.running){ state.paused = !state.paused; if(!state.paused) state.lastFrame=0; beep('sine', state.paused?260:420, .05, .04) } }
function gameOver(){
  state.running=false;
  state.best = Math.max(state.best, Math.floor(state.score));
  localStorage.setItem('dodge_best', state.best); ui.best.textContent = state.best;
  draw(true);
  beep('sawtooth', 160, .18, .06)
}
function resetGame(){
  state.running=false; state.paused=false; state.score=0; state.obstacles.length=0; state.particles.length=0; state.powerups.length=0; draw(false);
}

// --- Countdown overlay
function countdown(n, done){
  let left=n; const tick=()=>{ if(left<=0) return done(); overlay(String(left===0?'':left)); left--; if(left>=0) setTimeout(tick, 700) }; tick() }

// --- Loop
function loop(ts){ if(!state.running) return; const dt = state.lastFrame ? Math.min(32, ts-state.lastFrame) : 16; state.lastFrame=ts; if(!state.paused) update(dt*(state.slowmo?0.45:1)); draw(false); requestAnimationFrame(loop) }

function update(dt){
  state.t += dt;
  const p = state.player;
  let vx = 0; if(state.keys.has('left')) vx -= p.speed; if(state.keys.has('right')) vx += p.speed; p.x = clamp(p.x+vx, 8, W-p.w-8)

  // Stars parallax
  for(const s of state.stars){ s.x = (s.x + s.vx + W) % W; s.y = (s.y + s.vy) % H }

  // Spawning obstacles (waves + slight randomness)
  state.lastSpawn += dt;
  if(state.lastSpawn >= state.spawnEvery){ state.lastSpawn=0; spawnWave() }

  // Update obstacles
  for(const o of state.obstacles){ o.y += o.v; o.rot += o.v*0.01; if(o.y>H+60) o.dead=true }
  state.obstacles = state.obstacles.filter(o=>!o.dead)

  // Powerups
  for(const u of state.powerups){ u.y += u.v; u.rot += 0.02; if(u.y>H+40) u.dead=true }
  state.powerups = state.powerups.filter(u=>!u.dead)

  // Collisions
  const pbb = {x:p.x,y:p.y,w:p.w,h:p.h};
  for(const o of state.obstacles){
    if(aabb(pbb,o)){
      if(state.shield>0){
        state.shield=0; explode(o.x+o.w/2,o.y+o.h/2,14, o.hue); o.dead=true; bump(10); beep('square', 320, .08, .06)
      } else { gameOver(); return }
    }
  }
  for(const u of state.powerups){
    if(aabb(pbb,u)){
      if(u.kind==='shield'){ state.shield=1; toast('Shield!'); beep('triangle', 720, .12, .07) }
      else { state.slowmo=3200; toast('Slow-mo!'); beep('sine', 540, .1, .06) }
      u.dead=true
    }
  }

  // Particles update
  for(const q of state.particles){ q.x+=q.vx; q.y+=q.vy; q.vx*=0.99; q.vy+=0.02; q.life-=dt; if(q.life<=0) q.dead=true }
  state.particles = state.particles.filter(q=>!q.dead)

  // Combo / multiplier
  state.comboTime = Math.max(0, state.comboTime - dt);
  if(state.comboTime===0) state.multi = 1;

  // Scoring & difficulty ramp
  state.score += dt * 0.02 * state.multi; // ~50 points per second * mult
  if(Math.floor(state.score)%120===0){
    state.baseSpeed = Math.min(8, state.baseSpeed + 0.01);
    state.spawnEvery = Math.max(360, state.spawnEvery - 1);
    if(Math.random()<0.03) dropPowerup();
  }

  // Slowmo timer & shake decay
  state.slowmo = Math.max(0, state.slowmo - dt);
  state.shake *= 0.9;
}

// --- Spawning helpers
function spawnWave(){
  const lane = W/6; const count = 1 + (Math.random()<0.65?0:1);
  for(let i=0;i<count;i++){
    const w = rnd(28, 92); const h = rnd(14, 28);
    const x = clamp(rnd(8, W-w-8), 8, W-w-8);
    const spd = state.baseSpeed + rnd(0.4, 1.4);
    state.obstacles.push({x, y:-40, w, h, v:spd, hue:rnd(170,260), rot:rnd(0,Math.PI), dead:false});
    if(settings.particles) trailBox(x+w/2,-40, 6, 'hsl('+Math.floor(rnd(170,260))+' 90% 60% / .95)');
  }
  // Combo reward for surviving waves
  state.multi = clamp(state.multi + 0.05, 1, 5);
  state.comboTime = state.comboMax;
}

function dropPowerup(){
  const kind = Math.random()<0.5?'shield':'slow';
  const x = rnd(20, W-40), v = state.baseSpeed*0.75 + rnd(0.2,0.6);
  state.powerups.push({kind, x, y:-30, w:26, h:26, v, rot:0, hue: kind==='shield'?140:45, dead:false});
}

// --- Visual FX
function bump(intensity=6){ if(!settings.shake) return; state.shake = Math.min(12, state.shake + intensity) }
function explode(x,y,n=12, hue){ if(!settings.particles) return; for(let i=0;i<n;i++){ const a = rnd(0,Math.PI*2); const sp = rnd(1,3.5); state.particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:rnd(280,600),col:`hsl(${hue||200} 90% 60% / .95)`,dead:false}) } }
function trailBox(x,y,n,col){ for(let i=0;i<n;i++){ state.particles.push({x:x+rnd(-6,6),y:y+rnd(-6,6),vx:rnd(-.4,.4),vy:rnd(.2,1),life:rnd(220,520),col:col,dead:false}) } }

let toastT=0, toastMsg='';
function toast(msg){ toastMsg=msg; toastT=1400 }

// --- Render
function draw(showGameOver){
  // camera shake
  const sx = (Math.random()*2-1)*state.shake, sy = (Math.random()*2-1)*state.shake;
  ctx.setTransform(1,0,0,1, sx, sy);
  ctx.clearRect(-sx,-sy,W,H);

  // Background starscape
  for(const s of state.stars){
    ctx.fillStyle = `rgba(255,255,255,${s.a})`; ctx.fillRect(s.x, s.y, s.s, s.s);
  }

  // Ground glow
  const g = ctx.createLinearGradient(0,H-160,0,H);
  g.addColorStop(0,'rgba(34,211,238,0.05)'); g.addColorStop(1,'rgba(167,139,250,0.10)');
  ctx.fillStyle=g; ctx.fillRect(0,H-160,W,160);

  // Powerups
  for(const u of state.powerups){
    ctx.save(); ctx.translate(u.x+u.w/2,u.y+u.h/2); ctx.rotate(u.rot);
    ctx.shadowBlur=16; ctx.shadowColor=`hsl(${u.hue} 90% 55%)`;
    ctx.fillStyle=`hsl(${u.hue} 90% 55%)`; roundRect(ctx,-u.w/2,-u.h/2,u.w,u.h,8); ctx.restore();
  }

  // Obstacles (with soft glow & rotation)
  for(const o of state.obstacles){
    ctx.save(); ctx.translate(o.x+o.w/2, o.y+o.h/2); ctx.rotate(o.rot);
    ctx.shadowBlur = 18; ctx.shadowColor = `hsl(${o.hue} 90% 60% / .9)`;
    ctx.fillStyle = `hsl(${o.hue} 90% 60% / .95)`; roundRect(ctx, -o.w/2, -o.h/2, o.w, o.h, 6); ctx.restore();
  }

  // Particles
  for(const q of state.particles){ ctx.globalAlpha = Math.max(0, q.life/600); ctx.fillStyle=q.col; ctx.fillRect(q.x,q.y,2,2); ctx.globalAlpha=1 }

  // Player (rounded square + thruster)
  const p = state.player;
  // trail
  if(settings.particles && state.running && !state.paused){ trailBox(p.x+p.w/2, p.y+p.h, 1, 'hsl(190 90% 60% / .9)') }
  ctx.save(); ctx.shadowBlur=22; ctx.shadowColor='hsl(190 90% 60%)'; ctx.fillStyle='hsl(190 90% 60%)'; roundRect(ctx,p.x,p.y,p.w,p.h,8); ctx.restore();

  // Shield ring
  if(state.shield>0){ ctx.save(); ctx.strokeStyle='rgba(255,255,255,0.8)'; ctx.lineWidth=2; ctx.setLineDash([6,6]); ctx.beginPath(); ctx.arc(p.x+p.w/2,p.y+p.h/2, 28+Math.sin(state.t*0.01)*2, 0, Math.PI*2); ctx.stroke(); ctx.restore(); }

  // HUD text
  ui.score.textContent = Math.floor(state.score);
  ui.mult.textContent = `${state.multi.toFixed(2)}×`;
  if(settings.highHUD){ ui.mult.style.color = state.multi>1? 'var(--success)':'var(--ink)' } else { ui.mult.style.color = '' }

  // Toast
  if(toastT>0){ toastT-=16; ctx.save(); ctx.fillStyle='rgba(0,0,0,0.45)'; const tw=220, th=46; ctx.fillRect(W/2-tw/2,H*0.24,tw,th); ctx.fillStyle='#fff'; ctx.font='700 16px system-ui,Segoe UI,Roboto,Arial'; ctx.textAlign='center'; ctx.fillText(toastMsg, W/2, H*0.24+28); ctx.restore() }

  // overlays
  if(showGameOver){ overlay(`Game Over`, `Score ${Math.floor(state.score)} • Best ${state.best}\nSpace to play again`) }
  else if(!state.running){ overlay(`Dodge the Blocks`, `Space / Play to start\nArrows or A / D to move`) }
  else if(state.paused){ overlay(`Paused`, `Press P to resume`) }

  // reset transform
  ctx.setTransform(1,0,0,1,0,0);
}

function overlay(title, subtitle=''){
  ctx.save();
  ctx.fillStyle='rgba(0,0,0,0.45)'; ctx.fillRect(0,0,W,H);
  ctx.translate(W/2,H/2); ctx.textAlign='center'; ctx.fillStyle='#fff';
  ctx.font='800 30px system-ui,Segoe UI,Roboto,Arial'; ctx.shadowColor='rgba(0,0,0,0.8)'; ctx.shadowBlur=12;
  ctx.fillText(title,0,-8);
  if(subtitle){
    ctx.font='600 14px system-ui,Segoe UI,Roboto,Arial';
    subtitle.split('\n').forEach((line,i)=>{ ctx.fillStyle='rgba(255,255,255,0.85)'; ctx.fillText(line,0,22+i*18) })
  }
  ctx.restore()
}

function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath(); ctx.fill()
}

// --- Start with initial paint
draw(false);
