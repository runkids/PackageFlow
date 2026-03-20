import { useState, useEffect } from 'react';
import { ArrowLeft, Folder, Globe, Trash2, Plus } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { open } from '@tauri-apps/plugin-dialog';
import { homeDir } from '@tauri-apps/api/path';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import { useProjects } from '../context/ProjectContext';
import { tauriBridge } from '../api/tauri-bridge';

export default function ProjectsPage() {
  const { projects, activeProject, addProject, removeProject, switchWithRestart } = useProjects();
  const navigate = useNavigate();
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [port, setPort] = useState<string>('19420');
  const [portSaved, setPortSaved] = useState(false);

  useEffect(() => {
    tauriBridge.getPreferredPort().then((p) => setPort(String(p)));
  }, []);

  const handlePortSave = async () => {
    const num = parseInt(port, 10);
    if (isNaN(num) || num < 1024 || num > 65535) {
      setError('Port must be between 1024 and 65535');
      return;
    }
    try {
      await tauriBridge.setPreferredPort(num);
      setPortSaved(true);
      setTimeout(() => setPortSaved(false), 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const globalProjects = projects.filter((p) => p.projectType === 'global');
  const localProjects = projects.filter((p) => p.projectType === 'project');

  const handleAddGlobal = async () => {
    setAdding(true);
    setError(null);
    try {
      const cliPath = await tauriBridge.detectCli();
      if (!cliPath) throw new Error('CLI not found. Please install it first.');
      const home = await homeDir();
      try {
        await tauriBridge.runCli(cliPath, ['init'], home);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('already initialized')) throw err;
      }
      await addProject('Global', home, 'global');
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
      const cliPath = await tauriBridge.detectCli();
      if (!cliPath) throw new Error('CLI not found. Please install it first.');
      try {
        await tauriBridge.runCli(cliPath, ['init', '-p'], dir);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (!msg.toLowerCase().includes('already initialized')) throw err;
      }
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

  const handleSwitch = async (id: string) => {
    await switchWithRestart(id);
    navigate('/');
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

  const renderProjectRow = (project: (typeof projects)[0]) => {
    const isActive = project.id === activeProject?.id;
    const isGlobal = project.projectType === 'global';
    return (
      <Card key={project.id} className={isActive ? 'border-pencil' : ''}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            {isGlobal ? (
              <Globe size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
            ) : (
              <Folder size={18} strokeWidth={2.5} className="shrink-0 mt-0.5 text-pencil-light" />
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-pencil truncate">{project.name}</h3>
                {isActive && (
                  <Badge variant="success" size="sm">
                    Active
                  </Badge>
                )}
                <Badge size="sm">{isGlobal ? 'Global' : 'Project'}</Badge>
              </div>
              <p className="text-sm text-pencil-light truncate mt-0.5" title={project.path}>
                {project.path}
              </p>
              <p className="text-xs text-muted-dark mt-1">Added {formatDate(project.addedAt)}</p>
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {!isActive && !isGlobal && (
              <Button variant="ghost" size="sm" onClick={() => handleSwitch(project.id)}>
                Switch
              </Button>
            )}
            {!isGlobal && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleRemove(project.id)}
                className="text-danger hover:text-danger"
              >
                <Trash2 size={14} strokeWidth={2.5} />
              </Button>
            )}
          </div>
        </div>
      </Card>
    );
  };

  return (
    <div className="flex-1 overflow-y-auto p-8 bg-paper">
      <div className="max-w-2xl mx-auto space-y-8">
        {/* Header with back button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="p-1.5 rounded-[var(--radius-sm)] hover:bg-muted/50 transition-colors text-pencil-light hover:text-pencil"
          >
            <ArrowLeft size={20} strokeWidth={2.5} />
          </button>
          <h1
            className="text-2xl font-bold text-pencil"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Projects
          </h1>
        </div>

        {error && <p className="text-danger text-sm">{error}</p>}

        {/* Global section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              className="text-lg font-semibold text-pencil"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Global
            </h2>
            {globalProjects.length === 0 && (
              <Button variant="secondary" size="sm" onClick={handleAddGlobal} loading={adding}>
                <Globe size={14} strokeWidth={2.5} />
                Add Global
              </Button>
            )}
          </div>
          {globalProjects.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-pencil-light text-sm">
                No global config yet. Add one to manage packages globally.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">{globalProjects.map(renderProjectRow)}</div>
          )}
        </section>

        {/* Projects section */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2
              className="text-lg font-semibold text-pencil"
              style={{ fontFamily: 'var(--font-heading)' }}
            >
              Projects
            </h2>
            <Button size="sm" onClick={handleAddProject} loading={adding}>
              <Plus size={14} strokeWidth={2.5} />
              Add Project
            </Button>
          </div>
          {localProjects.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-pencil-light text-sm">
                No projects yet. Add a directory to get started.
              </p>
            </Card>
          ) : (
            <div className="space-y-3">{localProjects.map(renderProjectRow)}</div>
          )}
        </section>

        {/* Settings section */}
        <section className="space-y-3">
          <h2
            className="text-lg font-semibold text-pencil"
            style={{ fontFamily: 'var(--font-heading)' }}
          >
            Settings
          </h2>
          <Card>
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-pencil">Server Port</p>
                <p className="text-xs text-pencil-light mt-0.5">
                  CLI server will start on this port (restart required)
                </p>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={1024}
                  max={65535}
                  value={port}
                  onChange={(e) => {
                    setPort(e.target.value);
                    setPortSaved(false);
                  }}
                  className="w-24 px-2 py-1 text-sm border border-muted rounded-[var(--radius-sm)] bg-paper text-pencil focus:outline-none focus:border-pencil"
                />
                <Button size="sm" onClick={handlePortSave}>
                  {portSaved ? 'Saved' : 'Save'}
                </Button>
              </div>
            </div>
          </Card>
        </section>
      </div>
    </div>
  );
}
