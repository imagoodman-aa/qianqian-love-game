const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const LOVE_API_HOST = 'hctlyoavylhaebqpukbn.supabase.co';
const LOVE_API_PATH = '/functions/v1/love-board';
const ALLOWED_ACTIONS = new Set(['login', 'me', 'list', 'send', 'logout']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const db = cloud.database();
const COLLECTIONS = {
  settings: 'qianqian_couple_settings',
  moods: 'qianqian_couple_moods',
  wishes: 'qianqian_couple_wishes',
  draws: 'qianqian_couple_draws',
  album: 'qianqian_couple_album'
};
let collectionsReady = null;

async function ensureCollections() {
  if (!collectionsReady) {
    collectionsReady = Promise.all(Object.values(COLLECTIONS).map(name => db.createCollection(name).catch(() => null)));
  }
  await collectionsReady;
}

function apiRequest(action, payload, sessionToken) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ action, ...(payload || {}) });
    const headers = {
      'content-type': 'application/json',
      'content-length': Buffer.byteLength(body),
      'user-agent': 'qianqian-love-miniprogram/1.0'
    };
    if (sessionToken) headers['x-love-session'] = sessionToken;

    const request = https.request({
      hostname: LOVE_API_HOST,
      port: 443,
      path: LOVE_API_PATH,
      method: 'POST',
      headers,
      timeout: 9000
    }, response => {
      const chunks = [];
      response.on('data', chunk => chunks.push(chunk));
      response.on('end', () => {
        let data = {};
        try { data = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch (_) { /* 使用通用错误 */ }
        const status = Number(response.statusCode || 500);
        if (status < 200 || status >= 300) {
          reject({ status, message: data.error || '服务暂时不可用' });
          return;
        }
        resolve(data);
      });
    });

    request.on('timeout', () => request.destroy(new Error('连接超时，请稍后重试')));
    request.on('error', error => reject({ status: 0, message: error.message || '网络连接失败' }));
    request.write(body);
    request.end();
  });
}

function detectMime(buffer) {
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer.length >= 12 && buffer.subarray(0, 4).toString() === 'RIFF' && buffer.subarray(8, 12).toString() === 'WEBP') return 'image/webp';
  return '';
}

async function sendCloudImage(payload, sessionToken) {
  const cloudFileId = String(payload.cloudFileId || '');
  if (!sessionToken) throw { status: 401, message: '请先登录' };
  if (!cloudFileId.startsWith('cloud://')) throw { status: 400, message: '图片地址无效' };

  try {
    const download = await cloud.downloadFile({ fileID: cloudFileId });
    const buffer = Buffer.from(download.fileContent || []);
    if (!buffer.length) throw { status: 400, message: '图片内容为空' };
    if (buffer.length > MAX_IMAGE_BYTES) throw { status: 413, message: '图片不能超过 2 MB' };
    const mimeType = detectMime(buffer);
    if (!mimeType) throw { status: 400, message: '仅支持 JPG、PNG 或 WebP 图片' };

    return await apiRequest('send_image', {
      caption: String(payload.caption || '').slice(0, 500),
      imageBase64: buffer.toString('base64'),
      mimeType,
      notify: false
    }, sessionToken);
  } finally {
    try { await cloud.deleteFile({ fileList: [cloudFileId] }); } catch (_) { /* 临时文件会由云端后续清理 */ }
  }
}

async function getIdentity(sessionToken) {
  if (!sessionToken) throw { status: 401, message: '请先登录' };
  const result = await apiRequest('me', {}, sessionToken);
  const user = result && (result.user || result);
  if (!user || !user.username) throw { status: 401, message: '登录已过期，请重新登录' };
  return { username: String(user.username).toLowerCase(), displayName: String(user.displayName || user.username) };
}

function cleanText(value, maxLength) {
  return String(value || '').trim().slice(0, maxLength);
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';
}

async function readCoupleState() {
  const result = await db.collection(COLLECTIONS.settings).where({ key: 'default' }).limit(1).get();
  return result.data[0] || { key: 'default', anniversaryDate: '', updatedAt: '' };
}

async function writeCoupleState(payload, identity) {
  const anniversaryDate = validDate(payload.anniversaryDate);
  if (!anniversaryDate) throw { status: 400, message: '请选择有效的在一起日期' };
  const current = await db.collection(COLLECTIONS.settings).where({ key: 'default' }).limit(1).get();
  const data = { key: 'default', anniversaryDate, updatedAt: new Date().toISOString(), updatedBy: identity.username };
  if (current.data[0]) await db.collection(COLLECTIONS.settings).doc(current.data[0]._id).update({ data });
  else await db.collection(COLLECTIONS.settings).add({ data });
  return { ...data };
}

async function listMoods() {
  const result = await db.collection(COLLECTIONS.moods).orderBy('createdAt', 'desc').limit(30).get();
  return { moods: result.data || [] };
}

async function setMood(payload, identity) {
  const emoji = cleanText(payload.emoji, 8);
  if (!emoji) throw { status: 400, message: '请选择一个心情' };
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(payload.dateKey || ''))
    ? String(payload.dateKey) : new Date().toISOString().slice(0, 10);
  const data = {
    username: identity.username,
    displayName: identity.displayName,
    dateKey,
    emoji,
    note: cleanText(payload.note, 80),
    createdAt: new Date().toISOString()
  };
  const current = await db.collection(COLLECTIONS.moods).where({ username: identity.username, dateKey }).limit(1).get();
  if (current.data[0]) await db.collection(COLLECTIONS.moods).doc(current.data[0]._id).update({ data });
  else await db.collection(COLLECTIONS.moods).add({ data });
  return { mood: data };
}

async function listWishes() {
  const result = await db.collection(COLLECTIONS.wishes).orderBy('createdAt', 'desc').limit(100).get();
  return { wishes: result.data || [] };
}

async function addWish(payload, identity) {
  const title = cleanText(payload.title, 80);
  if (!title) throw { status: 400, message: '先写下一个愿望吧' };
  const data = { title, createdBy: identity.username, createdByName: identity.displayName, createdAt: new Date().toISOString(), done: false, doneBy: '' };
  const result = await db.collection(COLLECTIONS.wishes).add({ data });
  return { wish: { ...data, _id: result._id } };
}

async function updateWish(payload, identity) {
  const id = cleanText(payload.id, 64);
  if (!id) throw { status: 400, message: '愿望编号无效' };
  const done = Boolean(payload.done);
  await db.collection(COLLECTIONS.wishes).doc(id).update({ data: { done, doneBy: done ? identity.displayName : '', doneAt: done ? new Date().toISOString() : '' } });
  return { id, done };
}

async function deleteWish(payload, identity) {
  const id = cleanText(payload.id, 64);
  if (!id) throw { status: 400, message: '愿望编号无效' };
  const current = await db.collection(COLLECTIONS.wishes).doc(id).get();
  if (!current.data || current.data.createdBy !== identity.username) throw { status: 403, message: '只能删除自己添加的愿望' };
  await db.collection(COLLECTIONS.wishes).doc(id).remove();
  return { id };
}

async function listDraws() {
  const result = await db.collection(COLLECTIONS.draws).orderBy('createdAt', 'desc').limit(50).get();
  return { draws: result.data || [] };
}

async function saveDraw(payload, identity) {
  const title = cleanText(payload.title, 120);
  if (!title) throw { status: 400, message: '抽签内容不能为空' };
  const data = {
    activityIndex: Number(payload.activityIndex),
    category: cleanText(payload.category, 30),
    emoji: cleanText(payload.emoji, 8),
    title,
    createdBy: identity.username,
    createdByName: identity.displayName,
    createdAt: new Date().toISOString(),
    favorite: false,
    done: false
  };
  const result = await db.collection(COLLECTIONS.draws).add({ data });
  return { draw: { ...data, _id: result._id } };
}

async function updateDraw(payload) {
  const id = cleanText(payload.id, 64);
  if (!id) throw { status: 400, message: '抽签编号无效' };
  const data = {};
  if (typeof payload.favorite === 'boolean') data.favorite = payload.favorite;
  if (typeof payload.done === 'boolean') data.done = payload.done;
  if (!Object.keys(data).length) throw { status: 400, message: '没有要更新的内容' };
  await db.collection(COLLECTIONS.draws).doc(id).update({ data });
  return { id, ...data };
}

async function listAlbum() {
  const result = await db.collection(COLLECTIONS.album).orderBy('createdAt', 'desc').limit(100).get();
  const rows = result.data || [];
  const files = rows.map(item => item.cloudFileId).filter(Boolean);
  let urls = [];
  if (files.length) {
    const temp = await cloud.getTempFileURL({ fileList: files });
    urls = temp.fileList || [];
  }
  const urlMap = new Map(urls.map(item => [item.fileID, item.tempFileURL]));
  return { photos: rows.map(item => ({ ...item, imageUrl: urlMap.get(item.cloudFileId) || '' })) };
}

async function addAlbum(payload, identity) {
  const cloudFileId = cleanText(payload.cloudFileId, 300);
  if (!cloudFileId.startsWith('cloud://')) throw { status: 400, message: '相册图片地址无效' };
  const data = {
    cloudFileId,
    caption: cleanText(payload.caption, 120),
    createdBy: identity.username,
    createdByName: identity.displayName,
    createdAt: new Date().toISOString()
  };
  const result = await db.collection(COLLECTIONS.album).add({ data });
  return { photo: { ...data, _id: result._id } };
}

async function deleteAlbum(payload, identity) {
  const id = cleanText(payload.id, 64);
  if (!id) throw { status: 400, message: '相册图片编号无效' };
  const current = await db.collection(COLLECTIONS.album).doc(id).get();
  if (!current.data || current.data.createdBy !== identity.username) throw { status: 403, message: '只能删除自己上传的照片' };
  await db.collection(COLLECTIONS.album).doc(id).remove();
  if (current.data.cloudFileId) {
    try { await cloud.deleteFile({ fileList: [current.data.cloudFileId] }); } catch (_) { /* 云文件删除失败不影响记录删除 */ }
  }
  return { id };
}

async function handleSharedAction(action, payload, sessionToken) {
  await ensureCollections();
  const identity = await getIdentity(sessionToken);
  if (action === 'couple_read') return readCoupleState();
  if (action === 'couple_write') return writeCoupleState(payload, identity);
  if (action === 'mood_list') return listMoods();
  if (action === 'mood_set') return setMood(payload, identity);
  if (action === 'wish_list') return listWishes();
  if (action === 'wish_add') return addWish(payload, identity);
  if (action === 'wish_toggle') return updateWish(payload, identity);
  if (action === 'wish_delete') return deleteWish(payload, identity);
  if (action === 'draw_list') return listDraws();
  if (action === 'draw_save') return saveDraw(payload, identity);
  if (action === 'draw_update') return updateDraw(payload, identity);
  if (action === 'album_list') return listAlbum();
  if (action === 'album_add') return addAlbum(payload, identity);
  if (action === 'album_delete') return deleteAlbum(payload, identity);
  throw { status: 400, message: '不支持的操作' };
}

exports.main = async event => {
  const action = String(event.action || '');
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const sessionToken = String(event.sessionToken || '').slice(0, 300);

  try {
    const sharedActions = new Set(['couple_read', 'couple_write', 'mood_list', 'mood_set', 'wish_list', 'wish_add', 'wish_toggle', 'wish_delete', 'draw_list', 'draw_save', 'draw_update', 'album_list', 'album_add', 'album_delete']);
    const data = action === 'send_cloud_image'
      ? await sendCloudImage(payload, sessionToken)
      : sharedActions.has(action)
        ? await handleSharedAction(action, payload, sessionToken)
      : ALLOWED_ACTIONS.has(action)
        ? await apiRequest(action, action === 'send' ? { ...payload, notify: false } : payload, sessionToken)
        : (() => { throw { status: 400, message: '不支持的操作' }; })();
    return { ok: true, data };
  } catch (error) {
    return {
      ok: false,
      status: Number(error.status || 500),
      error: error.message || '服务暂时不可用'
    };
  }
};
