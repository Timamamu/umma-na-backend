// constants/EMERGENCY_CONDITIONS.js

// Emergency condition definitions with symptoms mapping
const EMERGENCY_CONDITIONS = [
    {
      id: "PPH",
      name: "Postpartum Hemorrhage (PPH)",
      description: "Excessive bleeding after childbirth that can be life-threatening if not treated promptly.",
      severity: 'critical',
      requiredSymptoms: ["heavy_bleeding_after_delivery"],
      optionalSymptoms: ["weakness", "unconsciousness", "abdominal_pain"]
    },
    {
      id: "eclampsia",
      name: "Eclampsia/Pre-eclampsia",
      description: "High blood pressure condition that can lead to seizures and other complications during pregnancy.",
      severity: 'critical',
      requiredSymptoms: ["severe_headache", "blurry_vision"],
      optionalSymptoms: ["swollen_hands_feet", "high_bp", "vomiting", "unconsciousness", "convulsions"]
    },
    {
      id: "obstructed_labor",
      name: "Obstructed Labor",
      description: "When the baby cannot progress through the birth canal, often requiring surgical intervention.",
      severity: 'high',
      requiredSymptoms: ["baby_not_coming"],
      optionalSymptoms: ["prolonged_labor", "abdominal_pain"]
    },
    {
      id: "preterm_labor",
      name: "Preterm Labor",
      description: "Labor that begins before 37 weeks of pregnancy, which can lead to premature birth.",
      severity: 'high',
      requiredSymptoms: ["preterm_labor"],
      optionalSymptoms: ["back_pain", "bloody_discharge", "water_breaking"]
    },
    {
      id: "sepsis",
      name: "Sepsis (Infection)",
      description: "Serious infection that can spread through the body and become life-threatening.",
      severity: 'critical',
      requiredSymptoms: ["fever", "foul_discharge"],
      optionalSymptoms: ["weakness", "painful_urination", "abdominal_pain"]
    },
    {
      id: "normal_delivery",
      name: "Normal Delivery",
      description: "Regular labor and delivery process that may require medical supervision but not emergency intervention.",
      severity: 'medium',
      requiredSymptoms: ["abdominal_pain"],
      optionalSymptoms: ["back_pain", "water_breaking", "baby_moving", "mucus_discharge"]
    },
    {
      id: "miscarriage",
      name: "Miscarriage/Incomplete Abortion",
      description: "Loss of pregnancy before 20 weeks that may require medical care to ensure complete removal.",
      severity: 'high',
      requiredSymptoms: ["bloody_discharge"],
      optionalSymptoms: ["no_fetal_movement", "abdominal_pain", "back_pain"]
    },
    {
      id: "unknown",
      name: "Serious Emergency",
      description: "Symptoms suggest a serious condition requiring the highest level of care available.",
      severity: 'critical',
      requiredSymptoms: [],
      optionalSymptoms: []
    }
  ];
  
  // Utility function to identify condition based on symptoms
  function identifyCondition(symptoms) {
    if (!symptoms || symptoms.length === 0) return 'unknown';
  
    // Special handling for critical symptoms that need urgent care
    const criticalSymptoms = ["convulsions", "unconsciousness", "heavy_bleeding_after_delivery"];
    const hasCriticalSymptoms = symptoms.some(s => criticalSymptoms.includes(s));
    
    // If any critical symptoms are present, check those specific conditions first
    if (hasCriticalSymptoms) {
      // Check for convulsions or unconsciousness - prioritize eclampsia
      if (symptoms.includes("convulsions") || symptoms.includes("unconsciousness")) {
        if (symptoms.includes("severe_headache") || symptoms.includes("blurry_vision") || 
            symptoms.includes("swollen_hands_feet") || symptoms.includes("high_bp")) {
          return "eclampsia";
        }
      }
      
      // Check for heavy bleeding - prioritize PPH
      if (symptoms.includes("heavy_bleeding_after_delivery")) {
        return "PPH";
      }
    }
  
    // Check each condition to find a match
    for (const condition of EMERGENCY_CONDITIONS) {
      // Skip the "unknown" fallback condition in this loop
      if (condition.id === 'unknown') continue;
      
      // Check if all required symptoms are present
      const hasAllRequired = condition.requiredSymptoms.every(symptom => 
        symptoms.includes(symptom)
      );
  
      if (hasAllRequired && condition.requiredSymptoms.length > 0) {
        return condition.id;
      }
    }
  
    // If we have more than one critical symptom, always route to highest care
    if (symptoms.filter(s => criticalSymptoms.includes(s)).length > 1) {
      return 'unknown';
    }
  
    // If no specific condition is identified, return 'unknown' to route to highest level facility
    return 'unknown';
  }
  
  // Hospital capability requirements for each condition
  const CAPABILITY_REQUIREMENTS = [
    {
      condition: "PPH",
      ideal: [
        "has_midwife_or_nurse",
        "has_power",
        "has_water",
        "has_uterotonics",
        "has_blood"
      ],
      acceptable: [
        "has_midwife_or_nurse",
        "has_power",
        "has_water",
        "has_uterotonics"
      ],
      timeWindow: 60 // minutes
    },
    {
      condition: "eclampsia",
      ideal: [
        "has_anticonvulsants",
        "has_antihypertensives",
        "has_monitoring",
        "has_ultrasound",
        "has_doctor",
        "has_delivery_room",
        "has_power"
      ],
      acceptable: [
        "has_anticonvulsants",
        "has_monitoring"
      ],
      timeWindow: 90
    },
    {
      condition: "obstructed_labor",
      ideal: [
        "has_theater",
        "has_power",
        "staff_24_7",
        "has_doctor",
        "has_ultrasound"
      ],
      acceptable: [
        "has_theater",
        "has_power",
        "staff_24_7"
      ],
      timeWindow: 120
    },
    {
      condition: "normal_delivery",
      ideal: [
        "has_delivery_room",
        "has_midwife_or_nurse",
        "has_power",
        "has_water"
      ],
      acceptable: [
        "has_delivery_room",
        "has_midwife_or_nurse"
      ],
      timeWindow: 180
    },
    {
      condition: "preterm_labor",
      ideal: [
        "has_incubator",
        "has_ultrasound",
        "has_doctor"
      ],
      acceptable: [
        "has_incubator",
        "has_midwife_or_nurse"
      ],
      timeWindow: 90
    },
    {
      condition: "miscarriage",
      ideal: [
        "has_mva_kit",
        "has_antibiotics",
        "has_iv_fluids",
        "has_ultrasound"
      ],
      acceptable: [
        "has_mva_kit"
      ],
      timeWindow: 120
    },
    {
      condition: "sepsis",
      ideal: [
        "has_antibiotics",
        "has_iv_fluids",
        "has_monitoring"
      ],
      acceptable: [
        "has_antibiotics",
        "has_iv_fluids"
      ],
      timeWindow: 60
    },
    {
      condition: "unknown",
      ideal: [
        "has_doctor",
        "has_theater",
        "has_monitoring",
        "has_blood",
        "has_iv_fluids",
        "has_antibiotics",
        "has_anticonvulsants",
        "has_antihypertensives",
        "staff_24_7"
      ],
      acceptable: [
        "has_doctor",
        "has_monitoring",
        "has_iv_fluids"
      ],
      timeWindow: 60
    }
  ];
  
  // Vehicle requirement rules for each condition
  const VEHICLE_REQUIREMENTS = [
    {
      condition: "PPH",
      allowed: ["car", "motorcycle"],
      preferred: "car"
    },
    {
      condition: "eclampsia",
      allowed: ["car", "motorcycle"],
      preferred: "car"
    },
    {
      condition: "obstructed_labor",
      allowed: ["car"],
      preferred: "car"
    },
    {
      condition: "normal_delivery",
      allowed: ["car", "motorcycle"],
      preferred: "car"
    },
    {
      condition: "preterm_labor",
      allowed: ["car"],
      preferred: "car"
    },
    {
      condition: "miscarriage",
      allowed: ["car", "motorcycle"],
      preferred: "car"
    },
    {
      condition: "sepsis",
      allowed: ["car", "motorcycle"],
      preferred: "car"
    },
    {
      condition: "unknown",
      allowed: ["car"],
      preferred: "car"
    }
  ];
  
  module.exports = { 
    EMERGENCY_CONDITIONS,
    identifyCondition,
    CAPABILITY_REQUIREMENTS,
    VEHICLE_REQUIREMENTS
  };