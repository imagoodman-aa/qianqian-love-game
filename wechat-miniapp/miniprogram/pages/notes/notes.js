const { callLoveApi, handleExpired } = require('../../utils/api');
const { confirmLogout } = require('../../utils/nav');

const CONTROL_PREFIX = '__QQ_CONTROL__';

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

function parseControl(content) {
  const value = String(content || '');
  if (!value.startsWith(CONTROL_PREFIX)) return null;
  try { return JSON.parse(value.slice(CONTROL_PREFIX.length)); } catch (_) { return null; }
}

function decorateMessages(rawMessages, limit) {
  const recalled = new Set();
  const reactions = {};
  rawMessages.forEach(message => {
    const control = parseControl(message.content);
    if (!control || !control.targetId) return;
    if (control.type === 'recall') recalled.add(String(control.targetId));
    if (control.type === 'reaction' && control.emoji) {
      const target = String(control.targetId);
      reactions[target] = reactions[target] || [];
      const existing = reactions[target].find(item => item.emoji === control.emoji && item.username === message.username);
      if (!existing) reactions[target].push({ emoji: control.emoji, username: message.username, key: `${message.username || 'guest'}-${control.emoji}` });
    }
  });
  const visible = rawMessages
    .filter(message => !parseControl(message.content) && !recalled.has(String(message.id)))
    .map(message => ({ ...message, reactions: reactions[String(message.id)] || [] }));
  return { messages: visible.slice(-limit), hasMore: visible.length > limit };
}

Page({
  data: {
    messages: [], loading: true, content: '', pendingImage: null, sending: false,
    status: '键盘“发送”键即可留言 · 支持上传图片', displayName: '', scrollToId: '', hasMore: false,
    visibleLimit: 80, inputFocus: false
  },
  pollTimer: null,
  messageSignature: '',
  rawMessages: [],

  onLoad() {
    const app = getApp();
    if (!app.ensureSignedIn()) return;
    this.setData({ displayName: app.globalData.user ? app.globalData.user.displayName : '—' });
    if (app.globalData.draftMessage) {
      this.setData({ content: app.globalData.draftMessage });
      app.globalData.draftMessage = '';
    }
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
      const rawMessages = (data.messages || []).map(message => ({ ...message, displayTime: formatTime(message.createdAt) }));
      const newest = rawMessages[rawMessages.length - 1];
      const signature = rawMessages.map(message => [message.id, message.type, message.content, message.imageUrl, message.readAt].join('¦')).join('¶');
      const latestId = newest ? String(newest.id) : '';
      const previousLatestId = this.rawMessages.length ? String(this.rawMessages[this.rawMessages.length - 1].id) : '';
      if (silent && signature === this.messageSignature) return;
      this.messageSignature = signature;
      this.rawMessages = rawMessages;
      const decorated = decorateMessages(rawMessages, this.data.visibleLimit);
      const newestVisible = decorated.messages[decorated.messages.length - 1];
      if (newest) {
        const user = getApp().globalData.user || {};
        wx.setStorageSync(`qianqian_love_seen_${user.username || 'guest'}`, String(newest.id));
      }
      const shouldScroll = !silent || latestId !== previousLatestId;
      this.setData({ messages: decorated.messages, hasMore: decorated.hasMore, loading: false, scrollToId: shouldScroll && newestVisible ? `message-${newestVisible.id}` : '' });
    } catch (error) {
      if (handleExpired(error)) return;
      if (!silent) this.setData({ loading: false, status: error.message || '留言加载失败' });
    }
  },

  showOlder() {
    const visibleLimit = this.data.visibleLimit + 80;
    const decorated = decorateMessages(this.rawMessages, visibleLimit);
    this.setData({ visibleLimit, messages: decorated.messages, hasMore: decorated.hasMore, scrollToId: '' });
  },

  messageActions(event) {
    const id = String(event.currentTarget.dataset.id || '');
    const message = this.data.messages.find(item => String(item.id) === id);
    if (!message) return;
    const items = message.mine ? ['回复', '👍 赞一下', '❤️ 心动', '撤回'] : ['回复', '👍 赞一下', '❤️ 心动'];
    wx.showActionSheet({ itemList: items, success: ({ tapIndex }) => {
      if (tapIndex === 0) {
        this.setData({ content: `回复 ${message.displayName}：`, inputFocus: true });
        setTimeout(() => this.setData({ inputFocus: false }), 300);
      } else if (tapIndex === 1) this.sendControl('reaction', id, '👍');
      else if (tapIndex === 2) this.sendControl('reaction', id, '❤️');
      else if (tapIndex === 3) {
        wx.showModal({ title: '撤回这条留言？', content: '撤回后，双方界面都会隐藏这条留言。', confirmColor: '#e84f71', success: ({ confirm }) => { if (confirm) this.sendControl('recall', id); } });
      }
    } });
  },

  async sendControl(type, targetId, emoji = '') {
    if (this.data.sending) return;
    this.setData({ sending: true, status: type === 'recall' ? '正在撤回…' : '正在发送回应…' });
    try {
      await callLoveApi('send', { content: `${CONTROL_PREFIX}${JSON.stringify({ type, targetId, emoji })}` });
      this.setData({ status: type === 'recall' ? '已撤回这条留言' : '回应已送达 💗' });
      await this.loadMessages(true, true);
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ status: error.message || '操作失败，请稍后再试' });
    } finally { this.setData({ sending: false }); }
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
      if (pendingImage) {
        const cloudPath = `love-board-temp/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
        const upload = await wx.cloud.uploadFile({ cloudPath, filePath: pendingImage.path });
        await callLoveApi('send_cloud_image', { caption: content, cloudFileId: upload.fileID, notify: false });
      } else {
        await callLoveApi('send', { content, notify: false });
      }
      this.setData({ content: '', pendingImage: null, status: '发送成功，对方可以看到啦 ♥' });
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
