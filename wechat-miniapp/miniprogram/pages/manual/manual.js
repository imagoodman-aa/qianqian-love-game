const { goHome, openNotes } = require('../../utils/nav');

Page({
  data: {
    toast: '',
    items: [
      { emoji: '🧸', title: '主要功能', copy: '陪吃、陪玩、拎包、提供无限抱抱。' },
      { emoji: '⚠️', title: '已知缺陷', copy: '偶尔嘴欠，有时反应会慢半拍。' },
      { emoji: '🔧', title: '维修方法', copy: '抱一下、亲一下，通常可以立刻恢复。' },
      { emoji: '🛡️', title: '售后服务', copy: '终身保修，吵架也不会自动离线。' }
    ]
  },
  onLoad() { getApp().ensureSignedIn(); },
  goHome,
  openNotes,
  renew() {
    this.setData({ toast: '续费成功！有效期：一辈子 ♥' });
    setTimeout(() => this.setData({ toast: '' }), 1700);
  }
});
