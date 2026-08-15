const { goHome, openNotes } = require('../../utils/nav');

const loveLines = [
  '你一笑，我的心就自动投降。',
  '今日份喜欢：比昨天又多一点。',
  '你负责可爱，我负责一直爱。',
  '想和你把普通日子过成纪念日。',
  '别抓啦，我整颗心本来就是你的。'
];

Page({
  data: { timeLeft: 10, score: 0, hearts: [], state: 'ready', toast: '' },
  heartId: 0,
  timers: [],
  gameTimer: null,
  spawnTimer: null,

  onLoad() { getApp().ensureSignedIn(); },
  onUnload() { this.stopTimers(); },
  goHome,
  openNotes,

  rememberTimer(timer) { this.timers.push(timer); return timer; },

  startGame() {
    this.stopTimers();
    this.setData({ timeLeft: 10, score: 0, hearts: [], state: 'playing', toast: '' });
    this.spawnHeart();
    this.spawnTimer = setInterval(() => this.spawnHeart(), 470);
    this.gameTimer = setInterval(() => {
      const next = this.data.timeLeft - 1;
      this.setData({ timeLeft: next });
      if (next <= 0) this.endGame();
    }, 1000);
  },

  spawnHeart() {
    if (this.data.state !== 'playing') return;
    const special = Math.random() < .2;
    const id = ++this.heartId;
    const heart = {
      id,
      special,
      emoji: special ? '💛' : ['💗', '💖', '💕'][Math.floor(Math.random() * 3)],
      size: special ? 115 : 94 + Math.floor(Math.random() * 18),
      left: 4 + Math.floor(Math.random() * 78),
      top: 4 + Math.floor(Math.random() * 76)
    };
    this.setData({ hearts: this.data.hearts.concat(heart) });
    this.rememberTimer(setTimeout(() => this.removeHeart(id), special ? 1250 : 1050));
  },

  catchHeart(event) {
    if (this.data.state !== 'playing') return;
    const id = Number(event.currentTarget.dataset.id);
    const heart = this.data.hearts.find(item => item.id === id);
    if (!heart) return;
    this.removeHeart(id);
    this.setData({ score: this.data.score + (heart.special ? 5 : 1) });
    if (heart.special) {
      this.setData({ toast: `💛 ${loveLines[Math.floor(Math.random() * loveLines.length)]}` });
      this.rememberTimer(setTimeout(() => this.setData({ toast: '' }), 1300));
    }
  },

  removeHeart(id) { this.setData({ hearts: this.data.hearts.filter(item => item.id !== id) }); },

  endGame() {
    clearInterval(this.gameTimer);
    clearInterval(this.spawnTimer);
    this.gameTimer = null;
    this.spawnTimer = null;
    this.setData({ timeLeft: 0, hearts: [], state: 'done' });
  },

  stopTimers() {
    clearInterval(this.gameTimer);
    clearInterval(this.spawnTimer);
    this.timers.forEach(clearTimeout);
    this.timers = [];
  }
});
