import tailwindcssAnimate from 'tailwindcss-animate';
import tailwindcssTypography from '@tailwindcss/typography';
import colors from 'tailwindcss/colors';

export default {
  darkMode: 'class',
  content: [
    './src/**/*.{js,jsx,ts,tsx}',
    './index.html',
  ],
  theme: {
    extend: {
      colors: {
        // Remap gray to neutral for pure gray tones (no blue tint)
        gray: colors.neutral,
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },
        success: {
          DEFAULT: 'hsl(var(--success))',
          foreground: 'hsl(var(--success-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
        'rocket-vibrate': {
          '0%, 100%': { transform: 'translateX(0)' },
          '20%': { transform: 'translateX(-1px) translateY(-0.5px)' },
          '40%': { transform: 'translateX(1px) translateY(0.5px)' },
          '60%': { transform: 'translateX(-0.5px) translateY(-0.5px)' },
          '80%': { transform: 'translateX(0.5px) translateY(0.5px)' },
        },
        'rocket-fly': {
          '0%': { transform: 'translateY(0) translateX(0)' },
          '50%': { transform: 'translateY(-6px) translateX(4px)' },
          '100%': { transform: 'translateY(0) translateX(0)' },
        },
        'flame-flicker': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.6', transform: 'scale(0.8)' },
        },
        // AI Generate - Gentle sparkle effect (writing/creating feel)
        'sparkle-glow': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.1)', opacity: '0.85' },
        },
        'sparkle-twinkle': {
          '0%, 100%': { opacity: '0', transform: 'scale(0)' },
          '50%': { opacity: '0.8', transform: 'scale(1)' },
        },
        'ai-generate-glow': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(147, 51, 234, 0.4)' },
          '50%': { boxShadow: '0 0 14px rgba(147, 51, 234, 0.6)' },
        },
        // AI Review - Gentle scanning effect
        'scan-glow': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.08)', opacity: '0.9' },
        },
        'scan-line': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.8' },
        },
        'ai-review-glow': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(59, 130, 246, 0.4)' },
          '50%': { boxShadow: '0 0 14px rgba(59, 130, 246, 0.6)' },
        },
        // AI Security - Amber glow for security analysis
        'ai-security-glow': {
          '0%, 100%': { boxShadow: '0 0 6px rgba(245, 158, 11, 0.4)' },
          '50%': { boxShadow: '0 0 14px rgba(245, 158, 11, 0.6)' },
        },
        'security-sparkle': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.15)', opacity: '0.85' },
        },
        // Subtle pulse for running list items
        'pulse-subtle': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.85' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
        'rocket-vibrate': 'rocket-vibrate 0.1s linear infinite',
        'rocket-fly': 'rocket-fly 1.5s ease-in-out infinite',
        'flame-flicker': 'flame-flicker 0.15s ease-in-out infinite',
        // AI Generate animations
        'sparkle-glow': 'sparkle-glow 1.2s ease-in-out infinite',
        'sparkle-twinkle': 'sparkle-twinkle 1s ease-in-out infinite',
        'ai-generate-glow': 'ai-generate-glow 1.5s ease-in-out infinite',
        // AI Review animations
        'scan-glow': 'scan-glow 1.2s ease-in-out infinite',
        'scan-line': 'scan-line 1s ease-in-out infinite',
        'ai-review-glow': 'ai-review-glow 1.5s ease-in-out infinite',
        // AI Security animations
        'ai-security-glow': 'ai-security-glow 1.5s ease-in-out infinite',
        'security-sparkle': 'security-sparkle 1.2s ease-in-out infinite',
        // Subtle pulse for running items
        'pulse-subtle': 'pulse-subtle 2s ease-in-out infinite',
      },
    },
  },
  plugins: [tailwindcssAnimate, tailwindcssTypography],
}
