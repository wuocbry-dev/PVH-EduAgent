import { notFound } from "next/navigation";

// Mọi đường dẫn không có trong cổng đều hiện trang 404 riêng của cổng (not-found.tsx) trong khung của cổng.
export default function UnknownPage() {
  notFound();
}
