# 📋 قائمة مهام ترقية محطة التمريض وتصليب الأمان

- `[x]` تعديل دالة الاتصال في [db_postgres.js](file:///c:/Users/ice/Desktop/NamaMedical/namaweb/db_postgres.js) لإضافة `idleTimeoutMillis: 1000`
- `[x]` تعديل [app.js](file:///c:/Users/ice/Desktop/NamaMedical/namaweb/public/js/app.js) لربط دالة `renderNursing(el)` مع محطة التمريض المطورة
- `[x]` إنشاء ملفات الهجرة لتصليب RLS على جداول التمريض:
  - `[x]` [e6_04_nursing_rls_up.sql](file:///c:/Users/ice/Desktop/NamaMedical/namaweb/migrations/e6_04_nursing_rls_up.sql)
  - `[x]` [e6_04_nursing_rls_down.sql](file:///c:/Users/ice/Desktop/NamaMedical/namaweb/migrations/e6_04_nursing_rls_down.sql)
  - `[x]` [e6_04_nursing_rls_validate.sql](file:///c:/Users/ice/Desktop/NamaMedical/namaweb/migrations/e6_04_nursing_rls_validate.sql)
- `[x]` تطبيق هجرة RLS التمريض محلياً على قاعدة بيانات التطوير
- `[x]` التحقق من صحة واجهات التمريض يدوياً/برمجياً
- `[x]` تشغيل كامل حزمة الاختبارات (npm run test) للتأكد من نجاحها وعدم تعليقها
- `[x]` توثيق التعديلات وحفظها في الـ AI Brain وكتابة تقرير الإنجاز
- `[x]` نشر التغييرات الفورية لبيئة الإنتاج jumanasoft.com وإعادة تشغيل PM2 والتحقق من رابط الصحة
