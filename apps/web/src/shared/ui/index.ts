// Bộ component giao diện dùng chung (bước 29). Quy ước bo: thẻ/khung/hộp thoại rounded-2xl, nút/ô nhập rounded-xl,
// nhãn/chip/avatar rounded-full. Chỉ dùng token màu (globals.css), không viết cứng mã màu.
export { Alert } from "./alert";
export { Badge, type BadgeTone } from "./badge";
export { Breadcrumbs, type Crumb } from "./breadcrumbs";
export { Button, buttonStyles, type ButtonProps, type ButtonVariant } from "./button";
export { Card, cardClass } from "./card";
export { cn } from "./cn";
export { useConfirm, type ConfirmOptions } from "./confirm";
export { Dialog } from "./dialog";
export { EmptyState } from "./empty-state";
export { FormActions } from "./form-actions";
export { errorClass, fieldClass, Input, Select, Textarea } from "./field";
export { PasswordInput } from "./password-input";
export { AppProviders } from "./providers";
export { Skeleton } from "./skeleton";
export { Table } from "./table";
export { ThemeToggle } from "./theme-toggle";
export { useToast } from "./toast";
