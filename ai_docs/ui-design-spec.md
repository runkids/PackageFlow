# PackageFlow UI Design Specification

A comprehensive design system guide for building consistent, accessible, and polished UI components in PackageFlow.

---

## Table of Contents

1. [Design Principles](#design-principles)
2. [Color System](#color-system)
3. [Spacing System](#spacing-system)
4. [Typography](#typography)
5. [Component Architecture](#component-architecture)
6. [Animation & Transitions](#animation--transitions)
7. [Accessibility](#accessibility)
8. [Theme Support](#theme-support)
9. [Component Reference](#component-reference)
10. [Dialog Width Standards](#dialog-width-standards)
11. [Slide-Over Panel Pattern](#slide-over-panel-pattern)
12. [Best Practices](#best-practices)

---

## Design Principles

### Core Philosophy

1. **Desktop-First Design**: Optimize for keyboard users, power users, and efficient workflows
2. **Platform Awareness**: Respect macOS, Windows, and Linux design conventions while maintaining cross-platform consistency
3. **Performance-Conscious**: Lightweight components, efficient re-renders, and smooth animations
4. **Accessibility-First**: WCAG compliance, keyboard navigation, screen reader support

### Visual Language

- **Subtle depth** through shadows and borders rather than heavy gradients
- **Refined interactions** with smooth transitions (150-200ms duration)
- **Clear hierarchy** using typography scale and spacing
- **Purposeful color** for semantic meaning (success, warning, error, info)

---

## Color System

### CSS Custom Properties

All colors are defined as HSL values without the `hsl()` wrapper, allowing for opacity modifiers with Tailwind CSS.

#### Light Theme (`:root`)

```css
:root {
  /* Base Colors */
  --background: 0 0% 100%;
  --foreground: 240 10% 3.9%;

  /* Card Surface */
  --card: 0 0% 100%;
  --card-foreground: 240 10% 3.9%;

  /* Primary Action */
  --primary: 221 83% 53%;
  --primary-foreground: 210 40% 98%;

  /* Secondary */
  --secondary: 240 4.8% 95.9%;
  --secondary-foreground: 240 5.9% 10%;

  /* Muted/Disabled */
  --muted: 240 4.8% 95.9%;
  --muted-foreground: 240 3.8% 46.1%;

  /* Accent (Hover states) */
  --accent: 240 4.8% 95.9%;
  --accent-foreground: 240 5.9% 10%;

  /* Semantic Colors */
  --destructive: 0 84.2% 60.2%;
  --destructive-foreground: 210 40% 98%;
  --success: 142 76% 36%;
  --success-foreground: 210 40% 98%;

  /* Borders & Inputs */
  --border: 240 5.9% 90%;
  --input: 240 5.9% 90%;
  --ring: 221 83% 53%;

  /* Border Radius */
  --radius: 0.5rem;
}
```

#### Dark Theme (`.dark`)

```css
.dark {
  /* Base Colors */
  --background: 0 0% 12%;
  --foreground: 0 0% 98%;

  /* Card Surface */
  --card: 0 0% 12%;
  --card-foreground: 0 0% 98%;

  /* Primary Action */
  --primary: 217 91% 60%;
  --primary-foreground: 222 47% 11%;

  /* Secondary */
  --secondary: 0 0% 18%;
  --secondary-foreground: 0 0% 98%;

  /* Muted/Disabled */
  --muted: 0 0% 18%;
  --muted-foreground: 0 0% 64%;

  /* Accent (Hover states) */
  --accent: 0 0% 18%;
  --accent-foreground: 0 0% 98%;

  /* Semantic Colors */
  --destructive: 0 62.8% 50.6%;
  --destructive-foreground: 0 0% 98%;
  --success: 142 71% 45%;
  --success-foreground: 0 0% 98%;

  /* Borders & Inputs */
  --border: 0 0% 20%;
  --input: 0 0% 18%;
  --ring: 217 91% 60%;
}
```

### Semantic Color Usage

| Token | Usage | Example |
|-------|-------|---------|
| `bg-background` | Main page background | Root container |
| `bg-card` | Elevated surfaces | Dialogs, cards, dropdowns |
| `bg-muted` | Subtle backgrounds | Disabled states, code blocks |
| `bg-accent` | Hover states | Button hover, list item hover |
| `bg-primary` | Primary actions | Submit buttons, active tabs |
| `bg-secondary` | Secondary actions | Cancel buttons, secondary CTA |
| `bg-destructive` | Dangerous actions | Delete buttons |
| `bg-success` | Success states | Confirmation indicators |

### Variant-Specific Colors

For components like `AIReviewDialog` and `ConfirmDialog`, use variant-based color configurations:

```typescript
const variantConfig = {
  'code-review': {
    gradient: 'from-purple-500/20 via-purple-600/10 to-transparent',
    gradientLight: 'from-purple-500/10 via-purple-600/5 to-transparent',
    iconColor: 'text-purple-400',
    iconBg: 'bg-purple-500/10 border-purple-500/20',
    accentBorder: 'border-purple-500/30',
  },
  'destructive': {
    iconBgClass: 'bg-red-500/10',
    iconClass: 'text-red-400',
    confirmButtonClass: 'bg-red-600 hover:bg-red-500 text-white',
    accentColor: 'border-red-500/20',
  },
  'warning': {
    iconBgClass: 'bg-amber-500/10',
    iconClass: 'text-amber-400',
    confirmButtonClass: 'bg-amber-600 hover:bg-amber-500 text-white',
    accentColor: 'border-amber-500/20',
  },
  'info': {
    iconBgClass: 'bg-blue-500/10',
    iconClass: 'text-blue-400',
    confirmButtonClass: 'bg-blue-600 hover:bg-blue-500 text-white',
    accentColor: 'border-blue-500/20',
  },
};
```

---

## Spacing System

### Base Scale

Using Tailwind's default spacing scale (1 unit = 4px):

| Class | Value | Usage |
|-------|-------|-------|
| `p-1` / `gap-1` | 4px | Tight spacing within groups |
| `p-2` / `gap-2` | 8px | Icon-to-text spacing |
| `p-3` / `gap-3` | 12px | Card internal padding (small) |
| `p-4` / `gap-4` | 16px | Card internal padding (default) |
| `p-5` / `gap-5` | 20px | Header sections |
| `p-6` / `gap-6` | 24px | Dialog padding, major sections |

### Component-Specific Spacing

#### Dialog Layout
```
+------------------------------------------+
|  px-6 py-5  (Header with gradient)       |
+------------------------------------------+
|  p-6        (Content area)               |
+------------------------------------------+
|  px-6 py-4  (Footer with actions)        |
+------------------------------------------+
```

#### Button Spacing
- **Small**: `px-3 py-2` (h-8)
- **Default**: `px-4 py-2` (h-9)
- **Large**: `px-8 py-2` (h-10)
- **Icon**: `w-9 h-9` square

#### Form Elements
- Input height: `h-9` (36px)
- Input padding: `px-3 py-1`
- Label margin: `mb-2`
- Field gap: `gap-4` or `space-y-4`

---

## Typography

### Font Stack

```css
body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, sans-serif;
}
```

### Scale

| Class | Size | Weight | Usage |
|-------|------|--------|-------|
| `text-xs` | 12px | Normal | Badges, metadata, helper text |
| `text-sm` | 14px | Normal/Medium | Body text, form labels, buttons |
| `text-base` | 16px | Normal | Primary body content |
| `text-lg` | 18px | Semibold | Dialog titles, section headers |
| `text-xl` | 20px | Semibold | Page titles |
| `text-2xl` | 24px | Bold | Major headings |

### Text Color Classes

```typescript
// Primary text
'text-foreground'

// Secondary text (descriptions, metadata)
'text-muted-foreground'

// Interactive text
'text-primary'

// Semantic text
'text-destructive'     // Error messages
'text-success'         // Success messages
'text-amber-400'       // Warning (dark)
'text-amber-600'       // Warning (light)
```

### Prose Styling (for Markdown content)

```typescript
// Example from AIReviewDialog
cn(
  'prose prose-sm dark:prose-invert max-w-none',
  // Headings
  'prose-headings:text-foreground prose-headings:font-semibold',
  'prose-h1:text-xl prose-h2:text-lg prose-h3:text-base',
  'prose-h1:border-b prose-h1:border-border prose-h1:pb-2 prose-h1:mb-4',
  'prose-h2:mt-6 prose-h2:mb-3',
  'prose-h3:mt-4 prose-h3:mb-2',
  // Paragraphs
  'prose-p:text-foreground/90 prose-p:leading-relaxed',
  // Code blocks
  'prose-pre:bg-muted/50 prose-pre:border prose-pre:border-border prose-pre:rounded-lg',
  'prose-code:text-primary prose-code:font-medium',
  'prose-code:bg-muted/50 prose-code:px-1.5 prose-code:py-0.5 prose-code:rounded',
  // Blockquotes
  'prose-blockquote:border-l-primary/50 prose-blockquote:bg-muted/30',
  'prose-blockquote:rounded-r-lg prose-blockquote:py-1 prose-blockquote:px-4',
)
```

---

## Component Architecture

### Standard Component Structure

```typescript
/**
 * ComponentName - Brief description
 * Purpose and use cases
 */

interface ComponentProps {
  /** Whether the component is open */
  open: boolean;
  /** Handler for state changes */
  onOpenChange: (open: boolean) => void;
  /** Visual variant */
  variant?: 'default' | 'destructive' | 'warning' | 'info';
  /** Additional content */
  children?: React.ReactNode;
}

export function Component({
  open,
  onOpenChange,
  variant = 'default',
  children,
}: ComponentProps) {
  // 1. Hooks at the top
  const modalId = React.useId();
  const [state, setState] = React.useState(initialState);
  const ref = React.useRef<HTMLElement>(null);

  // 2. Derived values
  const config = variantConfig[variant];

  // 3. Effects
  React.useEffect(() => {
    // Modal registration, keyboard handlers, etc.
  }, [dependencies]);

  // 4. Event handlers
  const handleAction = () => { /* ... */ };

  // 5. Early return for closed state
  if (!open) return null;

  // 6. Render
  return (
    <div role="dialog" aria-modal="true">
      {/* Component content */}
    </div>
  );
}
```

### Dialog Pattern (Reference: AIReviewDialog)

```typescript
// Layer structure for dialogs
<div className="fixed inset-0 z-50 animate-in fade-in-0 duration-200">
  {/* Backdrop */}
  <div className="fixed inset-0 bg-black/70 backdrop-blur-sm" />

  {/* Dialog container */}
  <div className="fixed inset-0 flex items-center justify-center p-4">
    <div className={cn(
      'relative w-full max-w-3xl max-h-[85vh]',
      'bg-background rounded-2xl',
      'border border-purple-500/30',
      'shadow-2xl shadow-black/60',
      'animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-bottom-4',
      'flex flex-col overflow-hidden'
    )}>
      {/* Header */}
      <div className="relative px-6 py-5 border-b border-border bg-gradient-to-r ...">
        {/* Close button */}
        {/* Title with icon badge */}
      </div>

      {/* Content (scrollable) */}
      <div className="flex-1 overflow-y-auto min-h-0">
        {/* Main content */}
      </div>

      {/* Footer */}
      <div className="px-6 py-4 border-t border-border bg-card/50 flex-shrink-0">
        {/* Actions */}
      </div>
    </div>
  </div>
</div>
```

### Dialog Width Standards

Use consistent dialog widths based on content complexity:

| Width Class | Pixels | Usage |
|-------------|--------|-------|
| `max-w-sm` | 384px | Simple confirmations, alerts |
| `max-w-md` | 448px | Single-field forms, simple settings |
| `max-w-lg` | 512px | Multi-field forms, basic dialogs |
| `max-w-xl` | 576px | Settings dialogs, webhook config |
| `max-w-2xl` | 672px | Complex forms, import/export dialogs |
| `max-w-3xl` | 768px | Content-heavy dialogs (AI review, code diff) |
| `max-w-4xl` | 896px | Full-featured editors, large previews |

**Guidelines:**
- Always include `max-h-[85vh]` or `max-h-[90vh]` for vertical constraint
- Use `overflow-y-auto` on content area for scrollable dialogs
- Minimum padding of `p-4` around dialog container for mobile safety

```typescript
// Example: Settings dialog
'relative w-full max-w-xl max-h-[90vh]'

// Example: AI Review dialog (content-heavy)
'relative w-full max-w-3xl max-h-[85vh]'

// Example: Simple confirmation
'relative w-full max-w-sm max-h-[85vh]'
```

### Button Variants

```typescript
const buttonVariants = cva(
  // Base styles
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground shadow hover:bg-primary/90',
        destructive: 'bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90',
        outline: 'border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground',
        secondary: 'bg-secondary text-secondary-foreground shadow-sm hover:bg-secondary/80',
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-md px-8',
        icon: 'h-9 w-9',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
);
```

### Icon Badge Pattern

```typescript
// Used in dialog headers for visual identity
<div className={cn(
  'flex-shrink-0',
  'w-12 h-12 rounded-xl',
  'flex items-center justify-center',
  'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
  'border',
  'bg-purple-500/10 border-purple-500/20',
  'shadow-lg'
)}>
  <IconComponent className="w-6 h-6 text-purple-400" />
</div>
```

### Sticky Header Pattern

Used for section headers in scrollable lists (e.g., tool categories, template groups). Provides a subtle, non-distracting appearance that works well in both light and dark themes.

```typescript
// Standard sticky header for grouped lists
<div className={cn(
  'sticky top-0 z-10',
  'px-3 py-2',
  'bg-muted/80 dark:bg-muted/50',
  'border-b border-border',
  'backdrop-blur-sm'
)}>
  <div className="flex items-center gap-2">
    <Icon className="w-3.5 h-3.5 text-blue-500 dark:text-blue-400" />
    <span className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
      Section Title
    </span>
  </div>
</div>

// Rounded variant (for collapsible sections)
<button className={cn(
  'w-full sticky top-0 z-10',
  'flex items-center gap-2 px-3 py-2',
  'bg-muted/80 dark:bg-muted/50',
  'border border-border rounded-lg',
  'hover:bg-muted transition-colors',
  'backdrop-blur-sm'
)}>
  {/* Content */}
</button>
```

**Key principles:**
- Use `bg-muted/80 dark:bg-muted/50` for subtle, theme-aware backgrounds
- Add `backdrop-blur-sm` for a frosted glass effect when content scrolls underneath
- Keep icons colored (e.g., `text-blue-500`) for visual distinction while text remains neutral
- Avoid strong colored backgrounds (e.g., `bg-blue-50`, `bg-amber-950`) as they can be visually overwhelming

---

## Animation & Transitions

### Standard Durations

| Duration | Usage |
|----------|-------|
| `duration-100` | Micro-interactions (hover states) |
| `duration-150` | Button/input state changes |
| `duration-200` | Dialog/dropdown animations |
| `duration-300` | Panel slide transitions |

### Entry Animations (tailwindcss-animate)

```typescript
// Dialog entry
'animate-in fade-in-0 zoom-in-95 duration-200 slide-in-from-bottom-4'

// Dropdown entry
'animate-in fade-in-0 zoom-in-95 slide-in-from-top-2 duration-150'

// Fade only
'animate-in fade-in-0 duration-200'
```

### Transition Classes

```typescript
// Color transitions (buttons, links)
'transition-colors duration-150'

// Transform transitions (icons, accordions)
'transition-transform duration-200'

// All property transitions
'transition-all duration-150'
```

### Custom Keyframes

```javascript
// tailwind.config.js
keyframes: {
  'accordion-down': {
    from: { height: '0' },
    to: { height: 'var(--radix-accordion-content-height)' },
  },
  'accordion-up': {
    from: { height: 'var(--radix-accordion-content-height)' },
    to: { height: '0' },
  },
},
```

### Reduce Motion Support

```css
/* System preference */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* App-level class */
.reduce-motion *, .reduce-motion *::before, .reduce-motion *::after {
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
  transition-duration: 0.01ms !important;
}
```

---

## Accessibility

### Required ARIA Attributes

#### Dialogs
```typescript
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
```

#### Buttons with Icons Only
```typescript
<button aria-label="Close dialog">
  <X className="w-4 h-4" />
</button>
```

#### Toggle Switches
```typescript
<button
  role="switch"
  aria-checked={checked}
  aria-label="Enable feature"
>
```

#### Select/Combobox
```typescript
<button
  role="combobox"
  aria-expanded={open}
  aria-haspopup="listbox"
  aria-controls="listbox-id"
>
```

### Focus Management

```typescript
// Focus ring styling
'focus:outline-none focus:ring-2 focus:ring-ring'
'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

// Focus ring with offset
'focus-visible:ring-offset-2 focus-visible:ring-offset-background'

// Auto-focus on dialog open
React.useEffect(() => {
  if (open && contentRef.current) {
    const timer = setTimeout(() => {
      contentRef.current?.focus();
    }, 50);
    return () => clearTimeout(timer);
  }
}, [open]);
```

### Keyboard Navigation

- **Escape**: Close dialogs/dropdowns
- **Enter/Space**: Activate buttons, toggle switches
- **Arrow Up/Down**: Navigate lists, select options
- **Tab**: Move focus between interactive elements
- **Home/End**: Jump to first/last option in lists

### Modal Stack Management

```typescript
// Ensure only the topmost modal responds to Escape
import { isTopModal, registerModal, unregisterModal } from './modalStack';

React.useEffect(() => {
  if (!open) return;
  registerModal(modalId);
  return () => unregisterModal(modalId);
}, [modalId, open]);

React.useEffect(() => {
  if (!open) return;
  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!isTopModal(modalId)) return;
    e.preventDefault();
    onOpenChange(false);
  };
  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [modalId, onOpenChange, open]);
```

---

## Theme Support

### Class-Based Theming

```javascript
// tailwind.config.js
export default {
  darkMode: 'class',
  // ...
}
```

### Theme-Aware Component Styling

```typescript
// Conditional styling for theme differences
cn(
  'bg-gradient-to-r',
  'dark:from-purple-500/20 dark:via-purple-600/10 dark:to-transparent',
  'from-purple-500/10 via-purple-600/5 to-transparent'
)

// Using theme-aware colors
'bg-background text-foreground'
'bg-card border-border'
'text-muted-foreground'
```

### Backdrop Styling

```typescript
// Light theme: darker backdrop needed
// Dark theme: medium backdrop sufficient
'bg-black/60 backdrop-blur-sm'  // Standard dialogs
'bg-black/70 backdrop-blur-sm'  // Important dialogs (AI Review)
```

### Theme-Specific Shadows

```typescript
// Standard shadow with dark theme consideration
'shadow-2xl shadow-black/50'   // General dialogs
'shadow-2xl shadow-black/60'   // Important/elevated dialogs
'shadow-lg'                     // Dropdowns, tooltips
```

---

## Component Reference

### AIReviewDialog (Featured Example)

A professional dialog for displaying AI-generated content with Markdown support.

**Key Features:**
- Variant-based color theming (code-review, staged-review)
- Icon badge in header
- Gradient header background
- Scrollable content area with prose styling
- Token usage metadata display
- Copy to clipboard functionality
- Regenerate action support
- Truncation warning indicator

**Structure:**
1. Fixed backdrop with blur
2. Centered dialog container (max-w-3xl, max-h-[85vh])
3. Header with gradient, icon badge, title, and subtitle
4. Optional warning banner
5. Scrollable content with Markdown rendering
6. Footer with metadata and action buttons

### ConfirmDialog

Confirmation dialog with semantic variants (destructive, warning, info, default).

**Key Features:**
- Icon-based visual indicator
- Clear title and description
- Optional item name highlighting
- Loading state support
- Accessible focus management (focuses Cancel by default)

### Button

Versatile button component with variants and sizes.

**Variants:** default, destructive, outline, secondary, ghost, link
**Sizes:** default (h-9), sm (h-8), lg (h-10), icon (h-9 w-9)

### Dialog

Base dialog primitives (Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose).

### Select

Custom dropdown select with keyboard navigation, grouping, and search support.

### Toggle

macOS-style toggle switch with size variants (sm, md).

### Tabs

Tab navigation with TabsList, TabsTrigger, and TabsContent.

### Collapsible

Progressive disclosure component with optional card styling.

### Dropdown

Action menu with items, sections, and separators.

### Input

Styled input field with consistent focus states.

### Skeleton

Loading placeholder with pulse animation.

### Progress

Progress bar with percentage-based width.

### ExecutionHistoryPanel (Slide-Over Panel)

Slide-over panel for displaying workflow execution history with filtering and search.

**Key Features:**
- Gradient header with icon badge (indigo theme)
- Filter & search bar with status/trigger filters
- Grouped history items by date with sticky separators
- Status variant config for consistent styling
- Statistics summary in footer
- ConfirmDialog for delete operations
- Modal stack integration

**Structure:**
1. Fixed backdrop with blur (slides from right)
2. Panel container (w-[400px], full height)
3. Header with gradient, icon badge, title, and subtitle
4. Filter & search bar (optional, shown when has history)
5. Scrollable content with grouped items
6. Footer with statistics and clear all action

### NodePanel (Edit Step Panel)

Slide-over panel for editing workflow node configuration.

**Key Features:**
- Gradient header with icon badge (cyan theme)
- Status badge with animated indicator
- Form fields for node configuration
- Keyboard shortcuts display with `<kbd>` styling
- ConfirmDialog for delete operations
- Modal stack integration

**Structure:**
1. Fixed backdrop (darker on mobile, lighter on desktop)
2. Panel container (max-w-md, full height)
3. Header with gradient, icon badge, title, and step number
4. Status badge (when applicable)
5. Form fields (name, command, cwd, timeout)
6. Info box with keyboard shortcuts
7. Footer with save and delete buttons

---

## Slide-Over Panel Pattern

Slide-over panels are side panels that slide in from the right edge of the screen. They're used for secondary views, editing forms, and detailed information displays.

### Standard Structure

```typescript
// Backdrop
<div
  className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 animate-in fade-in-0 duration-200"
  onClick={handleBackdropClick}
  aria-hidden="true"
/>

// Panel
<div
  className={cn(
    'fixed right-0 top-0 h-full w-[400px]',
    'bg-background',
    'border-l border-{color}-500/30',  // Color varies by panel type
    'z-50 flex flex-col',
    'animate-in slide-in-from-right duration-200',
    'shadow-2xl shadow-black/50'
  )}
  role="dialog"
  aria-modal="true"
  aria-labelledby="panel-title"
>
  {/* Header */}
  {/* Content */}
  {/* Footer */}
</div>
```

### Header Pattern

```typescript
<div
  className={cn(
    'relative px-5 py-4',
    'border-b border-border',
    'bg-gradient-to-r',
    'dark:from-{color}-500/15 dark:via-{color}-600/5 dark:to-transparent',
    'from-{color}-500/10 via-{color}-600/5 to-transparent'
  )}
>
  {/* Close button */}
  <button
    onClick={onClose}
    className={cn(
      'absolute right-4 top-4',
      'p-2 rounded-lg',
      'text-muted-foreground hover:text-foreground',
      'hover:bg-accent/50',
      'transition-colors duration-150',
      'focus:outline-none focus:ring-2 focus:ring-ring'
    )}
    aria-label="Close panel"
  >
    <X className="w-4 h-4" />
  </button>

  <div className="flex items-center gap-4 pr-10">
    {/* Icon badge */}
    <div
      className={cn(
        'flex-shrink-0 w-12 h-12 rounded-xl',
        'flex items-center justify-center',
        'bg-background/80 dark:bg-background/50 backdrop-blur-sm',
        'border border-{color}-500/20',
        'bg-{color}-500/10',
        'shadow-lg'
      )}
    >
      <Icon className="w-6 h-6 text-{color}-400" />
    </div>
    <div className="flex-1 min-w-0">
      <h2 id="panel-title" className="text-lg font-semibold text-foreground leading-tight">
        Panel Title
      </h2>
      <p className="mt-1 text-sm text-muted-foreground truncate">
        Subtitle or context
      </p>
    </div>
  </div>
</div>
```

### Color Themes for Panels

| Panel Type | Color | Border | Icon Color |
|------------|-------|--------|------------|
| History / Timeline | indigo | `border-indigo-500/30` | `text-indigo-400` |
| Settings / Edit | cyan | `border-cyan-500/30` | `text-cyan-400` |
| AI / Review | purple | `border-purple-500/30` | `text-purple-400` |
| Deploy | blue | `border-blue-500/30` | `text-blue-400` |
| Warning / Alert | amber | `border-amber-500/30` | `text-amber-400` |

### Status Variant Config Pattern

Use a variant config object for consistent status-based styling:

```typescript
const statusVariantConfig = {
  completed: {
    icon: CheckCircle,
    gradient: 'from-green-500/20 to-transparent',
    iconColor: 'text-green-500 dark:text-green-400',
    borderColor: 'border-green-500/30',
    bgColor: 'bg-green-500/5',
    badgeClass: 'bg-green-500/20 text-green-400 border-green-500/30',
    label: 'Completed',
  },
  failed: {
    icon: XCircle,
    gradient: 'from-red-500/20 to-transparent',
    iconColor: 'text-red-500 dark:text-red-400',
    borderColor: 'border-red-500/30',
    bgColor: 'bg-red-500/5',
    badgeClass: 'bg-red-500/20 text-red-400 border-red-500/30',
    label: 'Failed',
  },
  running: {
    icon: Play,
    gradient: 'from-blue-500/20 to-transparent',
    iconColor: 'text-blue-400',
    borderColor: 'border-blue-500/30',
    bgColor: 'bg-blue-500/5',
    badgeClass: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    label: 'Running',
  },
  // ... more variants
} as const;

// Usage
const config = statusVariantConfig[status];
<div className={cn(config.borderColor, config.bgColor)}>
  <config.icon className={config.iconColor} />
</div>
```

### Date Group Separator Pattern

```typescript
<div className="sticky top-0 z-10 py-2 bg-background/95 backdrop-blur-sm">
  <div className="flex items-center gap-2">
    <div className="h-px flex-1 bg-border" />
    <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
      {dateLabel}
    </span>
    <div className="h-px flex-1 bg-border" />
  </div>
</div>
```

### Filter Button Pattern

```typescript
<button
  onClick={() => setIsOpen(!isOpen)}
  className={cn(
    'flex items-center gap-1.5 px-2 py-1 rounded text-xs',
    'border transition-colors',
    value !== 'all'
      ? 'border-primary/50 bg-primary/10 text-primary'
      : 'border-border bg-background hover:bg-accent text-muted-foreground'
  )}
>
  <Filter className="w-3 h-3" />
  <span>{label}</span>
</button>
```

### Modal Stack Integration

All slide-over panels must integrate with the modal stack for proper ESC key handling:

```typescript
import { registerModal, unregisterModal, isTopModal } from '../ui/modalStack';

const modalId = useId();

// Register/unregister
useEffect(() => {
  if (!isOpen) return;
  registerModal(modalId);
  return () => unregisterModal(modalId);
}, [modalId, isOpen]);

// Handle ESC key
useEffect(() => {
  if (!isOpen) return;

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key !== 'Escape') return;
    if (!isTopModal(modalId)) return;
    e.preventDefault();
    onClose();
  };

  document.addEventListener('keydown', handleKeyDown);
  return () => document.removeEventListener('keydown', handleKeyDown);
}, [modalId, isOpen, onClose]);
```

### ConfirmDialog Integration

Always use `ConfirmDialog` instead of native `confirm()` for delete operations:

```typescript
const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

// Trigger
<Button onClick={() => setShowDeleteConfirm(true)}>Delete</Button>

// Dialog
<ConfirmDialog
  open={showDeleteConfirm}
  onOpenChange={setShowDeleteConfirm}
  variant="destructive"
  title="Delete Item"
  description="Are you sure you want to delete this item? This action cannot be undone."
  itemName={item.name}
  confirmText="Delete"
  onConfirm={handleDelete}
/>
```

### Keyboard Shortcut Display Pattern

```typescript
<div className="p-4 rounded-lg bg-muted/30 border border-border">
  <h4 className="text-sm font-medium text-foreground mb-2">Keyboard Shortcuts</h4>
  <ul className="text-xs text-muted-foreground space-y-1.5">
    <li className="flex items-center gap-2">
      <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">⌘S</kbd>
      <span>Save changes</span>
    </li>
    <li className="flex items-center gap-2">
      <kbd className="px-1.5 py-0.5 rounded bg-muted text-foreground font-mono text-[10px]">Esc</kbd>
      <span>Close panel</span>
    </li>
  </ul>
</div>
```

---

## Best Practices

### Do's

1. **Use the `cn()` utility** for all conditional class merging
   ```typescript
   import { cn } from '../../lib/utils';
   cn('base-classes', condition && 'conditional-classes', className)
   ```

2. **Implement proper TypeScript interfaces** for all props
   ```typescript
   interface ComponentProps {
     /** Description of prop */
     propName: PropType;
   }
   ```

3. **Handle all states** - loading, error, empty, success
   ```typescript
   if (isLoading) return <Skeleton />;
   if (error) return <ErrorMessage error={error} />;
   if (!data) return <EmptyState />;
   return <Content data={data} />;
   ```

4. **Support both light and dark themes** explicitly
   ```typescript
   'bg-background/80 dark:bg-background/50'
   ```

5. **Add ARIA attributes** for accessibility
   ```typescript
   role="dialog"
   aria-modal="true"
   aria-label="Action description"
   ```

6. **Use semantic color tokens** instead of raw colors
   ```typescript
   // Good
   'text-foreground bg-background'
   // Avoid
   'text-gray-900 bg-white'
   ```

7. **Implement keyboard handlers** for interactive elements
   ```typescript
   const handleKeyDown = (e: React.KeyboardEvent) => {
     if (e.key === 'Enter' || e.key === ' ') {
       e.preventDefault();
       handleAction();
     }
   };
   ```

### Don'ts

1. **Don't use hardcoded colors** - use CSS variables via Tailwind classes

2. **Don't skip focus management** - always handle focus trap in modals

3. **Don't forget disabled states** - include `disabled:opacity-50 disabled:cursor-not-allowed`

4. **Don't ignore reduce-motion** - respect user preferences for animations

5. **Don't use inline styles** unless absolutely necessary for dynamic values

6. **Don't create new components** when existing ones can be composed or extended

7. **Don't use native `<button>` in business components** - always use `<Button>` from `ui/Button`
   ```typescript
   // ❌ Bad - native button with custom styles
   <button className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600">
     Submit
   </button>

   // ✅ Good - use Button component
   import { Button } from '@/components/ui/Button';
   <Button variant="default">Submit</Button>

   // ✅ Exception - inside ui/ primitives (Select, Toggle, Dialog, etc.)
   // Native button is acceptable in low-level ui components
   ```

   **When native `<button>` is acceptable:**
   - Inside `ui/` primitive components (Select, Toggle, Dropdown, Tabs, etc.)
   - When building a new UI primitive that will be reused

   **When to use `<Button>` component:**
   - All business components (pages, panels, dialogs, forms)
   - Action buttons, submit buttons, cancel buttons
   - Icon buttons (use `size="icon"` variant)

8. **Don't use native `<select>` or custom dropdown implementations** - always use existing `Select` or `Dropdown` components
   ```typescript
   // ❌ Bad - native select with custom styles
   <select className="px-2 py-1 border rounded">
     <option value="a">Option A</option>
     <option value="b">Option B</option>
   </select>

   // ❌ Bad - custom dropdown implementation
   const [isOpen, setIsOpen] = useState(false);
   <div className="relative">
     <button onClick={() => setIsOpen(!isOpen)}>Toggle</button>
     {isOpen && <div className="absolute">...</div>}
   </div>

   // ✅ Good - use Select component for value selection
   import { Select } from '@/components/ui/Select';
   <Select
     value={selectedValue}
     onValueChange={setSelectedValue}
     options={[
       { value: 'a', label: 'Option A' },
       { value: 'b', label: 'Option B' },
     ]}
     size="sm"
   />

   // ✅ Good - use Dropdown component for action menus
   import { Dropdown, DropdownItem } from '@/components/ui/Dropdown';
   <Dropdown trigger={<Button>Actions</Button>}>
     <DropdownItem onClick={handleEdit}>Edit</DropdownItem>
     <DropdownItem onClick={handleDelete} destructive>Delete</DropdownItem>
   </Dropdown>
   ```

   **When to use `Select` component:**
   - Selecting a value from a list of options
   - Filter dropdowns (status, platform, sort)
   - Form fields with predefined choices
   - Supports keyboard navigation, grouping, and custom option rendering

   **When to use `Dropdown` component:**
   - Action menus (edit, delete, export, etc.)
   - Context menus
   - Menu buttons with multiple actions

   **Select sizes:**
   - `size="sm"` (h-8) - Compact filters, inline selects
   - `size="default"` (h-9) - Standard form fields
   - `size="lg"` (h-10) - Prominent selections

### Checklist for New Components

- [ ] TypeScript interface with JSDoc comments
- [ ] Proper ARIA attributes
- [ ] Keyboard navigation support
- [ ] Focus states (ring styles)
- [ ] Disabled states
- [ ] Loading states (if applicable)
- [ ] Light and dark theme support
- [ ] Consistent spacing with existing components
- [ ] Animation with reduce-motion support
- [ ] Props follow existing naming conventions

---

## File Structure Reference

```
src/
  components/
    ui/
      AIReviewDialog.tsx      # Featured dialog example
      Button.tsx              # Button variants
      Checkbox.tsx            # Checkbox input
      Collapsible.tsx         # Expandable sections
      ConfirmDialog.tsx       # Confirmation dialogs
      ContextMenu.tsx         # Right-click menus
      Dialog.tsx              # Base dialog primitives
      Dropdown.tsx            # Action menus
      ErrorBoundary.tsx       # Error handling
      Input.tsx               # Text inputs
      Progress.tsx            # Progress bars
      Select.tsx              # Dropdown selects
      Skeleton.tsx            # Loading placeholders
      Tabs.tsx                # Tab navigation
      Toggle.tsx              # Toggle switches
      modalStack.ts           # Modal z-index management
    workflow/
      ExecutionHistoryPanel.tsx  # Slide-over panel for history
      NodePanel.tsx              # Slide-over panel for edit step
      WorkflowEditor.tsx         # Main workflow editor
      WorkflowToolbar.tsx        # Toolbar with actions
  lib/
    utils.ts                  # cn() utility function
  styles.css                  # CSS variables, base styles
tailwind.config.js            # Theme configuration
```

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.1.0 | 2025-12 | Added Slide-Over Panel pattern, ExecutionHistoryPanel, NodePanel |
| 1.0.0 | 2025-12 | Initial design specification based on AIReviewDialog |
