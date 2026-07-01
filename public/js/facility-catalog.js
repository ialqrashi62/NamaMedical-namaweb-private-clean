/**
 * public/js/facility-catalog.js
 * Static Facility Catalog and Helper Functions for Multi-Facility Platform.
 */

window.FACILITY_CATALOG = {
  medical_cities: [
    { id: 1, name_en: 'King Fahad Medical City', name_ar: 'مدينة الملك فهد الطبية', region: 'Riyadh' },
    { id: 2, name_en: 'King Abdullah Medical City', name_ar: 'مدينة الملك عبدالله الطبية', region: 'Makkah' }
  ],
  facility_types: [
    { code: 'medical_city', name_en: 'Medical City', name_ar: 'مدينة طبية' },
    { code: 'general_hospital', name_en: 'General Hospital', name_ar: 'مستشفى عام' },
    { code: 'specialized_hospital', name_en: 'Specialized Hospital', name_ar: 'مستشفى تخصصي' },
    { code: 'tertiary_hospital', name_en: 'Tertiary Hospital', name_ar: 'مستشفى مرجعي' },
    { code: 'polyclinic', name_en: 'Polyclinic / Medical Complex', name_ar: 'مجمع طبي / مستوصف' },
    { code: 'phc', name_en: 'Primary Healthcare Center', name_ar: 'مركز رعاية صحية أولية' },
    { code: 'specialty_center', name_en: 'Specialty Center', name_ar: 'مركز تخصصي' },
    { code: 'diagnostic_center', name_en: 'Diagnostic Center', name_ar: 'مركز تشخيصي' },
    { code: 'rehabilitation_center', name_en: 'Rehabilitation Center', name_ar: 'مركز تأهيل طبي' },
    { code: 'dialysis_center', name_en: 'Dialysis Center', name_ar: 'مركز غسيل الكلى' },
    { code: 'dental_center', name_en: 'Dental Center', name_ar: 'مركز أسنان' },
    { code: 'mental_health_center', name_en: 'Mental Health Center', name_ar: 'مركز صحة نفسية' },
    { code: 'home_healthcare_unit', name_en: 'Home Healthcare Unit', name_ar: 'وحدة رعاية صحية منزلية' },
    { code: 'mobile_clinic', name_en: 'Mobile Clinic', name_ar: 'عيادة متنقلة' },
    { code: 'virtual_clinic', name_en: 'Virtual Clinic', name_ar: 'عيادة افتراضية' },
    { code: 'health_unit', name_en: 'Health Unit', name_ar: 'وحدة صحية' },
    { code: 'emergency_center', name_en: 'Emergency Center', name_ar: 'مركز طوارئ وإسعاف' }
  ],
  facilities: [
    { id: 101, city_id: 1, type: 'medical_city', name_en: 'KFMC Main Campus', name_ar: 'حرم مدينة الملك فهد الطبية الرئيسي', status: 'Active', deptsCount: 45, desc: 'Central medical city with advanced tertiary care.' },
    { id: 102, city_id: 1, type: 'general_hospital', name_en: 'KFMC General Hospital', name_ar: 'مستشفى مدينة الملك فهد العام', status: 'Active', deptsCount: 28, desc: 'General hospital serving emergency and surgery.' },
    { id: 103, city_id: 1, type: 'polyclinic', name_en: 'Sulaimaniyah Complex', name_ar: 'مجمع السليمانية الطبي', status: 'Active', deptsCount: 15, desc: 'Outpatient polyclinic with primary care.' },
    { id: 104, city_id: 1, type: 'health_unit', name_en: 'Olaya Primary Care Unit', name_ar: 'وحدة الرعاية الصحية بالعليا', status: 'Active', deptsCount: 6, desc: 'Basic primary care and vaccinations.' },
    { id: 105, city_id: 1, type: 'virtual_clinic', name_en: 'Riyadh Virtual Clinic', name_ar: 'عيادة الرياض الافتراضية', status: 'Active', deptsCount: 4, desc: 'Telemedicine consultations.' },
    { id: 201, city_id: 2, type: 'specialized_hospital', name_en: 'KAMC Oncology Center', name_ar: 'مركز الأورام بمدينة الملك عبدالله', status: 'Active', deptsCount: 20, desc: 'Cancer treatment and research center.' },
    { id: 202, city_id: 2, type: 'phc', name_en: 'Makkah Primary Care Center', name_ar: 'مركز الرعاية الأولية بمكة', status: 'Active', deptsCount: 8, desc: 'Family medicine and vaccinations.' }
  ]
};

window.getFacilitiesByMedicalCity = function(cityId) {
  return window.FACILITY_CATALOG.facilities.filter(f => f.city_id === cityId);
};

window.getDepartmentsByFacilityType = function(type) {
  // Returns list of departments enabled for a given facility type
  const map = {
    medical_city: null, // all enabled
    general_hospital: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30, 33, 34, 42],
    specialized_hospital: [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 12, 13, 14, 15, 17, 18, 20, 34, 42],
    tertiary_hospital: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 24, 30, 33, 34, 42],
    polyclinic: [0, 1, 2, 3, 4, 6, 8, 9, 13, 14, 15, 20, 34, 42],
    phc: [0, 1, 2, 3, 4, 6, 14, 15, 33, 34],
    specialty_center: [0, 1, 2, 3, 4, 6, 8, 14, 15, 20, 34],
    diagnostic_center: [3, 4, 14, 15],
    rehabilitation_center: [0, 1, 2, 14, 15, 24],
    dialysis_center: [0, 1, 2, 14, 15, 20],
    dental_center: [0, 1, 2, 14, 15, 21],
    mental_health_center: [0, 1, 2, 14, 15, 22],
    home_healthcare_unit: [0, 1, 2, 14, 15, 33],
    mobile_clinic: [0, 1, 2, 14, 15, 33],
    virtual_clinic: [0, 1, 2, 14, 15, 33],
    health_unit: [0, 1, 2, 3, 14, 15, 33],
    emergency_center: [0, 1, 2, 3, 14, 15, 19]
  };
  return map[type] !== undefined ? map[type] : map.general_hospital;
};
