import { useCallback } from "react";
import type { AcpAgentProfile, AcpBuiltinAgent, AcpBuiltinAgentId } from "@shared/presenter";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@shadcn/components/ui/dialog";
import { Button } from "@shadcn/components/ui/button";
import { Badge } from "@shadcn/components/ui/badge";

interface AcpProfileManagerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  agent: AcpBuiltinAgent | null;
  onAddProfile: (agentId: AcpBuiltinAgentId) => void;
  onEditProfile: (payload: { agentId: AcpBuiltinAgentId; profile: AcpAgentProfile }) => void;
  onDeleteProfile: (payload: { agentId: AcpBuiltinAgentId; profile: AcpAgentProfile }) => void;
  onSetActive: (payload: { agentId: AcpBuiltinAgentId; profileId: string }) => void;
}

const formatEnv = (env?: Record<string, string>) => {
  if (!env || !Object.keys(env).length) return "None";

  const maskValue = (val: string | undefined | null) => {
    if (!val) return "";
    const str = String(val);
    return str.length <= 10 ? str : `${str.slice(0, 10)}***`;
  };

  return Object.entries(env)
    .map(([key, value]) => `${key}=${maskValue(value)}`)
    .join(", ");
};

export default function AcpProfileManagerDialog({
  open,
  onOpenChange,
  agent,
  onAddProfile,
  onEditProfile,
  onDeleteProfile,
  onSetActive,
}: AcpProfileManagerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{agent ? agent.name : "Profile Manager"}</DialogTitle>
          <DialogDescription>Manage launch profiles for this agent.</DialogDescription>
        </DialogHeader>

        {agent ? (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">Profiles: {agent.profiles.length}</div>
              <Button size="sm" onClick={() => onAddProfile(agent.id)}>
                Add Profile
              </Button>
            </div>
            {agent.profiles.length === 0 ? (
              <div className="text-sm text-muted-foreground text-center py-8">No profiles configured.</div>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {agent.profiles.map((profile) => (
                  <div key={profile.id} className="border rounded-lg p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="text-sm font-semibold flex items-center gap-2">
                          <span>{profile.name}</span>
                          {profile.id === agent.activeProfileId && <Badge variant="secondary">Active</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground break-words">
                          {profile.command}
                          {profile.args?.length && <span> {profile.args.join(" ")}</span>}
                        </p>
                        <p className="text-[11px] text-muted-foreground break-words">
                          <span className="font-medium">ENV:</span> <span>{formatEnv(profile.env)}</span>
                        </p>
                      </div>
                      <div className="flex flex-col gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={profile.id === agent.activeProfileId}
                          onClick={() => onSetActive({ agentId: agent.id, profileId: profile.id })}
                        >
                          Set Active
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => onEditProfile({ agentId: agent.id, profile })}>
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={agent.profiles.length <= 1}
                          onClick={() => onDeleteProfile({ agentId: agent.id, profile })}
                        >
                          Delete
                        </Button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="py-6 text-center text-sm text-muted-foreground">No agent selected.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}
