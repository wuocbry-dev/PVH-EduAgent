"use client";

import type { TelegramLinkCodeDto, TelegramLinkStatusDto } from "@pvh/shared";
import { useEffect, useState } from "react";
import { errorClass } from "@/shared/ui/form-styles";
import { createTelegramLinkCode, getTelegramLink, unlinkTelegram } from "../api/telegram-api";
import { Skeleton, useConfirm } from "@/shared/ui";

const errorText = (err: unknown) => (err instanceof Error ? err.message : String(err));
const buttonClass = "rounded-xl bg-primary px-4 py-2 text-sm text-primary-foreground disabled:opacity-50";
const secondaryClass = "rounded-xl border border-border-strong px-4 py-2 text-sm disabled:opacity-50";

function formatCountdown(ms: number) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

// A01 – liên kết tài khoản với bot Telegram bằng OTP 6 số (hạn 5 phút).
export function TelegramLinkCard() {
  const ask = useConfirm();
  const [status, setStatus] = useState<TelegramLinkStatusDto | null>(null);
  const [code, setCode] = useState<TelegramLinkCodeDto | null>(null);
  // Thời điểm hiện tại cho đồng hồ đếm ngược; chỉ đặt khi đã có mã (không đọc giờ lúc prerender).
  const [now, setNow] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    let current = true;
    getTelegramLink()
      .then((s) => current && setStatus(s))
      .catch((err) => current && setError(errorText(err)));
    return () => {
      current = false;
    };
  }, []);

  // Đếm ngược hạn mã; trong lúc chờ thì hỏi lại trạng thái để biết người dùng đã gửi mã cho bot chưa.
  useEffect(() => {
    if (!code) return;
    const tick = setInterval(() => setNow(Date.now()), 1000);
    const poll = setInterval(() => {
      getTelegramLink()
        .then((s) => {
          setStatus(s);
          if (s.linked) setCode(null);
        })
        .catch(() => undefined);
    }, 4000);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [code]);

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setPending(false);
    }
  }

  const generate = () =>
    run(async () => {
      setCode(await createTelegramLinkCode());
      setNow(Date.now());
    });

  const unlink = () =>
    run(async () => {
      if (!(await ask("Huỷ liên kết Telegram? Bot sẽ không nhận lệnh hay gửi thông báo cho bạn nữa."))) return;
      await unlinkTelegram();
      setStatus(await getTelegramLink());
    });

  const remaining = code ? new Date(code.expiresAt).getTime() - now : 0;
  const expired = code !== null && remaining <= 0;

  return (
    <section aria-labelledby="telegram-title" className="space-y-3 rounded-2xl bg-surface border border-border p-4">
      <h2 id="telegram-title" className="font-semibold">
        Telegram
      </h2>

      {!status && !error && <Skeleton />}

      {status && !status.enabled && (
        <p className="text-sm text-muted">Bot Telegram chưa được cấu hình trên máy chủ. Vui lòng báo quản trị viên.</p>
      )}

      {status?.enabled && status.linked && (
        <>
          <p className="text-sm">
            <span className="font-medium text-success">Đã liên kết.</span> Bạn có thể ra lệnh và nhận thông báo (nhắc hạn, báo
            cáo ngày, kết quả đăng bài) qua bot
            {status.botUsername && (
              <>
                {" "}
                <a href={`https://t.me/${status.botUsername}`} target="_blank" rel="noreferrer" className="underline">
                  @{status.botUsername}
                </a>
              </>
            )}
            .
          </p>
          <button type="button" onClick={unlink} disabled={pending} className={secondaryClass}>
            Huỷ liên kết
          </button>
        </>
      )}

      {status?.enabled && !status.linked && (
        <>
          <p className="text-sm text-muted">
            Liên kết để ra lệnh cho trợ lý AI và nhận thông báo qua Telegram. Bot chỉ làm được những việc tài khoản của bạn
            có quyền.
          </p>
          {code && !expired ? (
            <div className="space-y-2">
              <p className="text-sm">
                Gửi cho bot
                {status.botUsername ? ` @${status.botUsername}` : ""} tin nhắn sau (còn hiệu lực{" "}
                <span className="font-medium tabular-nums">{formatCountdown(remaining)}</span>):
              </p>
              <p className="font-mono text-2xl font-bold tracking-widest select-all">/link {code.code}</p>
              {code.deepLink && (
                <a href={code.deepLink} target="_blank" rel="noreferrer" className={`inline-block ${buttonClass}`}>
                  Mở bot trên Telegram
                </a>
              )}
              <p className="text-xs text-muted">Trang sẽ tự cập nhật khi liên kết xong. Không chia sẻ mã này cho người khác.</p>
            </div>
          ) : (
            <>
              {expired && <p className="text-sm text-warning">Mã đã hết hạn, hãy sinh mã mới.</p>}
              <button type="button" onClick={generate} disabled={pending} className={buttonClass}>
                Liên kết Telegram
              </button>
            </>
          )}
        </>
      )}

      {error && <p className={errorClass}>{error}</p>}
    </section>
  );
}
