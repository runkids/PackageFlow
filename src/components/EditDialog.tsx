import React, { useState, useMemo } from 'react';
import { Save, Check, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogClose } from './ui/Dialog';
import { Select, type SelectOption } from './ui/Select';
import { Button } from './ui/Button';
import { cn } from '../lib/utils';
import type { ModalData, SigningIdentity } from '../types';

interface EditDialogProps {
  open: boolean;
  data: ModalData | null;
  signingIdentities: SigningIdentity[];
  onClose: () => void;
  onSave: (newValue: string, signingIdentity: string | null) => Promise<{ success: boolean; error?: string }>;
  onDelete?: () => void;
}

// Signing Identity Select sub-component
interface SigningIdentitySelectProps {
  selectedIdentity: string;
  onIdentityChange: (value: string) => void;
  signingIdentities: SigningIdentity[];
}

function SigningIdentitySelect({
  selectedIdentity,
  onIdentityChange,
  signingIdentities,
}: SigningIdentitySelectProps) {
  const options = useMemo<SelectOption[]>(() => {
    return [
      { value: '', label: 'Do not re-sign' },
      ...signingIdentities.map((identity) => ({
        value: identity.name,
        label: identity.name,
        description: identity.hash.substring(0, 8) + '...',
      })),
    ];
  }, [signingIdentities]);

  return (
    <div className="space-y-2">
      <label className="text-xs font-medium text-muted-foreground uppercase">
        Signing identity (re-sign after changes)
      </label>
      <Select
        value={selectedIdentity}
        onValueChange={onIdentityChange}
        options={options}
        placeholder="Select signing identity..."
        aria-label="Signing identity"
      />
    </div>
  );
}

export const EditDialog: React.FC<EditDialogProps> = ({
  open,
  data,
  signingIdentities,
  onClose,
  onSave,
}) => {
  const [value, setValue] = useState('');
  const [selectedIdentity, setSelectedIdentity] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  React.useEffect(() => {
    if (data) {
      setValue(data.value);
      setSelectedIdentity('');
      setSaveSuccess(false);
    }
  }, [data]);

  if (!data) return null;

  const { column, isReadOnly, plistKey, result } = data;
  const showSigningField = !isReadOnly && plistKey && signingIdentities.length > 0;

  const handleSave = async () => {
    if (isReadOnly) return;

    setIsSaving(true);
    const signingIdentity = selectedIdentity || null;

    try {
      const response = await onSave(value, signingIdentity);

      if (response.success) {
        setSaveSuccess(true);
        setTimeout(() => {
          setSaveSuccess(false);
          setIsSaving(false);
          onClose();
        }, 1500);
      } else {
        alert('Save failed: ' + response.error);
        setIsSaving(false);
      }
    } catch (error) {
      alert('Save failed: ' + (error as Error).message);
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="truncate pr-8 text-foreground" title={result.fileName}>
            {result.fileName}
          </DialogTitle>
          <DialogClose onClick={onClose} />
        </DialogHeader>

        <div className="space-y-4 mt-4">
          <div className="space-y-2">
            <label className="text-xs font-medium text-muted-foreground uppercase">
              {column.label}
            </label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              readOnly={isReadOnly}
              className="w-full min-h-[120px] px-3 py-2 border border-border rounded-md bg-background text-foreground font-mono text-sm resize-y focus:outline-none focus:ring-1 focus:ring-blue-500 focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-50"
            />
          </div>

          {showSigningField && (
            <SigningIdentitySelect
              selectedIdentity={selectedIdentity}
              onIdentityChange={setSelectedIdentity}
              signingIdentities={signingIdentities}
            />
          )}

          {!isReadOnly && (
            <div className="flex justify-end pt-2">
              <Button
                onClick={handleSave}
                disabled={isSaving}
                variant={saveSuccess ? 'success' : 'default'}
                className={cn(saveSuccess && 'bg-green-600 text-white hover:bg-green-500')}
              >
                {saveSuccess ? (
                  <>
                    <Check className="h-4 w-4 mr-2" />
                    {selectedIdentity ? 'Saved and signed' : 'Saved'}
                  </>
                ) : isSaving ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    {selectedIdentity ? 'Signing...' : 'Saving...'}
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4 mr-2" />
                    Save
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
