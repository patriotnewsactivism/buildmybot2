/**
 * Design Tokens for Playful UI
 * Visual & Playful design system with bold gradients and animations
 */

export const gradients = {
  // Primary gradients
  primary: 'bg-gradient-to-r from-violet-600 via-purple-600 to-indigo-600',
  primaryLight: 'bg-gradient-to-r from-violet-100 via-purple-50 to-indigo-100',
  primarySubtle: 'bg-gradient-to-br from-white to-purple-50/30',

  // Secondary gradients
  secondary: 'bg-gradient-to-r from-orange-500 via-pink-500 to-red-500',
  secondaryLight: 'bg-gradient-to-r from-orange-100 via-pink-50 to-red-100',

  // Success gradients
  success: 'bg-gradient-to-r from-emerald-500 to-teal-500',
  successLight: 'bg-gradient-to-r from-emerald-100 to-teal-100',

  // Info gradients
  info: 'bg-gradient-to-r from-blue-500 to-cyan-500',
  infoLight: 'bg-gradient-to-r from-blue-100 to-cyan-100',

  // Warning gradients
  warning: 'bg-gradient-to-r from-amber-500 to-orange-500',
  warningLight: 'bg-gradient-to-r from-amber-100 to-orange-100',

  // Error gradients
  error: 'bg-gradient-to-r from-rose-500 to-pink-500',
  errorLight: 'bg-gradient-to-r from-rose-100 to-pink-100',

  // Playful gradients for metrics
  playful1: 'bg-gradient-to-br from-violet-500 to-purple-600',
  playful2: 'bg-gradient-to-br from-pink-500 to-rose-600',
  playful3: 'bg-gradient-to-br from-emerald-500 to-teal-600',
  playful4: 'bg-gradient-to-br from-amber-500 to-orange-600',
  playful5: 'bg-gradient-to-br from-blue-500 to-indigo-600',
  playful6: 'bg-gradient-to-br from-cyan-500 to-sky-600',
  playful7: 'bg-gradient-to-br from-yellow-400 via-pink-500 to-purple-600',

  // Text gradients
  textPrimary:
    'bg-gradient-to-r from-violet-600 to-purple-600 bg-clip-text text-transparent',
  textPlayful:
    'bg-gradient-to-r from-pink-600 via-purple-600 to-indigo-600 bg-clip-text text-transparent',
};

export const shadows = {
  // Colored shadows for depth
  purple: 'shadow-lg shadow-purple-500/50',
  purpleXl: 'shadow-xl shadow-purple-500/40',
  purple2xl: 'shadow-2xl shadow-purple-600/60',

  pink: 'shadow-lg shadow-pink-500/50',
  pinkXl: 'shadow-xl shadow-pink-500/40',

  emerald: 'shadow-lg shadow-emerald-500/50',
  emeraldXl: 'shadow-xl shadow-emerald-500/40',

  orange: 'shadow-lg shadow-orange-500/50',
  orangeXl: 'shadow-xl shadow-orange-500/40',

  blue: 'shadow-lg shadow-blue-500/50',
  blueXl: 'shadow-xl shadow-blue-500/40',
};

export const animations = {
  // Standard Tailwind animations
  spin: 'animate-spin',
  ping: 'animate-ping',
  pulse: 'animate-pulse',
  bounce: 'animate-bounce',

  // Custom animations (require animations.css)
  wiggle: 'animate-wiggle',
  float: 'animate-float',
  slideIn: 'animate-slide-in',
  fadeIn: 'animate-fade-in',
  scaleIn: 'animate-scale-in',
};

export const transitions = {
  default: 'transition-all duration-300',
  fast: 'transition-all duration-150',
  slow: 'transition-all duration-500',
  smooth: 'transition-all duration-300 ease-in-out',
};

export const hovers = {
  scale: 'hover:scale-105',
  scaleSmall: 'hover:scale-102',
  scaleLarge: 'hover:scale-110',
  shadow: 'hover:shadow-xl',
  shadowLarge: 'hover:shadow-2xl',
  lift: 'hover:-translate-y-1',
};

export const borders = {
  gradient: {
    primary:
      'border-2 border-transparent bg-gradient-to-r from-violet-600 to-purple-600',
    secondary:
      'border-2 border-transparent bg-gradient-to-r from-orange-500 to-pink-500',
    success:
      'border-2 border-transparent bg-gradient-to-r from-emerald-500 to-teal-500',
  },
  glow: {
    purple: 'ring-2 ring-purple-500/50 ring-offset-2',
    pink: 'ring-2 ring-pink-500/50 ring-offset-2',
    emerald: 'ring-2 ring-emerald-500/50 ring-offset-2',
  },
};

// Helper function to combine classes
export const cn = (...classes: (string | boolean | undefined)[]) => {
  return classes.filter(Boolean).join(' ');
};

// Predefined card styles
export const cardStyles = {
  playful: cn(
    'rounded-2xl',
    'bg-white',
    'border-2 border-purple-100',
    'hover:border-purple-400',
    'hover:shadow-xl hover:shadow-purple-200',
    transitions.default,
  ),
  playfulActive: cn(
    'rounded-2xl',
    gradients.primarySubtle,
    'border-2 border-purple-400',
    shadows.purpleXl,
  ),
  gradient: cn(
    'rounded-2xl',
    gradients.primary,
    'text-white',
    shadows.purpleXl,
  ),
};

// Button styles
export const buttonStyles = {
  primary: cn(
    'px-4 py-2',
    'rounded-lg',
    gradients.primary,
    'text-white',
    'font-medium',
    'shadow-lg',
    hovers.scale,
    hovers.shadowLarge,
    transitions.default,
    'disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100',
  ),
  secondary: cn(
    'px-4 py-2',
    'rounded-lg',
    'bg-slate-100',
    'text-slate-700',
    'font-medium',
    'hover:bg-slate-200',
    transitions.default,
  ),
  ghost: cn(
    'px-4 py-2',
    'rounded-lg',
    'hover:bg-purple-50',
    'text-purple-700',
    'font-medium',
    transitions.default,
  ),
};

// Input styles
export const inputStyles = {
  default: cn(
    'w-full',
    'px-4 py-2',
    'rounded-lg',
    'border-2 border-slate-200',
    'focus:border-purple-400',
    'focus:outline-none',
    'focus:ring-2 focus:ring-purple-200',
    transitions.default,
  ),
  gradient: cn(
    'w-full',
    'px-4 py-2',
    'rounded-xl',
    'border-2 border-purple-200',
    'focus:border-transparent',
    'focus:ring-4 focus:ring-purple-300',
    transitions.default,
  ),
};

// Badge styles
export const badgeStyles = {
  active: cn(
    'px-3 py-1',
    'rounded-full',
    'text-xs font-bold',
    gradients.success,
    'text-white',
  ),
  draft: cn(
    'px-3 py-1',
    'rounded-full',
    'text-xs font-bold',
    'bg-slate-200',
    'text-slate-600',
  ),
  new: cn(
    'px-3 py-1',
    'rounded-full',
    'text-xs font-bold',
    gradients.info,
    'text-white',
  ),
};
