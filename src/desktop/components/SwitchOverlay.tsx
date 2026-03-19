import Spinner from '../../components/Spinner';
import Button from '../../components/Button';

interface SwitchOverlayProps {
  name: string;
  error?: string;
  onRetry?: () => void;
  onCancel?: () => void;
}

export default function SwitchOverlay({ name, error, onRetry, onCancel }: SwitchOverlayProps) {
  return (
    <div className="fixed inset-0 z-[100] bg-paper/90 flex flex-col items-center justify-center gap-4">
      {!error ? (
        <>
          <Spinner size="lg" />
          <p className="text-pencil text-lg font-medium">
            Switching to {name}...
          </p>
        </>
      ) : (
        <>
          <p className="text-danger text-lg font-medium">{error}</p>
          <div className="flex gap-3">
            {onRetry && (
              <Button variant="secondary" onClick={onRetry}>Retry</Button>
            )}
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>Cancel</Button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
