export const ADMIN_SITE_ORIGIN = 'https://mityadima.ru';

export function isAdminSiteUrl(value: string) {
  try { return new URL(value).origin === ADMIN_SITE_ORIGIN; } catch { return false; }
}

export function isAdminPageUrl(value: string) {
  if (!isAdminSiteUrl(value)) return false;
  const path = new URL(value).pathname;
  return path === '/profile' || path.startsWith('/profile/') || path === '/upload'
    || path === '/privacy' || path === '/consent';
}

export function recoveryDownloadText(raw: string) {
  if (raw.length > 40000) return null;
  try {
    const data = JSON.parse(raw);
    return data.channel === 'vinyl-admin-download' && data.name === 'mityadima-recovery-codes.txt'
      && typeof data.text === 'string' && data.text.length > 0 && data.text.length <= 16000
      ? data.text as string : null;
  } catch { return null; }
}

// Handle only the existing site's explicit recovery-code download action.
export const ADMIN_DOWNLOAD_BRIDGE = `
(function(){
  if(window.location.origin !== '${ADMIN_SITE_ORIGIN}' || window.__vinylAdminDownload)return;
  window.__vinylAdminDownload=true;
  var original=HTMLAnchorElement.prototype.click;
  HTMLAnchorElement.prototype.click=function(){
    if(this.download==='mityadima-recovery-codes.txt' && this.href.indexOf('blob:')===0){
      fetch(this.href).then(function(r){return r.text();}).then(function(text){
        if(text.length<=16000)window.ReactNativeWebView.postMessage(JSON.stringify({channel:'vinyl-admin-download',name:'mityadima-recovery-codes.txt',text:text}));
      });
      return;
    }
    return original.apply(this,arguments);
  };
})();true;`;
