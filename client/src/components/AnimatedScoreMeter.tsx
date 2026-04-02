import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';

interface AnimatedScoreMeterProps {
  score: number;
  tier: 'MINOR' | 'MODERATE' | 'SEVERE RISK';
  explanation: string;
}

export function AnimatedScoreMeter({ score, tier, explanation }: AnimatedScoreMeterProps) {
  const [displayScore, setDisplayScore] = useState(0);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Determine colors based on tier
  const getColors = () => {
    switch (tier) {
      case 'MINOR':
        return { bg: '#16A34A', text: '#16A34A', label: 'Minor' };
      case 'MODERATE':
        return { bg: '#D97706', text: '#D97706', label: 'Moderate' };
      case 'SEVERE RISK':
        return { bg: '#DC2626', text: '#DC2626', label: 'Severe' };
    }
  };

  const colors = getColors();

  // Animate score counter
  useEffect(() => {
    let animationFrame: number;
    let currentScore = 0;
    const duration = 2000; // 2 seconds
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      currentScore = Math.round(progress * score * 10) / 10;
      setDisplayScore(currentScore);

      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [score]);

  // Draw circular progress indicator
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 200;
    const radius = 90;
    const lineWidth = 8;

    canvas.width = size;
    canvas.height = size;

    const centerX = size / 2;
    const centerY = size / 2;

    // Clear canvas
    ctx.clearRect(0, 0, size, size);

    // Background circle
    ctx.strokeStyle = '#E5E7EB';
    ctx.lineWidth = lineWidth;
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
    ctx.stroke();

    // Progress circle
    const progress = displayScore / 10;
    ctx.strokeStyle = colors.bg;
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(centerX, centerY, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
    ctx.stroke();

    // Center text
    ctx.fillStyle = colors.text;
    ctx.font = 'bold 48px "IBM Plex Mono"';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(displayScore.toFixed(1), centerX, centerY - 10);

    ctx.fillStyle = '#6B7280';
    ctx.font = '14px "IBM Plex Sans"';
    ctx.fillText('/ 10', centerX, centerY + 20);
  }, [displayScore, colors.bg, colors.text]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6 }}
      className="flex flex-col items-center gap-6 p-8 bg-white rounded-lg border border-border shadow-sm"
    >
      <div className="flex flex-col items-center gap-3">
        <h2 className="text-2xl font-bold text-foreground">Seepage Severity Score</h2>
        <canvas ref={canvasRef} className="w-48 h-48" />
      </div>

      <div className="flex flex-col items-center gap-2">
        <div
          className="px-4 py-2 rounded-full text-white font-semibold text-sm"
          style={{ backgroundColor: colors.bg }}
        >
          {tier}
        </div>
        <p className="text-center text-muted-foreground max-w-sm text-sm leading-relaxed">
          {explanation}
        </p>
      </div>
    </motion.div>
  );
}
