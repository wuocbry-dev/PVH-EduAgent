import type { Metadata } from "next";
import { AnnouncementComposer, Inbox } from "@/features/announcements";

export const metadata: Metadata = { title: "Thông báo" };

export default function PrincipalAnnouncementsPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Thông báo</h1>
      <section className="space-y-3" aria-labelledby="gui-thong-bao">
        <h2 id="gui-thong-bao" className="text-xl font-semibold">
          Gửi thông báo
        </h2>
        <p className="max-w-3xl text-sm text-muted">
          Gửi cho toàn trường, một khối, một lớp hoặc chỉ giáo viên – nhân sự (học sinh không thấy). Thông báo hiện trong cổng của đúng đối
          tượng, không đăng lên website công khai.
        </p>
        <AnnouncementComposer />
      </section>
      <section className="space-y-3" aria-labelledby="hop-thu">
        <h2 id="hop-thu" className="text-xl font-semibold">
          Hộp thông báo
        </h2>
        <Inbox />
      </section>
    </div>
  );
}
