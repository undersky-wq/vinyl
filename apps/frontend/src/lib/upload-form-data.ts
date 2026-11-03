export function uploadFormData<T>(url: string, payload: FormData, onProgress: (percent: number | null) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', url);
    request.withCredentials = true;
    request.timeout = 60 * 60 * 1000;
    request.upload.onprogress = event => onProgress(event.lengthComputable ? Math.min(99, Math.round(event.loaded / event.total * 100)) : null);
    request.upload.onload = () => onProgress(100);
    request.onload = () => {
      let data: any;
      try { data = JSON.parse(request.responseText); } catch { reject(new Error(`Invalid server response (${request.status})`)); return; }
      if (request.status < 200 || request.status >= 300) {
        const message = Array.isArray(data?.message) ? data.message.join(', ') : data?.message;
        reject(new Error(typeof message === 'string' ? message : `Upload failed (${request.status})`)); return;
      }
      resolve(data as T);
    };
    request.onerror = () => reject(new Error('Connection lost during upload'));
    request.ontimeout = () => reject(new Error('Upload timed out'));
    request.onabort = () => reject(new Error('Upload cancelled'));
    request.send(payload);
  });
}
