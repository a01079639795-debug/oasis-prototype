// Жадный бот для проверки баланса. Запуск в консоли страницы игры: вставить файл, затем botRuns(20).
(function () {
  const G = window.__oasis;
  const SIZE = 7;
  function evalBoard() {
    const L = G.L; const W = G.computeWater();
    let s = 0; let freeSlots = 0;
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const c = L.grid[y][x]; if (!c.t) continue; const T = G.TILES[c.t.id];
      if (T.plant) {
        const w = W.watered.get(c.t);
        const nx = Math.min(T.max, c.t.stage + 1);
        if (w) s += (T.yield[nx] || 0) + (T.yield[T.max] || 0) * 0.7 + (T.harvest ? 3 : 0) + (T.windbreakAt !== undefined ? 0.4 : 0);
        else s -= 2 + c.t.stage * 2;
      }
    }
    // запас воды рядом с пустыми клетками
    W.left.forEach((v, k) => {
      let adj = 0;
      for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
        const c = L.grid[y][x]; if (c.t || c.g === 'salt') continue;
        if ([[0, 1], [1, 0], [0, -1], [-1, 0]].some(([dx, dy]) => { const yy = y + dy, xx = x + dx; return yy >= 0 && xx >= 0 && yy < SIZE && xx < SIZE && W.comp[yy][xx] === k; })) adj++;
      }
      freeSlots += Math.min(v, adj);
    });
    return s + freeSlots * 0.9;
  }
  function stepDay() {
    const L = G.L;
    for (let guard = 0; guard < 20; guard++) {
      const base = evalBoard();
      let best = null;
      L.hand.forEach((id, hi) => {
        const C = G.CARDS[id];
        const cost = (id === 'canal' && L.freeCanal) ? 0 : C.cost;
        if (cost > L.energy) return;
        if (C.kind === 'action' && !C.target) {
          let v = 0;
          if (id === 'seeds') v = 1.5; if (id === 'caravan') v = 3;
          if (id === 'rain') { const W = G.computeWater(); let n = 0; W.watered.forEach((w) => { if (!w) n++; }); v = n * 3 - 1; }
          if (!best || v > best.v) best = { v, hi };
          return;
        }
        for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
          const c = L.grid[y][x];
          if (C.kind === 'tile') {
            if (c.t) continue; const T = G.TILES[C.tile];
            if (c.g === 'salt' && T.plant && !T.saltOk && !G.run.relics.includes('filter')) continue;
            c.t = { id: C.tile, stage: 0, uid: 9999 };
            let v = evalBoard() - base;
            const f = L.fc[L.day + 1] || L.fc[L.day] || {};
            if ((C.tile === 'wall') && f.storm) v += 1.2;
            c.t = null;
            v -= cost * 0.6;
            if (!best || v > best.v) best = { v, hi, x, y };
          } else if (C.target === 'plant' && c.t && G.TILES[c.t.id].plant) {
            const T = G.TILES[c.t.id];
            const v = id === 'compost' ? (c.t.stage < T.max ? 2.5 : -1) : (G.computeWater().watered.get(c.t) ? -1 : 3 + c.t.stage);
            if (!best || v > best.v) best = { v, hi, x, y };
          }
        }
      });
      if (!best || best.v <= 0.05) break;
      G.playCard(best.hi, best.x, best.y);
      if (!G.L) return;
    }
  }
  window.botStep = stepDay;
  window.botLevel = function () {
    const startIdx = G.run.level;
    while (G.L && G.run && G.run.level === startIdx) {
      if (G.L.won) { const r = { idx: startIdx, life: G.L.life, target: G.L.target, day: G.L.day, days: G.L.days, win: true }; G.finishLevel(true); return r; }
      stepDay();
      const L = G.L; const last = L.day >= L.days; const life = L.life, target = L.target, day = L.day, days = L.days;
      G.endDay();
      if (!G.run || G.run.level !== startIdx) return { idx: startIdx, life, target, day, days, win: !!G.run };
    }
  };
  window.botRuns = function (n) {
    const res = [];
    for (let k = 0; k < n; k++) {
      localStorage.removeItem('oasis_run');
      G.newRun();
      const out = [];
      while (G.run) {
        G.startLevel();
        const r = botLevel(); out.push(r);
        if (!r.win || !G.run) break;
        // награда: первая карта и первая реликвия
        const c = document.querySelector('#rc .card'); if (c) c.click();
        const rr = document.querySelector('#rr .rp'); if (rr) rr.click();
        G.showMap();
      }
      res.push(out);
    }
    return res;
  };
})();
