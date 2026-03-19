import { Settings } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import ProjectDropdown from './ProjectDropdown';

export default function TitleBar() {
  const navigate = useNavigate();

  return (
    <div
      data-tauri-drag-region
      className="h-12 flex items-center justify-between px-4 bg-paper border-b border-muted select-none shrink-0"
      style={{ paddingLeft: '80px' }}
    >
      <ProjectDropdown />
      <button
        type="button"
        onClick={() => navigate('/projects')}
        className="p-1.5 rounded-[var(--radius-sm)] hover:bg-muted/50 transition-colors text-pencil-light hover:text-pencil"
        title="Manage Projects"
      >
        <Settings size={16} strokeWidth={2.5} />
      </button>
    </div>
  );
}
