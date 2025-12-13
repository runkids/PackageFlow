// Deploy TypeScript types
// One-Click Deploy feature (015-one-click-deploy)
// Extended with Multi Deploy Accounts (016-multi-deploy-accounts)

export type PlatformType = 'github_pages' | 'netlify' | 'cloudflare_pages';

export type DeploymentEnvironment = 'production' | 'preview';

export type DeploymentStatus =
  | 'queued'
  | 'building'
  | 'deploying'
  | 'ready'
  | 'failed'
  | 'cancelled';

export interface EnvVariable {
  key: string;
  value: string;
  isSecret?: boolean;
}

// Legacy interface - kept for backward compatibility
export interface ConnectedPlatform {
  platform: PlatformType;
  userId: string;
  username: string;
  avatarUrl?: string;
  connectedAt: string;
  expiresAt?: string;
  // Note: access_token is never exposed to frontend
}

// T004: New DeployAccount interface with multi-account support (016-multi-deploy-accounts)
export interface DeployAccount {
  /** Unique identifier (UUID v4) */
  id: string;
  /** Platform type (vercel/netlify) */
  platform: PlatformType;
  /** Platform-specific user ID (for duplicate detection) */
  platformUserId: string;
  /** Username from the platform */
  username: string;
  /** User-defined display name (optional, falls back to username) */
  displayName?: string;
  /** Avatar URL from the platform */
  avatarUrl?: string;
  /** When this account was connected (ISO 8601) */
  connectedAt: string;
  /** Token expiration time (ISO 8601, optional) */
  expiresAt?: string;
  // Note: access_token is never exposed to frontend
}

// T004: Deploy preferences for default account settings
export interface DeployPreferences {
  /** Default GitHub Pages account ID */
  defaultGithubPagesAccountId?: string;
  /** Default Netlify account ID */
  defaultNetlifyAccountId?: string;
  /** Default Cloudflare Pages account ID */
  defaultCloudflarePagesAccountId?: string;
}

// T004: Result from removing an account
export interface RemoveAccountResult {
  /** Whether the removal was successful */
  success: boolean;
  /** List of project IDs that were using this account */
  affectedProjects: string[];
}

// T005: Updated DeploymentConfig with account binding
export interface DeploymentConfig {
  projectId: string;
  platform: PlatformType;
  /** Bound account ID for this project (016-multi-deploy-accounts) */
  accountId?: string;
  environment: DeploymentEnvironment;
  frameworkPreset?: string;
  envVariables: EnvVariable[];
  rootDirectory?: string;
  /** Custom install command (used for GitHub Actions workflow generation) */
  installCommand?: string;
  /** Custom build command (e.g., "pnpm build", "yarn build:prod") */
  buildCommand?: string;
  /** Custom output directory (overrides framework preset detection) */
  outputDirectory?: string;
  /** Netlify site ID (for reusing existing site across deployments) */
  netlifySiteId?: string;
  /** Custom Netlify site name (e.g., "my-awesome-app" for my-awesome-app.netlify.app) */
  netlifySiteName?: string;
  /** Cloudflare account ID (required for Cloudflare Pages) */
  cloudflareAccountId?: string;
  /** Cloudflare project name (e.g., "my-app" for my-app.pages.dev) */
  cloudflareProjectName?: string;
}

export interface Deployment {
  id: string;
  projectId: string;
  platform: PlatformType;
  status: DeploymentStatus;
  url?: string;
  createdAt: string;
  completedAt?: string;
  commitHash?: string;
  commitMessage?: string;
  errorMessage?: string;
  // Netlify-specific fields
  /** Netlify admin dashboard URL */
  adminUrl?: string;
  /** Build time in seconds */
  deployTime?: number;
  /** Branch that was deployed */
  branch?: string;
  /** Site name (e.g., "my-app" for my-app.netlify.app) */
  siteName?: string;
  /** Unique preview URL for this specific deploy */
  previewUrl?: string;
}

export interface OAuthFlowResult {
  success: boolean;
  platform?: ConnectedPlatform;
  error?: string;
}

export interface DeploymentStatusEvent {
  deploymentId: string;
  status: DeploymentStatus;
  url?: string;
  errorMessage?: string;
}

// Result from GitHub Actions workflow generation
export interface GitHubWorkflowResult {
  success: boolean;
  /** Path to the generated workflow file */
  workflowPath: string;
  /** Setup instructions for the user */
  setupInstructions: string[];
  /** GitHub username, if detected */
  username?: string;
  /** GitHub repository name, if detected */
  repo?: string;
}

// Result from Cloudflare API token validation
export interface CloudflareValidationResult {
  valid: boolean;
  /** Cloudflare account ID */
  accountId?: string;
  /** Account name from Cloudflare */
  accountName?: string;
  error?: string;
}

// Result from checking if a deploy account is in use
export interface CheckAccountResult {
  inUse: boolean;
  affectedProjects: string[];
}

// Encrypted data structure (for backup)
export interface EncryptedData {
  /** Base64 encoded nonce */
  nonce: string;
  /** Base64 encoded ciphertext */
  ciphertext: string;
}

// Result from backup export operation
export interface BackupExportResult {
  /** Encrypted backup data (can be saved to file) */
  encryptedData: EncryptedData;
  /** Number of accounts included in backup */
  accountCount: number;
}

// Result from backup import operation
export interface BackupImportResult {
  success: boolean;
  /** Number of accounts restored */
  accountsRestored: number;
  /** Error message if any */
  error?: string;
}

// Framework presets
export const FRAMEWORK_PRESETS = [
  { key: 'nextjs', name: 'Next.js', buildCommand: 'next build', outputDirectory: '.next' },
  { key: 'vite', name: 'Vite', buildCommand: 'vite build', outputDirectory: 'dist' },
  { key: 'create-react-app', name: 'Create React App', buildCommand: 'react-scripts build', outputDirectory: 'build' },
  { key: 'vue', name: 'Vue.js', buildCommand: 'vue-cli-service build', outputDirectory: 'dist' },
  { key: 'nuxtjs', name: 'Nuxt.js', buildCommand: 'nuxt build', outputDirectory: '.nuxt' },
  { key: 'gatsby', name: 'Gatsby', buildCommand: 'gatsby build', outputDirectory: 'public' },
  { key: 'astro', name: 'Astro', buildCommand: 'astro build', outputDirectory: 'dist' },
  { key: 'sveltekit', name: 'SvelteKit', buildCommand: 'svelte-kit build', outputDirectory: 'build' },
  { key: 'remix', name: 'Remix', buildCommand: 'remix build', outputDirectory: 'build' },
  { key: 'static', name: 'Static', buildCommand: '', outputDirectory: '.' },
] as const;

export type FrameworkPresetKey = typeof FRAMEWORK_PRESETS[number]['key'];
