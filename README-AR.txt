AMMAN MAFIA — v95 — FIX TV RENDER FREEZE

الإصلاح الجذري:
- سبب تجمد شاشة التلفزيون كان وجود متغير defenseMode داخل render() بدون تعريف.
- هذا كان يوقف تحديث شاشة التلفزيون بعد أول حالة، لذلك المقعد والمؤقت يظلوا ثابتين.
- تم تعريف defenseMode بشكل صحيح داخل render().
- تم إضافة حماية try/catch حول render حتى لو صار خطأ مستقبلاً لا يقتل تحديث الشاشة بالكامل.
- بقي الرابط الثابت للتلفزيون من v94:
  https://bahaasholy.github.io/AMMAN.MAFiA/tv.html
- بقيت قناة التلفزيون الثابتة كما هي.

لوحة المشرف بعد الرفع:
https://bahaasholy.github.io/AMMAN.MAFiA/?v=95

مهم بعد الرفع:
افتح التلفزيون من:
https://bahaasholy.github.io/AMMAN.MAFiA/tv.html
ثم افتح المشرف من:
https://bahaasholy.github.io/AMMAN.MAFiA/?v=95
