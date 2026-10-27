// Bảng endpoint → quyền: nguồn duy nhất cho security.e2e-spec.ts (route thật ↔ bảng, 401, tài khoản không quyền)
// và role-matrix.e2e-spec.ts (mọi endpoint × mọi vai trò). docs/04-bang-endpoint-quyen.md được viết từ bảng này.

export type Access = 'public' | 'self' | string[];

//   public  = không cần đăng nhập (đã có biện pháp riêng: rate limit, secret, chỉ dữ liệu đã công bố)
//   self    = cần đăng nhập, chỉ thao tác trên dữ liệu của chính mình (hoặc từng thao tác tự kiểm quyền trong tool)
//   [..]    = cần ít nhất các quyền này (service gọi assertPermission/can; một số còn kiểm tra quyền sở hữu)
export const ROUTES: Record<string, Access> = {
  'POST /auth/login': 'public',
  'POST /auth/activate': 'public', // mã kích hoạt dùng một lần; giới hạn theo IP và mã đăng nhập
  'POST /auth/refresh': 'public',
  'POST /auth/logout': 'public',
  'GET /auth/me': 'self',
  'POST /auth/change-password': 'self',
  'POST /auth/forgot-password': 'public',
  'POST /auth/reset-password': 'public',

  'GET /academic/me': 'self', // chỉ thông tin học vụ của chính mình
  'GET /academic/school-years': ['academic:manage'],
  'POST /academic/school-years': ['academic:manage'],
  'PATCH /academic/school-years/:id': ['academic:manage'],
  'DELETE /academic/school-years/:id': ['academic:manage'],
  'GET /academic/semesters': ['academic:manage'],
  'POST /academic/semesters': ['academic:manage'],
  'PATCH /academic/semesters/:id': ['academic:manage'],
  'DELETE /academic/semesters/:id': ['academic:manage'],
  'GET /academic/grades': ['academic:manage'],
  'GET /academic/departments': ['academic:manage'],
  'POST /academic/departments': ['academic:manage'],
  'PATCH /academic/departments/:id': ['academic:manage'],
  'DELETE /academic/departments/:id': ['academic:manage'],
  'GET /academic/subjects': ['academic:manage'],
  'POST /academic/subjects': ['academic:manage'],
  'PATCH /academic/subjects/:id': ['academic:manage'],
  'DELETE /academic/subjects/:id': ['academic:manage'],
  'GET /academic/rooms': ['academic:manage'],
  'POST /academic/rooms': ['academic:manage'],
  'PATCH /academic/rooms/:id': ['academic:manage'],
  'DELETE /academic/rooms/:id': ['academic:manage'],
  'GET /academic/teachers': ['academic:manage'],
  'GET /academic/classes': ['academic:manage'],
  'POST /academic/classes': ['academic:manage'],
  'PATCH /academic/classes/sessions': ['academic:manage'],
  'PATCH /academic/classes/:id': ['academic:manage'],
  'DELETE /academic/classes/:id': ['academic:manage'],
  'GET /academic/classes/:id/students': ['academic:manage'], // hoặc giáo viên chủ nhiệm đúng lớp
  'POST /academic/students/:userId/transfer': ['academic:manage'],

  'POST /agent/chat': 'self',
  'GET /agent/actions': 'self',
  'POST /agent/actions/:id/confirm': 'self',
  'POST /agent/actions/:id/cancel': 'self',

  'GET /audit-logs': ['system:read'],
  'GET /audit-logs/filters': ['system:read'],

  'GET /categories': 'public',
  'POST /categories': ['post:approve'],
  'PATCH /categories/:id': ['post:approve'],
  'DELETE /categories/:id': ['post:approve'],

  'POST /contacts': 'public',
  'GET /contacts': ['post:approve'],
  'PATCH /contacts/:id/status': ['post:approve'],

  'GET /events': 'public',
  'GET /events/mine': 'self', // sự kiện toàn trường + đúng đối tượng (bước 20)
  'GET /events/targets': ['post:approve'],
  'POST /events': ['post:approve'],
  'PATCH /events/:id': ['post:approve'],
  'DELETE /events/:id': ['post:approve'],

  'POST /media/presign': ['post:create'],
  'POST /media/:id/complete': ['post:create'],
  'GET /media': ['post:create'],
  'DELETE /media/:id': ['post:create'],
  'PUT /media/local-upload/:id': 'public', // xác thực bằng token HMAC trong query
  'GET /media/files/:name': 'public',

  'GET /posts/manage': ['post:create'],
  'GET /posts/manage/:id': ['post:create'],
  'POST /posts': ['post:create'],
  'PATCH /posts/:id': ['post:create'],
  'POST /posts/:id/submit': ['post:create'],
  'POST /posts/:id/approve': ['post:approve', 'post:schedule'],
  'POST /posts/:id/reject': ['post:approve'],
  'POST /posts/:id/reschedule': ['post:schedule'],
  'POST /posts/:id/publish': ['post:schedule'],
  'POST /posts/:id/cancel-schedule': ['post:schedule'],
  'POST /posts/:id/unpublish': ['post:unpublish'],
  'POST /posts/:id/restore': ['post:unpublish'],
  'DELETE /posts/:id': ['post:create|role:ADMIN'],

  'GET /public/posts': 'public',
  'GET /public/posts/:slug': 'public',
  'POST /public/posts/:slug/view': 'public',
  'GET /public/admission': 'public',
  'GET /public/settings': 'public',
  'GET /public/gallery': 'public',

  'GET /roster/templates/:kind': ['student:import'],
  'POST /roster/import/:kind/preview': ['student:import'],
  'POST /roster/import/:previewId/confirm': ['student:import'],
  'POST /roster/users/:userId/activation-code': ['student:import'], // hoặc giáo viên chủ nhiệm của học sinh đó
  'POST /roster/classes/:classId/activation-codes': ['student:import'],

  'GET /roles': ['user:manage'],
  'PUT /roles/:code/permissions': ['user:manage'],

  'GET /settings': ['system:read'],
  'PATCH /settings': ['setting:manage'],

  'GET /system/health': 'public',
  'GET /system/status': ['system:read'],
  'GET /system/dashboard': 'self',
  'GET /system/overview': ['academic:manage'],

  'GET /tasks/deadlines': ['task:read:all|task:read:own'],
  'GET /tasks/assignees': ['task:assign|task:read:all'],
  'GET /tasks': ['task:read:all|task:read:own'],
  'GET /tasks/:id': ['task:read:all|task:read:own'],
  'POST /tasks': ['task:assign'],
  'PATCH /tasks/:id': ['task:assign'],
  'PATCH /tasks/:id/status': ['task:assign|task:read:own|task:read:all'], // người được giao tự đổi trạng thái việc của mình
  'DELETE /tasks/:id': ['task:assign'],

  'POST /telegram/webhook': 'public',
  'GET /timetable/frame': 'self',
  'PUT /timetable/frame': ['timetable:manage|setting:manage'], // hoặc setting:manage (ADMIN)
  'GET /timetable/versions': ['timetable:read'],
  'POST /timetable/versions': ['timetable:manage'],
  'DELETE /timetable/versions/:id': ['timetable:manage'],
  'POST /timetable/versions/:id/publish': ['timetable:manage'],
  'GET /timetable/versions/:id/slots': ['timetable:read'],
  'POST /timetable/versions/:id/slots': ['timetable:manage'],
  'GET /timetable/versions/:id/options': ['timetable:read'],
  'GET /timetable/versions/:id/stats': ['timetable:read'],
  'PATCH /timetable/slots/:id': ['timetable:manage'],
  'DELETE /timetable/slots/:id': ['timetable:manage'],
  'GET /timetable/fixed': 'self',
  'POST /timetable/fixed': ['timetable:manage'],
  'DELETE /timetable/fixed/:id': ['timetable:manage'],
  'GET /timetable/unavailability': ['timetable:read'],
  'GET /timetable/unavailability/mine': 'self',
  'PUT /timetable/unavailability/mine': 'self', // chỉ giáo viên (có hồ sơ giáo viên)
  'GET /timetable/view/mine': 'self',
  'GET /timetable/view/class/:classId': 'self', // quản lý/ADMIN mọi lớp; học sinh lớp mình; giáo viên lớp mình dạy
  'GET /timetable/view/teacher/:teacherId': 'self', // quản lý/ADMIN mọi giáo viên; giáo viên chỉ của mình
  'GET /timetable/export': ['timetable:read'],

  'GET /teaching/quotas': ['teaching:read'],
  'PUT /teaching/quotas': ['teaching:assign'],
  'PUT /teaching/quotas/class': ['teaching:assign'],
  'GET /teaching/assignments': ['teaching:read'],
  'POST /teaching/assignments': ['teaching:assign'],
  'POST /teaching/assignments/copy': ['teaching:assign'],
  'PATCH /teaching/assignments/:id': ['teaching:assign'],
  'DELETE /teaching/assignments/:id': ['teaching:assign'],
  'GET /teaching/summary': ['teaching:read'],
  'GET /teaching/summary/export': ['teaching:read'],
  'GET /teaching/mine': 'self', // chỉ phân công của chính mình
  'PUT /teaching/teachers/:userId/quota': ['teaching:assign'],

  // Điểm (bước 18): ngoài quyền còn kiểm tra phạm vi phân công lớp–môn–học kỳ trong service; ADMIN không có quyền điểm.
  'GET /scores/context': ['score:enter|assessment:manage|score:read:all'], // hoặc assessment:manage / score:read:all
  'GET /scores/progress': ['score:read:all'],
  'GET /scores/assessments': ['score:enter|score:read:all'], // hoặc score:read:all (BGH xem mọi đợt)
  'POST /scores/assessments': ['score:enter|assessment:manage'], // thường xuyên; giữa kỳ/cuối kỳ cần assessment:manage
  'PATCH /scores/assessments/:id': ['score:enter|assessment:manage'], // người tạo đợt thường xuyên, hoặc assessment:manage
  'DELETE /scores/assessments/:id': ['score:enter|assessment:manage'], // như trên; đã có lịch sử điểm thì không xoá được
  'GET /scores/assessments/:id/classes/:classId': ['score:enter|score:read:all'], // trong phạm vi phân công, hoặc score:read:all
  'PUT /scores/assessments/:id/classes/:classId': ['score:enter'], // chỉ giáo viên được phân công, trong hạn nhập
  'POST /scores/assessments/:id/classes/:classId/publish': ['score:enter|assessment:manage'], // hoặc assessment:manage
  'PUT /scores/assessments/:id/classes/:classId/exemptions/:studentId': ['assessment:manage'],
  'GET /scores/assessments/:id/classes/:classId/template': ['score:enter'],
  'POST /scores/assessments/:id/classes/:classId/import/preview': ['score:enter'],
  'POST /scores/import/:previewId/confirm': ['score:enter'],
  // Bước 19 – xem điểm, thống kê, hạn nhập/khoá sổ, điều chỉnh sau hạn.
  'GET /scores/me': 'student', // chỉ học sinh, chỉ điểm của chính mình đã công bố
  'GET /scores/students/:studentId/report': ['score:read:all|score:enter'], // hoặc chủ nhiệm lớp hiện tại của học sinh (score:enter)
  'GET /scores/gradebook': ['score:enter|score:read:all'], // giáo viên được phân công / chủ nhiệm (đã công bố) / score:read:all
  'GET /scores/gradebook/export': ['score:enter|score:read:all'], // như trên
  'GET /scores/classes/:classId/summary': ['score:enter|score:read:all'], // chủ nhiệm lớp, hoặc score:read:all
  'GET /scores/classes/:classId/summary/export': ['score:enter|score:read:all'], // như trên
  'GET /scores/stats': ['score:read:all'],
  'GET /scores/formula': 'self', // công thức ĐTB, không chứa điểm của ai
  'PUT /scores/formula': ['assessment:manage|setting:manage'], // hoặc setting:manage (ADMIN)
  'GET /scores/locks': ['score:read:all|assessment:manage'], // hoặc assessment:manage
  'PUT /scores/deadlines': ['assessment:manage'],
  'PUT /scores/locks/:semesterId': ['assessment:manage'],
  'GET /scores/adjustments': ['score:enter|assessment:manage'], // giáo viên: của mình; assessment:manage: mọi đề nghị
  'POST /scores/adjustments': ['score:enter'], // giáo viên được phân công, đợt đã khoá
  'POST /scores/adjustments/:id/approve': ['assessment:manage'],
  'POST /scores/adjustments/:id/reject': ['assessment:manage'],
  'POST /scores/adjustments/:id/cancel': ['score:enter'], // chính người gửi
  // Bước 20 – thông báo theo đối tượng, hộp thông báo.
  'GET /announcements/inbox': 'self', // thông báo đúng đối tượng của chính mình + thông báo hệ thống của mình
  'GET /announcements/unread-count': 'self',
  'POST /announcements/inbox/read': 'self', // chỉ mục mình thấy / của chính mình
  'GET /announcements/targets': ['announcement:send'],
  'GET /announcements/sent': ['announcement:send'],
  'POST /announcements': ['announcement:send|announcement:manage'], // giáo viên: lớp mình dạy/chủ nhiệm; announcement:manage: mọi đối tượng
  'DELETE /announcements/:id': ['announcement:send|announcement:manage'], // người gửi hoặc announcement:manage

  // Thư viện số (bước 21): danh mục công khai chỉ tài liệu toàn trường; đọc phải đăng nhập và đúng đối tượng xem.
  'GET /public/library/home': 'public',
  'GET /public/library/items': 'public',
  'GET /public/library/items/:slug': 'public',
  'PUT /library/local-upload/:id': 'public', // chỉ driver local; token HMAC `put` trong query
  'GET /library/files/:id': 'public', // chỉ driver local; token HMAC `get` hết hạn 5 phút, cấp sau khi kiểm tra quyền
  'GET /library/items': 'self', // lọc theo đối tượng xem của chính mình
  'GET /library/items/by-slug/:slug': 'self',
  'POST /library/items/:id/access': 'self', // kiểm tra đối tượng xem mỗi lần cấp URL; giới hạn 30/phút
  'PUT /library/items/:id/progress': 'self',
  'PUT /library/items/:id/favorite': 'self',
  'DELETE /library/items/:id/favorite': 'self',
  'GET /library/me': 'self',
  'GET /library/form-options': ['library:submit|library:manage'], // hoặc library:manage
  'GET /library/submissions': ['library:submit|library:manage'], // scope=all cần library:manage
  'POST /library/items': ['library:submit'],
  'GET /library/items/:id': ['library:submit'], // tài liệu của mình; library:manage mọi tài liệu
  'PATCH /library/items/:id': ['library:submit'], // của mình khi nháp/bị từ chối; library:manage mọi lúc
  'DELETE /library/items/:id': ['library:submit'],
  'POST /library/items/:id/upload': ['library:submit'],
  'POST /library/items/:id/upload/complete': ['library:submit'],
  'POST /library/items/:id/submit': ['library:submit'],
  'POST /library/items/:id/review': ['library:manage'],
  'GET /library/categories': ['library:manage'],
  'POST /library/categories': ['library:manage'],
  'PATCH /library/categories/:id': ['library:manage'],
  'DELETE /library/categories/:id': ['library:manage'],
  'GET /library/stats': ['library:manage'],

  // Trắc nghiệm ôn tập (bước 22): không tính vào điểm. Học sinh làm bài đúng đối tượng; đề không có đáp án đúng.
  'GET /quizzes/available': 'student', // chỉ học sinh; quiz đang mở đúng đối tượng + các lần làm của chính mình
  'POST /quizzes/:id/attempts': 'student', // chỉ học sinh đúng đối tượng (khác → 403); hết số lần → 409; giới hạn quiz-start
  'GET /quizzes/attempts/:attemptId': 'self', // chỉ lần làm của chính mình
  'PUT /quizzes/attempts/:attemptId/answers': 'self', // quá giờ → tự nộp + 409; giới hạn quiz-write
  'POST /quizzes/attempts/:attemptId/submit': 'self', // chấm ở server; quá giờ → 409
  'GET /quizzes/form-options': ['quiz:create|quiz:manage'], // hoặc quiz:manage
  'GET /quizzes/manage': ['quiz:create|quiz:manage'], // scope=all cần quiz:manage
  'GET /quizzes/import-template': ['quiz:create|quiz:manage'],
  'POST /quizzes/images': ['quiz:create|quiz:manage'],
  'POST /quizzes/images/:mediaId/complete': ['quiz:create|quiz:manage'],
  'POST /quizzes': ['quiz:create|quiz:manage'], // giáo viên: môn mình dạy, khối/lớp mình dạy; quiz:manage: mọi đối tượng
  'GET /quizzes/:id': ['quiz:create|quiz:manage'], // người soạn hoặc quiz:manage (có đáp án đúng)
  'PATCH /quizzes/:id': ['quiz:create|quiz:manage'],
  'PUT /quizzes/:id/questions': ['quiz:create|quiz:manage'], // khoá khi đã có lượt làm
  'POST /quizzes/:id/status': ['quiz:create|quiz:manage'],
  'DELETE /quizzes/:id': ['quiz:create|quiz:manage'],
  'GET /quizzes/:id/stats': ['quiz:create|quiz:manage'],
  'POST /quizzes/:id/import/preview': ['quiz:create|quiz:manage'],
  'POST /quizzes/import/:previewId/confirm': ['quiz:create|quiz:manage'], // chỉ người tải lên, dùng một lần

  'GET /telegram/link': 'self',
  'POST /telegram/link-code': 'self',
  'DELETE /telegram/link': 'self',

  'GET /users': ['user:manage'],
  'POST /users': ['user:manage'],
  'PATCH /users/:id': ['user:manage'],
  'PATCH /users/:id/status': ['user:manage'],
  'POST /users/:id/reset-password': ['user:manage'],
};
