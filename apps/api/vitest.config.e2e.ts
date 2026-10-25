import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    globals: true,
    root: './',
    include: ['**/*.e2e-spec.ts'],
    // Các file dùng chung một CSDL và tài khoản seed (có test tạm đổi mật khẩu, quyền vai trò) nên chạy tuần tự.
    fileParallelism: false,
  },
});
