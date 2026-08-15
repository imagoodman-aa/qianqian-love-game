const cloud = require('wx-server-sdk');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const LOVE_API_HOST = 'hctlyoavylhaebqpukbn.supabase.co';
const LOVE_API_PATH = '/functions/v1/love-board';
const ALLOWED_ACTIONS = new Set(['login', 'me', 'list', 'send', 'logout']);
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;

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
      mimeType
    }, sessionToken);
  } finally {
    try { await cloud.deleteFile({ fileList: [cloudFileId] }); } catch (_) { /* 临时文件会由云端后续清理 */ }
  }
}

exports.main = async event => {
  const action = String(event.action || '');
  const payload = event.payload && typeof event.payload === 'object' ? event.payload : {};
  const sessionToken = String(event.sessionToken || '').slice(0, 300);

  try {
    const data = action === 'send_cloud_image'
      ? await sendCloudImage(payload, sessionToken)
      : ALLOWED_ACTIONS.has(action)
        ? await apiRequest(action, payload, sessionToken)
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
