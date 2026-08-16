const { callLoveApi, handleExpired } = require('../../utils/api');
const { goHome, openNotes } = require('../../utils/nav');

// 你们在一起的日子：2024 年 6 月 19 日。
// 同时保存在本机，云端暂时连不上时也能正常显示。
const DEFAULT_ANNIVERSARY_DATE = '2024-06-19';
const ANNIVERSARY_STORAGE_KEY = 'qianqian_anniversary_date';

const moodOptions = [
  { emoji: '☀️', label: '开心' },
  { emoji: '🌷', label: '想你' },
  { emoji: '🥺', label: '撒娇' },
  { emoji: '😴', label: '困困' },
  { emoji: '🔥', label: '元气' },
  { emoji: '🌧️', label: '低落' }
];

function localDate(value) {
  const parts = String(value || '').split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  return new Date(parts[0], parts[1] - 1, parts[2]);
}

function dateKey(date = new Date()) {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function anniversaryInfo(value) {
  const start = localDate(value);
  if (!start) return { days: '—', next: '先设置你们在一起的日子吧 💕' };
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.max(0, Math.floor((todayOnly - start) / 86400000));
  let next = new Date(today.getFullYear(), start.getMonth(), start.getDate());
  if (next < todayOnly) next = new Date(today.getFullYear() + 1, start.getMonth(), start.getDate());
  const daysToNext = Math.ceil((next - todayOnly) / 86400000);
  return { days, next: `距离下一次纪念日还有 ${daysToNext} 天` };
}

Page({
  data: {
    state: { anniversaryDate: DEFAULT_ANNIVERSARY_DATE }, anniversaryDays: anniversaryInfo(DEFAULT_ANNIVERSARY_DATE).days, nextAnniversary: anniversaryInfo(DEFAULT_ANNIVERSARY_DATE).next,
    moodOptions, moods: [], todayMood: '', moodNote: '', wishes: [], wishTitle: '', draws: [], loading: true, saving: false,
    displayName: '', status: ''
  },

  onLoad() {
    const app = getApp();
    if (!app.ensureSignedIn()) return;
    this.setData({ displayName: app.globalData.user ? app.globalData.user.displayName : '—' });
    this.loadAll();
  },
  async onPullDownRefresh() { await this.loadAll(true); wx.stopPullDownRefresh(); },
  goHome,
  openNotes,

  async loadAll(silent = false) {
    if (!silent) this.setData({ loading: true });
    try {
      const [state, moodData, wishData, drawData] = await Promise.all([
        callLoveApi('couple_read'), callLoveApi('mood_list'), callLoveApi('wish_list'), callLoveApi('draw_list')
      ]);
      const cloudDate = state.anniversaryDate || '';
      const localDateValue = wx.getStorageSync(ANNIVERSARY_STORAGE_KEY) || '';
      const anniversaryDate = cloudDate || localDateValue || DEFAULT_ANNIVERSARY_DATE;
      const info = anniversaryInfo(anniversaryDate);
      wx.setStorageSync(ANNIVERSARY_STORAGE_KEY, anniversaryDate);
      // 第一次进入时自动把默认日期补到共享空间，之后两个人看到的是同一个日期。
      if (!cloudDate) callLoveApi('couple_write', { anniversaryDate }).catch(() => null);
      const today = dateKey();
      const moods = moodData.moods || [];
      const own = getApp().globalData.user || {};
      const ownMood = moods.find(item => item.username === String(own.username || '').toLowerCase() && item.dateKey === today);
      const username = String(own.username || '').toLowerCase();
      const wishes = (wishData.wishes || []).map(item => ({ ...item, mine: String(item.createdBy || '').toLowerCase() === username }));
      this.setData({
        state: { anniversaryDate }, anniversaryDays: info.days, nextAnniversary: info.next,
        moods: moods.slice(0, 6), todayMood: ownMood ? ownMood.emoji : '', moodNote: ownMood ? ownMood.note : '',
        wishes, draws: drawData.draws || [], loading: false
      });
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ loading: false, status: error.message || '共享内容加载失败' });
    }
  },

  onAnniversary(event) {
    const value = event.detail.value;
    wx.setStorageSync(ANNIVERSARY_STORAGE_KEY, value);
    this.setData({ 'state.anniversaryDate': value });
    this.saveAnniversary(value);
  },

  async saveAnniversary(value) {
    this.setData({ saving: true, status: '正在保存纪念日…' });
    try {
      await callLoveApi('couple_write', { anniversaryDate: value });
      const info = anniversaryInfo(value);
      this.setData({ anniversaryDays: info.days, nextAnniversary: info.next, saving: false, status: '纪念日已保存 💕' });
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ saving: false, status: error.message || '纪念日保存失败' });
    }
  },

  chooseMood(event) { this.setData({ todayMood: event.currentTarget.dataset.emoji }); },
  onMoodNote(event) { this.setData({ moodNote: event.detail.value }); },
  async saveMood() {
    if (!this.data.todayMood) { this.setData({ status: '先选一个今天的心情吧 😊' }); return; }
    this.setData({ saving: true, status: '正在记录今天的心情…' });
    try {
      await callLoveApi('mood_set', { emoji: this.data.todayMood, note: this.data.moodNote, dateKey: dateKey() });
      this.setData({ saving: false, status: '心情已告诉 TA 啦 💌' });
      await this.loadAll(true);
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ saving: false, status: error.message || '心情记录失败' });
    }
  },

  onWishTitle(event) { this.setData({ wishTitle: event.detail.value }); },
  async addWish() {
    const title = this.data.wishTitle.trim();
    if (!title) return;
    this.setData({ saving: true, status: '正在加入愿望清单…' });
    try {
      await callLoveApi('wish_add', { title });
      this.setData({ wishTitle: '', saving: false, status: '愿望加入成功 ✅' });
      await this.loadAll(true);
    } catch (error) {
      if (handleExpired(error)) return;
      this.setData({ saving: false, status: error.message || '愿望添加失败' });
    }
  },

  async toggleWish(event) {
    const id = event.currentTarget.dataset.id;
    const done = event.currentTarget.dataset.done !== 'true';
    try { await callLoveApi('wish_toggle', { id, done }); await this.loadAll(true); }
    catch (error) { if (!handleExpired(error)) this.setData({ status: error.message || '愿望更新失败' }); }
  },

  deleteWish(event) {
    const id = event.currentTarget.dataset.id;
    wx.showModal({ title: '删除这个愿望？', content: '只会删除你自己添加的愿望。', confirmColor: '#e84f71', success: async ({ confirm }) => {
      if (!confirm) return;
      try { await callLoveApi('wish_delete', { id }); await this.loadAll(true); }
      catch (error) { if (!handleExpired(error)) this.setData({ status: error.message || '愿望删除失败' }); }
    } });
  },

  async toggleDraw(event) {
    const id = event.currentTarget.dataset.id;
    const field = event.currentTarget.dataset.field;
    const current = event.currentTarget.dataset.value === 'true';
    try { await callLoveApi('draw_update', { id, [field]: !current }); await this.loadAll(true); }
    catch (error) { if (!handleExpired(error)) this.setData({ status: error.message || '抽签记录更新失败' }); }
  },

  shareDraw(event) {
    const item = this.data.draws.find(draw => String(draw._id) === String(event.currentTarget.dataset.id));
    if (!item) return;
    const app = getApp();
    app.globalData.draftMessage = `${item.emoji || '🎴'} 今日情侣抽签：${item.title}`;
    openNotes();
  }
});
