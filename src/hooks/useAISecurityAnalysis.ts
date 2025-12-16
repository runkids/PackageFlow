/**
 * useAISecurityAnalysis Hook - AI Security Vulnerability Analysis
 *
 * Provides AI-powered security vulnerability analysis functionality:
 * - Single vulnerability analysis
 * - Comprehensive summary of all vulnerabilities
 * - Mutual exclusion (only one analysis can run at a time)
 * - CLI tool support for AI analysis
 */

import { useState, useCallback, useMemo } from 'react';
import { aiAPI, aiCLIAPI } from '../lib/tauri-api';
import type { VulnItem, VulnSummary } from '../types/security';
import type {
  GenerateSecurityAnalysisRequest,
  GenerateSecuritySummaryRequest,
  CLIToolType,
} from '../types/ai';
import { getDefaultCliTool, shouldUseCLI } from './useAIService';

// ============================================================================
// CLI Execution Helper
// ============================================================================

/** Execute CLI tool and get the complete output */
async function executeCLITool(
  tool: CLIToolType,
  prompt: string,
  projectPath: string
): Promise<{ success: boolean; output: string; error?: string }> {
  try {
    const response = await aiCLIAPI.execute({
      tool,
      prompt,
      projectPath,
    });

    if (!response.success || !response.data) {
      return {
        success: false,
        output: '',
        error: response.error || 'CLI execution failed',
      };
    }

    const result = response.data;

    if (result.cancelled) {
      return {
        success: false,
        output: '',
        error: 'CLI execution was cancelled',
      };
    }

    const output = result.stdout || result.stderr || '';

    return {
      success: result.exitCode === 0,
      output,
      error: result.exitCode !== 0 ? `CLI exited with code ${result.exitCode}` : undefined,
    };
  } catch (err) {
    return {
      success: false,
      output: '',
      error: err instanceof Error ? err.message : 'Unknown CLI error',
    };
  }
}

// ============================================================================
// Types
// ============================================================================

export interface UseAISecurityAnalysisOptions {
  /** Project path */
  projectPath: string;
  /** Project name for context */
  projectName: string;
  /** Package manager used */
  packageManager: string;
  /** Whether to use CLI tool instead of API (defaults to checking localStorage preference) */
  useCli?: boolean;
}

export interface UseAISecurityAnalysisResult {
  /** Generate analysis for a single vulnerability */
  generateAnalysis: (
    vulnerability: VulnItem,
    options?: { providerId?: string; templateId?: string; useCli?: boolean }
  ) => Promise<string | null>;

  /** Generate summary for all vulnerabilities */
  generateSummary: (
    vulnerabilities: VulnItem[],
    summary: VulnSummary,
    options?: { providerId?: string; templateId?: string; useCli?: boolean }
  ) => Promise<string | null>;

  /** Whether any generation is in progress */
  isGenerating: boolean;

  /** ID of the vulnerability currently being analyzed (null for summary mode) */
  activeVulnerabilityId: string | null;

  /** Whether summary analysis is active */
  isSummaryActive: boolean;

  /** Error message if generation failed */
  error: string | null;

  /** Number of tokens used in the last generation */
  tokensUsed: number | null;

  /** Whether the last response was truncated */
  isTruncated: boolean;

  /** Clear the current error */
  clearError: () => void;

  /** Cancel current analysis (resets state) */
  cancelAnalysis: () => void;

  /** Whether CLI mode is being used */
  isCliMode: boolean;
}

// ============================================================================
// Hook Implementation
// ============================================================================

export function useAISecurityAnalysis(
  options: UseAISecurityAnalysisOptions
): UseAISecurityAnalysisResult {
  const { projectPath, projectName, packageManager, useCli: useCliOption } = options;

  // State
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeVulnerabilityId, setActiveVulnerabilityId] = useState<string | null>(null);
  const [isSummaryActive, setIsSummaryActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tokensUsed, setTokensUsed] = useState<number | null>(null);
  const [isTruncated, setIsTruncated] = useState(false);

  // Determine if CLI mode should be used
  const isCliMode = useMemo(() => {
    if (useCliOption !== undefined) return useCliOption;
    return shouldUseCLI();
  }, [useCliOption]);

  // ============================================================================
  // Single Vulnerability Analysis
  // ============================================================================

  const generateAnalysis = useCallback(
    async (
      vulnerability: VulnItem,
      genOptions?: { providerId?: string; templateId?: string; useCli?: boolean }
    ): Promise<string | null> => {
      // Check mutual exclusion
      if (isGenerating) {
        setError('Another analysis is already in progress');
        return null;
      }

      if (!projectPath) {
        setError('Project path is required');
        return null;
      }

      // Set state for mutual exclusion
      setIsGenerating(true);
      setActiveVulnerabilityId(vulnerability.id);
      setIsSummaryActive(false);
      setError(null);
      setTokensUsed(null);
      setIsTruncated(false);

      // Determine if this specific call should use CLI
      const shouldUseCli = genOptions?.useCli ?? isCliMode;
      const cliTool = getDefaultCliTool();

      try {
        // Use CLI tool if enabled and available
        if (shouldUseCli && cliTool) {
          const prompt = `Analyze this security vulnerability in the project "${projectName}":

Package: ${vulnerability.packageName}@${vulnerability.installedVersion}
Severity: ${vulnerability.severity}
Title: ${vulnerability.title}
${vulnerability.cwes.length > 0 ? `CWE: ${vulnerability.cwes.join(', ')}` : ''}
${vulnerability.cves.length > 0 ? `CVE: ${vulnerability.cves.join(', ')}` : ''}
${vulnerability.advisoryUrl ? `Advisory: ${vulnerability.advisoryUrl}` : ''}

Provide a detailed security analysis covering:
1. Impact assessment and risk level
2. Attack vectors and exploitation scenarios
3. Recommended remediation steps
4. Whether a fix is available (${vulnerability.fixAvailable ? 'Yes' : 'No'})
5. Temporary mitigations if immediate upgrade is not possible

Be specific and actionable in your recommendations.`;

          const result = await executeCLITool(cliTool, prompt, projectPath);

          if (result.success) {
            return result.output;
          } else {
            setError(result.error || 'CLI security analysis failed');
            return null;
          }
        }

        // Fall back to API
        const request: GenerateSecurityAnalysisRequest = {
          projectPath,
          projectName,
          packageManager,
          vulnerability,
          providerId: genOptions?.providerId,
          templateId: genOptions?.templateId,
        };

        const response = await aiAPI.generateSecurityAnalysis(request);

        if (response.success && response.data) {
          setTokensUsed(response.data.tokensUsed ?? null);
          setIsTruncated(response.data.isTruncated);
          return response.data.analysis;
        } else {
          const errorMsg = response.error || 'Failed to generate security analysis';
          setError(errorMsg);
          return null;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error generating security analysis';
        setError(message);
        console.error('Generate security analysis error:', err);
        return null;
      } finally {
        setIsGenerating(false);
        setActiveVulnerabilityId(null);
      }
    },
    [projectPath, projectName, packageManager, isGenerating, isCliMode]
  );

  // ============================================================================
  // All Vulnerabilities Summary
  // ============================================================================

  const generateSummary = useCallback(
    async (
      vulnerabilities: VulnItem[],
      summary: VulnSummary,
      genOptions?: { providerId?: string; templateId?: string; useCli?: boolean }
    ): Promise<string | null> => {
      console.log('[useAISecurityAnalysis] generateSummary called', {
        vulnCount: vulnerabilities.length,
        isGenerating,
        projectPath,
      });

      // Check mutual exclusion
      if (isGenerating) {
        console.warn('[useAISecurityAnalysis] Already generating, returning early');
        setError('Another analysis is already in progress');
        return null;
      }

      if (!projectPath) {
        console.warn('[useAISecurityAnalysis] No projectPath');
        setError('Project path is required');
        return null;
      }

      if (vulnerabilities.length === 0) {
        console.warn('[useAISecurityAnalysis] No vulnerabilities');
        setError('No vulnerabilities to analyze');
        return null;
      }

      // Set state for mutual exclusion
      setIsGenerating(true);
      setActiveVulnerabilityId(null);
      setIsSummaryActive(true);
      setError(null);
      setTokensUsed(null);
      setIsTruncated(false);

      // Determine if this specific call should use CLI
      const shouldUseCli = genOptions?.useCli ?? isCliMode;
      const cliTool = getDefaultCliTool();

      try {
        // Use CLI tool if enabled and available
        if (shouldUseCli && cliTool) {
          // Build a summary of vulnerabilities for the prompt
          const vulnList = vulnerabilities.slice(0, 10).map((v) =>
            `- ${v.packageName}@${v.installedVersion}: ${v.severity} - ${v.title}`
          ).join('\n');

          const prompt = `Analyze the security vulnerabilities in the project "${projectName}" (${packageManager}):

Summary:
- Total: ${summary.total}
- Critical: ${summary.critical}
- High: ${summary.high}
- Moderate: ${summary.moderate}
- Low: ${summary.low}

Top vulnerabilities:
${vulnList}
${vulnerabilities.length > 10 ? `\n... and ${vulnerabilities.length - 10} more` : ''}

Provide a comprehensive security assessment covering:
1. Overall risk assessment
2. Priority remediation order
3. Common themes in the vulnerabilities
4. Recommended immediate actions
5. Long-term security improvements

Be specific and actionable in your recommendations.`;

          const result = await executeCLITool(cliTool, prompt, projectPath);

          if (result.success) {
            return result.output;
          } else {
            setError(result.error || 'CLI security summary failed');
            return null;
          }
        }

        // Fall back to API
        const request: GenerateSecuritySummaryRequest = {
          projectPath,
          projectName,
          packageManager,
          vulnerabilities,
          summary,
          providerId: genOptions?.providerId,
          templateId: genOptions?.templateId,
        };

        console.log('[useAISecurityAnalysis] Calling API with request:', {
          projectPath: request.projectPath,
          projectName: request.projectName,
          vulnCount: request.vulnerabilities.length,
        });

        const response = await aiAPI.generateSecuritySummary(request);

        console.log('[useAISecurityAnalysis] API response:', {
          success: response.success,
          hasData: !!response.data,
          error: response.error,
        });

        if (response.success && response.data) {
          setTokensUsed(response.data.tokensUsed ?? null);
          setIsTruncated(response.data.isTruncated);
          console.log('[useAISecurityAnalysis] Success, analysis length:', response.data.analysis?.length);
          return response.data.analysis;
        } else {
          const errorMsg = response.error || 'Failed to generate security summary';
          console.error('[useAISecurityAnalysis] API error:', errorMsg);
          setError(errorMsg);
          return null;
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Unknown error generating security summary';
        setError(message);
        console.error('[useAISecurityAnalysis] Exception:', err);
        return null;
      } finally {
        setIsGenerating(false);
        setIsSummaryActive(false);
      }
    },
    [projectPath, projectName, packageManager, isGenerating, isCliMode]
  );

  // ============================================================================
  // Utility Functions
  // ============================================================================

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const cancelAnalysis = useCallback(() => {
    // Note: This only resets state, it doesn't cancel the actual API call
    // The backend will still complete the request
    setIsGenerating(false);
    setActiveVulnerabilityId(null);
    setIsSummaryActive(false);
    setError(null);
  }, []);

  // ============================================================================
  // Return
  // ============================================================================

  return {
    generateAnalysis,
    generateSummary,
    isGenerating,
    activeVulnerabilityId,
    isSummaryActive,
    error,
    tokensUsed,
    isTruncated,
    clearError,
    cancelAnalysis,
    isCliMode,
  };
}
