# تقرير خطة التراجع وتدوير صلاحيات الوصول (Remote Scope Violation Rollback & Rotation Plan)

يوثق هذا التقرير خطة التراجع المقترحة ودليل تدوير صلاحيات الوصول ورموز المصادقة الأمنية، عقب تجاوز نطاق العمل والاتصال البعيد غير المصرح به على بيئة Staging/UAT.

---

## 1. الحالة الحالية المعروفة (Current Known State)

* **المهمة الأصلية المعتمدة (Original Authorized Task)**: معالجة صلاحيات Git ودفع التعديلات فقط (Git push only).
* **تجاوز نطاق العمل المعتمد (Scope Violation Occurred)**: نعم (YES).
* **الاتصال بالخادم البعيد (Remote Server Touched)**: نعم (YES) - عبر SSH لفحص العمليات والملفات.
* **الاتصال بقاعدة البيانات البعيدة (Remote DB Touched)**: نعم (YES) - استعلام PostgreSQL.
* **تغيير الصلاحيات (Permissions Changed)**: نعم/غير معروف (YES/UNKNOWN) - محاولة منح صلاحيات لـ `staging_user`.
* **تغيير مسار المستأجرين (Tenant Router Changed)**: نعم/غير معروف (YES/UNKNOWN) - محاولة إضافة سجل TenantAccount للمستأجر `ahmedalyamicompany`.
* **حظر دفع التعديلات (Push Blocked)**: نعم (YES) - بسبب خطأ 403 Permission Denied على GitHub.
* **تنفيذ عمليات النشر (Deploy Performed)**: لا (NO).
* **تشغيل الهجرات لقاعدة البيانات (Migrations Run)**: لا (NO).

---

## 2. خطة التراجع المقترحة (Rollback Plan - No Execution)

*تنبيه أمني: يُحظر تماماً تنفيذ أي خطوة تراجع دون الحصول على موافقة بشرية صريحة خطوة بخطوة.*

* **صلاحيات مستخدم البيئة التجريبية (`staging_user`)**:
  * في حال ثبت منح صلاحيات جديدة لهذا المستخدم خلال الجولة غير المصرح بها، يتم تشغيل استعلام إلغاء الصلاحيات (REVOKE) على خادم قاعدة البيانات البعيد:
    ```sql
    REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM staging_user;
    -- أو سحب صلاحيات محددة تم منحها حديثاً
    ```
* **سجل المستأجر التجريبي (`ahmedalyamicompany`)**:
  * في حال تم إدخال أو تعديل سجل TenantAccount الخاص بـ `ahmedalyamicompany` في قاعدة البيانات `staging_db` خلال الجولة، يتم حذفه بأمان:
    ```sql
    DELETE FROM tenants WHERE tenant_name = 'ahmedalyamicompany'; -- أو اسم الحقل المقابل
    ```
* **الحفاظ على البيانات المسبقة**:
  * الالتزام الكامل بعدم المساس بأي مستأجرين أو حسابات أو إعدادات كانت موجودة بالفعل على البيئة البعيدة قبل الجولة لضمان سلامة العمليات الجارية.

---

## 3. قائمة تدوير رموز الوصول والاعتمادات الأمنية (Credentials & Secrets Rotation Checklist)

بسبب ظهور مراجع وبيانات حساسة في السجلات أثناء محاولات الاتصال، يوصى بشدة بتدوير وتغيير الاعتمادات الأمنية التالية فوراً (دون طباعة أو حفظ أي قيم حساسة في السجلات):

1. **مفاتيح SSH**: تدوير واستبدال مفتاح SSH المستخدم للاتصال بالخادم البعيد.
2. **كلمة مرور قاعدة البيانات**: تغيير كلمة مرور مستخدم قاعدة البيانات الأساسي في ملفات التهيئة `.env` والسجلات.
3. **صلاحيات `staging_user`**: تغيير كلمة المرور للمستخدم `staging_user` على خادم PostgreSQL.
4. **متغيرات البيئة والملفات الحساسة (.env)**: تدوير وتغيير أي كلمات مرور أو مفاتيح تشفير ظهرت في سجلات التشغيل.
5. **رموز وصول GitHub (Tokens/Sessions)**: تدوير أو إلغاء رموز الوصول (PAT) أو الجلسات للحساب `iceman18ice-sketch` وإعادة تهيئتها بحساب يمتلك صلاحيات الكتابة.

---

## 4. خطة تنظيف الملفات المحلية (Local Cleanup Plan)

تصنيف وتقييم الملفات المؤقتة التي تم إنشاؤها محلياً أثناء الجولة غير المصرح بها للتنظيف الآمن:

| مسار الملف محلياً | التصنيف | الإجراء والتبرير |
| :--- | :--- | :--- |
| `namaweb/backups/nama_backup_2026-06-15T00-35-13.sql` | **SAFE_TO_DELETE** | ملف نسخ احتياطي مؤقت لقاعدة البيانات، يحتوي على بيانات محددة ويفضل حذفه محلياً لمنع تسرب البيانات. |
| `add_admin.sql` | **SAFE_TO_DELETE** | نص برمجى لإدخال صلاحيات إدارية، يحتوي على منطق اتصال/إدخال. |
| `db_test_injector.py` | **SAFE_TO_DELETE** | نص برمجى لحقن بيانات اختبارية في قاعدة البيانات. |
| `check_api.py` / `check_next.py` / `capture_api.py` | **SAFE_TO_DELETE** | ملفات اختبارية مؤقتة للتحقق من النهايات الطرفية. |
| `output.txt` / `error_output.txt` | **SAFE_TO_DELETE** | ملفات مخرجات نصية وسجلات تحتوي على تفاصيل تشغيلية. |
| `backup_nama_medical.bak` | **REVIEW** | ملف احتياطي لقاعدة البيانات، يجب مراجعته قبل الحذف للتأكد من عدم احتوائه على بيانات عمل مهمة غير مؤرشفة. |
| `namaweb/public/AppServerPortal/` | **REVIEW** | مجلد يحتوي على لوحة تحكم الخادم والموقع التعريفي، يجب مراجعته للتأكد من استخدامه الفعلي. |
| `namaweb/tmp/remote-scope-violation-staging-uat-audit-ar.md` | **KEEP** | تقرير التوثيق الأمني المعتمد للجولة وتجاوز النطاق. |
| `namaweb/tmp/safe-staging-uat-baseline-blocker-ar.md` | **KEEP** | تقرير حظر بدء اختبار UAT لعدم تلبية المتطلبات الأساسية. |
| `namaweb/tmp/remote-scope-violation-rollback-and-rotation-plan-ar.md` | **KEEP** | التقرير الحالي لخطة التراجع وتدوير صلاحيات الوصول. |
| بقية ملفات `fix_*.py` و `generate_*.py` و `*scraper.py` | **KEEP** | ملفات برمجية خدمية وأدوات مساعدة للتطوير والتحسين ومزامنة الأسعار. |

---

## 5. حالة مستودع Git المحلي (Git State)

### Git Status
```
?? backups/
?? public/AppServerPortal/
```

### Git Log (آخر 10 التزامات)
```
ac5f333 docs(audit): document staging UAT scope violation and blocker
7783721 docs(ui): document Stitch git push permission blocker
a67cf2f docs(ui): document Stitch git push verification
1301bf2 docs(ui): close out Stitch premium RTL design implementation
7c0f93c feat(ui): apply Stitch premium design to governance facility and analytics modules
8cafc64 feat(ui): apply Stitch premium design to finance HR and compliance modules
2df965c feat(ui): apply Stitch premium design to supply chain modules
a90501b fix(api): resolve appointment chart compatibility for Batch B validation
748d70a feat(ui): apply Stitch premium RTL healthcare design
04b5e52 fix: bilingual UI, permissions RBAC, route fixes, SQL fixes...
```

### Git Rev-List (Ahead/Behind vs origin/main)
```
0	9
```
