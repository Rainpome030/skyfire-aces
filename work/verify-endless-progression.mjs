import { spawn } from 'node:child_process';
import { readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ROOT = 'C:/Users/72707/Documents/Codex/2026-08-01/html';
const FILE = ROOT + '/outputs/skyfire-aces.html';
const CHROME = 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe';
const html = readFileSync(FILE, 'utf8');
const checks = [];

function check(name, pass, detail = '') {
  checks.push({ name, pass: !!pass });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${name}${detail ? ' | ' + detail : ''}`);
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

class BrowserRun {
  constructor() {
    this.port = 9896;
    this.profile = join(tmpdir(), `skyfire-endless-${process.pid}`);
    this.pending = new Map();
    this.id = 0;
    this.errors = [];
  }

  async start() {
    rmSync(this.profile, { recursive: true, force: true });
    mkdirSync(this.profile, { recursive: true });
    this.chrome = spawn(CHROME, [
      '--headless=new', '--disable-gpu', '--mute-audio',
      `--remote-debugging-port=${this.port}`, `--user-data-dir=${this.profile}`,
      '--window-size=1280,720', 'file:///' + FILE
    ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    this.chrome.stderr.on('data', data => {
      const message = String(data);
      if (/Uncaught|SyntaxError|TypeError|ReferenceError/i.test(message)) this.errors.push(message.trim());
    });
    let target;
    for (let i = 0; i < 100; i++) {
      try {
        const list = await (await fetch(`http://127.0.0.1:${this.port}/json/list`)).json();
        target = list.find(item => item.type === 'page');
        if (target) break;
      } catch {}
      await sleep(80);
    }
    if (!target) throw new Error('Chrome target not found');
    this.ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { this.ws.onopen = resolve; this.ws.onerror = reject; });
    this.ws.onmessage = event => {
      const message = JSON.parse(event.data);
      if (message.id && this.pending.has(message.id)) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result);
      } else if (message.method === 'Runtime.exceptionThrown') {
        this.errors.push(message.params.exceptionDetails?.exception?.description || message.params.exceptionDetails?.text || 'Runtime exception');
      }
    };
    await this.send('Runtime.enable');
    await this.send('Page.enable');
    await this.send('Page.reload', { ignoreCache: true });
    await sleep(350);
  }

  send(method, params = {}) {
    return new Promise((resolve, reject) => {
      const id = ++this.id;
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
    });
  }

  async eval(expression) {
    const result = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
    return result.result.value;
  }

  async stop() {
    try { this.ws?.close(); } catch {}
    try { this.chrome?.kill(); } catch {}
    await sleep(120);
    rmSync(this.profile, { recursive: true, force: true });
  }
}

check('静态存在等级永久强化池', html.includes('const RUN_UPGRADE_POOL'));
check('静态存在波次武器奖励入口', html.includes('function showWeaponRewardChoice'));
check('静态存在无尽四阶段状态机', html.includes("mission.wavePhase = 'mobs'") && html.includes("mission.wavePhase = 'reward'"));
check('静态存在五波Boss历史分组抽取', html.includes('bossHistory: []') && html.includes('function endlessBossHistoryGroups'));
check('波次生成每帧只调用一次', (html.match(/updateMissionSpawn\(dt\)/g) || []).length === 2);

const run = new BrowserRun();
let fatal = null;
try {
  await run.start();

  const initial = await run.eval(`(() => {
    startEndless(); transition.active = false; GAME.state = 'playing';
    return { wave: mission.waveIndex, phase: mission.wavePhase, alive: enemies.filter(e => !e.dead).length };
  })()`);
  check('开局直接进入第1波小兵阶段', initial.wave === 1 && initial.phase === 'mobs' && initial.alive >= 2, JSON.stringify(initial));

  const bossFlow = await run.eval(`(() => {
    enemies.forEach(e => { e.dead = true; });
    updateMissionSpawn(0.016);
    const pending = mission.wavePhase;
    updateMissionSpawn(1);
    const boss = { phase: mission.wavePhase, kind: mission.boss && mission.boss.kind, marked: !!(mission.boss && mission.boss.isWaveBoss) };
    mission.boss.dead = true; mission.bossKilled = true;
    updateMissionSpawn(0.016);
    const reward = { phase: mission.wavePhase, kind: upgradeChoice && upgradeChoice.kind, options: upgradeChoice && upgradeChoice.options.length, wave: upgradeChoice && upgradeChoice.wave };
    skipUpgradeChoice();
    const skipped = { phase: mission.wavePhase, choice: upgradeChoice };
    updateMissionSpawn(1);
    return { pending, boss, reward, skipped, history: mission.bossHistory.slice(), next: { wave: mission.waveIndex, phase: mission.wavePhase } };
  })()`);
  check('小兵清空后进入Boss预警', bossFlow.pending === 'bossPending', JSON.stringify(bossFlow));
  check('每波生成一个正式Boss', bossFlow.boss.phase === 'boss' && bossFlow.boss.kind === 'ace' && bossFlow.boss.marked, JSON.stringify(bossFlow.boss));
  check('Boss击败后出现武器三选一', bossFlow.reward.phase === 'reward' && bossFlow.reward.kind === 'weapon' && bossFlow.reward.options === 3 && bossFlow.reward.wave === 1, JSON.stringify(bossFlow.reward));
  check('击败Boss后按波次写入Boss历史', bossFlow.history.join(',') === 'ace', JSON.stringify(bossFlow.history));
  check('放弃武器奖励后进入下一波', bossFlow.skipped.phase === 'intermission' && bossFlow.skipped.choice === null && bossFlow.next.wave === 2 && bossFlow.next.phase === 'mobs', JSON.stringify(bossFlow));

  const elites = await run.eval(`(() => {
    const sampleHistory = ['ace', 'eye', 'king', 'ace', 'king', 'eye', 'king', 'ace', 'eye', 'king'];
    const originalRandom = Math.random;
    const selectWith = (wave, draws, history = sampleHistory) => {
      let index = 0;
      Math.random = () => draws[index++] ?? 0;
      return selectEndlessEliteKinds(wave, history);
    };
    const wave5 = selectWith(5, [0]);
    const wave6 = selectWith(6, [0]);
    const wave7 = selectWith(7, [0.999999]);
    const wave11 = selectWith(11, [0, 0]);
    const wave12 = selectWith(12, [0.999999, 0.999999]);
    const extendedHistory = sampleHistory.concat(['ace', 'eye', 'king', 'ace', 'eye'], ['king', 'eye', 'ace', 'king', 'eye']);
    const wave16 = selectWith(16, [0, 0, 0], extendedHistory);
    const wave21 = selectWith(21, [0, 0, 0, 0], extendedHistory);
    const incomplete = selectEndlessEliteKinds(11, sampleHistory.slice(0, 9));
    Math.random = originalRandom;

    mission.bossHistory = ['ace', 'ace', 'ace', 'ace', 'ace', 'king', 'king', 'king', 'king', 'king'];
    upgradeChoice = null; enemies = []; spawnEndlessWave(11);
    const spawned11 = {
      selected: mission.waveEliteKinds.slice(),
      elites: enemies.filter(e => e.eliteMinion).map(e => e.kind)
    };
    return { wave5, wave6, wave7, wave11, wave12, wave16, wave21, incomplete, spawned11 };
  })()`);
  check('第5波尚无历史Boss精英', elites.wave5.length === 0, JSON.stringify(elites.wave5));
  check('第6波从第一组五个Boss中抽取1个', elites.wave6.join(',') === 'ace', JSON.stringify(elites.wave6));
  check('第7波重新从第一组抽取而非沿用第6波', elites.wave7.join(',') === 'king', JSON.stringify(elites.wave7));
  check('第11波从两组Boss中各抽1个', elites.wave11.join(',') === 'ace,eye', JSON.stringify(elites.wave11));
  check('第12波重新从两组各抽1个', elites.wave12.join(',') === 'king,king', JSON.stringify(elites.wave12));
  check('第16/21波继续增加为3/4组且不受Boss种类数限制', elites.wave16.length === 3 && elites.wave21.length === 4, JSON.stringify({ wave16: elites.wave16, wave21: elites.wave21 }));
  check('不足五个Boss的历史组不会提前生效', elites.incomplete.length === 1, JSON.stringify(elites.incomplete));
  check('第11波实际生成两组各自选中的Boss精英', elites.spawned11.selected.join(',') === 'ace,king' && elites.spawned11.elites.join(',') === 'ace,king', JSON.stringify(elites.spawned11));

  const weapons = await run.eval(`(() => {
    GAME.weaponCopies = {}; GAME.weapons = []; GAME.synth = {}; player.weapon = defaultWeapon(); mission.wavePhase = 'mobs';
    const take = (id, quality) => { const option = { id, quality }; upgradeChoice = { kind: 'weapon', options: [option] }; applyUpgrade(option); };
    take('scatter', 'rare');
    take('scatter', 'common');
    const sameType = { id: player.weapon.id, quality: player.weapon.quality, common: weaponCopyProgress('scatter', 'common') };
    take('heavy', 'common');
    const differentType = { id: player.weapon.id, quality: player.weapon.quality };
    take('scatter', 'common');
    const returnType = { id: player.weapon.id, quality: player.weapon.quality, common: weaponCopyProgress('scatter', 'common') };
    take('scatter', 'common');
    const merged = { id: player.weapon.id, quality: player.weapon.quality, common: weaponCopyProgress('scatter', 'common'), good: weaponCopyProgress('scatter', 'good') };
    take('laser', 'rare'); player.weapon.ammo = 0; switchWeaponBack();
    take('laser', 'common');
    const limited = { id: player.weapon.id, quality: player.weapon.quality, common: weaponCopyProgress('laser', 'common'), ammo: player.weapon.ammo };
    return { sameType, differentType, returnType, merged, limited };
  })()`);
  check('同类型低品质只累计且不降级', weapons.sameType.id === 'scatter' && weapons.sameType.quality === 'rare' && weapons.sameType.common === 1, JSON.stringify(weapons.sameType));
  check('不同类型立即切换到新武器', weapons.differentType.id === 'heavy' && weapons.differentType.quality === 'common', JSON.stringify(weapons.differentType));
  check('切回旧类型时装备最高品质并继续累计', weapons.returnType.id === 'scatter' && weapons.returnType.quality === 'rare' && weapons.returnType.common === 2, JSON.stringify(weapons.returnType));
  check('三个普通合成一个良好且稀有装备不降级', weapons.merged.quality === 'rare' && weapons.merged.common === 0 && weapons.merged.good === 1, JSON.stringify(weapons.merged));
  check('有限武器耗尽后品质产权仍保留', weapons.limited.id === 'laser' && weapons.limited.quality === 'rare' && weapons.limited.common === 1 && weapons.limited.ammo > 0, JSON.stringify(weapons.limited));

  const buffs = await run.eval(`(() => {
    GAME.upgrades = {}; GAME.pendingBuffChoices = 1; upgradeChoice = null; mission.wavePhase = 'mobs';
    showUpgradeChoice();
    const offered = { kind: upgradeChoice && upgradeChoice.kind, count: upgradeChoice && upgradeChoice.options.length };
    const projectile = RUN_UPGRADE_POOL.find(u => u.id === 'projectiles');
    upgradeChoice = { kind: 'buff', options: [projectile], level: GAME.level };
    applyUpgrade(projectile);
    player.weapon = defaultWeapon(); player.fireCd = 0; bullets = []; player.alive = true;
    firePlayerGuns();
    return { offered, stacks: GAME.upgrades.projectiles, bullets: bullets.length };
  })()`);
  check('等级提升提供永久Buff三选一', buffs.offered.kind === 'buff' && buffs.offered.count === 3, JSON.stringify(buffs.offered));
  check('弹丸+1永久强化真实影响射击', buffs.stacks === 1 && buffs.bullets === 3, JSON.stringify(buffs));

  const rewardQueue = await run.eval(`(() => {
    startEndless(); transition.active = false; GAME.state = 'playing';
    enemies.forEach(e => { e.dead = true; }); updateMissionSpawn(0.016); updateMissionSpawn(1);
    GAME.exp = expNeeded(GAME.level) - 1; mission.boss.exp = 1; GAME.combo = 0; upgradeChoice = null;
    killPlane(mission.boss);
    updateMissionSpawn(0.016);
    const first = { phase: mission.wavePhase, kind: upgradeChoice && upgradeChoice.kind, pending: GAME.pendingBuffChoices };
    skipUpgradeChoice();
    updateMissionSpawn(0.016);
    const second = { phase: mission.wavePhase, kind: upgradeChoice && upgradeChoice.kind, options: upgradeChoice && upgradeChoice.options.length };
    return { first, second };
  })()`);
  check('Boss击杀升级时先处理永久Buff', rewardQueue.first.phase === 'reward' && rewardQueue.first.kind === 'buff', JSON.stringify(rewardQueue.first));
  check('永久Buff处理后武器奖励不会丢失', rewardQueue.second.phase === 'reward' && rewardQueue.second.kind === 'weapon' && rewardQueue.second.options === 3, JSON.stringify(rewardQueue.second));
  check('运行过程无Runtime异常', run.errors.length === 0, run.errors.join(' | '));
} catch (error) {
  fatal = error;
  console.error(error.stack || error.message);
} finally {
  await run.stop();
}

const passed = checks.filter(item => item.pass).length;
console.log(`\nRESULT ${passed}/${checks.length} checks passed`);
if (fatal || passed !== checks.length) process.exitCode = 1;
