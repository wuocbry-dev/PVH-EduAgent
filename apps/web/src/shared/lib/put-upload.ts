import { env } from "@/shared/config/env";

export interface PresignedPut {
  uploadUrl: string;
  headers: Record<string, string>;
}

// PUT file thẳng lên kho lưu trữ theo URL ký sẵn (R2: URL đầy đủ của Cloudflare; driver local: đường dẫn tương đối so
// với API). `onProgress` nhận 0–100.
export function putUpload(file: File, presign: PresignedPut, onProgress?: (percent: number) => void): Promise<void> {
  const url = /^https?:\/\//i.test(presign.uploadUrl) ? presign.uploadUrl : `${env.apiUrl}${presign.uploadUrl}`;
  return new Promise((resolve, reject) => {
    // XMLHttpRequest vì fetch chưa báo được tiến độ tải lên.
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(presign.headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Tải file lên kho lưu trữ thất bại (mã ${xhr.status})`));
    xhr.onerror = () => reject(new Error("Mất kết nối khi tải file lên, vui lòng thử lại"));
    xhr.onabort = () => reject(new Error("Đã huỷ tải lên"));
    xhr.send(file);
  });
}
