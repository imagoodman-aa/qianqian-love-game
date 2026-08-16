const { callLoveApi, handleExpired } = require('../../utils/api');
const { openNotes, openCouple, openAlbum, confirmLogout } = require('../../utils/nav');

Page({
  data: { displayName: '', hasUnread: false },

  onShow() {
    const app = getApp();
    if (!app.ensureSignedIn()) return;
    this.setData({ displayName: app.globalData.user ? app.globalData.user.displayName : '—' });
    this.checkUnread();
  },

  async onPullDownRefresh() {
    await this.checkUnread();
    wx.stopPullDownRefresh();
  },

  openModule(event) { wx.navigateTo({ url: event.currentTarget.dataset.url }); },
  openNotes,
  openCouple,
  openAlbum,
  logout: confirmLogout,

  async checkUnread() {
    try {
      const data = await callLoveApi('list');
      const user = getApp().globalData.user || {};
      const seenKey = `qianqian_love_seen_${user.username || 'guest'}`;
      const lastSeen = Number(wx.getStorageSync(seenKey) || 0);
      const hasUnread = (data.messages || []).some(message => !message.mine && !String(message.content || '').startsWith('__QQ_CONTROL__') && Number(message.id) > lastSeen);
      this.setData({ hasUnread });
    } catch (error) {
      handleExpired(error);
    }
  }
});
