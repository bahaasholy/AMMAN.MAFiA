AMMAN MAFIA — TV DISPLAY v11

الملفات:
- index.html: لوحة المنظم على الموبايل
- display.html: شاشة العرض على التلفزيون
- tv-control.js / tv-control.css: نظام المؤقت والتحكم
- realtime-config.js: بيانات Supabase للربط بين جهازين

الوضع الحالي:
- بدون Supabase: تقدر تجرب لوحة المنظم وشاشة العرض في تبويبين على نفس الجهاز.
- مع Supabase: الموبايل والتلفزيون يتصلان لحظياً عبر الإنترنت.

للتركيب على GitHub:
ارفع جميع الملفات مباشرة في جذر المستودع، واستبدل index.html و sw.js و manifest.json القديمة.

مهم:
لا تضع service_role key أبداً. المطلوب فقط anon public key.
