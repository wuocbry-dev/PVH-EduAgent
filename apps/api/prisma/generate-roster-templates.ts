// Tạo hai file Excel mẫu nhập danh sách (dữ liệu GIẢ) vào docs/mau/. Chạy: pnpm --filter api roster:templates
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildTemplate } from '../src/features/roster/excel.js';

const dir = resolve(process.cwd(), '../../docs/mau');
await mkdir(dir, { recursive: true });
await writeFile(resolve(dir, 'mau-nhap-hoc-sinh.xlsx'), await buildTemplate('STUDENT'));
await writeFile(resolve(dir, 'mau-nhap-giao-vien.xlsx'), await buildTemplate('TEACHER'));
console.log(`Đã tạo file mẫu trong ${dir}`);
