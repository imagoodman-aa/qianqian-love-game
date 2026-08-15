const FUNCTION_NAME = 'loveProxy';

function makeError(message, status) {
  const error = new Error(message || '服务暂时不可用');
  error.status = Number(status || 0);
  return error;
}

async function callLoveApi(action, payload = {}, tokenOverride) {
  const app = getApp();
  const sessionToken = tokenOverride === undefined
    ? app.globalData.sessionToken
    : tokenOverride;

  let response;
  try {
    response = await wx.cloud.callFunction({
      name: FUNCTION_NAME,
      data: { action, payload, sessionToken: sessionToken || '' }
    });
  } catch (error) {
    throw makeError(error && error.errMsg ? '云服务连接失败，请稍后重试' : '网络连接失败，请稍后重试');
  }

  const result = response.result || {};
  if (!result.ok) throw makeError(result.error, result.status);
  return result.data || {};
}

function handleExpired(error) {
  if (Number(error && error.status) !== 401) return false;
  const app = getApp();
  app.clearSession();
  wx.reLaunch({ url: '/pages/login/login?expired=1' });
  return true;
}

module.exports = { callLoveApi, handleExpired };
