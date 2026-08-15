const { callLoveApi } = require('../../utils/api');

Page({
  data: { username: '', password: '', loading: false, message: '' },

  onLoad(options) {
    const app = getApp();
    if (options.logout) this.setData({ message: '已经安全退出' });
    if (options.expired) this.setData({ message: '登录已过期，请重新登录' });
    if (app.globalData.sessionToken) this.restoreSession();
  },

  onUsername(event) { this.setData({ username: event.detail.value }); },
  onPassword(event) { this.setData({ password: event.detail.value }); },

  async restoreSession() {
    this.setData({ loading: true, message: '正在确认身份…' });
    try {
      const data = await callLoveApi('me');
      getApp().saveSession(getApp().globalData.sessionToken, data.user);
      wx.reLaunch({ url: '/pages/home/home' });
    } catch (_) {
      getApp().clearSession();
      this.setData({ loading: false, message: '请重新登录' });
    }
  },

  async login() {
    const username = this.data.username.trim();
    const password = this.data.password;
    if (!username || !password) {
      this.setData({ message: '请填写用户名和密码' });
      return;
    }

    this.setData({ loading: true, message: '' });
    try {
      const data = await callLoveApi('login', { username, password }, '');
      getApp().saveSession(data.token, data.user);
      this.setData({ password: '' });
      wx.showToast({ title: `欢迎回来，${data.user.displayName}`, icon: 'none' });
      setTimeout(() => wx.reLaunch({ url: '/pages/home/home' }), 350);
    } catch (error) {
      this.setData({ message: error.message || '登录失败', loading: false, password: '' });
    }
  }
});
