-- Tạo tài khoản và CSDL cho môi trường phát triển. Chạy MỘT lần bằng tài khoản postgres:
--   & "C:\Program Files\PostgreSQL\18\bin\psql.exe" -U postgres -f apps/api/prisma/init-db.sql
-- Mật khẩu 'pvh' chỉ dùng trên máy cá nhân; trên server thật hãy đặt mật khẩu mạnh.

-- CREATEDB: `prisma migrate dev` cần tạo "shadow database" tạm để kiểm tra migration.
CREATE ROLE pvh WITH LOGIN PASSWORD 'pvh' CREATEDB;
CREATE DATABASE pvh_eduagent OWNER pvh ENCODING 'UTF8';
