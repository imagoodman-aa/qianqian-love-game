const { callLoveApi } = require('./api');

function goHome() {
  wx.reLaunch({ url: '/pages/home/home' });
}

function openNotes() {
  wx.navigateTo({ url: '/pages/notes/notes' });
}

function openCouple() {
  wx.navigateTo({ url: '/pages/couple/couple' });
}

function openAlbum() {
  wx.navigateTo({ url: '/pages/album/album' });
}

function confirmLogout() {
  wx.showModal({
    title: '退出登录',
    content: '要回到登录界面吗？',
    confirmText: '退出',
    confirmColor: '#e84f71',
    success: async ({ confirm }) => {
      if (!confirm) return;
      try { await callLoveApi('logout'); } catch (_) { /* 本地退出仍继续 */ }
      getApp().clearSession();
      wx.reLaunch({ url: '/pages/login/login?logout=1' });
    }
  });
}

module.exports = { goHome, openNotes, openCouple, openAlbum, confirmLogout };
