import { FACILITIES, HISTORY, NAME_MEANING, PENDING, SCHOOL_FACTS } from "../lib/school-info";

const sectionClass = "space-y-3";
const h2Class = "text-xl font-semibold text-brand";

// F02 – Giới thiệu trường. Nội dung tĩnh lấy từ tài liệu phân tích (mục 1).
export function AboutContent() {
  return (
    <div className="space-y-10">
      <section className={sectionClass}>
        <h2 className={h2Class}>Thông tin chung</h2>
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-[14rem_1fr]">
          {SCHOOL_FACTS.map((fact) => (
            <div key={fact.label} className="contents">
              <dt className="font-medium">{fact.label}</dt>
              <dd className="opacity-90">{fact.value}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>Lịch sử thành lập</h2>
        {HISTORY.map((p) => (
          <p key={p} className="leading-relaxed">
            {p}
          </p>
        ))}
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>{NAME_MEANING.title}</h2>
        {NAME_MEANING.paragraphs.map((p) => (
          <p key={p} className="leading-relaxed">
            {p}
          </p>
        ))}
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>Ban giám hiệu</h2>
        <ul className="space-y-2">
          <li className="rounded-lg border border-black/10 p-4 dark:border-white/15">
            <p className="font-semibold">Ông Nguyễn Duy Bình</p>
            <p className="text-sm opacity-80">Hiệu trưởng (nguyên Hiệu trưởng Trường THPT Bình Hưng Hòa)</p>
          </li>
          <li className="rounded-lg border border-black/10 p-4 dark:border-white/15">
            <p className="font-semibold">Phó hiệu trưởng</p>
            <p className="text-sm opacity-80">{PENDING}</p>
          </li>
        </ul>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>Tổ chuyên môn</h2>
        <p className="opacity-80">{PENDING}</p>
      </section>

      <section className={sectionClass}>
        <h2 className={h2Class}>Cơ sở vật chất</h2>
        {FACILITIES.map((p) => (
          <p key={p} className="leading-relaxed">
            {p}
          </p>
        ))}
      </section>
    </div>
  );
}
