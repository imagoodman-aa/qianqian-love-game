App({
  globalData: {
    sessionToken: '',
    user: null,
    draftMessage: ''
  },

  onLaunch() {
    if (!wx.cloud) {
      wx.showModal({
        title: '微信版本过低',
        content: '请升级微信后再打开我们的小程序。',
        showCancel: false
      });
      return;
    }

    wx.cloud.init({
      env: wx.cloud.DYNAMIC_CURRENT_ENV,
      traceUser: true
    });

    this.globalData.sessionToken = wx.getStorageSync('qianqian_love_session_v1') || '';
    this.globalData.user = wx.getStorageSync('qianqian_love_user_v1') || null;
  },

  saveSession(token, user) {
    this.globalData.sessionToken = token;
    this.globalData.user = user;
    wx.setStorageSync('qianqian_love_session_v1', token);
    wx.setStorageSync('qianqian_love_user_v1', user);
  },

  clearSession() {
    this.globalData.sessionToken = '';
    this.globalData.user = null;
    wx.removeStorageSync('qianqian_love_session_v1');
    wx.removeStorageSync('qianqian_love_user_v1');
  },

  ensureSignedIn() {
    if (this.globalData.sessionToken) return true;
    wx.reLaunch({ url: '/pages/login/login' });
    return false;
  }
});
