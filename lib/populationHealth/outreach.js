'use strict';
// lib/populationHealth/outreach.js
// Outreach templates per registry, two channels (SMS / EMAIL).
// No patient identifiers, no PHI content. Audit emits count + IDs only.

(function () {
  if (typeof module !== 'object' || !module.exports) return;

  const TEMPLATES = Object.freeze({
    diabetes: {
      sms: {
        en: 'Reminder: please schedule your HbA1c and BP check this month. Reply STOP to opt out.',
        ar: 'تذكير: يرجى حجز فحص HbA1c والضغط لهذا الشهر. للانسحاب أرسل STOP.'
      },
      email: {
        en: {
          subject: 'Diabetes follow-up due',
          body: 'Dear patient, your diabetes follow-up (HbA1c, BP, LDL, eGFR) is due. Please contact the clinic to schedule.'
        },
        ar: {
          subject: 'متابعة السكري مستحقة',
          body: 'عزيزي المريض، حان موعد متابعة السكري (HbA1c، الضغط، LDL، eGFR). يرجى التواصل مع العيادة للحجز.'
        }
      }
    },
    hypertension: {
      sms: {
        en: 'Reminder: please record your home BP this week and book a follow-up.',
        ar: 'تذكير: يرجى تسجيل قراءة ضغط дома هذا الأسبوع وحجز متابعة.'
      },
      email: {
        en: { subject: 'BP follow-up due', body: 'Please log your home BP and schedule a follow-up appointment.' },
        ar: { subject: 'متابعة الضغط مستحقة', body: 'يرجى تسجيل قراءة ضغط المنزل وحجز موعد متابعة.' }
      }
    },
    asthma: {
      sms: {
        en: 'Reminder: complete your ACT score and peak-flow this week.',
        ar: 'تذكير: أكمل استبيان ACT وقياس peak-flow لهذا الأسبوع.'
      },
      email: {
        en: { subject: 'Asthma control check', body: 'Please complete your ACT score and bring it to your next visit.' },
        ar: { subject: 'فحص السيطرة على الربو', body: 'يرجى إكمال استبيان ACT وجلبه في زيارتك القادمة.' }
      }
    },
    chf: {
      sms: {
        en: 'Reminder: please weigh yourself daily and log any swelling or breathlessness.',
        ar: 'تذكير: يرجى قياس وزنك يوميًا وتسجيل أي تورم أو ضيق تنفس.'
      },
      email: {
        en: { subject: 'Heart failure self-monitoring', body: 'Daily weight and symptom log helps your team intervene early.' },
        ar: { subject: 'متابعة قصور القلب', body: 'تسجيل الوزن والأعراض يوميًا يساعد فريقك على التدخل المبكر.' }
      }
    },
    ckd: {
      sms: {
        en: 'Reminder: please complete your eGFR + uacr labs this month.',
        ar: 'تذكير: يرجى إجراء تحاليل eGFR و uacr لهذا الشهر.'
      },
      email: {
        en: { subject: 'CKD labs due', body: 'Your eGFR, uACR, potassium, and phosphorus labs are due.' },
        ar: { subject: 'تحاليل القصور الكلوي مستحقة', body: 'تحاليل eGFR و uACR والبوتاسيوم والفوسفور مستحقة.' }
      }
    }
  });

  function getTemplate(registryId, channel, lang) {
    if (!TEMPLATES[registryId]) throw new Error('TEMPLATE_UNKNOWN:' + registryId);
    const t = TEMPLATES[registryId];
    if (channel !== 'sms' && channel !== 'email') throw new Error('CHANNEL_UNKNOWN');
    const c = t[channel];
    const useLang = (lang === 'ar' || lang === 'en') ? lang : 'en';
    return c[useLang];
  }

  function listRegistries() {
    return Object.keys(TEMPLATES).map(function (k) {
      return { registryId: k };
    });
  }

  module.exports = {
    TEMPLATES: TEMPLATES,
    getTemplate: getTemplate,
    listRegistries: listRegistries
  };
})();
