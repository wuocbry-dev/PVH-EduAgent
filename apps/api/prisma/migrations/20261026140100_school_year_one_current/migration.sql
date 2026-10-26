-- Chỉ một năm học được đánh dấu hiện hành (Prisma không biểu diễn được index duy nhất một phần).
CREATE UNIQUE INDEX "school_years_one_current" ON "school_years" ("is_current") WHERE "is_current";
