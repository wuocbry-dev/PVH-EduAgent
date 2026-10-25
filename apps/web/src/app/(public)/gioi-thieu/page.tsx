import type { Metadata } from "next";
import { AboutContent, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Giới thiệu",
  description: "Lịch sử thành lập, ý nghĩa tên trường, ban giám hiệu và cơ sở vật chất Trường THPT Phan Văn Hớn.",
};

export default function AboutPage() {
  return (
    <PageShell title="Giới thiệu" description="Trường THPT Phan Văn Hớn, phường Đông Hưng Thuận, TP.HCM">
      <AboutContent />
    </PageShell>
  );
}
