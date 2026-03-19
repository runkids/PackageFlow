import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, Plus, Folder, Globe, Check } from 'lucide-react';
import { useProjects } from '../hooks/useProjects';
import SwitchOverlay from './SwitchOverlay';
import { tauriBridge } from '../api/tauri-bridge';
import { useTauri } from '../context/TauriContext';

export default function ProjectSwitcher() {
  const { projects, activeProject, switching, switchProject } = useProjects();
  const { appInfo } = useTauri();
  const [open, setOpen] = useState(false);
  const [switchingName, setSwitchingName] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const handleSwitch = async (id: string, name: string) => {
    setOpen(false);
    setSwitchingName(name);
    setSwitchError(null);

    const timeoutId = setTimeout(() => {
      setSwitchError(`Switching to "${name}" timed out.`);
    }, 5000);

    try {
      await switchProject(id);

      // Restart server for the new project
      if (appInfo?.cliVersion) {
        const cliPath = await tauriBridge.detectCli();
        if (cliPath) {
          const project = projects.find((p) => p.id === id);
          await tauriBridge.restartServer(cliPath, project?.path);
        }
      }
      clearTimeout(timeoutId);
      setSwitchingName(null);
    } catch {
      clearTimeout(timeoutId);
      setSwitchError(`Failed to switch to "${name}".`);
    }
  };

  const handleRetry = () => {
    const project = projects.find((p) => p.name === switchingName);
    if (project) {
      setSwitchError(null);
      handleSwitch(project.id, project.name);
    }
  };

  const handleCancel = () => {
    setSwitchingName(null);
    setSwitchError(null);
  };

  return (
    <>
      <div ref={ref} className="relative px-2 mb-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 text-sm text-pencil hover:bg-muted/20 transition-colors cursor-pointer rounded-[var(--radius-sm)]"
        >
          <span className="flex items-center gap-2 truncate">
            {activeProject?.projectType === 'global' ? (
              <Globe size={14} strokeWidth={2.5} className="shrink-0 text-pencil-light" />
            ) : (
              <Folder size={14} strokeWidth={2.5} className="shrink-0 text-pencil-light" />
            )}
            <span className="truncate font-medium">
              {activeProject?.name || 'No Project'}
            </span>
          </span>
          <ChevronDown
            size={14}
            strokeWidth={2.5}
            className={`shrink-0 text-pencil-light transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>

        {open && (
          <div className="absolute left-2 right-2 top-full mt-1 z-50 bg-surface border border-muted rounded-[var(--radius-md)] shadow-md overflow-hidden animate-dropdown-in">
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => handleSwitch(project.id, project.name)}
                disabled={switching || project.id === activeProject?.id}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted/20 transition-colors cursor-pointer disabled:opacity-50"
              >
                {project.projectType === 'global' ? (
                  <Globe size={14} strokeWidth={2.5} className="shrink-0 text-pencil-light" />
                ) : (
                  <Folder size={14} strokeWidth={2.5} className="shrink-0 text-pencil-light" />
                )}
                <span className="truncate flex-1">{project.name}</span>
                {project.id === activeProject?.id && (
                  <Check size={14} strokeWidth={2.5} className="shrink-0 text-success" />
                )}
              </button>
            ))}
            <div className="border-t border-muted">
              <button
                onClick={() => { setOpen(false); navigate('/projects'); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-pencil-light hover:text-pencil hover:bg-muted/20 transition-colors cursor-pointer"
              >
                <Plus size={14} strokeWidth={2.5} className="shrink-0" />
                <span>Add Project</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {switchingName && !switchError && (
        <SwitchOverlay name={switchingName} />
      )}
      {switchError && (
        <SwitchOverlay
          name={switchingName || ''}
          error={switchError}
          onRetry={handleRetry}
          onCancel={handleCancel}
        />
      )}
    </>
  );
}
