// DeploymentProgress Component
// Deploy UI Enhancement (018-deploy-ui-enhancement)
// Shows detailed deployment progress with steps indicator

import { useState, useEffect, useRef } from 'react';
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Upload,
  Hammer,
  Globe,
  ExternalLink,
  Clock,
} from 'lucide-react';
import { deployEvents, openUrl } from '../../../lib/tauri-api';
import type { Deployment, DeploymentStatus, DeploymentProgressEvent } from '../../../types/deploy';
import { buttonVariants } from '../../ui/Button';

interface DeploymentProgressProps {
  deployment: Deployment;
  /** Called when deployment completes */
  onComplete?: () => void;
}

// Deployment steps definition
const DEPLOYMENT_STEPS = [
  { id: 'upload', name: 'Upload', icon: Upload },
  { id: 'build', name: 'Build', icon: Hammer },
  { id: 'deploy', name: 'Deploy', icon: Globe },
] as const;

// Map status to step index
const getStepFromStatus = (status: DeploymentStatus): number => {
  switch (status) {
    case 'queued': return 0;
    case 'building': return 1;
    case 'deploying': return 2;
    case 'ready': return 3;
    case 'failed': return -1;
    case 'cancelled': return -1;
    default: return 0;
  }
};

// Get status color
const getStatusColor = (status: DeploymentStatus): string => {
  switch (status) {
    case 'ready': return 'text-green-500';
    case 'failed': return 'text-red-500';
    case 'cancelled': return 'text-gray-500';
    default: return 'text-blue-500';
  }
};

// Format elapsed time
const formatElapsedTime = (seconds: number): string => {
  if (seconds < 60) return `${seconds}s`;
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}m ${secs}s`;
};

export function DeploymentProgress({ deployment, onComplete }: DeploymentProgressProps) {
  const [currentStep, setCurrentStep] = useState(getStepFromStatus(deployment.status));
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [progressInfo, setProgressInfo] = useState<DeploymentProgressEvent | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef = useRef<Date>(new Date(deployment.createdAt));

  // Subscribe to progress events
  useEffect(() => {
    const unsubscribe = deployEvents.onDeploymentProgress((event) => {
      if (event.deploymentId === deployment.id) {
        setProgressInfo(event);
        if (event.currentStepIndex) {
          setCurrentStep(event.currentStepIndex);
        }
        if (event.elapsedSeconds) {
          setElapsedSeconds(event.elapsedSeconds);
        }
      }
    });

    return () => {
      unsubscribe.then(fn => fn());
    };
  }, [deployment.id]);

  // Update elapsed time
  useEffect(() => {
    if (deployment.status !== 'ready' && deployment.status !== 'failed' && deployment.status !== 'cancelled') {
      intervalRef.current = setInterval(() => {
        const now = new Date();
        const elapsed = Math.floor((now.getTime() - startTimeRef.current.getTime()) / 1000);
        setElapsedSeconds(elapsed);
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [deployment.status]);

  // Update step based on status
  useEffect(() => {
    const step = getStepFromStatus(deployment.status);
    setCurrentStep(step);

    if (deployment.status === 'ready' || deployment.status === 'failed') {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      onComplete?.();
    }
  }, [deployment.status, onComplete]);

  const isCompleted = deployment.status === 'ready';
  const isFailed = deployment.status === 'failed' || deployment.status === 'cancelled';

  return (
    <div className="rounded-lg border border-border bg-card p-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {!isCompleted && !isFailed && (
            <Loader2 className="h-4 w-4 animate-spin text-blue-500" />
          )}
          {isCompleted && (
            <CheckCircle2 className="h-4 w-4 text-green-500" />
          )}
          {isFailed && (
            <XCircle className="h-4 w-4 text-red-500" />
          )}
          <span className={`font-medium ${getStatusColor(deployment.status)}`}>
            {deployment.status === 'queued' && 'Queued...'}
            {deployment.status === 'building' && 'Building...'}
            {deployment.status === 'deploying' && 'Deploying...'}
            {deployment.status === 'ready' && 'Deployed!'}
            {deployment.status === 'failed' && 'Failed'}
            {deployment.status === 'cancelled' && 'Cancelled'}
          </span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Clock className="h-3.5 w-3.5" />
          <span>{formatElapsedTime(elapsedSeconds)}</span>
        </div>
      </div>

      {/* Progress Steps */}
      <div className="mt-4 flex items-center justify-between">
        {DEPLOYMENT_STEPS.map((step, index) => {
          const StepIcon = step.icon;
          const isActive = currentStep === index + 1;
          const isComplete = currentStep > index + 1 || isCompleted;
          const isError = isFailed && currentStep === index + 1;

          return (
            <div key={step.id} className="flex flex-1 items-center">
              {/* Step Indicator */}
              <div className="flex flex-col items-center">
                <div
                  className={`flex h-8 w-8 items-center justify-center rounded-full border-2 transition-colors ${
                    isComplete
                      ? 'border-green-500 bg-green-500 text-white'
                      : isError
                      ? 'border-red-500 bg-red-500 text-white'
                      : isActive
                      ? 'border-blue-500 bg-blue-500 text-white'
                      : 'border-muted bg-background text-muted-foreground'
                  }`}
                >
                  {isComplete ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : isActive && !isFailed ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : isError ? (
                    <XCircle className="h-4 w-4" />
                  ) : (
                    <StepIcon className="h-4 w-4" />
                  )}
                </div>
                <span
                  className={`mt-1 text-xs ${
                    isActive || isComplete ? 'font-medium text-foreground' : 'text-muted-foreground'
                  }`}
                >
                  {step.name}
                </span>
              </div>

              {/* Connector Line */}
              {index < DEPLOYMENT_STEPS.length - 1 && (
                <div
                  className={`mx-2 h-0.5 flex-1 transition-colors ${
                    currentStep > index + 1 || isCompleted
                      ? 'bg-green-500'
                      : 'bg-muted'
                  }`}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* Progress Bar (if available) */}
      {progressInfo?.progress !== undefined && !isCompleted && !isFailed && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{progressInfo.currentStep || 'Processing...'}</span>
            <span>{progressInfo.progress}%</span>
          </div>
          <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-blue-500 transition-all duration-300"
              style={{ width: `${progressInfo.progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {deployment.errorMessage && (
        <div className="mt-3 rounded-md bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-400">
          {deployment.errorMessage}
        </div>
      )}

      {/* Success URL */}
      {isCompleted && deployment.url && (
        <div className="mt-4 flex items-center justify-between rounded-md bg-green-50 p-3 dark:bg-green-950/30">
          <button
            onClick={() => openUrl(deployment.url!)}
            className="flex-1 truncate text-sm text-green-700 hover:underline dark:text-green-400 text-left"
          >
            {deployment.url}
          </button>
          <button
            onClick={() => openUrl(deployment.url!)}
            className={buttonVariants({ variant: 'success', size: 'sm', className: 'ml-2 gap-1.5' })}
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Open Site
          </button>
        </div>
      )}

      {/* Deploy Time (for completed deployments) */}
      {isCompleted && deployment.deployTime != null && (
        <div className="mt-2 text-xs text-muted-foreground">
          Deployed in {formatElapsedTime(deployment.deployTime)}
          {deployment.siteName ? ` to ${deployment.siteName}` : ''}
        </div>
      )}
    </div>
  );
}
