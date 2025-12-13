// PlatformConnector Component
// One-Click Deploy feature (015-one-click-deploy)

import { useState } from 'react';
import {
  Cloud,
  Link2,
  Unlink,
  Loader2,
  Check,
  ExternalLink,
  AlertCircle,
} from 'lucide-react';
import type { PlatformType, ConnectedPlatform } from '../../../types/deploy';
import { NetlifyIcon } from '../../ui/icons';

// Platform configuration
// Note: GitHub Pages doesn't require OAuth - it uses git credentials directly
const PLATFORMS: Array<{
  id: PlatformType;
  name: string;
  icon: React.ReactNode;
  bgClass: string;
  description: string;
}> = [
  {
    id: 'netlify',
    name: 'Netlify',
    icon: <NetlifyIcon className="h-7 w-7" />,
    bgClass: 'bg-[#0e1e25]',
    description: 'All-in-one platform for web development',
  },
];

interface PlatformConnectorProps {
  connectedPlatforms: ConnectedPlatform[];
  connectingPlatform: PlatformType | null;
  onConnect: (platform: PlatformType) => Promise<void>;
  onDisconnect: (platform: PlatformType) => Promise<void>;
  error?: string | null;
}

export function PlatformConnector({
  connectedPlatforms,
  connectingPlatform,
  onConnect,
  onDisconnect,
  error,
}: PlatformConnectorProps) {
  const [disconnecting, setDisconnecting] = useState<PlatformType | null>(null);

  const isConnected = (platformId: PlatformType) =>
    connectedPlatforms.some((p) => p.platform === platformId);

  const getConnectedAccount = (platformId: PlatformType) =>
    connectedPlatforms.find((p) => p.platform === platformId);

  const handleConnect = async (platform: PlatformType) => {
    await onConnect(platform);
  };

  const handleDisconnect = async (platform: PlatformType) => {
    setDisconnecting(platform);
    try {
      await onDisconnect(platform);
    } finally {
      setDisconnecting(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <Cloud className="h-4 w-4" />
        <span>Connect Deploy Platforms</span>
      </div>

      {error && (
        <div className="flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <div className="grid gap-3">
        {PLATFORMS.map((platform) => {
          const connected = isConnected(platform.id);
          const account = getConnectedAccount(platform.id);
          const isConnecting = connectingPlatform === platform.id;
          const isDisconnecting = disconnecting === platform.id;

          return (
            <div
              key={platform.id}
              className={`relative overflow-hidden rounded-lg border p-4 transition-all ${
                connected
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card hover:border-primary/30'
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  {/* Platform Icon */}
                  <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${platform.bgClass}`}>
                    {platform.icon}
                  </div>

                  {/* Platform Info */}
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-medium">{platform.name}</h4>
                      {connected && (
                        <span className="flex items-center gap-1 rounded-full bg-green-500/10 px-2 py-0.5 text-xs text-green-600">
                          <Check className="h-3 w-3" />
                          Connected
                        </span>
                      )}
                    </div>
                    {connected && account ? (
                      <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                        {account.avatarUrl && (
                          <img
                            src={account.avatarUrl}
                            alt={account.username}
                            className="h-4 w-4 rounded-full"
                          />
                        )}
                        <span>{account.username}</span>
                      </div>
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        {platform.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                <div className="shrink-0">
                  {connected ? (
                    <button
                      onClick={() => handleDisconnect(platform.id)}
                      disabled={isDisconnecting}
                      className="flex items-center gap-1.5 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-1.5 text-sm text-destructive transition-colors hover:bg-destructive/20 disabled:opacity-50"
                    >
                      {isDisconnecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Unlink className="h-4 w-4" />
                      )}
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      onClick={() => handleConnect(platform.id)}
                      disabled={isConnecting}
                      className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
                    >
                      {isConnecting ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Link2 className="h-4 w-4" />
                      )}
                      <span>{isConnecting ? 'Connecting...' : 'Connect'}</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Connected Account Actions */}
              {connected && account && (
                <div className="mt-3 flex items-center gap-3 border-t border-border/50 pt-3">
                  <a
                    href="https://app.netlify.com"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    <ExternalLink className="h-3 w-3" />
                    <span>Open Dashboard</span>
                  </a>
                  <span className="text-xs text-muted-foreground">
                    Connected {new Date(account.connectedAt).toLocaleDateString('en-US')}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
