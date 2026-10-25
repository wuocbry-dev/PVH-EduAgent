import { getSiteSettings } from "../api/get-site-settings";
import { DEFAULT_ADDRESS, PENDING, SCHOOL_NAME } from "../lib/school-info";

// Thông tin liên lạc và bản đồ (F07). Đọc cấu hình công khai (có cache) nên đặt trong <Suspense>.
export async function ContactInfo() {
  const settings = await getSiteSettings();
  const address = settings["school.address"] ?? DEFAULT_ADDRESS;
  const query = encodeURIComponent(`${settings["school.name"] ?? SCHOOL_NAME}, ${address}`);
  // Có thể đặt school.map_url trong system_settings để trỏ đúng vị trí; mặc định tìm theo địa chỉ.
  const mapLink = settings["school.map_url"] ?? `https://www.google.com/maps/search/?api=1&query=${query}`;

  return (
    <div className="space-y-4">
      <dl className="space-y-2 text-sm">
        <div>
          <dt className="font-medium">Địa chỉ</dt>
          <dd className="opacity-90">{address}</dd>
        </div>
        <div>
          <dt className="font-medium">Điện thoại</dt>
          <dd className="opacity-90">{settings["school.phone"] ?? PENDING}</dd>
        </div>
        <div>
          <dt className="font-medium">Email</dt>
          <dd className="opacity-90">{settings["school.email"] ?? PENDING}</dd>
        </div>
      </dl>
      <iframe
        title="Bản đồ vị trí trường"
        src={`https://www.google.com/maps?q=${query}&output=embed`}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
        className="h-64 w-full rounded-lg border border-black/10 dark:border-white/15"
      />
      <a href={mapLink} target="_blank" rel="noopener noreferrer" className="inline-block text-sm text-brand underline">
        Mở bản đồ trong cửa sổ mới
      </a>
    </div>
  );
}
