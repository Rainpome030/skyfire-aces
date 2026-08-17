// ---------- audio ----------
// ---------- P34.2 命中/击毁音频消费聚合合同 + 引擎声生命周期 + 双路音量 ----------
const SFX_VOLUME_DEFAULT = 1.0;      // 音效音量默认值(0~1), 可调; 旧存档无字段用此默认
const ENGINE_VOLUME_DEFAULT = 1.0;   // 引擎音量默认值(0~1), 可调; 旧存档无字段用此默认
const HIT_SFX_MIN_INTERVAL = 0.06;   // 普通命中音效最小触发间隔(秒), 可调; kill 事件不受此限
const HIT_SFX_FREQ = 1250;           // 普通命中音效基频(Hz, square 短促高频)
const HIT_SFX_DUR = 0.05;            // 普通命中音效时长(秒)
const KILL_SFX_FREQ = 260;           // 击毁音效基频(Hz, sawtooth 下扫, 与命中明显区分)
const KILL_SFX_DUR = 0.22;           // 击毁音效时长(秒)
const ENGINE_GAIN_MIN = 0.018;       // 飞行底噪最小增益(与基线一致)
const ENGINE_GAIN_RANGE = 0.035;     // 飞行底噪随速度增益范围(与基线一致)
const ENGINE_GAIN_MAX = 0.06;        // 飞行底噪增益上限(防过载), 可调
const ENGINE_GAIN_TAU = 0.1;         // 引擎增益平滑时间常数(秒, setTargetAtTime), 可调
const AudioSys = {
  ctx: null, master: null, enabled: true, musicOn: false,
  paused: false, _lastHitSfxT: -999,   // P34.2: 暂停冻结标志 + hit 音效上次触发时间(gameTime)
  engineOsc: null, engineGain: null, engineFilter: null,
  nextBeat: 0, beat: 0, musicTimer: null,
  init() {
    if (this.ctx) { this.resume(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.6;
      this.master.connect(this.ctx.destination);
      this.startEngine();
      this.startMusic();
    } catch (err) { /* audio unavailable */ }
  },
  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
  toggleMute() {
    this.enabled = !this.enabled;
    if (this.master) this.master.gain.value = this.enabled ? 0.6 : 0;
    return this.enabled;
  },
  _throttle: {},
  throttled(name, ms, fn) {
    const now = performance.now();
    if (now - (this._throttle[name] || 0) < ms) return;
    this._throttle[name] = now;
    fn();
  },
  sfxVol() {   // P34.2: 音效通道音量(0~1), 旧存档无字段用默认; 与 master(0.6 总线 + M 键)相乘
    return (typeof save !== 'undefined' && save && typeof save.sfxVolume === 'number') ? save.sfxVolume : SFX_VOLUME_DEFAULT;
  },
  engineVol() {   // P34.2: 引擎通道音量(0~1), 旧存档无字段用默认
    return (typeof save !== 'undefined' && save && typeof save.engineVolume === 'number') ? save.engineVolume : ENGINE_VOLUME_DEFAULT;
  },
  tone(freq, dur, type, vol, slide, when) {
    if (!this.ctx || !this.enabled || this.paused) return;   // P34.2: 暂停冻结全部游戏音效
    const v = ((vol || 0.15) * this.sfxVol());   // P34.2: 音效通道音量缩放(0 → 不建任何节点)
    if (v <= 0.0001) return;
    const t = this.ctx.currentTime + (when || 0);
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(Math.max(20, freq), t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq + slide), t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master);
    o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, q, slideTo) {
    if (!this.ctx || !this.enabled || this.paused) return;   // P34.2: 暂停冻结全部游戏音效
    const v = ((vol || 0.3) * this.sfxVol());   // P34.2: 音效通道音量缩放(0 → 不建任何节点)
    if (v <= 0.0001) return;
    const t = this.ctx.currentTime;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buf;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq || 1200;
    f.Q.value = q || 1;
    if (slideTo) f.frequency.exponentialRampToValueAtTime(Math.max(40, slideTo), t + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(this.master);
    src.start(t);
  },
  gun() { this.throttled('gun', 30, () => this.noise(0.07, 0.10, 2300, 0.8, 700)); },
  missileLaunch() { this.noise(0.5, 0.18, 900, 0.7, 2600); this.tone(220, 0.35, 'sawtooth', 0.05, 420); },
  explosion(big) {
    this.throttled('explosion', 60, () => {
      this.noise(big ? 1.1 : 0.55, big ? 0.5 : 0.32, big ? 260 : 420, 0.6, 60);
      this.tone(big ? 70 : 110, big ? 0.8 : 0.4, 'sine', big ? 0.5 : 0.3, -45);
    });
  },
  hit() { this.throttled('hit', 30, () => this.tone(900, 0.06, 'square', 0.08, -300)); },
  lockBeep() { this.tone(1250, 0.07, 'square', 0.07); },
  warning() { this.tone(980, 0.16, 'sawtooth', 0.10, 120); this.tone(740, 0.16, 'sawtooth', 0.08, -80, 0.14); },
  pickup() { this.tone(660, 0.12, 'sine', 0.16, 0); this.tone(990, 0.18, 'sine', 0.14, 0, 0.08); },
  click() { this.tone(520, 0.06, 'square', 0.06, 60); },
  score() { this.tone(880, 0.08, 'sine', 0.10); this.tone(1320, 0.12, 'sine', 0.09, 0, 0.06); },
  warningLaunch() { this.warning(); },
  roll() {
    if (!this.ctx || !this.enabled) return;
    this.noise(0.55, 0.10, 420, 0.6, 2100);
    this.tone(240, 0.5, 'sine', 0.05, 260);
  },
  startEngine() {
    if (!this.ctx || this.engineOsc) return;
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.value = 70;
    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.value = 420;
    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.value = 0;
    this.engineOsc.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);
    this.engineGain.connect(this.master);
    this.engineOsc.start();
  },
  updateEngine(ratio) {
    if (!this.ctx || !this.engineOsc || !this.enabled) return;
    const t = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(55 + ratio * 90, t, 0.08);
    this.engineFilter.frequency.setTargetAtTime(300 + ratio * 600, t, 0.08);
    // P34.2: 非飞行(菜单/暂停/结算/标题)ratio=0 → 目标增益 0(基线恒有 0.018 底噪);
    //        飞行时增益有上限不过载; setTargetAtTime 平滑无跳变; 乘引擎通道音量。
    const base = ratio > 0 ? ENGINE_GAIN_MIN + ratio * ENGINE_GAIN_RANGE : 0;
    const target = Math.min(ENGINE_GAIN_MAX, base) * this.engineVol();
    this.engineGain.gain.setTargetAtTime(target, t, ENGINE_GAIN_TAU);
  },
  consumeHitQueue() {   // P34.2: 每帧消费 HitFeedback.queue 聚合事件合同(读后清空; hit 0.06s 限频; kill 即时)
    if (typeof HitFeedback === 'undefined' || !HitFeedback.queue) return;
    const q = HitFeedback.queue;
    if (!q.length) return;
    const evts = q.splice(0, q.length);
    for (const ev of evts) {
      if (ev.type === 'hit') {
        if (gameTime - this._lastHitSfxT < HIT_SFX_MIN_INTERVAL) continue;
        this._lastHitSfxT = gameTime;
        this.tone(HIT_SFX_FREQ + Math.min(ev.count || 1, HIT_AGG_MAX_COUNT) * 90, HIT_SFX_DUR, 'square', 0.05, -250);
      } else if (ev.type === 'kill') {
        this.tone(KILL_SFX_FREQ, KILL_SFX_DUR, 'sawtooth', 0.09, -120);   // 击毁: 低沉下扫(与命中 square 高频区分), 即时不限频
        this.noise(0.12, 0.06, 520, 0.8, 180);
      }
    }
  },
  setPaused(on) {   // P34.2: 暂停冻结(状态驱动, 幂等): SFX 门控 + BGM 静音并停止调度; 其余状态解除
    if (on === this.paused) return;
    this.paused = on;
    if (typeof MusicSys !== 'undefined' && MusicSys) {
      MusicSys.paused = on;
      if (on && MusicSys.stop) MusicSys.stop();
    }
  },
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    this.nextBeat = this.ctx.currentTime + 0.2;
    this.beat = 0;
    this.musicTimer = setInterval(() => this.scheduleMusic(), 250);
  },
  scheduleMusic() {
    if (!this.ctx || !this.enabled || !this.musicOn) return;
    const bass = [110, 87.31, 130.81, 98];
    const arp = [220, 261.63, 329.63, 440, 329.63, 261.63];
    while (this.nextBeat < this.ctx.currentTime + 0.6) {
      const bar = Math.floor(this.beat / 4) % 4;
      const step = this.beat % 4;
      const when = this.nextBeat - this.ctx.currentTime;
      if (step === 0) this.tone(bass[bar], 0.9, 'sine', 0.05, 0, when);
      const n = arp[(bar * 2 + step) % arp.length];
      if (step % 2 === 0) this.tone(n * (step === 0 ? 0.5 : 1), 0.34, 'triangle', 0.028, 0, when);
      if (step === 3) this.tone(n * 2, 0.3, 'sine', 0.022, 0, when);
      this.nextBeat += 0.34;
      this.beat++;
    }
  }
};

/* ============================================================================
 * MusicSys — 《苍穹之翼·单机空战》程序化 BGM 合成器
 * 任务:batch1/task-04(任务书:.orchestra/tasks/batch1/task-04/brief.md)
 * 文件类型:纯 JS 片段(无 <script>/HTML/import/export),可被总控直接拼接进主文件
 *
 * 特性:
 *  - 3 首循环曲目:title(66BPM,Am-F-C-G)/ combat(132BPM,A 小调)/ boss(100BPM,D 小调)
 *  - 全部 Web Audio 原生节点合成(Oscillator / Gain / BiquadFilter / Delay /
 *    AudioBufferSourceNode 白噪声),零外部素材
 *  - lookahead 无缝循环:每 100ms 检查一次,提前 0.3s(> 任务书 0.2s,双倍调度余量)
 *    排下所有步进;全部基于 ctx.currentTime 绝对时间排程,不随 setInterval 抖动漂移
 *  - 可复现:文件中所有"随机"(噪声采样 / 力度抖动)均来自固定种子 mulberry32,
 *    文件载入播种一次、每次 play() 按曲目固定种子重新播种 → 同一曲每次播放完全一致
 *  - 优雅降级:AudioContext 缺失 / 创建失败 / 设备不可用 → 所有方法静默 no-op,绝不抛错
 *  - 静音联动:主游戏 M 键翻转 AudioSys.enabled;本模块在 toggleMute() / update() /
 *    调度 tick 中持续读取该标志决定是否输出(详见 toggleMute 与 _syncMuteFromGame 注释)
 *
 * 总控挂接:
 *   1) setState 时:title/briefing/complete/gameover/settings → MusicSys.play('title');
 *      playing 且非 boss 关 → MusicSys.play('combat');playing 且 mission.boss → play('boss')
 *   2) M 键静音处理处追加 MusicSys.toggleMute()(与 AudioSys.toggleMute() 并列调用即可;
 *      即使漏挂,update()/调度 tick 也会自动跟随 AudioSys.enabled)
 *   3) 主循环 loop() 中调用 MusicSys.update(dt)(可选,音量平滑 + 静音跟随)
 *   注意:主文件 AudioSys.startMusic() 自带一个简单循环,集成时应将其停用
 *        (如 AudioSys.musicOn = false 或直接移除其 musicTimer),避免与 MusicSys 重叠。
 * ============================================================================ */
var MusicSys = (function () {
  'use strict';

  /* ---------- 可复现随机:mulberry32(固定种子,绝不使用裸 Math.random) ---------- */
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      var t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  var RNG = mulberry32(20260808);                 // 文件载入即播种(用于噪声缓冲等)
  function reseed(seed) { RNG = mulberry32(seed); } // play() 时按曲目重新播种
  function rnd() { return RNG(); }

  /* ---------- 工具 ---------- */
  // MIDI 音符号 → 频率(A4=440Hz)
  function mf(m) { return 440 * Math.pow(2, (m - 69) / 12); }
  // 力度轻微抖动(±10%),来自固定种子 RNG → 每曲每次播放一致
  function human(v) { return v * (0.9 + rnd() * 0.2); }

  /* ---------- 曲目数据 ----------
   * 每曲:bars 个小节循环,每小节 8 个 8 分步进;步长 = 60/bpm/2
   * chords[midi]: [根音, 三音, 五音];bass[midi]: 每小节根音;motif[midi]: 每小节 8 步,0=休止
   */
  var TRACKS = {
    /* 标题曲 · 舒缓神秘:66 BPM,和弦 Am - F - C - G(每小节 4 拍)
       音色:三角波琶音 + 慢速颤音(4.5Hz LFO 调制频率)→ 8 分音符延迟反馈链(混响感);
             低音根音(正弦,低八度长音)+ 极轻三角波铺底和弦(根音+三音) */
    title: {
      bpm: 66, seed: 6601, bars: 4,
      delayTime: 0.4545, feedback: 0.38, delayFreq: 2100, wet: 0.45, sendAmt: 0.5,
      chords: [
        [45, 48, 52],  // Am: A2 C3 E3
        [41, 45, 48],  // F:  F2 A2 C3
        [48, 52, 55],  // C:  C3 E3 G3
        [43, 47, 50]   // G:  G2 B2 D3
      ]
    },
    /* 战斗曲 · 紧张推进:132 BPM,A 小调,和弦根音 Am - F - Am - E
       音色:方波低音脉冲(低通 240Hz,8 分音符持续,根音/高八度交替)
             + 锯齿波小调动机(低通 1400Hz,短促 8 分音符,4 小节动机带休止)
             + 军鼓式噪声脉冲(白噪声 → 高通 1800Hz + 快包络,第 2/4 拍) */
    combat: {
      bpm: 132, seed: 13201, bars: 4,
      delayTime: 0.2273, feedback: 0.3, delayFreq: 2500, wet: 0.35, sendAmt: 0.3,
      bass: [45, 41, 45, 40],            // A2 F2 A2 E2
      motif: [
        [69, 0, 72, 71, 74, 0, 72, 69],  // A4 - C5 B4 D5 - C5 A4
        [0, 69, 72, 0, 77, 76, 0, 72],   // -  A4 C5 - F5 E5 - C5
        [0, 0, 76, 0, 0, 0, 74, 0],      // -  -  E5 - -  -  D5 -
        [76, 0, 75, 76, 0, 71, 74, 0]    // E5 - D#5 E5 - B4 D5 -(E 属和弦,导音 D# 制造张力)
      ]
    },
    /* Boss 曲 · 压迫史诗:100 BPM,D 小调,D2-C#2-C2-B1 半音下行持续低音
       音色:锯齿波持续低音(低通 300Hz,每小节一个 2.35s 长音)
             + 锯齿波半音下行动机(低通 900Hz,每小节 4 个短促下行音)
             + 大鼓(正弦 120→40Hz 扫频,第 1/3 拍)+ 噪声点缀(第 1/3 拍带通、第 2/4 拍高通) */
    boss: {
      bpm: 100, seed: 10001, bars: 4,
      delayTime: 0.3, feedback: 0.35, delayFreq: 1600, wet: 0.4, sendAmt: 0.35,
      bass: [38, 37, 36, 35],            // D2 C#2 C2 B1
      motif: [
        [62, 61, 60, 59, 0, 0, 0, 0],    // D4 C#4 C4 B3
        [61, 60, 59, 57, 0, 0, 0, 0],    // C#4 C4 B3 A3
        [60, 59, 57, 56, 0, 0, 0, 0],    // C4 B3 A3 G#3
        [59, 57, 56, 57, 0, 0, 0, 0]     // B3 A3 G#3 A3(收在 A,回环)
      ]
    }
  };

  /* ---------- MusicSys 公共对象 ---------- */
  var api = {
    ctx: null,          // AudioContext(惰性创建,首次播放时 new)
    playing: null,      // 当前曲目 key:'title' | 'combat' | 'boss'
    volume: 0.16,       // 总输出音量(相对现有音效平衡,任务书指定)
    master: null,       // 总 GainNode
    timers: [],         // 调度器句柄集合(stop() 全部 clearInterval)
    muted: false,
    paused: false,      // P34.2: 暂停时静音并冻结调度(AudioSys.setPaused 镜像)

    _noiseBuf: null,    // 共享白噪声缓冲(固定种子填充,可复现)
    _send: null,        // 当前曲目延迟发送节点
    _stepIndex: 0,      // 绝对步进计数(循环取模)
    _nextTime: 0,       // 下个步进的绝对排程时间

    /* init():创建 AudioContext + master GainNode(不自动播放)。
       失败 / 不可用时置空 ctx,后续所有方法静默 no-op。 */
    init: function () {
      if (this.ctx) { this.resume(); return; }
      try {
        var AC = (typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)) ||
                 (typeof globalThis !== 'undefined' && globalThis.AudioContext);
        if (!AC) throw new Error('WebAudio unsupported');
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
        this._noiseBuffer();   // 用文件载入种子填充噪声缓冲 → 内容固定
      } catch (err) {
        /* 音频设备不可用:优雅降级,全部方法 no-op,绝不让游戏崩溃 */
        this.ctx = null; this.master = null;
      }
    },
    resume: function () {
      if (this.ctx && this.ctx.state === 'suspended') { try { this.ctx.resume(); } catch (e) {} }
    },

    /* play(key):停掉当前曲目,启动新曲目循环。key ∈ 'title'|'combat'|'boss' */
    play: function (key) {
      if (!TRACKS[key]) return;
      if (!this.ctx) this.init();
      if (!this.ctx || !this.master) return;   // 降级:静默
      if (key === this.playing) { this.resume(); return; }
      this.stop();
      this.playing = key;
      reseed(TRACKS[key].seed);                // 固定种子 → 同一曲每次播放一致
      this._buildChain(TRACKS[key]);
      this._stepIndex = 0;
      this._nextTime = this.ctx.currentTime + 0.1;
      var self = this, tk = key;
      var tick = setInterval(function () { self._tickLoop(tk); }, 100);   // 100ms 检查一次
      this.timers.push(tick);
      this.resume();
      this.master.gain.setTargetAtTime(this._effectiveVolume(), this.ctx.currentTime, 0.5); // 淡入
    },

    /* stop():停止所有调度(全部 clearInterval),快速淡出当前已排定声音 */
    stop: function () {
      for (var i = 0; i < this.timers.length; i++) clearInterval(this.timers[i]);
      this.timers.length = 0;
      this.playing = null;
      if (this._send) { try { this._send.disconnect(); } catch (e) {} this._send = null; }
      if (this.ctx && this.master) this.master.gain.setTargetAtTime(0, this.ctx.currentTime, 0.05);
    },

    /* toggleMute():与主游戏 AudioSys 静音联动。
       主游戏 M 键调用 AudioSys.toggleMute() 翻转 AudioSys.enabled;
       本方法按任务书"读取它的当前值决定自己是否输出":
       - AudioSys 存在 → muted = !AudioSys.enabled(以游戏标志为准,与调用顺序无关)
       - AudioSys 不存在(独立测试环境)→ 独立翻转自身 muted
       即使总控漏挂本方法,update() 与调度 tick 中的 _syncMuteFromGame()
       也会持续跟随 AudioSys.enabled,保证 M 键一定生效。 */
    toggleMute: function () {
      var hasGameFlag = (typeof AudioSys !== 'undefined' && AudioSys &&
                         typeof AudioSys.enabled === 'boolean');
      if (hasGameFlag) {
        this.muted = !AudioSys.enabled;
      } else {
        this.muted = !this.muted;
      }
      if (this.ctx && this.master) {
        this.master.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.05);
      }
      return this.muted;
    },

    /* update(dt):每帧调用。1) 跟随游戏静音标志;2) master 音量平滑趋近目标(淡入淡出) */
    update: function () {
      if (!this.ctx || !this.master) return;
      this._syncMuteFromGame();
      var target = (this.muted || this.paused) ? 0 : this.volume;   // P34.2: 暂停静音
      var cur = this.master.gain.value;
      if (Math.abs(cur - target) > 0.0005) {
        this.master.gain.setTargetAtTime(target, this.ctx.currentTime, 0.1);
      }
    },

    /* ---------- 内部:静音联动 ---------- */
    _syncMuteFromGame: function () {
      if (typeof AudioSys !== 'undefined' && AudioSys &&
          typeof AudioSys.enabled === 'boolean') {
        this.muted = !AudioSys.enabled;
      }
    },
    _effectiveVolume: function () {
      return this.muted ? 0 : this.volume;
    },

    /* ---------- 内部:lookahead 调度核心 ---------- */
    _tickLoop: function (key) {
      if (!this.ctx || !this.master) return;
      if (this.paused) return;   // P34.2: 暂停冻结 BGM 调度(不排新步进)
      if (this.playing !== key) return;          // 已切换曲目,旧 tick 直接退出
      this._syncMuteFromGame();
      var track = TRACKS[key];
      var stepDur = 60 / track.bpm / 2;          // 8 分音符时长
      // 提前量:至少 0.3s,且不小于 2 个步长(boss 曲速下 0.3s 恰等于 1 步,取 2 步更稳)
      var ahead = Math.max(0.3, stepDur * 2);    // 任务书要求 0.2s,此处始终留双倍余量
      while (this._nextTime < this.ctx.currentTime + ahead) {
        this._scheduleStep(key, this._stepIndex, this._nextTime);
        this._nextTime += stepDur;
        this._stepIndex++;
      }
    },
    _scheduleStep: function (key, step, when) {
      var track = TRACKS[key];
      var bar = Math.floor(step / 8) % track.bars;   // 循环小节
      var s = step % 8;                               // 小节内 8 分步
      if (key === 'title') this._titleStep(bar, s, when);
      else if (key === 'combat') this._combatStep(bar, s, when);
      else this._bossStep(bar, s, when);
    },

    /* ---------- 内部:曲目步进(每步 = 一个 8 分音符) ---------- */
    _titleStep: function (bar, s, when) {
      var ch = TRACKS.title.chords[bar];
      if (s === 0) {
        // 低音根音:正弦,低八度,整小节长音
        this._playOsc({ freq: mf(ch[0] - 12), type: 'sine', when: when, dur: 3.2,
                        vol: 0.055, mode: 'pad', attack: 0.15, release: 0.5 });
        // 铺底:根音 + 三音,三角波,极轻,慢起音
        this._playOsc({ freq: mf(ch[0] + 12), type: 'triangle', when: when, dur: 3.6,
                        vol: 0.014, mode: 'pad', attack: 0.6, release: 0.9 });
        this._playOsc({ freq: mf(ch[1] + 12), type: 'triangle', when: when, dur: 3.6,
                        vol: 0.014, mode: 'pad', attack: 0.6, release: 0.9 });
      }
      // 琶音:根-五-八-五 循环,三角波 + 慢速颤音,送入延迟反馈(混响感)
      var arp = [ch[0] + 12, ch[2] + 12, ch[0] + 24, ch[2] + 12];
      this._playOsc({ freq: mf(arp[s % 4]), type: 'triangle', when: when, dur: 0.42,
                      vol: human(0.03), mode: 'pluck', attack: 0.01,
                      vibrato: { rate: 4.5, depth: 2.5 }, send: true });
    },

    _combatStep: function (bar, s, when) {
      var root = TRACKS.combat.bass[bar];
      // 低音脉冲:方波 + 低通 240Hz,8 分音符持续,根音/高八度交替(0=根音,1=高八度)
      var oct = [0, 1, 0, 0, 1, 0, 0, 1];
      this._playOsc({ freq: mf(root + (oct[s] ? 12 : 0)), type: 'square', when: when, dur: 0.16,
                      vol: s === 0 ? 0.085 : 0.062, mode: 'pluck', attack: 0.005,
                      filterFreq: 240, filterType: 'lowpass' });
      // 军鼓式噪声脉冲:白噪声 → 高通 1800Hz + 快包络,第 2/4 拍(步 3/7)
      if (s === 3 || s === 7) {
        this._playNoise({ when: when, dur: 0.1, vol: 0.085,
                          filterType: 'highpass', filterFreq: 1800, attack: 0.001 });
      }
      // 小调动机:锯齿波 + 低通 1400Hz,短促 8 分音符(0=休止),送入延迟
      var m = TRACKS.combat.motif[bar][s];
      if (m > 0) {
        this._playOsc({ freq: mf(m), type: 'sawtooth', when: when, dur: 0.18,
                        vol: human(0.04), mode: 'pluck', attack: 0.008,
                        filterFreq: 1400, filterType: 'lowpass', send: true });
      }
    },

    _bossStep: function (bar, s, when) {
      var root = TRACKS.boss.bass[bar];
      // 持续低音:锯齿波 + 低通 300Hz,每小节一个 2.35s 长音
      if (s === 0) {
        this._playOsc({ freq: mf(root), type: 'sawtooth', when: when, dur: 2.35,
                        vol: 0.095, mode: 'pad', attack: 0.12, release: 0.4,
                        filterFreq: 300, filterType: 'lowpass' });
      }
      // 大鼓:正弦 120→40Hz 扫频,第 1/3 拍(步 0/4)
      if (s === 0 || s === 4) {
        this._playOsc({ freq: 120, slideTo: 40, type: 'sine', when: when, dur: 0.55,
                        vol: 0.22, mode: 'pluck', attack: 0.008 });
      }
      // 噪声点缀:第 1/3 拍带通 2400Hz 短促撞击;第 2/4 拍高通 2000Hz 轻击
      if (s === 0 || s === 4) {
        this._playNoise({ when: when, dur: 0.06, vol: 0.05,
                          filterType: 'bandpass', filterFreq: 2400, q: 1, attack: 0.001 });
      } else if (s === 3 || s === 7) {
        this._playNoise({ when: when, dur: 0.08, vol: 0.045,
                          filterType: 'highpass', filterFreq: 2000, attack: 0.001 });
      }
      // 半音下行动机:锯齿波 + 低通 900Hz,短促下行音,送入延迟
      var m = TRACKS.boss.motif[bar][s];
      if (m > 0) {
        this._playOsc({ freq: mf(m), type: 'sawtooth', when: when, dur: 0.26,
                        vol: human(0.048), mode: 'pluck', attack: 0.01,
                        filterFreq: 900, filterType: 'lowpass', send: true });
      }
    },

    /* ---------- 内部:节点构建与语音合成 ---------- */
    /* 延迟反馈链(每曲独立构建):voice → send → delay → [fb → lowpass → delay] → wet → master */
    _buildChain: function (track) {
      var ctx = this.ctx;
      var delay = ctx.createDelay(2.0);
      delay.delayTime.value = track.delayTime;
      var fb = ctx.createGain();
      fb.gain.value = track.feedback;
      var flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.value = track.delayFreq;
      var wet = ctx.createGain();
      wet.gain.value = track.wet;
      var send = ctx.createGain();
      send.gain.value = track.sendAmt;
      delay.connect(fb); fb.connect(flt); flt.connect(delay);
      delay.connect(wet); wet.connect(this.master);
      send.connect(delay);
      this._send = send;
    },

    /* 白噪声缓冲(1 秒,固定种子填充 → 可复现),惰性创建并缓存 */
    _noiseBuffer: function () {
      if (this._noiseBuf || !this.ctx) return this._noiseBuf;
      var len = Math.max(1, Math.floor(this.ctx.sampleRate));
      var buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = rnd() * 2 - 1;
      this._noiseBuf = buf;
      return buf;
    },

    /* 振荡器语音:支持滤波 / 滑音 / 颤音 / 延迟发送;包络分 pluck(快起快衰)与 pad(慢起保持) */
    _playOsc: function (o) {
      if (!this.ctx || !this.master) return;
      var ctx = this.ctx, t = o.when, dur = o.dur;
      if (!(dur > 0)) return;
      var osc = ctx.createOscillator();
      osc.type = o.type || 'sine';
      osc.frequency.setValueAtTime(Math.max(1, o.freq), t);
      if (o.slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(1, o.slideTo), t + dur * 0.9);
      var g = ctx.createGain();
      var vol = o.vol || 0.05;
      var atk = o.attack || 0.01;
      if (o.mode === 'pad') {
        var rel = o.release || 0.3;
        var hold = Math.max(atk, dur - rel);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + atk);
        g.gain.setValueAtTime(vol, t + hold);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      } else {
        atk = Math.min(atk, dur * 0.3);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + atk);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      }
      var prev = osc;
      if (o.filterFreq) {
        var f = ctx.createBiquadFilter();
        f.type = o.filterType || 'lowpass';
        f.frequency.value = o.filterFreq;
        if (o.filterQ) f.Q.value = o.filterQ;
        prev.connect(f);
        prev = f;
      }
      prev.connect(g);
      g.connect(this.master);
      if (o.send && this._send) g.connect(this._send);
      if (o.vibrato) {
        // 慢速颤音:正弦 LFO → gain(Hz 偏移)→ osc.frequency
        var lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.value = o.vibrato.rate || 4.5;
        var lg = ctx.createGain();
        lg.gain.value = o.vibrato.depth || 2;
        lfo.connect(lg); lg.connect(osc.frequency);
        lfo.start(t); lfo.stop(t + dur + 0.1);
      }
      osc.start(t); osc.stop(t + dur + 0.05);
    },

    /* 噪声语音:白噪声缓冲 + 滤波 + 包络 */
    _playNoise: function (o) {
      if (!this.ctx || !this.master) return;
      var buf = this._noiseBuffer();
      if (!buf) return;
      var ctx = this.ctx, t = o.when, dur = o.dur;
      if (!(dur > 0)) return;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      var f = ctx.createBiquadFilter();
      f.type = o.filterType || 'highpass';
      f.frequency.value = o.filterFreq || 1500;
      if (o.q) f.Q.value = o.q;
      var g = ctx.createGain();
      var vol = o.vol || 0.08;
      var atk = Math.min(o.attack || 0.001, dur * 0.3);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + atk);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      src.connect(f); f.connect(g); g.connect(this.master);
      src.start(t); src.stop(t + dur + 0.05);
    }
  };

  return api;
})();


const SAVE_KEY = 'skyfire_save_v1';
const PLANE_DEFS = {
  gale:    { id: 'gale',    name: '疾风', tag: '均衡', desc: '攻守平衡的标准机体', hpMult: 1.0,  gunDmgMult: 1.0,  fireRateMult: 1.0, turnMult: 1.0,  accelMult: 1.0,  missileBonus: 0,   unlock: null },
  hammer:  { id: 'hammer',  name: '重锤', tag: '重装', desc: '血量+50% 机炮+25% 机动-20% 导弹+16', hpMult: 1.5, gunDmgMult: 1.25, fireRateMult: 1.0, turnMult: 0.8,  accelMult: 0.8,  missileBonus: 16,  unlock: null },
  bolt:    { id: 'bolt',    name: '迅雷', tag: '轻灵', desc: '血量-25% 射速+30% 机动+25% 导弹-16', hpMult: 0.75, gunDmgMult: 1.0, fireRateMult: 1.3, turnMult: 1.25, accelMult: 1.25, missileBonus: -16, unlock: null },
  phoenix: { id: 'phoenix', name: '凤凰', tag: '隐藏', desc: '通关第二章解锁 · 增益buff冷却-30%', hpMult: 1.0, gunDmgMult: 1.0, fireRateMult: 1.0, turnMult: 1.0,  accelMult: 1.0,  missileBonus: 0,   unlock: 'chapter2', buffCdMult: 0.7 }
};
const DIFFICULTY_DEFS = {
  normal: { key: 'normal', name: '普通', enemyHpMult: 1.0,  enemyDmgMult: 1.0,  scoreMult: 1.0, unlock: null },
  hard:   { key: 'hard',   name: '困难', enemyHpMult: 1.25, enemyDmgMult: 1.35, scoreMult: 1.3, unlock: 'chapter1' }
};

function defaultSave() {
  return { version: 1, unlockedMissions: 1, chapterCleared: 0, selectedPlane: 'gale',
           difficulty: 'normal', bestScore: {}, bestRank: {}, achievements: [], bestKills: 0,
           totalKills: 0, totalScore: 0, missionsCleared: 0,
           sfxVolume: SFX_VOLUME_DEFAULT, engineVolume: ENGINE_VOLUME_DEFAULT,
           controlScheme: 'keyboard+mouse' };
}

let controlSchemeChosen = false;   // P36: 是否曾明确选择操作方式(原始存档含该字段 或 本次会话已选择)
let controlSchemeAsk = false;      // P36: 首次进入 playing 的操作方式二选一询问弹窗
let controlSchemeAskSel = 0;       // P36: 询问弹窗键盘导航高亮: 0=键鼠 1=纯键盘
let save = null;

function loadSave() {
  controlSchemeChosen = false;   // P36: 每次加载重置(是否询问以原始存档是否含 controlScheme 字段为准)
  const fallback = defaultSave();
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) {
      save = fallback;
      return save;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('Invalid save data');
    save = Object.assign(fallback, parsed);
    if (typeof save.controlScheme !== 'string' || (save.controlScheme !== 'keyboard+mouse' && save.controlScheme !== 'keyboard-only')) save.controlScheme = 'keyboard+mouse';   // P36: 旧档无字段默认键鼠, 不报错
    controlSchemeChosen = !!(typeof parsed.controlScheme === 'string' && (parsed.controlScheme === 'keyboard+mouse' || parsed.controlScheme === 'keyboard-only'));   // P36: 原始存档已含该字段 = 已选择过, 不再询问
    if (!save.bestScore || typeof save.bestScore !== 'object' || Array.isArray(save.bestScore)) save.bestScore = {};
    if (!save.bestRank || typeof save.bestRank !== 'object' || Array.isArray(save.bestRank)) save.bestRank = {};
    if (!Array.isArray(save.achievements)) save.achievements = [];
    if (!PLANE_DEFS[save.selectedPlane]) save.selectedPlane = 'gale';
    if (!DIFFICULTY_DEFS[save.difficulty]) save.difficulty = 'normal';
    if (typeof save.sfxVolume !== 'number') save.sfxVolume = SFX_VOLUME_DEFAULT;   // P34.2: 旧存档无音量字段用默认
    if (typeof save.engineVolume !== 'number') save.engineVolume = ENGINE_VOLUME_DEFAULT;
  } catch (err) {
    save = fallback;
  }
  return save;
}

function saveNow() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch (err) {
    return false;
  }
}

function isPlaneUnlocked(id) {
  const def = PLANE_DEFS[id];
  if (!def) return false;
  if (def.unlock === null) return true;
  return def.unlock === 'chapter2' && save.chapterCleared >= 2;
}

function isDifficultyUnlocked(key) {
  const def = DIFFICULTY_DEFS[key];
  if (!def) return false;
  if (def.unlock === null) return true;
  return def.unlock === 'chapter1' && save.chapterCleared >= 1;
}

function applyPlaneSetup() {
  const def = PLANE_DEFS[save.selectedPlane] || PLANE_DEFS.gale;
  player.maxHp = Math.round(100 * def.hpMult);
  player.hp = player.maxHp;
  player.maxMissiles = Math.max(16, 48 + def.missileBonus);
  player.missiles = player.maxMissiles;
  player.turn = CFG.turnRate * def.turnMult;
  player.gunDmgMult = def.gunDmgMult;
  player.fireRateMult = def.fireRateMult;
  player.accelMult = def.accelMult;
  player.buffCdMult = def.buffCdMult || 1;
}

loadSave();
