"use client";

import type { AccountSlipDto, ClassStudentDto } from "@pvh/shared";
import Link from "next/link";
import { useState } from "react";
import { reissueActivationCode, SlipSheet } from "@/features/roster";
import { formatDateTime } from "@/shared/lib/format";
import { errorText, useData } from "@/shared/lib/use-data";
import { errorClass, inputClass } from "@/shared/ui/form-styles";
import { getMyAcademicClient, listClassStudents } from "../api/academic-api";
import { Skeleton, Table, useConfirm } from "@/shared/ui";

const smallButton = "rounded-xl border border-border-strong px-3 py-1 text-sm disabled:opacity-50";
const STATUS: Record<ClassStudentDto["status"], string> = { ACTIVE: "Đã kích hoạt", PENDING: "Chờ kích hoạt", LOCKED: "Đang bị khoá" };
const loadStudents = (classId: string) => (classId ? listClassStudents(classId) : Promise.resolve(null));

// Cổng giáo viên – lớp chủ nhiệm: danh sách học sinh (trạng thái tài khoản, lần đăng nhập gần nhất), cấp lại mã kích hoạt
// và in phiếu cho các em quên mật khẩu/mất phiếu. Mã chỉ hiện một lần ngay sau khi cấp.
export function HomeroomClass() {
  const ask = useConfirm();
  const me = useData(getMyAcademicClient, undefined);
  const [selected, setSelected] = useState<string | null>(null);
  const classId = selected ?? me.data?.homeroomClasses[0]?.id ?? "";
  const students = useData(loadStudents, classId);
  const [slips, setSlips] = useState<AccountSlipDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reissue(s: ClassStudentDto) {
    if (!(await ask(`Cấp lại mã kích hoạt cho ${s.fullName} (${s.studentCode})? Mã cũ và mọi phiên đăng nhập của em sẽ bị huỷ.`))) return;
    setBusy(s.userId);
    setError(null);
    try {
      const slip = await reissueActivationCode(s.userId);
      setSlips((prev) => [...prev.filter((p) => p.userId !== slip.userId), slip]);
      students.reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(null);
    }
  }

  if (me.error) return <p className={errorClass}>{me.error}</p>;
  if (!me.data) return <Skeleton />;
  const classes = me.data.homeroomClasses;
  if (classes.length === 0) return <p className="text-sm text-muted">Bạn không chủ nhiệm lớp nào trong năm học hiện hành.</p>;
  const list = students.data ?? [];
  const pending = list.filter((s) => s.status === "PENDING").length;
  const never = list.filter((s) => s.status === "ACTIVE" && !s.lastLoginAt).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        {classes.length > 1 && (
          <label className="space-y-1 text-sm">
            <span>Lớp</span>
            <select value={classId} onChange={(e) => (setSelected(e.target.value), setSlips([]))} className={`${inputClass} w-auto`}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
        )}
        <Link href="/giao-vien/thong-bao" className={smallButton}>
          Gửi thông báo cho lớp
        </Link>
        <Link href="/giao-vien/so-diem" className={smallButton}>
          Bảng điểm lớp
        </Link>
      </div>

      {students.error && <p className={errorClass}>{students.error}</p>}
      {error && <p className={errorClass}>{error}</p>}
      {students.data && (
        <section className="space-y-2 print:hidden" aria-label="Danh sách lớp">
          <p className="text-sm">
            Sĩ số <strong>{list.length}</strong> · chờ kích hoạt <strong>{pending}</strong> · đã kích hoạt nhưng chưa đăng nhập lần nào{" "}
            <strong>{never}</strong>
          </p>
          <Table stickyFirstColumn>
            <thead className="border-b border-border">
              <tr>
                <th className="px-2 py-2">STT</th>
                <th className="px-2 py-2">Mã HS</th>
                <th className="px-2 py-2">Họ và tên</th>
                <th className="px-2 py-2">Tài khoản</th>
                <th className="whitespace-nowrap px-2 py-2">Đăng nhập gần nhất</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {list.map((s, i) => (
                <tr key={s.userId} className="border-b border-border">
                  <td className="px-2 py-1.5">{i + 1}</td>
                  <td className="px-2 py-1.5 font-mono">{s.studentCode}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{s.fullName}</td>
                  <td className={`whitespace-nowrap px-2 py-1.5 ${s.status === "ACTIVE" ? "" : "text-warning"}`}>{STATUS[s.status]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : <span className="text-muted">chưa có</span>}</td>
                  <td className="px-2 py-1.5">
                    <button type="button" className={`${smallButton} whitespace-nowrap`} disabled={busy === s.userId || s.status === "LOCKED"} onClick={() => void reissue(s)}>
                      Cấp lại mã
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </Table>
        </section>
      )}

      {slips.length > 0 && (
        <section className="space-y-2" aria-label="Phiếu tài khoản vừa cấp">
          <div className="flex flex-wrap items-center gap-3 print:hidden">
            <p className="text-sm">Mã kích hoạt chỉ hiện một lần: hãy in phiếu và phát cho học sinh ngay.</p>
            <button type="button" className={smallButton} onClick={() => window.print()}>
              In phiếu
            </button>
          </div>
          <SlipSheet slips={slips} />
        </section>
      )}
    </div>
  );
}
