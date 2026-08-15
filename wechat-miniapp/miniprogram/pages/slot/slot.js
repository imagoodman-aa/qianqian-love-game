const { goHome, openNotes } = require('../../utils/nav');

const prizes = [
  { emoji: '🥤', name: '奶茶' },
  { emoji: '🤗', name: '抱抱' },
  { emoji: '🙋‍♂️', name: '听话一天' },
  { emoji: '🍲', name: '火锅' },
  { emoji: '💋', name: '亲亲' },
  { emoji: '🎤', name: '唱首歌' },
  { emoji: '🛍️', name: '陪逛街' },
  { emoji: '💌', name: '夸你十次' }
];

Page({
  data: {
    reels: prizes.slice(0, 3),
    spinning: false,
    copy: '幸运值已装满。点击开始，大奖马上送到！',
    buttonText: '开始哄我',
    ticket: '',
    celebrating: false
  },
  spinCount: 0,
  shuffleTimer: null,
  timeouts: [],

  onLoad() { getApp().ensureSignedIn(); },
  onUnload() { clearInterval(this.shuffleTimer); this.timeouts.forEach(clearTimeout); },
  goHome,
  openNotes,

  later(callback, delay) { const timer = setTimeout(callback, delay); this.timeouts.push(timer); },

  spin() {
    if (this.data.spinning) return;
    this.spinCount += 1;
    this.setData({ spinning: true, ticket: '', copy: '好运正在赶来，请稍等一下…' });
    this.shuffleTimer = setInterval(() => {
      this.setData({ reels: [0, 1, 2].map(() => prizes[Math.floor(Math.random() * prizes.length)]) });
    }, 90);

    const finalPrizes = this.spinCount === 1
      ? prizes.slice(0, 3)
      : [0, 1, 2].map(() => prizes[Math.floor(Math.random() * prizes.length)]);

    this.later(() => {
      clearInterval(this.shuffleTimer);
      const ticket = finalPrizes.map(item => item.name).join('＋');
      this.setData({
        reels: finalPrizes,
        spinning: false,
        copy: '哇！本次奖品由男朋友亲自负责兑现。',
        buttonText: '再抽一次',
        ticket,
        celebrating: true
      });
      this.later(() => this.setData({ celebrating: false }), 1800);
    }, 1950);
  }
});
