const { callLoveApi, handleExpired } = require('../../utils/api');
const { confirmLogout } = require('../../utils/nav');

function formatTime(value) {
  const date = new Date(value);
  const pad = number => String(number).padStart(2, '0');
  return `${date.getMonth() + 1}/${date.getDate()} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fileInfo(path) {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().getFileInfo({ filePath: path, success: resolve, fail: reject });
  });
}

function compress(path, quality, side) {
  return new Promise((resolve, reject) => {
    wx.compressImage({ src: path, quality, compressedWidth: side, compressedHeight: side, success: result => resolve(result.tempFilePath), fail: reject });
  });
}

Page({
  data: {
    messages: [], loading: true, content: '', pendingImage: null, sending: false,
    status: '键盘“发送”键即可留言 · 支持上传图片', displayName: '', scrollToId: ''
  },
  pollTimer: null,

  onLoad() {
    const app = getApp();
    if (!app.ensureSignedIn()) return;
    this.setData({ displayName: app.globalData.user ? app.globalData.user.displayName : '—' });
  },
  onShow() { this.loadMessages(true); this.stopPolling(); this.pollTimer = setInterval(() => this.loadMessages(true, true), 8000); },
  onHide() { this.stopPolling(); },
  onUnload() { this.stopPolling(); },
  stopPolling() { clearInterval(this.pollTimer); this.pollTimer = null; },
  back() { wx.navigateBack({ fail: () => wx.reLaunch({ url: '/pages/home/home' }) }); },
  refresh() { this.loadMessages(true); },
  logout: confirmLogout,
  onContent(event) { this.setData({ content: event.detail.value }); },

  async loadMessages(markRead, silent = false) {
    if (!silent) this.setData({ loading: !this.data.messages.length });
    try {
      const data = await callLoveApi('list', { markRead: Boolean(markRead) });
      const messages = (data.messages || []).map(message => ({ ...message, displayTime: formatTime(message.createdAt) }));
      const newest = messages[messages.length - 1];
      if (newest) {
        const user = getApp().globalData.user || {};
        wx.setStorageSync(`qianqian_love_seen_${user.username || 'guest'}`, String(newest.id));
      }
      this.setData({ messages, loading: false, scrollToId: newest ? `message-${newest.id}` : '' });
    } catch (error) {
      if (handleExpired(error)) return;
      if (!silent) this.setData({ loading: false, status: error.message || '留言加载失败' });
    }
  },

  async chooseImage() {
    if (this.data.sending) return;
    try {
      const selection = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      const selected = selection.tempFiles[0];
      let path = selected.tempFilePath;
      let info = await fileInfo(path);
      if (info.size > 900 * 1024) {
        path = await compress(path, 55, 1280);
        info = await fileInfo(path);
      }
      if (info.size > 1500 * 1024) {
        path = await compress(path, 35, 960);
        info = await fileInfo(path);
      }
      if (info.size > 2 * 1024 * 1024) throw new Error('图片压缩后仍超过 2 MB，请换一张');
      this.setData({ pendingImage: { path, size: info.size, name: `手机照片 · ${Math.ceil(info.size / 1024)} KB` }, status: '图片准备好了，点击发送吧' });
    } catch (error) {
      if (String(error.errMsg || '').includes('cancel')) return;
      this.setData({ status: error.message || '图片读取失败，请换一张试试' });
    }
  },

  removeImage() { this.setData({ pendingImage: null, status: '键盘“发送”键即可留言 · 支持上传图片' }); },

  async send() {
    if (this.data.sending) return;
    const content = this.data.content.trim();
    const pendingImage = this.data.pendingImage;
    if (!content && !pendingImage) return;
    this.setData({ sending: true, status: '正在发送…' });

    try {
      let result;
      if (pendingImage) {
        const cloudPath = `love-board-temp/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const upload = await wx.cloud.uploadFile({ cloudPath, filePath: pendingImage.path });
        result = await callLoveApi('send_cloud_image', { caption: content, cloudFileId: upload.fileID });
      } else {
        result = await callLoveApi('send', { content });
      }
      let status = '发送成功，对方可以看到啦 ♥';
      if (result.notification === 'sent') status = '发送成功，邮件提醒也发出啦 💌';
      if (result.notification === 'failed') status = '留言已保存，但邮件提醒暂时没发出';
      if (result.notification === 'not_configured') status = '留言已保存，邮件提醒还没完成配置';
      this.setData({ content: '', pendingImage: null, status });
      await this.loadMessages(true, true);
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ status: error.message || '发送失败，请稍后再试' });
    } finally {
      this.setData({ sending: false });
    }
  },

  previewMessageImage(event) {
    const current = event.currentTarget.dataset.url;
    const urls = this.data.messages.filter(item => item.type === 'image' && item.imageUrl).map(item => item.imageUrl);
    wx.previewImage({ current, urls });
  }
});
