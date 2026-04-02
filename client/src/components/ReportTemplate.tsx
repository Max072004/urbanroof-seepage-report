import { useEffect, useRef, useState } from 'react';
import {
  Thermometer, AlertTriangle, TrendingUp, DollarSign,
  MapPin, Activity, FileText, CheckCircle, Shield,
} from 'lucide-react';
import { ThermalScanData, InspectionData } from '../lib/pdfExtractor';
import { AIAnalysisResult } from '../lib/aiEngine';

interface Props {
  thermalData: ThermalScanData[];
  inspection: InspectionData;
  analysis: AIAnalysisResult;
}

// ─── Animated number hook ────────────────────────────────────────────────────
function useCountUp(target: number, duration = 1200, start = false) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (!start) return;
    let startTime: number | null = null;
    const step = (ts: number) => {
      if (!startTime) startTime = ts;
      const progress = Math.min((ts - startTime) / duration, 1);
      setValue(Math.round(progress * target * 10) / 10);
      if (progress < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }, [target, duration, start]);
  return value;
}

// ─── Section wrapper ─────────────────────────────────────────────────────────
function Section({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mb-8 print:mb-6 print:break-inside-avoid">
      <div className="flex items-center gap-3 mb-4 pb-2 border-b-2 border-[#E8520A]">
        <span className="text-[#E8520A]">{icon}</span>
        <h2 className="text-lg font-bold text-[#0B1D35] uppercase tracking-wide">{title}</h2>
      </div>
      {children}
    </div>
  );
}

// ─── Animated progress bar ────────────────────────────────────────────────────
function AnimatedBar({ value, color = '#E8520A', label, isExporting = false }: { value: number; color?: string; label: string; isExporting?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);

  // When exporting, skip IntersectionObserver and render at full width immediately
  const effectiveWidth = isExporting ? value : width;

  useEffect(() => {
    if (isExporting) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setVisible(true); }, { threshold: 0.2 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [isExporting]);
  useEffect(() => {
    if (isExporting || !visible) return;
    const t = setTimeout(() => setWidth(value), 100);
    return () => clearTimeout(t);
  }, [visible, value, isExporting]);
  return (
    <div ref={ref} className="mb-3">
      <div className="flex justify-between text-xs text-gray-600 mb-1">
        <span className="font-medium">{label}</span>
        <span className="font-bold" style={{ color }}>{value}%</span>
      </div>
      <div className="h-2.5 bg-gray-100 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-1000 ease-out"
          style={{ width: `${effectiveWidth}%`, backgroundColor: color }}
        />
      </div>
    </div>
  );
}

// ─── Severity dial ────────────────────────────────────────────────────────────
function SeverityDial({ score, tier, isExporting = false }: { score: number; tier: string; isExporting?: boolean }) {
  const [started, setStarted] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (isExporting) return;
    const obs = new IntersectionObserver(([e]) => { if (e.isIntersecting) setStarted(true); }, { threshold: 0.3 });
    if (ref.current) obs.observe(ref.current);
    return () => obs.disconnect();
  }, [isExporting]);

  const animated = useCountUp(score, 1400, started);
  // When exporting, use the real score directly (no animation)
  const displayScore = isExporting ? score : animated;

  const radius = 80;
  const circumference = Math.PI * radius;
  const progress = (displayScore / 10) * circumference;
  const tierColor = tier === 'SEVERE RISK' ? '#dc2626' : tier === 'MODERATE' ? '#f59e0b' : '#16a34a';

  return (
    <div ref={ref} className="flex flex-col items-center">
      <svg width="220" height="130" viewBox="0 0 220 130">
        <path
          d={`M 20 110 A ${radius} ${radius} 0 0 1 200 110`}
          fill="none" stroke="#e5e7eb" strokeWidth="16" strokeLinecap="round"
        />
        <path
          d={`M 20 110 A ${radius} ${radius} 0 0 1 200 110`}
          fill="none" stroke={tierColor} strokeWidth="16" strokeLinecap="round"
          strokeDasharray={`${progress} ${circumference}`}
          style={{ transition: isExporting ? 'none' : 'stroke-dasharray 1.4s ease-out' }}
        />
        <text x="110" y="98" textAnchor="middle" fontSize="38" fontWeight="bold" fill={tierColor}>
          {displayScore.toFixed(1)}
        </text>
        <text x="110" y="118" textAnchor="middle" fontSize="11" fill="#6b7280">out of 10</text>
      </svg>
      <span
        className="mt-1 px-4 py-1.5 rounded-full text-white text-sm font-bold tracking-wide"
        style={{ backgroundColor: tierColor }}
      >
        {tier}
      </span>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export default function ReportTemplate({ thermalData, inspection, analysis }: Props) {
  const handlePrint = () => window.print();

  const formatINR = (n: number) =>
    n > 0 ? `₹${n.toLocaleString('en-IN')}` : 'Not Available';

  const tierColor = analysis.severityTier === 'SEVERE RISK'
    ? '#dc2626' : analysis.severityTier === 'MODERATE' ? '#f59e0b' : '#16a34a';

  const riskColor = (v: number) =>
    v >= 80 ? '#dc2626' : v >= 60 ? '#f59e0b' : '#16a34a';

  return (
    <div className="max-w-4xl mx-auto font-sans px-2 sm:px-0">

      {/* ── Action Buttons (outside report content, not in PDF) ── */}
      <div className="flex flex-wrap gap-4 justify-center mb-6 print:hidden">
        <button
          onClick={handlePrint}
          className="flex items-center gap-2 bg-[#0B1D35] hover:bg-[#162d50] text-white font-bold px-8 py-3 rounded-lg transition-colors text-sm"
        >
          <FileText className="w-5 h-5" />
          Print Report
        </button>
      </div>

      {/* ══════════════════════════════════════════════════════════════════════
          REPORT CONTENT (everything below goes into the PDF)
      ══════════════════════════════════════════════════════════════════════ */}
      <div id="report-content" className="bg-white rounded-2xl shadow-lg overflow-hidden">

        {/* ── Header ── */}
        <div className="bg-[#0B1D35] text-white px-4 sm:px-8 py-4 sm:py-6 flex flex-col sm:flex-row items-center justify-between gap-3 sm:gap-0">
          <div className="flex items-center gap-4">
            <img
              src="/urbanroof-logo.png"
              alt="UrbanRoof"
              className="h-10 sm:h-14 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          </div>
          <div className="text-center sm:text-right">
            <h1 className="text-base sm:text-xl font-bold tracking-wide">AI-Powered Seepage Detection Report</h1>
            <p className="text-xs sm:text-sm text-blue-200 mt-1">
              Generated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
            </p>
            <p className="text-xs text-blue-300 mt-0.5">Confidential — For Client Use Only</p>
          </div>
        </div>

        <div className="p-3 sm:p-8 space-y-6 sm:space-y-8">

          {/* ── Section 1: Customer & Inspection Details ── */}
          <Section title="Customer & Inspection Details" icon={<MapPin className="w-5 h-5" />}>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 sm:gap-4">
              {[
                { label: 'Customer Name', value: inspection.customerName },
                { label: 'Mobile Number', value: inspection.mobileNumber },
                { label: 'Email', value: inspection.email },
                { label: 'Address', value: inspection.address },
                { label: 'Property Type', value: inspection.propertyType },
                { label: 'Property Age', value: inspection.propertyAge ? `${inspection.propertyAge} years` : 'Not Available' },
                { label: 'Number of Floors', value: inspection.floors ? `${inspection.floors}` : 'Not Available' },
                { label: 'Inspection Date', value: inspection.inspectionDate },
                { label: 'Inspected By', value: inspection.inspectedBy },
                { label: 'Impacted Rooms', value: inspection.impactedRooms.length > 0 ? inspection.impactedRooms.join(', ') : 'Not Available' },
              ].map(({ label, value }) => (
                <div key={label} className="bg-gray-50 rounded-lg p-3 border border-gray-100">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">{label}</p>
                  <p className="text-sm font-medium text-[#0B1D35] break-words">{value || 'Not Available'}</p>
                </div>
              ))}
            </div>
          </Section>

          {/* ── Section 2: Thermal Scan Analysis ── */}
          <Section title="Thermal Scan Analysis" icon={<Thermometer className="w-5 h-5" />}>
            {thermalData.length === 0 ? (
              <p className="text-gray-500 text-sm">No thermal scan data extracted.</p>
            ) : (
              <div className="space-y-6">
                {thermalData.map((scan, idx) => {
                  const scanTierColor =
                    scan.moistureLevel === 'High' ? '#dc2626'
                    : scan.moistureLevel === 'Moderate' ? '#f59e0b'
                    : '#16a34a';
                  return (
                    <div key={idx} className="border border-gray-200 rounded-xl overflow-hidden shadow-sm print:break-inside-avoid">
                      {/* Scan header */}
                      <div className="bg-[#0B1D35] text-white px-3 sm:px-5 py-3 flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2 sm:gap-3">
                          <span className="font-bold text-sm">Scan #{scan.pageNumber}</span>
                          <span className="text-xs text-blue-200 hidden sm:inline">{scan.filename}</span>
                        </div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className="px-3 py-1 rounded-full text-xs font-bold border"
                            style={{ borderColor: scanTierColor, color: scanTierColor, backgroundColor: 'rgba(255,255,255,0.08)' }}
                          >
                            {scan.moistureLevel} Moisture
                          </span>
                          {scan.areaIndex >= 0 && inspection.impactedAreas[scan.areaIndex] && (() => {
                            const neg = inspection.impactedAreas[scan.areaIndex].negativeSide;
                            // Extract first sentence (up to first period) as the area label,
                            // strip leading numbering like "1)" then strip damage-description
                            // prefix words (e.g. "Dampness observed in") keeping only the location.
                            let label = neg.split('.')[0].trim().replace(/^\d+[.)]\s*/, '');
                            // Remove everything up to and including "in / at / on (the)"
                            label = label.replace(/^.+?\s+(?:in|at|on)\s+(?:the\s+)?/i, '');
                            if (!label || label === 'Not Available') label = `Area #${inspection.impactedAreas[scan.areaIndex].areaNumber}`;
                            return (
                              <span className="bg-[#E8520A] text-white px-3 py-1 rounded-full text-xs font-bold max-w-[260px] text-center leading-tight">
                                {label}
                              </span>
                            );
                          })()}
                        </div>
                      </div>
                      {/* Scan body */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
                        {/* Image */}
                        <div className="bg-gray-50 flex items-center justify-center min-h-[200px] border-r border-gray-200">
                          {scan.imageDataUrl ? (
                            <img
                              src={scan.imageDataUrl}
                              alt={`Thermal scan ${scan.pageNumber}`}
                              className="w-full h-full object-contain max-h-[280px]"
                            />
                          ) : (
                            <div className="flex flex-col items-center gap-2 text-gray-400 py-8">
                              <Thermometer className="w-10 h-10" />
                              <span className="text-sm">Image not available</span>
                            </div>
                          )}
                        </div>
                        {/* Data */}
                        <div className="p-3 sm:p-5">
                          <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-4">
                            <div className="bg-red-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">Hotspot</p>
                              <p className="text-xl font-bold text-red-600">{scan.hotspot}°C</p>
                            </div>
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">Coldspot</p>
                              <p className="text-xl font-bold text-blue-600">{scan.coldspot}°C</p>
                            </div>
                            <div className="bg-amber-50 rounded-lg p-3 text-center">
                              <p className="text-xs text-gray-500 mb-1">Delta Δ</p>
                              <p className="text-xl font-bold text-amber-600">{scan.delta}°C</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm mb-4">
                            <div><span className="text-gray-500">Midpoint:</span> <span className="font-semibold text-[#0B1D35]">{scan.midpoint}°C</span></div>
                            <div><span className="text-gray-500">Emissivity:</span> <span className="font-semibold text-[#0B1D35]">{scan.emissivity}</span></div>
                            <div><span className="text-gray-500">Reflected:</span> <span className="font-semibold text-[#0B1D35]">{scan.reflected}°C</span></div>
                            <div><span className="text-gray-500">Date:</span> <span className="font-semibold text-[#0B1D35]">{scan.date}</span></div>
                          </div>
                          {/* AI Observation */}
                          <div
                            className="rounded-lg p-3 border text-xs leading-relaxed"
                            style={{ borderColor: scanTierColor, backgroundColor: `${scanTierColor}10` }}
                          >
                            <p className="font-bold mb-1" style={{ color: scanTierColor }}>AI Observation</p>
                            <p className="text-gray-700">{scan.aiObservation}</p>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Section>

          {/* ── Section 3: Severity Score ── */}
          <Section title="AI Severity Assessment" icon={<AlertTriangle className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
              <SeverityDial score={analysis.severityScore} tier={analysis.severityTier} />
              <div className="space-y-4">
                <div className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                  <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Analysis Basis</p>
                  <p className="text-sm text-gray-700 leading-relaxed">{analysis.severityExplanation}</p>
                </div>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div className="bg-red-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-red-600">{analysis.thermalSummary.highMoistureCount}</p>
                    <p className="text-xs text-gray-500 mt-1">High Moisture</p>
                  </div>
                  <div className="bg-amber-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-amber-600">{analysis.thermalSummary.moderateMoistureCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Moderate</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <p className="text-xl font-bold text-green-600">{analysis.thermalSummary.lowMoistureCount}</p>
                    <p className="text-xs text-gray-500 mt-1">Low</p>
                  </div>
                </div>
              </div>
            </div>
          </Section>

          {/* ── Section 4: Moisture Spread ── */}
          <Section title="Moisture Spread Analysis" icon={<Activity className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Moisture Coverage</p>
                <div className="flex items-end gap-3 mb-3">
                  <span className="text-3xl sm:text-5xl font-black" style={{ color: tierColor }}>
                    {analysis.moistureSpread.percentage}%
                  </span>
                  <span className="text-sm text-gray-500 mb-2">of affected area</span>
                </div>
                <div className="h-3 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-1000"
                    style={{ width: `${analysis.moistureSpread.percentage}%`, backgroundColor: tierColor }}
                  />
                </div>
              </div>
              <div className="bg-gray-50 rounded-xl p-5 border border-gray-200">
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Penetration Depth</p>
                <div className="flex items-center gap-3">
                  <span
                    className="text-2xl font-bold px-4 py-2 rounded-lg"
                    style={{ color: tierColor, backgroundColor: `${tierColor}15` }}
                  >
                    {analysis.moistureSpread.depthClassification}
                  </span>
                </div>
                <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                  {analysis.moistureSpread.depthClassification === 'Deep'
                    ? 'Water has penetrated through the structural core. RCC corrosion risk is high.'
                    : analysis.moistureSpread.depthClassification === 'Moderate'
                    ? 'Moisture has reached the intermediate substrate layer. Structural risk is developing.'
                    : 'Surface-level dampness detected. Structural integrity not yet compromised.'}
                </p>
              </div>
            </div>
          </Section>

          {/* ── Section 5: Source Detection ── */}
          <Section title="Seepage Source Detection" icon={<MapPin className="w-5 h-5" />}>
            {analysis.sourceDetection.length === 0 ? (
              <p className="text-gray-500 text-sm">No specific sources identified from the inspection data.</p>
            ) : (
              <div className="space-y-4">
                {analysis.sourceDetection.map((src, i) => (
                  <div key={i} className="bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-semibold text-[#0B1D35] text-sm">{src.source}</span>
                      <span className="text-xs font-bold px-2 py-0.5 rounded-full text-white"
                        style={{ backgroundColor: src.confidence >= 80 ? '#dc2626' : src.confidence >= 65 ? '#f59e0b' : '#16a34a' }}>
                        {src.confidence}% confidence
                      </span>
                    </div>
                    <AnimatedBar value={src.confidence} color={src.confidence >= 80 ? '#dc2626' : src.confidence >= 65 ? '#f59e0b' : '#16a34a'} label="" />
                    <p className="text-xs text-gray-600 leading-relaxed mt-2">{src.description}</p>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Section 6: Impacted Areas ── */}
          <Section title="Impacted Areas" icon={<MapPin className="w-5 h-5" />}>
            {inspection.impactedAreas.length === 0 ? (
              <p className="text-gray-500 text-sm">No impacted area data extracted from inspection report.</p>
            ) : (
              <div className="space-y-4">
                {inspection.impactedAreas.map((area, i) => (
                  <div key={i} className="border border-gray-200 rounded-xl overflow-hidden print:break-inside-avoid">
                    <div className="bg-[#0B1D35] text-white px-4 py-2 text-sm font-bold">
                      Area #{area.areaNumber}
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-gray-200">
                      <div className="p-4">
                        <p className="text-xs font-bold text-red-600 uppercase tracking-wide mb-2">Negative Side — Damage Observed</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{area.negativeSide}</p>
                        {/* Inspection photo for this area */}
                        {area.inspectionImages && area.inspectionImages[0] && (
                          <div className="mt-3">
                            <p className="text-xs text-gray-400 mb-1 font-medium uppercase tracking-wide">Site Photo</p>
                            <img
                              src={area.inspectionImages[0]}
                              alt={`Inspection photo area ${area.areaNumber}`}
                              className="w-full rounded-lg border border-gray-200 object-contain max-h-[220px]"
                            />
                          </div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-xs font-bold text-[#E8520A] uppercase tracking-wide mb-2">Positive Side — Probable Source</p>
                        <p className="text-sm text-gray-700 leading-relaxed">{area.positiveSide}</p>
                        {area.solutionText && area.solutionText !== 'Not Available' && (
                          <div className="mt-3 pt-3 border-t border-gray-100">
                            <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-1">Solution</p>
                            <p className="text-xs text-gray-600 leading-relaxed">{area.solutionText}</p>
                          </div>
                        )}
                        {area.estimateCost > 0 && (
                          <div className="mt-2 inline-block bg-green-50 border border-green-200 rounded-lg px-3 py-1">
                            <span className="text-xs font-bold text-green-700">Estimate: {formatINR(area.estimateCost)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* ── Section 7: Risk Projection ── */}
          <Section title="Damage Risk Projection" icon={<TrendingUp className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {[
                { label: '3 Months', data: analysis.riskProjection.threeMonth },
                { label: '6 Months', data: analysis.riskProjection.sixMonth },
                { label: '12 Months', data: analysis.riskProjection.twelveMonth },
              ].map(({ label, data }) => (
                <div key={label} className="bg-gray-50 rounded-xl p-4 border border-gray-200 print:break-inside-avoid">
                  <p className="text-xs font-bold text-[#0B1D35] uppercase tracking-wide mb-3 text-center">{label}</p>
                  <AnimatedBar value={data.paintFailure} color={riskColor(data.paintFailure)} label="Paint Failure" />
                  <AnimatedBar value={data.structuralDamage} color={riskColor(data.structuralDamage)} label="Structural Damage" />
                  <AnimatedBar value={data.rccCorrosion} color={riskColor(data.rccCorrosion)} label="RCC Corrosion" />
                </div>
              ))}
            </div>
          </Section>

          {/* ── Section 8: Cost Escalation ── */}
          <Section title="Cost Escalation Analysis" icon={<DollarSign className="w-5 h-5" />}>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-green-50 border-2 border-green-300 rounded-xl p-4 sm:p-6 text-center">
                <p className="text-xs font-bold text-green-700 uppercase tracking-wide mb-2">Fix Now — Total Project Cost</p>
                <p className="text-2xl sm:text-4xl font-black text-green-700">
                  {analysis.costEscalation.fixNow > 0 ? formatINR(analysis.costEscalation.fixNow) : 'As per estimate'}
                </p>
                <p className="text-xs text-green-600 mt-2">Based on inspection report estimates</p>
              </div>
              <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 sm:p-6 text-center">
                <p className="text-xs font-bold text-red-700 uppercase tracking-wide mb-2">
                  If Delayed 6 Months ({analysis.costEscalation.delayMultiplier}× escalation)
                </p>
                <p className="text-2xl sm:text-4xl font-black text-red-700">
                  {analysis.costEscalation.delayedCost > 0 ? formatINR(analysis.costEscalation.delayedCost) : 'Significantly Higher'}
                </p>
                <p className="text-xs text-red-600 mt-2">Projected cost including structural damage repair</p>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-3 text-center italic">
              These are estimated prices. For exact market pricing, connect with the dedicated consultant.
            </p>
          </Section>

          {/* ── Section 9: Brand Recommendations ── */}
          <Section title="Recommended Treatment & Brands" icon={<Shield className="w-5 h-5" />}>
            {analysis.brandRecommendations.length === 0 ? (
              <p className="text-gray-500 text-sm">No specific treatment recommendations could be derived from the inspection data.</p>
            ) : (
              <div className="space-y-3">
                {analysis.brandRecommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-4 bg-gray-50 rounded-xl p-4 border border-gray-200">
                    <CheckCircle className="w-5 h-5 text-[#E8520A] mt-0.5 flex-shrink-0" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-bold text-[#0B1D35] text-sm">{rec.treatment}</span>
                        <span className="bg-[#E8520A] text-white text-xs font-bold px-2 py-0.5 rounded-full">{rec.brand}</span>
                      </div>
                      <p className="text-xs text-gray-500">
                        Applicable to: {rec.areas.slice(0, 3).join('; ')}{rec.areas.length > 3 ? ` +${rec.areas.length - 3} more` : ''}
                      </p>
                    </div>
                  </div>
                ))}
                <p className="text-xs text-gray-400 italic mt-2 text-center">
                  These are estimated prices. For exact market pricing, connect with the dedicated consultant.
                </p>
              </div>
            )}
          </Section>

          {/* ── Section 10: Recommended Action ── */}
          <Section title="Recommended Action" icon={<AlertTriangle className="w-5 h-5" />}>
            <div
              className="rounded-xl p-6 border-2 text-center"
              style={{ borderColor: tierColor, backgroundColor: `${tierColor}10` }}
            >
              <p className="text-xl sm:text-3xl font-black mb-2" style={{ color: tierColor }}>
                {analysis.recommendedAction.directive}
              </p>
              <p className="text-sm text-gray-600 mb-4">
                Urgency Score: <strong>{analysis.recommendedAction.urgencyScore}/10</strong>
                &nbsp;·&nbsp; Timeline: <strong>{analysis.recommendedAction.timeline}</strong>
              </p>
              <p className="text-xs text-gray-500">
                Most Affected Zone: <strong>{analysis.thermalSummary.mostAffectedZone}</strong>
                &nbsp;·&nbsp; Avg Thermal Delta: <strong>{analysis.thermalSummary.avgDelta}°C</strong>
                &nbsp;·&nbsp; Total Scans: <strong>{analysis.thermalSummary.totalScans}</strong>
              </p>
            </div>
          </Section>

          {/* ── Problem Duration & Seasonal Pattern ── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Problem Duration</p>
              <p className="text-sm text-gray-700 leading-relaxed">{inspection.problemDuration}</p>
            </div>
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Seasonal Pattern</p>
              <p className="text-sm text-gray-700 leading-relaxed">{inspection.seasonalPattern}</p>
            </div>
          </div>

        </div>{/* end padding wrapper */}

        {/* ── Footer ── */}
        <div className="bg-[#0B1D35] text-white px-4 sm:px-8 py-4 flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-center sm:text-left">
          <div className="flex items-center gap-3">
            <img
              src="/urbanroof-logo.png"
              alt="UrbanRoof"
              className="h-8 w-auto object-contain"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
            <span className="text-blue-300">AI-Powered Seepage Detection</span>
          </div>
          <span className="text-blue-300">All data processed locally. No files stored on servers.</span>
        </div>

      </div>{/* end #report-content */}

      {/* ── Print CSS ── */}
      <style>{`
        @media print {
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .print\\:hidden { display: none !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
        }
      `}</style>
    </div>
  );
}
