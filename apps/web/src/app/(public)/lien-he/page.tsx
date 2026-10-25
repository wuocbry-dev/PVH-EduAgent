import type { Metadata } from "next";
import { Suspense } from "react";
import { ContactForm } from "@/features/contacts";
import { ContactInfo, Loading, PageShell } from "@/features/site";

export const metadata: Metadata = {
  title: "Liên hệ",
  description: "Gửi câu hỏi, góp ý tới Trường THPT Phan Văn Hớn; địa chỉ và bản đồ.",
  alternates: { canonical: "/lien-he" },
};

// F07 – Liên hệ: form gửi tới bảng contacts, thông tin liên lạc và bản đồ.
export default function ContactPage() {
  return (
    <PageShell title="Liên hệ" description="Gửi câu hỏi hoặc góp ý, nhà trường sẽ phản hồi qua email hoặc điện thoại bạn để lại.">
      <div className="grid gap-10 lg:grid-cols-[3fr_2fr]">
        <section aria-labelledby="gui-lien-he" className="space-y-4">
          <h2 id="gui-lien-he" className="text-xl font-semibold text-brand">
            Gửi liên hệ
          </h2>
          <ContactForm />
        </section>
        <section aria-labelledby="thong-tin" className="space-y-4">
          <h2 id="thong-tin" className="text-xl font-semibold text-brand">
            Thông tin liên lạc
          </h2>
          <Suspense fallback={<Loading />}>
            <ContactInfo />
          </Suspense>
        </section>
      </div>
    </PageShell>
  );
}
