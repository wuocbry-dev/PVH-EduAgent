"use client";

import { useState, type FormEvent } from "react";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { sendContact } from "../api/contacts-api";

// F07 – form liên hệ. Có ô ẩn `website` chống bot; server giới hạn tần suất theo IP.
export function ContactForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const formEl = e.currentTarget;
    const form = new FormData(formEl);
    setPending(true);
    setError(null);
    setDone(null);
    try {
      const res = await sendContact({
        fullName: String(form.get("fullName")),
        email: String(form.get("email")) || null,
        phone: String(form.get("phone")) || null,
        subject: String(form.get("subject")),
        message: String(form.get("message")),
        website: String(form.get("website")),
      });
      formEl.reset();
      setDone(res.message);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block space-y-1 text-sm">
          <span>Họ và tên *</span>
          <input name="fullName" required maxLength={120} autoComplete="name" className={inputClass} />
        </label>
        <label className="block space-y-1 text-sm">
          <span>Số điện thoại</span>
          <input name="phone" type="tel" maxLength={20} autoComplete="tel" className={inputClass} />
        </label>
      </div>
      <label className="block space-y-1 text-sm">
        <span>Email (cần email hoặc số điện thoại để nhà trường phản hồi)</span>
        <input name="email" type="email" maxLength={150} autoComplete="email" className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Tiêu đề *</span>
        <input name="subject" required maxLength={200} className={inputClass} />
      </label>
      <label className="block space-y-1 text-sm">
        <span>Nội dung * (ít nhất 10 ký tự)</span>
        <textarea name="message" required minLength={10} maxLength={5000} rows={6} className={inputClass} />
      </label>
      {/* Ô ẩn chống bot: người thật không thấy và không điền. */}
      <div aria-hidden className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
        <label>
          Website
          <input name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {error && <p className={errorClass} role="alert">{error}</p>}
      {done && <p className="text-sm text-success" role="status">{done}</p>}
      <button type="submit" disabled={pending} className="w-full rounded-xl bg-primary px-6 py-2 font-medium text-primary-foreground disabled:opacity-50 sm:w-auto">
        {pending ? "Đang gửi…" : "Gửi liên hệ"}
      </button>
    </form>
  );
}
