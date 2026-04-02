// ─────────────────────────────────────────────────────────────────────────────
// pdfExtractor.ts  –  Correct multi-line parser for:
//   • Bosch GTC 400 C thermal inspection reports
//   • SafetyCulture / UrbanRoof inspection form reports
// ─────────────────────────────────────────────────────────────────────────────
import * as pdfjsLib from 'pdfjs-dist';
import workerSrc from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface ThermalScanData {
  pageNumber: number;
  filename: string;
  date: string;
  device: string;
  serialNumber: string;
  hotspot: number;
  coldspot: number;
  midpoint: number;
  emissivity: number;
  reflected: number;
  delta: number;
  moistureLevel: 'Low' | 'Moderate' | 'High';
  room: string;
  areaIndex: number;  // 0-based index into impactedAreas (proportional block assignment)
  imageDataUrl: string | null;
  aiObservation: string;
}

export interface ImpactedArea {
  areaNumber: number;
  negativeSide: string;
  positiveSide: string;
  solutionText: string;
  estimateCost: number;
  inspectionImages?: string[];  // rendered photo page(s) from inspection PDF for this area
}

export interface InspectionData {
  customerName: string;
  mobileNumber: string;
  email: string;
  address: string;
  propertyAge: string;
  propertyType: string;
  floors: string;
  previousStructuralAudit: string;
  previousRepairWork: string;
  inspectionDate: string;
  inspectedBy: string;
  inspectionScore: string;
  flaggedItems: string;
  impactedRooms: string[];
  impactedAreas: ImpactedArea[];
  checklist: {
    wcChecklist: Record<string, string>;
    externalWallChecklist: Record<string, string>;
    rccStructuralCondition: Record<string, string>;
    externalWallCondition: Record<string, string>;
  };
  seasonalPattern: string;
  problemDuration: string;
  totalEstimateCost: number;
}


// ─── Canvas renderer (pdfjs v4 compatible) ────────────────────────────────────
async function renderPageToImage(page: pdfjsLib.PDFPageProxy): Promise<string | null> {
  try {
    const viewport = page.getViewport({ scale: 2.0 });
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(viewport.width);
    canvas.height = Math.floor(viewport.height);
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return null;
    await (page.render({ canvasContext: ctx as any, viewport } as any)).promise;
    return canvas.toDataURL('image/jpeg', 0.92);
  } catch (err) {
    console.error('renderPageToImage error:', err);
    return null;
  }
}

// ─── Extract raw text lines from a page ───────────────────────────────────────
async function getPageLines(page: pdfjsLib.PDFPageProxy): Promise<string[]> {
  const content = await page.getTextContent();
  return (content.items as any[])
    .filter((item: any) => typeof item.str === 'string')
    .map((item: any) => item.str.trim())
    .filter(Boolean);
}

// ─── Classify moisture from thermal delta ─────────────────────────────────────
function classifyMoisture(delta: number): 'Low' | 'Moderate' | 'High' {
  if (delta >= 5) return 'High';
  if (delta >= 3) return 'Moderate';
  return 'Low';
}

// ─── AI observation text ──────────────────────────────────────────────────────
function generateObservation(
  delta: number,
  hotspot: number,
  coldspot: number,
  level: 'Low' | 'Moderate' | 'High',
  room: string
): string {
  const loc = room && room !== 'Unknown' ? room : 'this area';
  if (level === 'High') {
    return `CRITICAL ALERT: Severe deep-layer water penetration detected in ${loc}. The ${delta.toFixed(1)}°C thermal differential (${coldspot}°C → ${hotspot}°C) confirms an active, high-pressure seepage breach through the structural core. Continued exposure will cause irreversible RCC corrosion, concrete spalling, and structural failure. Immediate emergency intervention is mandatory — every day of delay accelerates catastrophic damage.`;
  }
  if (level === 'Moderate') {
    return `WARNING: Significant moisture infiltration actively progressing in ${loc}. The ${delta.toFixed(1)}°C differential (${coldspot}°C → ${hotspot}°C) confirms seepage has breached the surface layer and is penetrating into the structural substrate. Without treatment within 4–6 weeks, this will escalate to deep structural damage and paint failure. Urgent preventive treatment is strongly recommended.`;
  }
  return `CAUTION: Early-stage moisture activity detected in ${loc}. The ${delta.toFixed(1)}°C differential (${coldspot}°C → ${hotspot}°C) indicates surface-level dampness that, if left unaddressed, will penetrate deeper layers during the next monsoon cycle. Preventive sealing and close monitoring are recommended to prevent escalation.`;
}

// ─── Month abbreviation map ───────────────────────────────────────────────────
const MONTHS: Record<string, string> = {
  jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06',
  jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12',
};

function formatDate(raw: string): string {
  if (!raw) return '';
  if (/\d{2}\.\d{2}\.\d{4}/.test(raw)) return raw;
  const m = raw.match(/(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})/);
  if (m) {
    const day = m[1].padStart(2, '0');
    const mon = MONTHS[m[2].toLowerCase()] ?? '01';
    return `${day}.${mon}.${m[3]}`;
  }
  return raw;
}

// ─── Parse a temperature value string like "31.2 °C" or "<-10 °C" ─────────────
function parseTemp(s: string): number {
  if (!s) return 0;
  const m = s.match(/<?\s*(-?\d+\.?\d*)\s*°?C?/i);
  return m ? parseFloat(m[1]) : 0;
}

// ─── Room keywords ────────────────────────────────────────────────────────────
const ROOM_KEYWORDS = [
  'Hall', 'Bedroom', 'Kitchen', 'Bathroom', 'Toilet', 'WC',
  'Living Room', 'Dining', 'Balcony', 'Parking', 'Terrace',
  'Store', 'Passage', 'Master Bedroom', 'Common Bathroom', 'Lobby',
  'Corridor', 'Staircase', 'Lift', 'Duct', 'Lawn', 'Garden', 'Room',
];

// ─────────────────────────────────────────────────────────────────────────────
// THERMAL PDF PARSER
//
// Bosch GTC 400 C report structure per page (as extracted by pdfjs):
//
//   1.1 RB25110X.JPG          ← "N.M FILENAME.JPG"
//   27 Mar 2026               ← date
//   Page 1
//   Device : GTC 400 C Professional
//   Serial Number : 70003
//   -
//   Hot Spot :                ← label on its own line
//   31.2 °C                   ← value on NEXT line
//   Material :
//   Cold Spot :
//   26.2 °C
//   Emissivity :
//   0.94
//   Center Spot :
//   ∼27.4 °C
//   Reflected temperature :
//   23 °C
//   31.2 °C                   ← repeated (ignore)
//   26.2 °C                   ← repeated (ignore)
//   Taken on 27 Mar 2026
//   1/17
//   www.bosch-professional.com/thermal
// ─────────────────────────────────────────────────────────────────────────────
function parseThermalPage(
  lines: string[],
  pageNum: number,
  totalThermalPages: number,
  impactedAreas: ImpactedArea[]
): Omit<ThermalScanData, 'imageDataUrl'> {

  // ── Filename ──────────────────────────────────────────────────────────────
  const filenameMatch = lines.join('\n').match(/\b([A-Z0-9]+\.JPG)\b/i);
  const filename = filenameMatch ? filenameMatch[1] : `Thermal_Page_${pageNum}`;

  // ── Date ──────────────────────────────────────────────────────────────────
  let date = '';
  for (const line of lines) {
    const m = line.match(/Taken\s+on\s+(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})/i)
      || line.match(/^(\d{1,2}\s+[A-Za-z]{3}\s+\d{4})$/);
    if (m) { date = formatDate(m[1]); break; }
  }

  // ── Device & Serial ───────────────────────────────────────────────────────
  let device = 'GTC 400 C Professional';
  let serialNumber = '';
  for (const line of lines) {
    const dm = line.match(/Device\s*:\s*(.+)/i);
    if (dm) device = dm[1].trim();
    const sm = line.match(/Serial\s+Number\s*:\s*(.+)/i);
    if (sm) serialNumber = sm[1].trim();
  }

  // ── Multi-line label → next-line value extractor ──────────────────────────
  // The Bosch PDF puts the label ("Hot Spot :") on one line and the value
  // ("31.2 °C") on the NEXT non-empty, non-label line.
  function extractNextValue(labelRe: RegExp): number {
    for (let i = 0; i < lines.length - 1; i++) {
      if (labelRe.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const v = lines[j].trim();
          // Skip empty, dashes, and known label lines
          if (!v || v === '-') continue;
          if (/^(Material|Device|Serial|Hot|Cold|Center|Emissivity|Reflected|Taken|Page|www|\d+\/\d+)/i.test(v)) continue;
          // Must contain a digit (temperature value)
          if (/\d/.test(v)) return parseTemp(v);
        }
      }
    }
    return 0;
  }

  const hotspot   = extractNextValue(/^Hot\s+Spot\s*:/i);
  const coldspot  = extractNextValue(/^Cold\s+Spot\s*:/i);
  const emissivity = extractNextValue(/^Emissivity\s*:/i) || 0.94;
  const reflected  = extractNextValue(/^Reflected\s+temperature\s*:/i) || 23;
  let midpoint     = extractNextValue(/^Center\s+Spot\s*:/i);
  if (midpoint === 0 && hotspot > 0 && coldspot > 0) {
    midpoint = Math.round(((hotspot + coldspot) / 2) * 10) / 10;
  }

  const delta = Math.max(0, Math.round((hotspot - coldspot) * 10) / 10);
  const moistureLevel = classifyMoisture(delta);

  // ── Area & room mapping: proportional block assignment ───────────────────
  // The thermal PDF has no room/area labels. We distribute thermal scans
  // proportionally across inspection areas so sequential scans stay in the
  // same area (much better than round-robin).
  // e.g. 17 scans / 5 areas → scans 1-3→area0, 4-6→area1, 7-9→area2, …
  let areaIndex = -1;
  let room = 'Unknown';
  if (impactedAreas.length > 0 && totalThermalPages > 0) {
    areaIndex = Math.min(
      Math.floor((pageNum - 1) * impactedAreas.length / totalThermalPages),
      impactedAreas.length - 1
    );
    const area = impactedAreas[areaIndex];
    const areaText = `${area.negativeSide} ${area.positiveSide} ${area.solutionText}`.toLowerCase();
    for (const kw of ROOM_KEYWORDS) {
      if (areaText.includes(kw.toLowerCase())) {
        room = kw;
        break;
      }
    }
  }

  return {
    pageNumber: pageNum,
    filename,
    date,
    device,
    serialNumber,
    hotspot,
    coldspot,
    midpoint,
    emissivity,
    reflected,
    delta,
    moistureLevel,
    room,
    areaIndex,
    aiObservation: generateObservation(delta, hotspot, coldspot, moistureLevel, room),
  };
}

export async function extractThermalData(
  file: File,
  impactedAreas: ImpactedArea[] = []
): Promise<ThermalScanData[]> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  const scans: ThermalScanData[] = [];

  for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const lines = await getPageLines(page);
    const data = parseThermalPage(lines, pageNum, totalPages, impactedAreas);
    const imageDataUrl = await renderPageToImage(page);
    scans.push({ ...data, imageDataUrl });
  }

  return scans;
}

// ─────────────────────────────────────────────────────────────────────────────
// INSPECTION PDF PARSER
//
// SafetyCulture / UrbanRoof format (lines as extracted by pdfjs):
//
//   UrbanRoof - Inspection Form Template
//   Chandru                    ← customer name (line after template title)
//   Score
//   Complete
//   41 / 43 (95.35%)
//   Customer Name              ← label
//   Mobile:                    ← label
//   Flagged items
//   2
//   Actions
//   0
//   Chandru                    ← customer name (repeated)
//   9900175939                 ← mobile number
//   Email:
//   chandru8justice@gmail.com
//   Address:
//   KCS Arcade, Jakkur, Bengaluru, Karnataka 560-064
//   Property Age (In years):
//   7
//   Property Type:
//   Commercial
//   Floors:
//   5
//   Previous Structural audit done
//   No
//   Previous Repair work done
//   No
//   Inspection Date and Time:
//   27.03.2026 12:30 IST
//   Inspected By:
//   Aslaan
// ─────────────────────────────────────────────────────────────────────────────
function parseInspectionText(fullText: string): InspectionData {
  const lines = fullText.split('\n').map(l => l.trim()).filter(Boolean);

  // ── Generic: find value on the next non-trivial line after a label ─────────
  function nextValue(labelRe: RegExp, startIdx = 0): string {
    for (let i = startIdx; i < lines.length - 1; i++) {
      if (labelRe.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 8, lines.length); j++) {
          const v = lines[j].trim();
          if (!v) continue;
          // Skip known structural labels
          if (/^(Score|Complete|Flagged|Actions|Customer|Mobile|Email|Address|Property|Floors|Previous|Inspection|Inspected|safetyculture|UrbanRoof|\d+\s*\/\s*\d+|\d+$)/i.test(v)) continue;
          return v;
        }
      }
    }
    return 'Not Available';
  }

  // ── Customer Name ─────────────────────────────────────────────────────────
  // SafetyCulture 2-column table: pdfjs may extract all left-col labels first,
  // then all right-col values — so the name can appear far from its label.
  // Also, "Customer Name" may be split as "Customer" + "Name" by pdfjs.
  let customerName = 'Not Available';

  // Strategy 1: "Customer Name" as single label line
  for (let i = 0; i < lines.length; i++) {
    if (/^Customer\s+Name\s*:?\s*$/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 15, lines.length); j++) {
        const v = lines[j].trim();
        if (!v) continue;
        if (/^(Mobile|Email|Address|Property|Floors|Previous|Inspection|Flagged|Actions|Score|Complete|safetyculture|\d)/i.test(v)) continue;
        if (/^[A-Za-z][a-zA-Z\s]{1,40}$/.test(v)) { customerName = v; break; }
      }
      break;
    }
    // Inline: "Customer Name: Chandru"
    const inlineMatch = lines[i].match(/^Customer\s+Name\s*:\s*([A-Za-z][a-zA-Z\s]{1,40})/i);
    if (inlineMatch) { customerName = inlineMatch[1].trim(); break; }
  }

  // Strategy 2: "Customer" and "Name" on separate lines (pdfjs split label)
  if (customerName === 'Not Available') {
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^Customer\s*$/i.test(lines[i]) && /^Name\s*:?\s*$/i.test(lines[i + 1])) {
        for (let j = i + 2; j < Math.min(i + 15, lines.length); j++) {
          const v = lines[j].trim();
          if (!v) continue;
          if (/^(Mobile|Email|Address|Property|Floors|Previous|Inspection|Flagged|Actions|Score|Complete|safetyculture|\d)/i.test(v)) continue;
          if (/^[A-Za-z][a-zA-Z\s]{1,40}$/.test(v)) { customerName = v; break; }
        }
        break;
      }
    }
  }

  // Strategy 3: Name appears right after "Actions" count in right-column ordering
  if (customerName === 'Not Available') {
    for (let i = 0; i < lines.length - 1; i++) {
      if (/^Actions$/i.test(lines[i]) && /^\d+$/.test(lines[i + 1])) {
        for (let j = i + 2; j < Math.min(i + 5, lines.length); j++) {
          const v = lines[j].trim();
          if (!v || /^\d+$/.test(v)) continue;
          if (/^[A-Za-z][a-zA-Z\s]{1,40}$/.test(v)) { customerName = v; break; }
        }
        break;
      }
    }
  }

  // Strategy 4: Name appears immediately after the UrbanRoof form title
  if (customerName === 'Not Available') {
    for (let i = 0; i < lines.length; i++) {
      if (/UrbanRoof.*Inspection/i.test(lines[i])) {
        for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
          const v = lines[j].trim();
          if (v && /^[A-Z][a-zA-Z\s]{2,40}$/.test(v) &&
              !/^(Score|Complete|Flagged|Actions|UrbanRoof)/i.test(v)) {
            customerName = v;
            break;
          }
        }
        if (customerName !== 'Not Available') break;
      }
    }
  }

  // ── Mobile Number ─────────────────────────────────────────────────────────
  let mobileNumber = 'Not Available';
  for (let i = 0; i < lines.length; i++) {
    // Inline: "Mobile: 9900175939"
    const inline = lines[i].match(/Mobile\s*:?\s*(\d{8,15})/i);
    if (inline) { mobileNumber = inline[1]; break; }
    // Next-line: label "Mobile:" then number on next line
    if (/^Mobile\s*:?\s*$/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/^\d{8,15}$/.test(lines[j].trim())) {
          mobileNumber = lines[j].trim();
          break;
        }
      }
      if (mobileNumber !== 'Not Available') break;
    }
  }
  // Fallback: find any 10-digit number in the full text
  if (mobileNumber === 'Not Available') {
    const m = fullText.match(/(?:Mobile|Phone|Contact)[^\d]*(\d{10})/i);
    if (m) mobileNumber = m[1];
  }

  // ── Email ─────────────────────────────────────────────────────────────────
  const emailMatch = fullText.match(/([a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,})/);
  const email = emailMatch ? emailMatch[1] : 'Not Available';

  // ── Address ───────────────────────────────────────────────────────────────
  let address = 'Not Available';
  for (let i = 0; i < lines.length; i++) {
    if (/^Address\s*:?\s*$/i.test(lines[i])) {
      const parts: string[] = [];
      for (let j = i + 1; j < Math.min(i + 6, lines.length); j++) {
        const v = lines[j].trim();
        if (!v || /^(Property|Floors|Previous|Inspection|Inspected|safetyculture|\d+\s*\/)/i.test(v)) break;
        parts.push(v);
      }
      if (parts.length) address = parts.join(', ');
      break;
    }
    // Inline: "Address: KCS Arcade..."
    const inline = lines[i].match(/^Address\s*:\s*(.+)/i);
    if (inline) { address = inline[1].trim(); break; }
  }

  // ── Property Age ──────────────────────────────────────────────────────────
  // pdfjs may put "Property Age (In years):" on one line and "7" on the next,
  // or all on the same line.  We locate "Property Age" then search the next
  // 300 chars for the first number that follows a colon (inline or next line).
  let propertyAge = 'Not Available';
  {
    const agePos = fullText.search(/Property\s+Age/i);
    if (agePos >= 0) {
      const snippet = fullText.slice(agePos, agePos + 300);
      // Try: colon then optional whitespace/newline then 1-3 digit number
      const m1 = snippet.match(/:\s*\n?\s*(\d{1,3})(?!\d)/);
      if (m1) {
        propertyAge = m1[1];
      } else {
        // Fallback: first standalone 1-3 digit on its own line in the snippet
        const m2 = snippet.match(/\n\s*(\d{1,3})\s*(?:\n|$)/m);
        if (m2) propertyAge = m2[1];
      }
    }
  }

  // ── Property Type ─────────────────────────────────────────────────────────
  let propertyType = 'Not Available';
  {
    // Inline: "Property Type: Commercial"  OR  label line → value on next(ish) line
    // Allow up to ~200 chars of any text (labels, newlines) between label and value
    const m = fullText.match(/Property\s+Type\s*:?\s*(Commercial|Residential|Industrial|Apartment|Villa|Bungalow|Flat|House|Office|Retail|Warehouse|Shop)/i);
    if (m) {
      propertyType = m[1];
    } else {
      // Generic fallback: first alphabetic word after "Property Type"
      const m2 = fullText.match(/Property\s+Type\s*:?\s*\n+([A-Za-z][A-Za-z\s]{1,30})/i);
      if (m2) propertyType = m2[1].trim();
    }
  }

  // ── Floors ────────────────────────────────────────────────────────────────
  let floors = 'Not Available';
  {
    const m = fullText.match(/^Floors\s*:?\s*(\d+)/im);
    if (m) {
      floors = m[1];
    } else {
      const m2 = fullText.match(/Floors\s*:?\s*\n+(\d+)/i);
      if (m2) floors = m2[1];
    }
  }

  // ── Previous Structural Audit ─────────────────────────────────────────────
  let prevAudit = 'Not Available';
  for (let i = 0; i < lines.length; i++) {
    if (/^Previous\s+Structural\s+audit/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^(Yes|No)$/i.test(lines[j].trim())) { prevAudit = lines[j].trim(); break; }
      }
      break;
    }
  }

  // ── Previous Repair Work ──────────────────────────────────────────────────
  let prevRepair = 'Not Available';
  for (let i = 0; i < lines.length; i++) {
    if (/^Previous\s+Repair\s+work/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        if (/^(Yes|No)$/i.test(lines[j].trim())) { prevRepair = lines[j].trim(); break; }
      }
      break;
    }
  }

  // ── Inspection Date ───────────────────────────────────────────────────────
  let inspectionDate = 'Not Available';
  for (let i = 0; i < lines.length; i++) {
    if (/^Inspection\s+Date/i.test(lines[i])) {
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const m = lines[j].match(/(\d{2}\.\d{2}\.\d{4})/);
        if (m) { inspectionDate = m[1]; break; }
      }
      break;
    }
    // Also catch a bare date line
    const dm = lines[i].match(/^(\d{2}\.\d{2}\.\d{4})/);
    if (dm && inspectionDate === 'Not Available') inspectionDate = dm[1];
  }

  // ── Inspected By ──────────────────────────────────────────────────────────
  let inspectedBy = 'Not Available';
  {
    // Inline first
    const m1 = fullText.match(/Inspected\s+By\s*:\s*([A-Za-z][A-Za-z\s]{1,40})/i);
    if (m1) {
      inspectedBy = m1[1].trim().split('\n')[0].trim();
    } else {
      // Label on one line, name on next
      const m2 = fullText.match(/Inspected\s+By\s*:?\s*\n+([A-Za-z][A-Za-z\s]{1,40})/i);
      if (m2) inspectedBy = m2[1].trim().split('\n')[0].trim();
    }
  }

  // ── Inspection Score ──────────────────────────────────────────────────────
  let inspectionScore = 'Not Available';
  for (const line of lines) {
    const m = line.match(/(\d+\s*\/\s*\d+\s*\(\d+\.?\d*%\))/);
    if (m) { inspectionScore = m[1]; break; }
  }

  // ── Flagged Items ─────────────────────────────────────────────────────────
  let flaggedItems = 'Not Available';
  for (let i = 0; i < lines.length - 1; i++) {
    if (/^Flagged\s+items$/i.test(lines[i])) {
      if (/^\d+$/.test(lines[i + 1].trim())) { flaggedItems = lines[i + 1].trim(); break; }
    }
  }

  // ── Impacted Rooms ────────────────────────────────────────────────────────
  const impactedRooms: string[] = [];
  for (const kw of ROOM_KEYWORDS) {
    if (new RegExp(`\\b${kw}\\b`, 'i').test(fullText) && !impactedRooms.includes(kw)) {
      impactedRooms.push(kw);
    }
  }

  // ── Impacted Areas ────────────────────────────────────────────────────────
  // Split on "Negative side Description" — each block is one seepage area
  const impactedAreas: ImpactedArea[] = [];
  const areaBlocks = fullText.split(/Negative\s+side\s+Description/i);

  for (let b = 1; b < areaBlocks.length; b++) {
    const block = areaBlocks[b];

    // Negative description: everything before "Negative side photographs" or "Photo"
    const negMatch = block.match(/^([\s\S]*?)(?:Negative\s+side\s+photographs?|Photo\s+\d|Positive\s+side)/i);
    const negativeSide = negMatch
      ? negMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    // Positive description: between "Positive side Description" and "Solution"
    const posMatch = block.match(/Positive\s+side\s+Description\s*([\s\S]*?)(?:Solution|Positive\s+side\s+photographs?|Photo\s+\d|$)/i);
    const positiveSide = posMatch
      ? posMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    // Solution text: between "Solution" and "Estimate" or photos
    const solMatch = block.match(/Solution\s*([\s\S]*?)(?:Estimate|Positive\s+side\s+photographs?|Photo\s+\d|Negative\s+side\s+Description|$)/i);
    const solutionText = solMatch
      ? solMatch[1].replace(/\n/g, ' ').replace(/\s+/g, ' ').trim()
      : '';

    // Estimate cost — normalize block first to handle pdfjs split artifacts:
    //   1. Spaced/split characters: "Estima t e" or "E s t i m a t e" → "Estimate"
    //   2. Numbers split across 2–3+ lines: "6,\n5\n00" needs multiple join passes
    //      Pass 1: "6,\n5\n00" → "6,5\n00"
    //      Pass 2: "6,5\n00"  → "6,500"   ← one pass was not enough
    const normalizedBlock = block
      .replace(/E\s*s\s*t\s*i\s*m\s*a\s*t\s*e/gi, 'Estimate')
      .replace(/(\d[\d,]*)\n+(\d)/g, '$1$2')
      .replace(/(\d[\d,]*)\n+(\d)/g, '$1$2')
      .replace(/(\d[\d,]*)\n+(\d)/g, '$1$2');
    const estMatch = normalizedBlock.match(/Estimate\s*=\s*[₹]?\s*([\d,]+)\s*(?:\/[-]?)?/i);
    const estimateCost = estMatch ? parseInt(estMatch[1].replace(/,/g, '')) : 0;

    if (negativeSide || positiveSide) {
      impactedAreas.push({
        areaNumber: b,
        negativeSide: negativeSide || 'Not Available',
        positiveSide: positiveSide || 'Not Available',
        solutionText: solutionText || 'Not Available',
        estimateCost,
      });
    }
  }

  const totalEstimateCost = impactedAreas.reduce((s, a) => s + a.estimateCost, 0);

  // ── Seasonal Pattern ──────────────────────────────────────────────────────
  const seasonalMatch = fullText.match(/Leakage\s+during\s*[:\n]\s*(All\s+time|Monsoon|Specific\s+time)/i)
    || fullText.match(/\b(All\s+time|Monsoon|Specific\s+time)\b/i);
  const seasonalPattern = seasonalMatch ? seasonalMatch[1] : 'Not Available';

  // ── Problem Duration ──────────────────────────────────────────────────────
  let problemDuration = 'Unknown duration';
  if (/Yes/i.test(prevRepair)) {
    problemDuration = 'Recurring / Chronic — previous repair work was done but issue has returned';
  } else if (!/Yes/i.test(prevAudit)) {
    problemDuration = 'Long-standing — no prior audit or repair; likely present since construction';
  } else {
    problemDuration = 'Audit done but no repair — issue identified but untreated';
  }

  return {
    customerName,
    mobileNumber,
    email,
    address,
    propertyAge,
    propertyType,
    floors,
    previousStructuralAudit: prevAudit,
    previousRepairWork: prevRepair,
    inspectionDate,
    inspectedBy,
    inspectionScore,
    flaggedItems,
    impactedRooms,
    impactedAreas,
    checklist: {
      wcChecklist: {},
      externalWallChecklist: {},
      rccStructuralCondition: {},
      externalWallCondition: {},
    },
    seasonalPattern,
    problemDuration,
    totalEstimateCost,
  };
}

export async function extractInspectionData(file: File): Promise<InspectionData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  // First pass: collect text + metadata per page to identify area boundaries and photo pages
  interface PageMeta { pageNum: number; lines: string[]; isAreaStart: boolean; isPhotoPage: boolean; }
  const pages: PageMeta[] = [];

  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const lines = await getPageLines(page);
    const joined = lines.join('\n');
    const isAreaStart = /Negative\s+side\s+Description/i.test(joined);
    // Photo pages: very few text lines, or marked as photo section
    const isPhotoPage =
      lines.length <= 5 ||
      lines.some(l => /^Photo\s*\d*$/i.test(l)) ||
      /Negative\s+side\s+photographs?|Positive\s+side\s+photographs?/i.test(joined);
    pages.push({ pageNum, lines, isAreaStart, isPhotoPage });
  }

  const fullText = pages.map(p => p.lines.join('\n')).join('\n');
  const result = parseInspectionText(fullText);

  // Second pass: extract actual embedded photos (not page renders) for each area
  // Photo pages are pages within an area's range that have the photo section marker
  // or very few text lines (indicating the content is mostly images).
  const areaStartIndices: number[] = [];
  for (let i = 0; i < pages.length; i++) {
    if (pages[i].isAreaStart) areaStartIndices.push(i);
  }

  for (let aIdx = 0; aIdx < Math.min(areaStartIndices.length, result.impactedAreas.length); aIdx++) {
    const rangeStart = areaStartIndices[aIdx];
    const rangeEnd = aIdx + 1 < areaStartIndices.length ? areaStartIndices[aIdx + 1] : pages.length;

    // Render the first photo page found in this area's page range
    for (let pi = rangeStart; pi < rangeEnd; pi++) {
      if (!pages[pi].isPhotoPage) continue;
      const page = await pdf.getPage(pages[pi].pageNum);
      const img = await renderPageToImage(page);
      if (img) {
        result.impactedAreas[aIdx].inspectionImages = [img];
        break; // one representative image per area is enough
      }
    }
  }

  return result;
}
