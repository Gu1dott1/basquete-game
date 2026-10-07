#!/usr/bin/env node
/*
 * Simulador headless do SANGUE NO OCTÓGONO.
 *
 * Roda o <script> do index.html dentro do Node (com um DOM falso) e usa o próprio motor do jogo
 * para medir o balanceamento com milhares de lutas e carreiras — sem navegador.
 *
 * Uso:
 *   node tools/sim.js luta        planos x planos, estilos x estilos, valor de cada atributo,
 *                                 curva de OVR, tipos de vitória, decisões e estatísticas
 *   node tools/sim.js carreira    carreiras completas com dois robôs: "esperto" (segue o treinador,
 *                                 treina com critério) e "preguiçoso" (pula as lutas, treina no aleatório)
 *   node tools/sim.js tudo
 *
 * Opções: --n=3000 (lutas por cenário)  --c=300 (carreiras por robô)  --seed=42
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const args = process.argv.slice(2);
const opt = { n: 3000, c: 300, seed: 42 };
args.forEach(a => { const m = a.match(/^--(\w+)=(.*)$/); if (m) opt[m[1]] = Number(m[2]); });
const mode = args.find(a => !a.startsWith('--')) || 'tudo';

/* ---------- carregar o jogo ---------- */
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function stubElement() {
  const handler = {
    get(t, p) {
      if (p === Symbol.toPrimitive) return () => '';
      if (p === 'toString' || p === 'valueOf') return () => '';
      if (p === 'then') return undefined;
      if (p === 'length') return 0;
      if (p === 'children' || p === 'childNodes') return [];
      if (p === 'classList') return { add() {}, remove() {}, toggle() {}, contains() { return false; } };
      if (p === 'style') return t.__style || (t.__style = {});
      if (p === 'value') return t.__value || '';
      if (p === 'offsetWidth' || p === 'scrollTop') return 0;
      if (!(p in t)) t[p] = new Proxy(function () {}, handler);
      return t[p];
    },
    set(t, p, v) { if (p === 'value') t.__value = v; else t[p] = v; return true; },
    apply() { return new Proxy(function () {}, handler); },
  };
  return new Proxy(function () {}, handler);
}
function loadGame(seed) {
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const code = html.slice(html.indexOf('<script>') + 8, html.lastIndexOf('</script>'));
  const store = new Map();
  const doc = stubElement();
  const ctx = {
    document: doc,
    localStorage: {
      getItem: k => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    navigator: {},
    setTimeout: () => 0,
    clearTimeout: () => {},
    setInterval: () => 0,
    clearInterval: () => {},
    __SIM: true,
    console,
  };
  ctx.window = ctx;
  ctx.addEventListener = () => {};
  ctx.scrollTo = () => {};
  ctx.location = { reload() {} };
  vm.createContext(ctx);
  ctx.__rng = mulberry32(seed);
  vm.runInContext('Math.random = __rng;', ctx);
  vm.runInContext(code, ctx, { filename: 'index.html#script' });
  return ctx;
}

/* ---------- utilidades ---------- */
const pct = (a, b) => (b ? (100 * a / b).toFixed(1) : '0.0');
function table(title, header, rows) {
  console.log('\n' + title);
  const all = [header].concat(rows).map(r => r.map(String));
  const w = header.map((_, i) => Math.max(...all.map(r => (r[i] || '').length)));
  all.forEach((r, j) => {
    console.log('  ' + r.map((c, i) => (i === 0 ? c.padEnd(w[i]) : c.padStart(w[i]))).join('  '));
    if (j === 0) console.log('  ' + w.map(x => '-'.repeat(x)).join('  '));
  });
}
function flat(G, v) { const a = {}; G.ATTRS.forEach(x => { a[x.key] = v; }); return a; }

/* Uma luta completa sem interface. planY: string ou função(G) -> plano a cada round. */
function fight(G, Ydef, Odef, rounds, planY) {
  G.GF = G.newFight(Ydef, Odef, rounds);
  G.GF.quiet = true;
  let guard = 0;
  while (!G.GF.result && G.GF.round < G.GF.rounds && guard++ < 10) {
    const p = typeof planY === 'function' ? planY(G) : planY;
    G.gfRound(p);
  }
  G.gfResolve();
  return G.GF.result;
}
function mkDef(G, name, a, sty, extra) { return Object.assign({ name, a, sty, tr: [], dur: 75 }, extra || {}); }

/* ---------- experimentos de luta ---------- */
function runFights(G) {
  const N = opt.n;
  const plans = G.PLAN_KEYS;

  // 1) plano x plano (mesmo estilo "completo", mesmos atributos): plano do Y fixo vs plano do O fixo
  {
    const rows = [];
    const saved = G.aiPlan;
    plans.forEach(py => {
      const row = [G.PLANS[py].nome];
      let tot = 0;
      plans.forEach(po => {
        G.aiPlan = () => po;
        let w = 0;
        for (let i = 0; i < N / 4; i++) { const r = fight(G, mkDef(G, 'Y', flat(G, 70), 'completo'), mkDef(G, 'O', flat(G, 70), 'completo'), 3, py); if (r.won === true) w++; else if (r.won === null) w += 0.5; }
        const v = 100 * w / (N / 4); tot += v; row.push(v.toFixed(0));
      });
      row.push((tot / plans.length).toFixed(1));
      rows.push(row);
    });
    G.aiPlan = saved;
    table('PLANO x PLANO — % de vitória do plano da linha (atributos iguais, estilo completo)', ['plano'].concat(plans.map(p => G.PLANS[p].nome.slice(0, 9)), ['média']), rows);
  }

  // 2) cada plano fixo contra a IA de cada estilo (estilos iguais ao Y)
  {
    const rows = [];
    G.STY_KEYS.forEach(sk => {
      const row = [G.STY[sk].nome];
      plans.forEach(py => {
        let w = 0;
        for (let i = 0; i < N / 6; i++) {
          const r = fight(G, mkDef(G, 'Y', G.genAttrs(70, sk, 0), sk), mkDef(G, 'O', G.genAttrs(70, 'completo', 0), 'completo'), 3, py);
          if (r.won === true) w++; else if (r.won === null) w += 0.5;
        }
        row.push((100 * w / (N / 6)).toFixed(0));
      });
      let w = 0; // robô esperto: segue o treinador
      for (let i = 0; i < N / 10; i++) {
        G.GF = G.newFight(mkDef(G, 'Y', G.genAttrs(70, sk, 0), sk), mkDef(G, 'O', G.genAttrs(70, 'completo', 0), 'completo'), 3);
        G.GF.quiet = true;
        while (!G.GF.result && G.GF.round < G.GF.rounds) G.gfRound(G.coachBest(10));
        G.gfResolve();
        if (G.GF.result.won === true) w++; else if (G.GF.result.won === null) w += 0.5;
      }
      row.push((100 * w / (N / 10)).toFixed(0));
      rows.push(row);
    });
    table('ESTILO DO Y (OVR 70) vs COMPLETO (OVR 70, IA) — % de vitória por plano fixo do Y', ['estilo'].concat(plans.map(p => G.PLANS[p].nome.slice(0, 9)), ['treinador']), rows);
  }

  // 3) estilo x estilo (os dois com IA de plano)
  {
    const rows = [];
    const ks = G.STY_KEYS;
    ks.forEach(a => {
      const row = [G.STY[a].nome];
      let tot = 0;
      ks.forEach(b => {
        let w = 0;
        const n = Math.round(N / 8);
        for (let i = 0; i < n; i++) {
          const r = fight(G, mkDef(G, 'Y', G.genAttrs(70, a, 0), a), mkDef(G, 'O', G.genAttrs(70, b, 0), b), 3, g => G.aiPlan(g.GF.Y, g.GF.O));
          if (r.won === true) w++; else if (r.won === null) w += 0.5;
        }
        const v = 100 * w / n; tot += v; row.push(v.toFixed(0));
      });
      row.push((tot / ks.length).toFixed(1));
      rows.push(row);
    });
    table('ESTILO x ESTILO — % de vitória da linha (OVR 70 x 70, os dois com plano da IA)', ['estilo'].concat(ks.map(k => G.STY[k].nome.slice(0, 7)), ['média']), rows);
  }

  // 4) valor de cada atributo: +20 num atributo (o resto 70) vs 70 liso
  {
    const rows = [];
    const base = (() => { let w = 0; for (let i = 0; i < N; i++) { const r = fight(G, mkDef(G, 'Y', flat(G, 70), 'completo'), mkDef(G, 'O', flat(G, 70), 'completo'), 3, 'equilibrado'); if (r.won === true) w++; else if (r.won === null) w += 0.5; } return 100 * w / N; })();
    G.ATTRS.forEach(at => {
      const res = [];
      [50, 90].forEach(v => {
        let w = 0;
        for (let i = 0; i < N / 2; i++) { const a = flat(G, 70); a[at.key] = v; const r = fight(G, mkDef(G, 'Y', a, 'completo'), mkDef(G, 'O', flat(G, 70), 'completo'), 3, 'equilibrado'); if (r.won === true) w++; else if (r.won === null) w += 0.5; }
        res.push(100 * w / (N / 2));
      });
      rows.push([at.label, res[0].toFixed(1), res[1].toFixed(1), (res[1] - res[0]).toFixed(1)]);
    });
    table('VALOR DOS ATRIBUTOS — % vitória com o atributo em 50 e em 90 (resto 70, base ' + base.toFixed(1) + '%)', ['atributo', 'em 50', 'em 90', 'amplitude'], rows);
  }

  // 5) curva de OVR e tipos de resultado
  {
    const rows = [];
    [-15, -10, -5, -2, 0, 2, 5, 10].forEach(gap => {
      let w = 0, ko = 0, sub = 0, dec = 0, dr = 0, nc = 0;
      for (let i = 0; i < N; i++) {
        const sa = G.STY_KEYS[i % 8], sb = G.STY_KEYS[(i * 3 + 1) % 8];
        const r = fight(G, mkDef(G, 'Y', G.genAttrs(70 + gap, sa, 3), sa), mkDef(G, 'O', G.genAttrs(70, sb, 3), sb), 3, g => G.aiPlan(g.GF.Y, g.GF.O));
        if (r.won === true) w++;
        if (r.kind === 'ko' || r.kind === 'tko') ko++; else if (r.kind === 'sub') sub++; else if (r.kind === 'dec' || r.kind === 'tdec') dec++; else if (r.kind === 'draw') dr++; else nc++;
      }
      rows.push([(gap > 0 ? '+' : '') + gap, pct(w, N), pct(ko, N), pct(sub, N), pct(dec, N), pct(dr, N), pct(nc, N)]);
    });
    table('DIFERENÇA DE OVR (Y - O) — vitória do Y e como as lutas acabam (estilos variados, IA)', ['gap', 'vitória', 'KO/TKO', 'final.', 'decisão', 'empate', 'NC/DQ'], rows);
  }

  // 6) decisões e estatísticas médias por round
  {
    let dec = 0, un = 0, sp = 0, mj = 0, draws = 0, r108 = 0, rounds = 0, ss = 0, sa = 0, td = 0, tda = 0, kd = 0, ctrl = 0, fights = 0;
    for (let i = 0; i < N; i++) {
      const sa_ = G.STY_KEYS[i % 8], sb = G.STY_KEYS[(i * 5 + 2) % 8];
      const r = fight(G, mkDef(G, 'Y', G.genAttrs(70, sa_, 3), sa_), mkDef(G, 'O', G.genAttrs(70, sb, 3), sb), 3, g => G.aiPlan(g.GF.Y, g.GF.O));
      const Y = G.GF.Y.s, O = G.GF.O.s;
      fights++; ss += Y.ss + O.ss; sa += Y.sa + O.sa; td += Y.td + O.td; tda += Y.tda + O.tda; kd += Y.kd + O.kd; ctrl += Y.ctrl + O.ctrl;
      rounds += G.GF.round;
      if (r.kind === 'dec' || r.kind === 'draw') {
        dec++; if (r.decType === 'unanime') un++; else if (r.decType === 'dividida') sp++; else mj++;
        if (r.kind === 'draw') draws++;
        r.cards.forEach(c => c.forEach(j => { if (j.y === 8 || j.o === 8) r108++; }));
      }
    }
    console.log('\nDECISÕES E ESTATÍSTICAS (OVR 70 x 70, estilos variados)');
    console.log(`  decisões: unânime ${pct(un, dec)}% · dividida ${pct(sp, dec)}% · majoritária ${pct(mj, dec)}% · empates ${pct(draws, N)}% das lutas · cartões 10-8 ${pct(r108, dec * 3 * 3)}%`);
    console.log(`  por lutador por round: golpes sig. ${(ss / rounds / 2).toFixed(1)} de ${(sa / rounds / 2).toFixed(1)} (${pct(ss, sa)}%) · quedas ${(td / fights / 2).toFixed(2)}/${(tda / fights / 2).toFixed(2)} por luta · knockdowns ${(kd / fights).toFixed(2)} por luta · controle ${(ctrl / rounds / 2).toFixed(0)}s por round`);
  }
}

/* ---------- carreiras ---------- */
const TP_PRIORITY = { wrestler: ['chao', 'cardio'], jiujitsu: ['chao', 'fightIQ'], muaythai: ['poder', 'cardio'], boxe: ['precisao', 'velocidade'], trocador: ['poder', 'queixo'] };
function botSpend(G, smart) {
  const F = G.F;
  let guard = 0;
  while ((F.tp || 0) > 0 && guard++ < 200) {
    let key;
    if (smart) {
      // prioriza os atributos do estilo até ~6 acima da média, depois o mais barato/baixo
      const sk = G.PLAYER_STY[F.style];
      const pri = TP_PRIORITY[sk] || [];
      const avg = G.ATTRS.reduce((s, a) => s + F.attrs[a.key], 0) / G.ATTRS.length;
      key = pri.find(k => F.attrs[k] < avg + 6 && G.tpCost(F.attrs[k]) <= F.tp && F.attrs[k] < (F.potential || 99));
      if (!key) {
        const cands = G.ATTRS.map(a => a.key).filter(k => F.attrs[k] < (F.potential || 99) && G.tpCost(F.attrs[k]) <= F.tp);
        cands.sort((a, b) => F.attrs[a] - F.attrs[b]);
        key = cands[0];
      }
    } else {
      const cands = G.ATTRS.map(a => a.key).filter(k => F.attrs[k] < (F.potential || 99) && G.tpCost(F.attrs[k]) <= F.tp);
      key = cands[Math.floor(Math.random() * cands.length)];
    }
    if (!key) break;
    const before = F.tp; G.spendTP(key); if (F.tp === before) break;
  }
}
function botShop(G) {
  const F = G.F;
  ['camp', 'nutri', 'chin', 'box', 'wr'].forEach(id => {
    const it = G.SHOP.find(s => s.id === id);
    const owned = (F.bought && F.bought[id]) || 0;
    if (owned < it.max && F.money >= it.cost + 60000) G.buyItem(id);
  });
}
function botTeam(G) {
  const F = G.F;
  if (F.stage2 !== 'liga') return;
  const m = F.money || 0;
  const want = m > 2.5e6 ? 2 : (m > 4e5 ? 1 : 0);
  ['striking', 'grappling', 'fisico', 'fisio'].forEach(k => { if (G.teamLv(k) < want) { F.team = F.team || {}; F.team[k] = want; } });
  if (m > 6e5 && G.teamLv('empresario') < 1) { F.team.empresario = 1; }
}
/* academia: o esperto vai pra escola do estilo quando pode (e pro Combat Lab quando está no ranking) */
const GYM_FOR = { jiujitsu: 'tatame', muaythai: 'thai', boxe: 'boxe', wrestler: 'wrestle', trocador: 'thai' };
function botGym(G) {
  const F = G.F;
  const want = G.gymOk('lab') ? 'lab' : (GYM_FOR[G.PLAYER_STY[F.style]] || 'tatame');
  const k = G.gymOk(want) ? want : (G.gymOk('tatame') && want === 'wrestle' ? 'tatame' : null);
  if (k && F.gym !== k && (F.money || 0) > 3000) { F.gym = k; F.gymSince = F.wk || 0; }
}
/* escolhe a oferta: o esperto pesa o risco pelo OVR; o preguiçoso aceita a primeira */
function botPickOffer(G, smart) {
  const offs = G.F.offers || [];
  if (!smart) return 0;
  let best = 0, bestScore = -1e9;
  offs.forEach((o, i) => {
    const gap = G.F.ovr - o.ovr;
    let sc = gap * 2 + ({ title: 30, super: 18, risco: 8, short: 10, revanche: 6, fogo: 9, grande: 6, segura: 0, local: 0, prospecto: 2, defesa: 5, estrela: 8, callout: 8, rivalidade: 8, primeTitle: 30 }[o.kind] || 0);
    if (gap < -6) sc -= 25;
    if (o.title && gap >= -7) sc += 20;
    if (sc > bestScore) { bestScore = sc; best = i; }
  });
  return best;
}
function botWeek(G, smart) {
  const o = G.currentOpp, w = o.week;
  if (!smart || w.camp === 'curto') { if (!smart) { w.camp = w.camp === 'curto' ? 'curto' : 'casa'; w.media = 'respeito'; w.cut = 'normal'; } return; }
  const m = G.F.money || 0;
  const pick = ['elite', 'estudo', 'fisico', 'casa'].find(k => G.campCost(k) * 4 <= m) || 'casa';
  w.camp = pick;
  w.media = (G.F.ovr - o.ovr >= 2) ? 'provocar' : 'respeito';
  w.cut = G.cutRisk('pesado') < 0.08 ? 'pesado' : 'normal';
}
function divSnapshot(G) {
  const st = G.DIVSTATE[G.curDivName];
  const top = st.rank.filter(e => !e.you).slice(0, 5);
  return { champ: st.champ.ovr, top5: top.reduce((s, e) => s + e.ovr, 0) / Math.max(1, top.length) };
}
function runCareer(G, smart, idx) {
  const F = G.F;
  F.name = 'Bot ' + idx; F.nick = 'Bot' + idx;
  F.weight = G.WEIGHTS[idx % 8]; F.style = G.STYLES[idx % 5]; F.state = 'SP';
  G.DIVSTATE = {};
  G.F.w = 0; G.F.l = 0; G.F.d = 0; G.F.look = null;
  G.initFighterAttrs(); G.goCard();
  const log = { fights: 0, firstRanked: null, firstShot: null, firstTitle: null, titles: 0, defenses: 0, peakOvr: 0, ovrAt: {}, world: {}, cause: null, age: 0, wins: 0, losses: 0, injuries: 0, ach: 0, retiredNpc: 0 };
  while (!F.retired && log.fights < 160) {
    if (F.injuryPending) {
      log.injuries++;
      const c = G.injuryCosts(F.injuryPending);
      G.treatInjury(F.money >= c.full ? 'full' : (F.money >= c.basic ? 'basic' : 'none'));
      if (F.retired) break;
      continue;
    }
    if (F.pend && F.pend.length) { G.pendAuto(); continue; }
    if (F.pendingOffer) { G.chooseOffer(F.pendingOffer, 0); continue; }
    if (smart) { botShop(G); botTeam(G); botGym(G); }
    botSpend(G, smart);
    if (G.PHASE !== 'offers' && G.PHASE !== 'week' && G.PHASE !== 'prefight') G.goToOffers();
    if (F.retired) break;
    if (G.PHASE === 'offers' && !(F.offers && F.offers.length)) G.goToOffers();
    if (G.PHASE === 'offers') G.acceptOffer(botPickOffer(G, smart));
    if (G.PHASE === 'week') { botWeek(G, smart); G.confirmWeek(); }
    if (G.PHASE !== 'prefight') continue;
    const o = G.currentOpp;
    if (o.title && log.firstShot === null) log.firstShot = log.fights + 1;
    G.gfStart();
    G.GF.quiet = true;
    let guard = 0;
    let plan = smart ? (o.coach || 'equilibrado') : 'equilibrado';
    while (!G.GF.result && G.GF.round < G.GF.rounds && guard++ < 10) {
      G.gfRound(plan);
      if (smart && !G.GF.result && G.GF.round < G.GF.rounds) plan = G.coachBest(8);
    }
    G.gfResolve();
    const wasTitle = o.title;
    G.endFight(G.GF.result);
    log.fights++;
    if (G.GF.result.won === true) log.wins++; else if (G.GF.result.won === false) log.losses++;
    if (log.firstRanked === null && F.stage2 === 'liga' && G.playerRank() < 16) log.firstRanked = log.fights;
    if (wasTitle && F.champion && log.firstTitle === null) log.firstTitle = log.fights;
    log.peakOvr = Math.max(log.peakOvr, F.ovr);
    [10, 20, 30, 40].forEach(k => { if (log.fights === k) { log.ovrAt[k] = F.ovr; log.world[k] = divSnapshot(G); } });
  }
  log.ach = Object.keys(F.ach || {}).length;
  log.retiredNpc = G.WORLD.retired || 0;
  log.titles = F.titleWins || 0; log.defenses = F.titleDef || 0; log.cause = F.retireCause || 'limite'; log.age = F.age;
  log.money = F.careerEarn || 0;
  return log;
}
function median(a) { if (!a.length) return '-'; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; }
const WORLDROWS = [];
function runCareers(G) {
  const C = opt.c;
  const rows = [];
  [['esperto', true], ['preguiçoso', false]].forEach(([nm, smart]) => {
    const logs = [];
    for (let i = 0; i < C; i++) logs.push(runCareer(G, smart, i));
    const champs = logs.filter(l => l.titles > 0);
    const causes = {};
    logs.forEach(l => { causes[l.cause] = (causes[l.cause] || 0) + 1; });
    const ovr = k => median(logs.filter(l => l.ovrAt[k] != null).map(l => l.ovrAt[k]));
    const wavg = (k, f) => { const a = logs.filter(l => l.world[k]).map(l => l.world[k][f]); return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-'; };
    WORLDROWS.push([nm, '~85/' + [10, 20, 30, 40].map(k => wavg(k, 'champ')).join('/'), [10, 20, 30, 40].map(k => wavg(k, 'top5')).join('/'), (logs.reduce((s, l) => s + l.retiredNpc, 0) / C).toFixed(1), (logs.reduce((s, l) => s + l.ach, 0) / C).toFixed(1)]);
    rows.push([nm,
      pct(champs.length, C) + '%',
      (logs.reduce((s, l) => s + l.defenses, 0) / C).toFixed(1),
      median(logs.filter(l => l.firstRanked).map(l => l.firstRanked)),
      median(logs.filter(l => l.firstShot).map(l => l.firstShot)),
      median(logs.filter(l => l.firstTitle).map(l => l.firstTitle)),
      median(logs.map(l => l.fights)),
      pct(logs.reduce((s, l) => s + l.wins, 0), logs.reduce((s, l) => s + l.wins + l.losses, 0)) + '%',
      ovr(10) + '/' + ovr(20) + '/' + ovr(30),
      median(logs.map(l => l.peakOvr)),
      median(logs.map(l => l.age)),
      Object.keys(causes).map(k => k + ' ' + pct(causes[k], C) + '% (~' + median(logs.filter(l => l.cause === k).map(l => l.age)) + 'a)').join(', '),
    ]);
  });
  WORLDROWS.length && table('MUNDO VIVO — divisão do jogador (médias)', ['robô', 'campeão OVR luta 0/10/20/30/40', 'top 5 OVR luta 10/20/30/40', 'aposentadorias de NPC (11 divisões)', 'conquistas por carreira'], WORLDROWS);
  table('CARREIRAS (' + C + ' por robô) — medianas', ['robô', 'campeão', 'defesas', 'lutas p/ ranking', 'p/ 1ª disputa', 'p/ 1º título', 'lutas', 'vitórias', 'OVR luta 10/20/30', 'OVR máx', 'idade fim', 'motivo do fim'], rows);
}

/* ---------- main ---------- */
module.exports = { loadGame, fight, mkDef, flat };
if (require.main === module) {
  const G = loadGame(opt.seed);
  if (mode === 'luta' || mode === 'tudo') runFights(G);
  if (mode === 'carreira' || mode === 'tudo') { G.BAL.coachPre = 8; runCareers(G); }
}
