import { useState } from 'react';
import { UploadScreen } from '../components/UploadScreen';
import { LoadingScreen } from '../components/LoadingScreen';
import ReportTemplate from '../components/ReportTemplate';
import { extractThermalData, extractInspectionData, ThermalScanData, InspectionData } from '../lib/pdfExtractor';
import { analyzeSeepage, AIAnalysisResult } from '../lib/aiEngine';

type AppState = 'upload' | 'loading' | 'report';

export default function Home() {
  const [appState, setAppState] = useState<AppState>('upload');
  const [thermalData, setThermalData] = useState<ThermalScanData[]>([]);
  const [inspection, setInspection] = useState<InspectionData | null>(null);
  const [analysis, setAnalysis] = useState<AIAnalysisResult | null>(null);

  const handleFilesSelected = async (thermalFile: File, inspectionFile: File) => {
    setAppState('loading');

    try {
      // Step 1: Extract inspection data first (needed for room mapping)
      const inspectionData = await extractInspectionData(inspectionFile);
      setInspection(inspectionData);

      // Step 2: Extract thermal data (uses impacted areas for room mapping)
      const thermal = await extractThermalData(thermalFile, inspectionData.impactedAreas);
      setThermalData(thermal);

      // Step 3: Run AI analysis
      const result = analyzeSeepage(thermal, inspectionData);
      setAnalysis(result);

      setAppState('report');
    } catch (err: any) {
      console.error('Analysis error:', err);
      setAppState('upload');
    }
  };

  const handleReset = () => {
    setAppState('upload');
    setThermalData([]);
    setInspection(null);
    setAnalysis(null);
  };

  return (
    <>
      {/* Loading overlay — shown during analysis */}
      <LoadingScreen isVisible={appState === 'loading'} />

      {/* Upload screen */}
      {appState === 'upload' && (
        <UploadScreen onFilesSelected={handleFilesSelected} isLoading={false} />
      )}

      {/* Report */}
      {appState === 'report' && thermalData && inspection && analysis && (
        <div className="min-h-screen bg-gray-100 py-8 px-4">
          <div className="max-w-4xl mx-auto mb-6 flex items-center justify-between">
            <button
              onClick={handleReset}
              className="flex items-center gap-2 text-sm text-[#0B1D35] hover:text-[#E8520A] font-semibold transition-colors"
            >
              ← New Analysis
            </button>
            <div className="flex items-center gap-2">
              <img
                src="/urbanroof-logo.png"
                alt="UrbanRoof"
                className="h-10 w-auto object-contain"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            </div>
          </div>
          <ReportTemplate thermalData={thermalData} inspection={inspection} analysis={analysis} />
        </div>
      )}
    </>
  );
}
