const { callLoveApi, handleExpired } = require('../../utils/api');
const { goHome, openNotes } = require('../../utils/nav');

function compress(path) {
  return new Promise((resolve, reject) => {
    wx.compressImage({ src: path, quality: 72, compressedWidth: 1280, success: result => resolve(result.tempFilePath), fail: reject });
  });
}

Page({
  data: { photos: [], pendingImage: null, caption: '', loading: true, uploading: false, status: '' },

  onLoad() { if (getApp().ensureSignedIn()) this.loadPhotos(); },
  onShow() { if (getApp().globalData.sessionToken && !this.data.loading) this.loadPhotos(true); },
  async onPullDownRefresh() { await this.loadPhotos(true); wx.stopPullDownRefresh(); },
  goHome,
  openNotes,

  async loadPhotos(silent = false) {
    if (!silent) this.setData({ loading: true });
    try {
      const data = await callLoveApi('album_list');
      const username = String((getApp().globalData.user || {}).username || '').toLowerCase();
      const photos = (data.photos || []).map(item => ({ ...item, mine: String(item.createdBy || '').toLowerCase() === username }));
      this.setData({ photos, loading: false });
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ loading: false, status: error.message || '相册加载失败' });
    }
  },

  onCaption(event) { this.setData({ caption: event.detail.value }); },

  async chooseImage() {
    if (this.data.uploading) return;
    try {
      const result = await wx.chooseMedia({ count: 1, mediaType: ['image'], sourceType: ['album', 'camera'], sizeType: ['compressed'] });
      const file = result.tempFiles[0];
      let path = file.tempFilePath;
      if (Number(file.size || 0) > 1800 * 1024) path = await compress(path);
      const info = await new Promise((resolve, reject) => wx.getFileSystemManager().getFileInfo({ filePath: path, success: resolve, fail: reject }));
      if (info.size > 2 * 1024 * 1024) throw new Error('图片压缩后仍超过 2 MB，请换一张');
      this.setData({ pendingImage: { path }, status: '照片准备好了，写一句说明再保存吧 📸' });
    } catch (error) {
      if (String(error.errMsg || '').includes('cancel')) return;
      this.setData({ status: error.message || '图片读取失败，请换一张试试' });
    }
  },

  removePending() { this.setData({ pendingImage: null, caption: '', status: '' }); },

  async uploadPhoto() {
    const pending = this.data.pendingImage;
    if (!pending || this.data.uploading) return;
    this.setData({ uploading: true, status: '正在保存到你们的相册…' });
    let cloudFileId = '';
    try {
      const cloudPath = `love-album/${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
      const upload = await wx.cloud.uploadFile({ cloudPath, filePath: pending.path });
      cloudFileId = upload.fileID;
      await callLoveApi('album_add', { cloudFileId, caption: this.data.caption });
      this.setData({ pendingImage: null, caption: '', uploading: false, status: '已经放进你们的回忆里啦 💕' });
      await this.loadPhotos(true);
    } catch (error) {
      if (cloudFileId) { try { await wx.cloud.deleteFile({ fileList: [cloudFileId] }); } catch (_) {} }
      if (handleExpired(error)) return;
      this.setData({ uploading: false, status: error.message || '照片保存失败，请稍后再试' });
    }
  },

  preview(event) {
    const current = event.currentTarget.dataset.url;
    wx.previewImage({ current, urls: this.data.photos.map(item => item.imageUrl).filter(Boolean) });
  },

  removePhoto(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '从相册移除？', content: '只会移除你上传的这张照片。', confirmColor: '#e84f71', success: async ({ confirm }) => {
      if (!confirm) return;
      try { await callLoveApi('album_delete', { id }); await this.loadPhotos(true); }
      catch (error) { if (!handleExpired(error)) this.setData({ status: error.message || '照片移除失败' }); }
    } });
  }
});
