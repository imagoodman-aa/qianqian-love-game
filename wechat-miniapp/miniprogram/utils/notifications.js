function requestNewMessageReminder() {
  const ids = (getApp().globalData.subscribeTemplateIds || []).filter(Boolean);
  if (!ids.length) {
    wx.showModal({
      title: '提醒功能还差一步',
      content: '微信订阅提醒需要先在公众平台创建一条订阅消息模板。配置模板 ID 后，两个人各点一次这里即可。现在仍可通过留言红点和邮件提醒查看新消息。',
      showCancel: false
    });
    return;
  }
  wx.requestSubscribeMessage({
    tmplIds: ids,
    success(result) {
      const accepted = ids.some(id => result[id] === 'accept');
      wx.showToast({ title: accepted ? '提醒已开启 🔔' : '你暂时没有开启提醒', icon: 'none' });
    },
    fail() { wx.showToast({ title: '提醒设置暂时失败', icon: 'none' }); }
  });
}

module.exports = { requestNewMessageReminder };
