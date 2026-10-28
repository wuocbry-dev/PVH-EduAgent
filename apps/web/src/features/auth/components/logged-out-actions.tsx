import { House, LogIn } from "lucide-react";
import Link from "next/link";
import { buttonStyles } from "@/shared/ui";
import { LOGIN_PATH } from "../config";

export function LoggedOutActions() {
  return (
    <div className="space-y-3">
      <Link href={LOGIN_PATH} className={buttonStyles({ full: true })}>
        <LogIn className="size-4" aria-hidden />
        Đăng nhập lại
      </Link>
      <Link href="/" className={buttonStyles({ variant: "secondary", full: true })}>
        <House className="size-4" aria-hidden />
        Về trang chủ
      </Link>
    </div>
  );
}
