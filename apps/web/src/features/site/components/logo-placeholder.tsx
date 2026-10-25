// Chưa có logo chính thức của trường: hiển thị khung giữ chỗ rõ ràng, thay bằng ảnh logo khi có.
export function LogoPlaceholder({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <span
      title="Logo trường (chưa có, đang chờ nhà trường cung cấp)"
      className={`${className} inline-flex shrink-0 items-center justify-center rounded-full border-2 border-dashed border-current text-[10px] font-bold leading-none`}
      aria-hidden
    >
      LOGO
    </span>
  );
}
