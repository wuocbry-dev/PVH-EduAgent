import { BadRequestException } from '@nestjs/common';

// id trong URL là chuỗi số (BigInt trong CSDL); từ chối giá trị không hợp lệ trước khi gọi BigInt().
export function parseId(id: string): bigint {
  if (!/^\d{1,18}$/.test(id)) throw new BadRequestException('Mã không hợp lệ');
  return BigInt(id);
}
