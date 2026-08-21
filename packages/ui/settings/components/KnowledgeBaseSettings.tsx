import { useState, useEffect } from "react";
import RagflowKnowledgeSettings from "./RagflowKnowledgeSettings";
import DifyKnowledgeSettings from "./DifyKnowledgeSettings";
import FastGptKnowledgeSettings from "./FastGptKnowledgeSettings";
import NowledgeMemSettings from "./NowledgeMemSettings";
import BuiltinKnowledgeSettings from "./BuiltinKnowledgeSettings";
import KnowledgeFile from "./KnowledgeFile";
import type { BuiltinKnowledgeConfig } from "@argos/shared/presenter";
import { createKnowledgeClient } from "#api/KnowledgeClient";
import SettingsPageShell from "./control-center/SettingsPageShell";

const knowledgeClient = createKnowledgeClient();

export default function KnowledgeBaseSettings() {
  const [enableBuiltinKnowledge, setEnableBuiltinKnowledge] = useState(false);
  const [showBuiltinKnowledgeDetail, setShowBuiltinKnowledgeDetail] = useState(false);
  const [builtinKnowledgeDetail, setBuiltinKnowledgeDetail] = useState<BuiltinKnowledgeConfig | null>(null);

  useEffect(() => {
    knowledgeClient
      .isSupported()
      .then((res: boolean) => {
        setEnableBuiltinKnowledge(res);
      })
      .catch(() => {
        setEnableBuiltinKnowledge(false);
      });
  }, []);

  const showDetail = (detail: BuiltinKnowledgeConfig) => {
    setShowBuiltinKnowledgeDetail(true);
    setBuiltinKnowledgeDetail(detail);
  };

  return (
    <SettingsPageShell title="Knowledge Base" eyebrow="Knowledge" data-testid="settings-knowledge-base-page">
      {!showBuiltinKnowledgeDetail && (
        <div className="flex w-full flex-col gap-4">
          <div className="space-y-4">
            <RagflowKnowledgeSettings />
            <DifyKnowledgeSettings />
            <FastGptKnowledgeSettings />
            {enableBuiltinKnowledge && <BuiltinKnowledgeSettings onShowDetail={showDetail} />}
            <NowledgeMemSettings />
          </div>
        </div>
      )}
      {showBuiltinKnowledgeDetail && builtinKnowledgeDetail && (
        <KnowledgeFile
          builtinKnowledgeDetail={builtinKnowledgeDetail}
          onHideKnowledgeFile={() => setShowBuiltinKnowledgeDetail(false)}
        />
      )}
    </SettingsPageShell>
  );
}
