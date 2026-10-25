-- Mỗi mốc nhắc (BEFORE_DUE, OVERDUE) chỉ gửi một lần cho mỗi công việc.
CREATE UNIQUE INDEX "task_reminders_task_id_remind_type_key" ON "task_reminders"("task_id", "remind_type");
