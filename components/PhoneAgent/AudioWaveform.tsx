import React, { useEffect, useRef } from 'react';

interface AudioWaveformProps {
  isActive: boolean;
  color?: string;
}

export const AudioWaveform: React.FC<AudioWaveformProps> = ({ isActive, color = '#3b82f6' }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let bars: number[] = Array(20).fill(0);
    
    const animate = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const centerY = canvas.height / 2;
      const barWidth = 4;
      const gap = 4;
      const totalWidth = bars.length * (barWidth + gap);
      const startX = (canvas.width - totalWidth) / 2;

      bars = bars.map(prev => {
        if (!isActive) return Math.max(0, prev - 2); // Decay
        const target = Math.random() * 25 + 5;
        return prev + (target - prev) * 0.2; // Smooth transition
      });

      bars.forEach((height, i) => {
        const x = startX + i * (barWidth + gap);
        
        ctx.fillStyle = color;
        // Rounded bars
        ctx.beginPath();
        ctx.roundRect(x, centerY - height / 2, barWidth, height, 4);
        ctx.fill();
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    animate();

    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    };
  }, [isActive, color]);

  return (
    <canvas 
      ref={canvasRef} 
      width={200} 
      height={60} 
      className="w-full max-w-[200px] h-[60px]"
    />
  );
};
