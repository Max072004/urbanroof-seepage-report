import { motion } from 'framer-motion';
import { CheckCircle2, Loader } from 'lucide-react';
import { useEffect, useState } from 'react';

interface LoadingScreenProps {
  isVisible: boolean;
}

const steps = [
  { label: 'Extracting thermal scan data', duration: 2 },
  { label: 'Parsing inspection report', duration: 2 },
  { label: 'Analyzing moisture patterns', duration: 2 },
  { label: 'Calculating severity score', duration: 2 },
  { label: 'Detecting seepage sources', duration: 2 },
  { label: 'Projecting risk timeline', duration: 2 },
  { label: 'Generating recommendations', duration: 2 },
  { label: 'Finalizing report', duration: 1 },
];

export function LoadingScreen({ isVisible }: LoadingScreenProps) {
  const [completedSteps, setCompletedSteps] = useState(0);

  useEffect(() => {
    if (!isVisible) {
      setCompletedSteps(0);
      return;
    }

    let currentStep = 0;
    const timers: NodeJS.Timeout[] = [];

    const scheduleSteps = () => {
      let cumulativeTime = 0;
      steps.forEach((step, index) => {
        const timer = setTimeout(() => {
          setCompletedSteps(index + 1);
        }, cumulativeTime);
        timers.push(timer);
        cumulativeTime += step.duration * 1000;
      });
    };

    scheduleSteps();

    return () => {
      timers.forEach((timer) => clearTimeout(timer));
    };
  }, [isVisible]);

  if (!isVisible) return null;

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.3 }}
        className="bg-white rounded-lg shadow-2xl p-8 max-w-md w-full mx-4"
      >
        <div className="text-center mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-2">AI Analysis in Progress</h2>
          <p className="text-muted-foreground">Processing your inspection data...</p>
        </div>

        <div className="space-y-3">
          {steps.map((step, index) => (
            <motion.div
              key={index}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: index * 0.1 }}
              className="flex items-center gap-3"
            >
              {completedSteps > index ? (
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: 'spring', stiffness: 200 }}
                >
                  <CheckCircle2 className="w-5 h-5 text-green-500 flex-shrink-0" />
                </motion.div>
              ) : completedSteps === index ? (
                <motion.div animate={{ rotate: 360 }} transition={{ duration: 2, repeat: Infinity }}>
                  <Loader className="w-5 h-5 text-secondary flex-shrink-0" />
                </motion.div>
              ) : (
                <div className="w-5 h-5 rounded-full border-2 border-border flex-shrink-0" />
              )}
              <span
                className={`text-sm font-medium ${
                  completedSteps > index
                    ? 'text-green-600'
                    : completedSteps === index
                      ? 'text-secondary'
                      : 'text-muted-foreground'
                }`}
              >
                {step.label}
              </span>
            </motion.div>
          ))}
        </div>

        <div className="mt-8 pt-6 border-t border-border">
          <div className="w-full bg-muted rounded-full h-2">
            <motion.div
              className="bg-secondary h-2 rounded-full"
              initial={{ width: 0 }}
              animate={{ width: `${(completedSteps / steps.length) * 100}%` }}
              transition={{ duration: 0.5 }}
            />
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            {completedSteps} of {steps.length} steps completed
          </p>
        </div>
      </motion.div>
    </div>
  );
}
