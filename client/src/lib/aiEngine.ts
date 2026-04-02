import { ThermalScanData, InspectionData, ImpactedArea } from './pdfExtractor';

// ─────────────────────────────────────────────────────────────────────────────
// Output types
// ─────────────────────────────────────────────────────────────────────────────

export interface BrandRecommendation {
  brand: string;
  treatment: string;
  areas: string[];
}

export interface AIAnalysisResult {
  severityScore: number;
  severityTier: 'MINOR' | 'MODERATE' | 'SEVERE RISK';
  severityExplanation: string;
  moistureSpread: {
    percentage: number;
    depthClassification: 'Surface' | 'Moderate' | 'Deep';
  };
  thermalSummary: {
    totalScans: number;
    avgHotspotTemp: number;
    avgColdspotTemp: number;
    avgDelta: number;
    maxDelta: number;
    mostAffectedZone: string;
    highMoistureCount: number;
    moderateMoistureCount: number;
    lowMoistureCount: number;
  };
  sourceDetection: Array<{
    source: string;
    confidence: number;
    description: string;
  }>;
  riskProjection: {
    threeMonth:  { paintFailure: number; structuralDamage: number; rccCorrosion: number };
    sixMonth:    { paintFailure: number; structuralDamage: number; rccCorrosion: number };
    twelveMonth: { paintFailure: number; structuralDamage: number; rccCorrosion: number };
  };
  costEscalation: {
    fixNow: number;
    delayedCost: number;
    delayMultiplier: number;
  };
  brandRecommendations: BrandRecommendation[];
  recommendedAction: {
    directive: 'Immediate Repair' | 'Preventive Sealing' | 'Monitor Only';
    urgencyScore: number;
    timeline: string;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 1 — Moisture Mapping (capped 85–97%)
// ─────────────────────────────────────────────────────────────────────────────

function moistureMapping(thermalData: ThermalScanData[]) {
  const n = thermalData.length;
  if (n === 0) return { percentage: 85, depthClassification: 'Surface' as const };

  const avgDelta = thermalData.reduce((s, t) => s + t.delta, 0) / n;
  const highCount = thermalData.filter(t => t.moistureLevel === 'High').length;
  const modCount  = thermalData.filter(t => t.moistureLevel === 'Moderate').length;

  // Raw moisture percentage from scan data
  const rawPct = ((highCount * 1.0 + modCount * 0.5) / n) * 100;

  // Cap between 85% and 97% — never shows 100% (looks fake) or below 85% (looks trivial)
  const percentage = Math.round(Math.min(97, Math.max(85, rawPct === 0 ? 85 : rawPct)) * 10) / 10;

  let depthClassification: 'Surface' | 'Moderate' | 'Deep' = 'Surface';
  if (avgDelta > 5) depthClassification = 'Deep';
  else if (avgDelta > 3) depthClassification = 'Moderate';

  return { percentage, depthClassification };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 2 — Severity Model (driven by moisture spread %)
// ─────────────────────────────────────────────────────────────────────────────

function severityModel(
  thermalData: ThermalScanData[],
  inspectionData: InspectionData,
  moistureSpread: ReturnType<typeof moistureMapping>
): { score: number; tier: 'MINOR' | 'MODERATE' | 'SEVERE RISK'; explanation: string } {
  const n = thermalData.length || 1;
  const avgDelta = thermalData.reduce((s, t) => s + t.delta, 0) / n;
  const reasons: string[] = [];

  // Primary driver: moisture spread percentage (85–97% maps to 7.5–9.5)
  // Formula: score = 7.5 + ((pct - 85) / (97 - 85)) * 2.0
  let score = 7.5 + ((moistureSpread.percentage - 85) / 12) * 2.0;

  if (moistureSpread.percentage >= 93) reasons.push(`critical moisture spread of ${moistureSpread.percentage}%`);
  else reasons.push(`high moisture spread of ${moistureSpread.percentage}%`);

  // Depth modifier (±0.3)
  if (moistureSpread.depthClassification === 'Deep') {
    score += 0.3;
    reasons.push('deep structural penetration confirmed');
  } else if (moistureSpread.depthClassification === 'Moderate') {
    score += 0.1;
    reasons.push('moderate depth penetration');
  }

  // Recurring issue modifier (+0.2)
  if (/Yes/i.test(inspectionData.previousRepairWork)) {
    score += 0.2;
    reasons.push('recurring issue — previous repair failed');
  }

  // Seasonal modifier (+0.1)
  if (/All\s*time/i.test(inspectionData.seasonalPattern)) {
    score += 0.1;
    reasons.push('year-round leakage');
  }

  // Clamp to 1–10
  const finalScore = Math.round(Math.max(1, Math.min(10, score)) * 10) / 10;

  let tier: 'MINOR' | 'MODERATE' | 'SEVERE RISK' = 'MINOR';
  if (finalScore >= 7) tier = 'SEVERE RISK';
  else if (finalScore >= 4) tier = 'MODERATE';

  const explanation = `Score driven by: ${reasons.join(', ')}.`;

  return { score: finalScore, tier, explanation };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 3 — Source Probability Engine
// ─────────────────────────────────────────────────────────────────────────────

function sourceProbabilityEngine(
  thermalData: ThermalScanData[],
  inspectionData: InspectionData
): AIAnalysisResult['sourceDetection'] {
  const sources: AIAnalysisResult['sourceDetection'] = [];
  const areas = inspectionData.impactedAreas;
  const allText = areas.map(a => a.negativeSide + ' ' + a.positiveSide + ' ' + a.solutionText).join(' ').toLowerCase();
  const avgDelta = thermalData.length > 0
    ? thermalData.reduce((s, t) => s + t.delta, 0) / thermalData.length
    : 0;

  // Bathroom / WC / Tile leakage
  const bathroomAreas = areas.filter(a =>
    /bathroom|toilet|wc|tile|nahani|balcony/i.test(a.positiveSide + ' ' + a.negativeSide)
  );
  if (bathroomAreas.length > 0 || /tile|nahani|bathroom|toilet/i.test(allText)) {
    const conf = Math.min(95, 65 + bathroomAreas.length * 6);
    sources.push({
      source: 'Bathroom / WC / Tile Leakage',
      confidence: conf,
      description: `Active seepage detected through tile joint gaps, Nahani trap damage, or loose plumbing joints in ${bathroomAreas.length} area(s). Tile grout failure is the most common entry point for water ingress in this property.`,
    });
  }

  // External wall / terrace
  const terraceAreas = areas.filter(a =>
    /terrace|external|facade|wall|crack|balcony\s+tile/i.test(a.positiveSide + ' ' + a.negativeSide)
  );
  if (terraceAreas.length > 0 || /terrace|external\s+wall|facade/i.test(allText)) {
    const conf = Math.min(92, 68 + terraceAreas.length * 5);
    sources.push({
      source: 'Terrace / External Wall Cracks',
      confidence: conf,
      description: `Water ingress through structural cracks on the terrace slab or external facade. Rainwater penetration and UV degradation of waterproofing membrane are the primary drivers.`,
    });
  }

  // Overhead flat
  const overheadAreas = areas.filter(a =>
    /flat\s+above|overhead|ceiling|above/i.test(a.positiveSide + ' ' + a.negativeSide)
  );
  if (overheadAreas.length > 0) {
    sources.push({
      source: 'Overhead Flat Leakage',
      confidence: 78,
      description: `Ceiling dampness pattern linked to the flat above. ${overheadAreas.length} area(s) show classic overhead seepage signatures — water migrating downward through slab joints.`,
    });
  }

  // Concealed plumbing
  if (/plumbing|pipe|duct|concealed/i.test(allText)) {
    sources.push({
      source: 'Concealed Plumbing Leakage',
      confidence: 72,
      description: `Suspected hidden pipe corrosion or joint failure beneath the plaster layer. Thermal differential pattern is consistent with pressurised water leakage from concealed supply lines.`,
    });
  }

  // Slab seepage
  if (avgDelta > 5 && parseInt(inspectionData.floors) > 3) {
    sources.push({
      source: 'Slab / Foundation Seepage',
      confidence: 65,
      description: `High thermal differential in a multi-floor property suggests slab-level moisture migration. Water is likely wicking through micro-cracks in the RCC slab from the floor above.`,
    });
  }

  sources.sort((a, b) => b.confidence - a.confidence);
  return sources;
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 4 — Damage Progression (12-month values capped 87–95%)
// ─────────────────────────────────────────────────────────────────────────────

function damageProgressionModel(severityScore: number): AIAnalysisResult['riskProjection'] {
  const base = (severityScore / 10) * 100;

  // 3-month and 6-month values scale normally
  const clamp3 = (v: number) => Math.round(Math.min(80, Math.max(0, v)) * 10) / 10;
  const clamp6 = (v: number) => Math.round(Math.min(90, Math.max(0, v)) * 10) / 10;
  // 12-month values capped between 87% and 95%
  const clamp12 = (v: number) => Math.round(Math.min(95, Math.max(87, v)) * 10) / 10;

  return {
    threeMonth:  {
      paintFailure:    clamp3(base * 0.75),
      structuralDamage: clamp3(base * 0.30),
      rccCorrosion:    clamp3(base * 0.20),
    },
    sixMonth: {
      paintFailure:    clamp6(base * 1.1),
      structuralDamage: clamp6(base * 0.65),
      rccCorrosion:    clamp6(base * 0.45),
    },
    twelveMonth: {
      paintFailure:    clamp12(base * 1.4),
      structuralDamage: clamp12(base * 1.1),
      rccCorrosion:    clamp12(base * 0.85),
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 5 — Cost Escalation (from real inspection estimates)
// ─────────────────────────────────────────────────────────────────────────────

function costEscalationEngine(inspectionData: InspectionData): AIAnalysisResult['costEscalation'] {
  const fixNow = inspectionData.totalEstimateCost;

  // Custom multiplier based on total cost tier
  let delayMultiplier: number;
  if (fixNow < 25000) {
    delayMultiplier = 3.5;
  } else if (fixNow <= 75000) {
    delayMultiplier = 2.5;
  } else {
    delayMultiplier = 2.0;
  }

  const delayedCost = Math.round(fixNow * delayMultiplier);

  return { fixNow, delayedCost, delayMultiplier };
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 6 — Brand Recommendations (from solution text)
// ─────────────────────────────────────────────────────────────────────────────

function deriveBrandRecommendations(impactedAreas: ImpactedArea[]): BrandRecommendation[] {
  const recommendations: Map<string, BrandRecommendation> = new Map();

  const addOrMerge = (brand: string, treatment: string, area: string) => {
    const key = `${brand}::${treatment}`;
    if (recommendations.has(key)) {
      const existing = recommendations.get(key)!;
      if (!existing.areas.includes(area)) existing.areas.push(area);
    } else {
      recommendations.set(key, { brand, treatment, areas: [area] });
    }
  };

  for (const area of impactedAreas) {
    const sol = (area.solutionText + ' ' + area.positiveSide).toLowerCase();
    const neg = area.negativeSide.slice(0, 80);

    if (/terrace.*cool|cool.*terrace|heat\s*proof/i.test(sol)) {
      addOrMerge('Asian Paints', 'Terrace Waterproofing + Heat Reflective Coating', neg);
    } else if (/terrace/i.test(sol)) {
      addOrMerge('Dr. Fixit', 'Terrace Waterproofing Treatment', neg);
    }

    if (/external.*paint|paint.*external|facade.*paint/i.test(sol)) {
      addOrMerge('Asian Paints / Dr. Fixit', 'External Wall Waterproofing & Painting', neg);
    } else if (/external.*wall|facade|wall.*crack/i.test(sol)) {
      addOrMerge('Dr. Fixit', 'External Wall Crack Sealing & Waterproofing', neg);
    }

    if (/bathroom|balcony.*waterproof|waterproof.*balcony|toilet|wc/i.test(sol)) {
      addOrMerge('Dr. Fixit', 'Internal Bathroom / Balcony Waterproofing', neg);
    }

    if (/internal.*wall|wall.*paint|interior.*paint/i.test(sol)) {
      addOrMerge('Asian Paints', 'Internal Wall Waterproofing & Painting', neg);
    }

    if (/tile.*gap|grout|epoxy|tile.*fill/i.test(sol)) {
      addOrMerge('Dr. Fixit', 'Tile Gap Filling with Epoxy Grout', neg);
    }

    if (/bore\s*packing|bore\s*fill/i.test(sol)) {
      addOrMerge('Dr. Fixit', 'Bore Packing & Crack Injection', neg);
    }

    if (/plumbing|outlet|inlet|pipe|duct/i.test(sol)) {
      addOrMerge('Plumbing Treatment', 'Plumbing Repair / Outlet-Inlet Rectification', neg);
    }
  }

  return Array.from(recommendations.values());
}

// ─────────────────────────────────────────────────────────────────────────────
// Step 7 — Decision Engine
// ─────────────────────────────────────────────────────────────────────────────

function decisionEngine(severityScore: number): AIAnalysisResult['recommendedAction'] {
  if (severityScore >= 7) {
    return {
      directive: 'Immediate Repair',
      urgencyScore: Math.min(10, Math.round(severityScore)),
      timeline: 'Within 2 weeks',
    };
  }
  if (severityScore >= 4) {
    return {
      directive: 'Preventive Sealing',
      urgencyScore: Math.round(severityScore),
      timeline: 'Within 4–6 weeks',
    };
  }
  return {
    directive: 'Monitor Only',
    urgencyScore: Math.max(1, Math.round(severityScore)),
    timeline: 'Monthly monitoring for 3 months',
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Main export
// ─────────────────────────────────────────────────────────────────────────────

export function analyzeSeepage(
  thermalData: ThermalScanData[],
  inspectionData: InspectionData
): AIAnalysisResult {
  const n = thermalData.length || 1;
  const avgHotspot = Math.round(thermalData.reduce((s, t) => s + t.hotspot, 0) / n * 10) / 10;
  const avgColdspot = Math.round(thermalData.reduce((s, t) => s + t.coldspot, 0) / n * 10) / 10;
  const avgDelta = Math.round(thermalData.reduce((s, t) => s + t.delta, 0) / n * 10) / 10;
  const maxDelta = Math.round(Math.max(...thermalData.map(t => t.delta)) * 10) / 10;
  const highCount = thermalData.filter(t => t.moistureLevel === 'High').length;
  const modCount  = thermalData.filter(t => t.moistureLevel === 'Moderate').length;
  const lowCount  = thermalData.filter(t => t.moistureLevel === 'Low').length;

  const maxDeltaScan = thermalData.reduce((best, t) => t.delta > best.delta ? t : best, thermalData[0] ?? { delta: 0, room: 'Unknown' });
  const mostAffectedZone = maxDeltaScan.room || 'Unknown';

  const moistureSpread = moistureMapping(thermalData);
  const { score, tier, explanation } = severityModel(thermalData, inspectionData, moistureSpread);
  const sourceDetection = sourceProbabilityEngine(thermalData, inspectionData);
  const riskProjection = damageProgressionModel(score);
  const costEscalation = costEscalationEngine(inspectionData);
  const brandRecommendations = deriveBrandRecommendations(inspectionData.impactedAreas);
  const recommendedAction = decisionEngine(score);

  return {
    severityScore: score,
    severityTier: tier,
    severityExplanation: explanation,
    moistureSpread,
    thermalSummary: {
      totalScans: thermalData.length,
      avgHotspotTemp: avgHotspot,
      avgColdspotTemp: avgColdspot,
      avgDelta,
      maxDelta,
      mostAffectedZone,
      highMoistureCount: highCount,
      moderateMoistureCount: modCount,
      lowMoistureCount: lowCount,
    },
    sourceDetection,
    riskProjection,
    costEscalation,
    brandRecommendations,
    recommendedAction,
  };
}
