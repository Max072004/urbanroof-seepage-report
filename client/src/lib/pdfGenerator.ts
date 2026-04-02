import { AIAnalysisResult } from './aiEngine';
import { InspectionData, ThermalScanData } from './pdfExtractor';

declare global {
  interface Window {
    html2pdf: any;
  }
}

async function loadHtml2Pdf(): Promise<void> {
  if (window.html2pdf) return;
  return new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Failed to load html2pdf'));
    document.head.appendChild(script);
  });
}

export async function generatePDF(
  analysis: AIAnalysisResult,
  inspection: InspectionData,
  thermalData: ThermalScanData[]
): Promise<void> {
  const element = document.getElementById('report-content');
  if (!element) {
    throw new Error('Report content element not found. Please wait for the report to fully render.');
  }

  await loadHtml2Pdf();

  const filename = `Seepage_Report_${inspection.customerName.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.pdf`;

  const opt = {
    margin: [8, 8, 8, 8],
    filename,
    image: { type: 'jpeg', quality: 0.95 },
    html2canvas: {
      scale: 2,
      useCORS: true,
      allowTaint: true,
      logging: false,
      scrollY: 0,
    },
    jsPDF: {
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4',
    },
    pagebreak: { mode: ['avoid-all', 'css', 'legacy'] },
  };

  try {
    await window.html2pdf().set(opt).from(element).save();
  } catch (error) {
    console.error('PDF generation error:', error);
    throw new Error('Failed to generate PDF. Please try the Print option instead.');
  }
}
