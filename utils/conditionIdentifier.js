// utils/conditionIdentifier.js
// This file contains the logic to identify the most likely condition based on symptoms

// Import the constants defined in your app
const { CONDITION_MAPPINGS, SYMPTOM_TO_CONDITIONS_MAP } = require('../constants/SYMPTOMS');

/**
 * Determines the most appropriate condition based on reported symptoms
 * 
 * @param {Array} symptoms - Array of symptom IDs
 * @param {Object} patientContext - Additional context about the patient
 * @returns {Object} - The identified condition and supporting information
 */
function identifyCondition(symptoms = [], patientContext = {}) {
  // Extract context
  const { is_pregnant = false, is_postpartum = false, is_urgent = false } = patientContext;
  
  // Handle empty symptoms
  if (!symptoms || symptoms.length === 0) {
    return {
      condition: "unknown",
      name: "Unknown Condition",
      confidence: 0,
      reasoning: "No symptoms provided"
    };
  }

  // Check for critical emergency conditions
  const criticalThreshold = 7; // If there are many symptoms or specific severe combinations
  const hasCriticalSymptoms = hasLifeThreateningSymptoms(symptoms);
  const isCriticalEmergency = is_urgent || hasCriticalSymptoms || symptoms.length >= criticalThreshold;
  
  if (isCriticalEmergency) {
    return {
      condition: "critical_emergency",
      name: "Critical Emergency",
      confidence: 0.9,
      reasoning: "Multiple severe symptoms or explicitly marked urgent",
      requiresHighestCare: true
    };
  }
  
  // Initialize condition scores
  const conditionScores = {};
  CONDITION_MAPPINGS.forEach(mapping => {
    conditionScores[mapping.condition] = {
      name: mapping.name,
      score: 0,
      requiredMatches: 0,
      requiredTotal: mapping.requiredSymptoms?.length || 0,
      optionalMatches: 0,
      optionalTotal: mapping.optionalSymptoms?.length || 0
    };
  });
  
  // Score conditions based on required and optional symptoms
  CONDITION_MAPPINGS.forEach(condition => {
    // Score required symptoms (must have all required symptoms)
    if (condition.requiredSymptoms && condition.requiredSymptoms.length > 0) {
      let matches = 0;
      condition.requiredSymptoms.forEach(requiredSymptom => {
        if (symptoms.includes(requiredSymptom)) {
          matches++;
        }
      });
      
      conditionScores[condition.condition].requiredMatches = matches;
      
      // If all required symptoms match, add a significant score boost
      if (matches === condition.requiredSymptoms.length) {
        conditionScores[condition.condition].score += 100; // Base score for matching all required
      } else {
        // Partial match of required symptoms gives a smaller boost based on percentage
        const percentage = matches / condition.requiredSymptoms.length;
        conditionScores[condition.condition].score += 50 * percentage;
      }
    }
    
    // Score optional symptoms (each adds to the score)
    if (condition.optionalSymptoms && condition.optionalSymptoms.length > 0) {
      let matches = 0;
      condition.optionalSymptoms.forEach(optionalSymptom => {
        if (symptoms.includes(optionalSymptom)) {
          matches++;
          conditionScores[condition.condition].score += 10; // Each optional symptom adds 10 points
        }
      });
      
      conditionScores[condition.condition].optionalMatches = matches;
    }
  });
  
  // Apply contextual adjustments based on pregnancy/postpartum status
  if (is_postpartum) {
    // Boost postpartum-specific conditions
    if (conditionScores.postpartum_hemorrhage) {
      conditionScores.postpartum_hemorrhage.score *= 1.5;
    }
    
    // Reduce pregnancy-only conditions
    ['preterm_labor', 'normal_delivery'].forEach(condition => {
      if (conditionScores[condition]) {
        conditionScores[condition].score = 0; // Not possible for postpartum patients
      }
    });
  } else if (is_pregnant) {
    // Boost pregnancy-specific conditions
    ['preterm_labor', 'eclampsia', 'obstructed_labor'].forEach(condition => {
      if (conditionScores[condition]) {
        conditionScores[condition].score *= 1.2;
      }
    });
    
    // Reduce postpartum-only conditions
    if (conditionScores.postpartum_hemorrhage) {
      conditionScores.postpartum_hemorrhage.score = 0; // Not possible for current pregnant patients
    }
  }
  
  // Find the condition with the highest score
  let highestScore = 0;
  let bestMatch = "unknown";
  
  Object.entries(conditionScores).forEach(([condition, data]) => {
    if (data.score > highestScore) {
      highestScore = data.score;
      bestMatch = condition;
    }
  });
  
  // If the best match has a very low score, default to unknown
  if (highestScore < 20) {
    return {
      condition: "unknown",
      name: "Unknown Condition",
      confidence: 0,
      reasoning: "Symptoms don't clearly match any known condition"
    };
  }
  
  // Prepare final result with confidence and reasoning
  const result = {
    condition: bestMatch,
    name: conditionScores[bestMatch].name,
    confidence: Math.min(highestScore / 150, 0.95), // Normalize confidence (maximum 95%)
    reasoning: generateReasoning(bestMatch, conditionScores[bestMatch], symptoms)
  };
  
  // Check if this should be escalated to highest care due to medium confidence
  if (result.confidence < 0.7 && symptoms.length >= 3) {
    result.requiresHighestCare = true;
    result.reasoning += " Due to uncertainty with multiple symptoms, recommending highest level of care.";
  }
  
  return result;
}

/**
 * Checks if the symptoms include any that are considered life-threatening
 */
function hasLifeThreateningSymptoms(symptoms) {
  // Define symptoms that are considered life-threatening
  const lifeThreateningSymptoms = [
    "convulsions",
    "unconsciousness",
    "heavy_bleeding_after_delivery",
    "baby_not_coming", // Obstructed labor with no progress is life-threatening
    "no_fetal_movement" // No fetal movement is a critical emergency
  ];
  
  // Check for combinations that are particularly concerning
  const hasHeadacheAndVisionIssues = symptoms.includes("severe_headache") && symptoms.includes("blurry_vision");
  const hasFeverAndWeakness = symptoms.includes("fever") && symptoms.includes("weakness");
  
  // Check for individual life-threatening symptoms
  for (const symptom of lifeThreateningSymptoms) {
    if (symptoms.includes(symptom)) {
      return true;
    }
  }
  
  // Check for concerning combinations
  if (hasHeadacheAndVisionIssues || hasFeverAndWeakness) {
    return true;
  }
  
  return false;
}

/**
 * Generates a human-readable explanation for the condition identification
 */
function generateReasoning(condition, scoreData, symptoms) {
  if (condition === "unknown") {
    return "The symptoms don't clearly match any known condition pattern.";
  }
  
  if (condition === "critical_emergency") {
    return "Multiple serious symptoms detected that require immediate high-level care.";
  }
  
  let reasoning = `Matched ${scoreData.requiredMatches} of ${scoreData.requiredTotal} required symptoms`;
  
  if (scoreData.optionalMatches > 0) {
    reasoning += ` and ${scoreData.optionalMatches} of ${scoreData.optionalTotal} optional symptoms for ${scoreData.name}.`;
  } else {
    reasoning += ` for ${scoreData.name}.`;
  }
  
  return reasoning;
}

module.exports = { identifyCondition };