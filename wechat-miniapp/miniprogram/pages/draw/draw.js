const activities = require('../../utils/activities');
const { goHome, openNotes } = require('../../utils/nav');

const BAG_KEY = 'qianqian_activity_bag_v1';
const LAST_KEY = 'qianqian_last_activity_v1';

function shuffledBag(lastIndex) {
  const bag = activities.map((_, index) => index);
  for (let index = bag.length - 1; index > 0; index -= 1) {
    const other = Math.floor(Math.random() * (index + 1));
    [bag[index], bag[other]] = [bag[other], bag[index]];
  }
  if (bag[bag.length - 1] === lastIndex && bag.length > 1) {
    [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
  }
  return bag;
}

Page({
  data: {
    number: 'LOVE LOT · 000', category: '等待抽签', emoji: '🎴',
    title: '今天要一起做什么？', copy: '点一下按钮，抽到什么就认真考虑去做什么。',
    counter: '本轮还有 100 支不重复的签', buttonText: '抽一支签', drawing: false, toast: ''
  },
  bag: [],
  lastIndex: -1,

  onLoad() {
    if (!getApp().ensureSignedIn()) return;
    const saved = wx.getStorageSync(BAG_KEY);
    this.bag = Array.isArray(saved) && saved.every(Number.isInteger) ? saved : [];
    this.lastIndex = Number(wx.getStorageSync(LAST_KEY));
    if (this.bag.length) this.setData({ counter: `本轮还有 ${this.bag.length} 支不重复的签` });
  },
  goHome,
  openNotes,

  draw() {
    if (this.data.drawing) return;
    if (!this.bag.length) this.bag = shuffledBag(this.lastIndex);
    this.setData({ drawing: true, title: '正在从 100 支签里选一支…', emoji: '✨', toast: '' });
    setTimeout(() => {
      const activityIndex = this.bag.pop();
      const [category, emoji, title] = activities[activityIndex];
      this.lastIndex = activityIndex;
      wx.setStorageSync(BAG_KEY, this.bag);
      wx.setStorageSync(LAST_KEY, activityIndex);
      this.setData({
        number: `LOVE LOT · ${String(activityIndex + 1).padStart(3, '0')}`,
        category, emoji, title,
        copy: '这是一份小提议。如果两个人今天都不想做，就再抽一支。',
        counter: this.bag.length ? `本轮还有 ${this.bag.length} 支不重复的签` : '100 支签已经抽完，下次会重新洗牌',
        buttonText: '再抽一支', drawing: false, toast: `${emoji} 今天就做这个吧`
      });
      setTimeout(() => this.setData({ toast: '' }), 1500);
    }, 700);
  }
});
