import { animate, motion, useMotionValue, useTransform } from 'motion/react';
import { useEffect } from 'react';
import { formatValue } from '../../shared/config.ts';

/** A score that counts up/down smoothly when it changes. */
export function AnimatedNumber({ value, prefix = '' }: { value: number; prefix?: string }) {
  const mv = useMotionValue(value);
  const text = useTransform(mv, (v) => formatValue(Math.round(v * 2) / 2, prefix));
  useEffect(() => {
    const controls = animate(mv, value, { duration: 0.8, ease: [0.16, 1, 0.3, 1] });
    return () => controls.stop();
  }, [mv, value]);
  return <motion.span>{text}</motion.span>;
}
