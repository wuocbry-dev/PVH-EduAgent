"use client";

import { Check } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert, Button, cn, Input } from "@/shared/ui";
import { activateAccount } from "../api/auth-api";
import { afterLoginPath, LOGIN_PATH } from "../config";
import { NewPasswordFields, readNewPassword } from "./password-fields";

const STEPS = ["Nhập mã", "Đặt mật khẩu", "Xong"] as const;

// Kích hoạt tài khoản (thay cho đăng ký: tài khoản do nhà trường tạo). Ba bước hiển thị: nhập mã → đặt mật khẩu → xong.
// Vẫn một lần gọi API như trước (mã + mật khẩu mới), chỉ tách giao diện thành bước; sai mã thì quay lại bước 1 sửa được.
export function ActivationForm() {
  const router = useRouter();
  const [step, setStep] = useState<0 | 1 | 2>(0);
  const [identifier, setIdentifier] = useState("");
  const [activationCode, setActivationCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function onCodes(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setStep(1);
  }

  async function onPassword(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    try {
      const me = await activateAccount({ identifier: identifier.trim(), activationCode: activationCode.trim(), newPassword: readNewPassword(form) });
      setStep(2);
      router.replace(afterLoginPath(me.roles, null));
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPending(false);
    }
  }

  return (
    <div className="space-y-5">
      <ol className="flex items-center gap-2 text-xs font-medium" aria-label="Các bước kích hoạt">
        {STEPS.map((label, i) => (
          <li key={label} aria-current={i === step ? "step" : undefined} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "inline-flex size-6 shrink-0 items-center justify-center rounded-full border",
                i < step && "border-primary bg-primary text-primary-foreground",
                i === step && "border-primary bg-primary-soft text-primary",
                i > step && "border-border text-muted",
              )}
            >
              {i < step ? <Check className="size-3.5" aria-hidden /> : i + 1}
            </span>
            <span className={i === step ? "text-foreground" : "text-muted"}>
              <span className="sr-only">Bước {i + 1}: </span>
              {label}
            </span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <form onSubmit={onCodes} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Mã học sinh / mã giáo viên (hoặc email)</span>
            <Input name="identifier" value={identifier} onChange={(e) => setIdentifier(e.target.value)} autoComplete="username" autoCapitalize="none" maxLength={150} required />
          </label>
          <label className="block space-y-1.5 text-sm font-medium">
            <span>Mã kích hoạt (dạng XXXXX-XXXXX)</span>
            <Input
              name="activationCode"
              value={activationCode}
              onChange={(e) => setActivationCode(e.target.value)}
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              maxLength={40}
              required
              className="font-mono tracking-wider uppercase"
            />
          </label>
          {error && <Alert tone="danger">{error}</Alert>}
          <Button type="submit" full>
            Tiếp tục
          </Button>
        </form>
      )}

      {step === 1 && (
        <form onSubmit={onPassword} className="space-y-4">
          <p className="text-sm text-muted">
            Tài khoản <span className="font-medium text-foreground">{identifier.trim()}</span>: đặt mật khẩu của riêng bạn.
          </p>
          <NewPasswordFields />
          {error && <Alert tone="danger">{error}</Alert>}
          <div className="flex flex-col-reverse gap-2 sm:flex-row">
            <Button variant="secondary" onClick={() => setStep(0)} disabled={pending} className="sm:flex-1">
              Quay lại sửa mã
            </Button>
            <Button type="submit" loading={pending} className="sm:flex-2">
              {pending ? "Đang kích hoạt…" : "Kích hoạt và đăng nhập"}
            </Button>
          </div>
        </form>
      )}

      {step === 2 && <Alert tone="success">Đã kích hoạt tài khoản. Đang chuyển tới trang của bạn…</Alert>}

      <p className="text-center text-sm">
        <Link href={LOGIN_PATH} className="rounded-xl font-medium text-primary hover:underline focus-visible:ring-2 focus-visible:ring-accent focus-visible:outline-none">
          Đã có mật khẩu? Đăng nhập
        </Link>
      </p>
    </div>
  );
}
