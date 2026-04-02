import { motion } from 'framer-motion';
import { Upload, FileText } from 'lucide-react';
import { useState, useRef } from 'react';
import { Button } from './ui/button';

interface UploadScreenProps {
  onFilesSelected: (thermalFile: File, inspectionFile: File) => void;
  isLoading: boolean;
}

export function UploadScreen({ onFilesSelected, isLoading }: UploadScreenProps) {
  const [thermalFile, setThermalFile] = useState<File | null>(null);
  const [inspectionFile, setInspectionFile] = useState<File | null>(null);
  const thermalInputRef = useRef<HTMLInputElement>(null);
  const inspectionInputRef = useRef<HTMLInputElement>(null);

  const handleThermalDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') {
      setThermalFile(file);
    }
  };

  const handleInspectionDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file?.type === 'application/pdf') {
      setInspectionFile(file);
    }
  };

  const handleSubmit = () => {
    if (thermalFile && inspectionFile) {
      onFilesSelected(thermalFile, inspectionFile);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-3 sm:p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
        className="w-full max-w-2xl"
      >
        <div className="bg-white rounded-lg shadow-lg p-4 sm:p-8 space-y-6 sm:space-y-8">
          {/* Header */}
          <div className="text-center space-y-2">
            <h1 className="text-2xl sm:text-4xl font-bold text-foreground">Seepage Detection Analysis</h1>
            <p className="text-sm sm:text-base text-muted-foreground">Upload thermal and inspection PDFs for AI-powered analysis</p>
          </div>

          {/* Upload Areas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
            {/* Thermal Scan Upload */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleThermalDrop}
              onClick={() => thermalInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all ${ thermalFile
                ? 'border-secondary bg-blue-50'
                : 'border-border hover:border-secondary hover:bg-slate-50'
              }`}
            >
              <input
                ref={thermalInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files && setThermalFile(e.target.files[0])}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <Upload className={`w-8 h-8 ${thermalFile ? 'text-secondary' : 'text-muted-foreground'}`} />
                <div className="text-center">
                  <p className="font-semibold text-foreground">Thermal Scan PDF</p>
                  <p className="text-sm text-muted-foreground">Drag or click to upload</p>
                </div>
                {thermalFile && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-secondary/10 rounded-full">
                    <FileText className="w-4 h-4 text-secondary" />
                    <span className="text-xs font-medium text-secondary">{thermalFile.name}</span>
                  </div>
                )}
              </div>
            </motion.div>

            {/* Inspection Report Upload */}
            <motion.div
              whileHover={{ scale: 1.02 }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleInspectionDrop}
              onClick={() => inspectionInputRef.current?.click()}
              className={`p-6 border-2 border-dashed rounded-lg cursor-pointer transition-all ${ inspectionFile
                ? 'border-secondary bg-blue-50'
                : 'border-border hover:border-secondary hover:bg-slate-50'
              }`}
            >
              <input
                ref={inspectionInputRef}
                type="file"
                accept=".pdf"
                onChange={(e) => e.target.files && setInspectionFile(e.target.files[0])}
                className="hidden"
              />
              <div className="flex flex-col items-center gap-3">
                <Upload className={`w-8 h-8 ${inspectionFile ? 'text-secondary' : 'text-muted-foreground'}`} />
                <div className="text-center">
                  <p className="font-semibold text-foreground">Inspection Report PDF</p>
                  <p className="text-sm text-muted-foreground">Drag or click to upload</p>
                </div>
                {inspectionFile && (
                  <div className="flex items-center gap-2 mt-2 px-3 py-1 bg-secondary/10 rounded-full">
                    <FileText className="w-4 h-4 text-secondary" />
                    <span className="text-xs font-medium text-secondary">{inspectionFile.name}</span>
                  </div>
                )}
              </div>
            </motion.div>
          </div>

          {/* Info Box */}
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <p className="text-sm text-blue-900">
              <strong>Note:</strong> Both PDF files are required for analysis. The AI will extract thermal data and inspection details to generate a comprehensive seepage report.
            </p>
          </div>

          {/* Submit Button */}
          <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
            <Button
              onClick={handleSubmit}
              disabled={!thermalFile || !inspectionFile || isLoading}
              className="w-full bg-secondary hover:bg-secondary/90 text-white font-semibold py-3 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Analyzing...' : 'Analyze Seepage Data'}
            </Button>
          </motion.div>
        </div>

        {/* Footer */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.8 }}
          className="text-center text-sm text-muted-foreground mt-6"
        >
          Your data is processed locally in your browser. No files are stored on our servers.
        </motion.p>
      </motion.div>
    </div>
  );
}
