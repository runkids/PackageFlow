import { useState } from 'react';
import { Folder, Globe, Trash2, Plus } from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import { useProjects } from '../hooks/useProjects';

export default function ProjectsPage() {
  const { projects, activeProject, addProject, removeProject, switchProject } = useProjects();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddGlobal = async () => {
    setAdding(true);
    setError(null);
    try {
      await addProject('Global', '~', 'global');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleAddProject = async () => {
    const dir = await open({ directory: true, title: 'Select project directory' });
    if (typeof dir !== 'string') return;

    setAdding(true);
    setError(null);
    try {
      const name = dir.split('/').pop() || 'Project';
      await addProject(name, dir, 'project');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (id: string) => {
    try {
      await removeProject(id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1
          className="text-2xl font-bold text-pencil"
          style={{ fontFamily: 'var(--font-heading)' }}
        >
          Projects
        </h1>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={handleAddGlobal} loading={adding}>
            <Globe size={14} strokeWidth={2.5} />
            Add Global
          </Button>
          <Button size="sm" onClick={handleAddProject} loading={adding}>
            <Plus size={14} strokeWidth={2.5} />
            Add Project
          </Button>
        </div>
      </div>

      {error && (
        <p className="text-danger text-sm">{error}</p>
      )}

      {projects.length === 0 ? (
        <Card className="text-center py-12">
          <p className="text-pencil-light">
            No projects yet. Add one to get started.
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {projects.map((project) => {
            const isActive = project.id === activeProject?.id;
            return (
              <Card key={project.id} className={isActive ? 'border-pencil' : ''}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-3 min-w-0">
                    {project.projectType === 'global' ? (
                      <Globe size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
                    ) : (
                      <Folder size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
                    )}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-pencil truncate">{project.name}</h3>
                        {isActive && <Badge variant="success" size="sm">Active</Badge>}
                        <Badge size="sm">
                          {project.projectType === 'global' ? 'Global' : 'Project'}
                        </Badge>
                      </div>
                      <p className="text-sm text-pencil-light truncate mt-0.5" title={project.path}>
                        {project.path}
                      </p>
                      <p className="text-xs text-muted-dark mt-1">
                        Added {formatDate(project.addedAt)}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!isActive && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => switchProject(project.id)}
                      >
                        Switch
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemove(project.id)}
                      className="text-danger hover:text-danger"
                    >
                      <Trash2 size={14} strokeWidth={2.5} />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
