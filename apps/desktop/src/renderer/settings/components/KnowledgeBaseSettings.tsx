import { useState, useEffect } from "react";
import RagflowKnowledgeSettings from "./RagflowKnowledgeSettings";
import DifyKnowledgeSettings from "./DifyKnowledgeSettings";
import FastGptKnowledgeSettings from "./FastGptKnowledgeSettings";
import NowledgeMemSettings from "./NowledgeMemSettings";
import BuiltinKnowledgeSettings from "./BuiltinKnowledgeSettings";
import KnowledgeFile from "./KnowledgeFile";
import type { BuiltinKnowledgeConfig } from "@shared/presenter";
import { useLegacyPresenter } from "@api/legacy/presenters";
import SettingsPageShell from "./control-center/SettingsPageShell";

export default function KnowledgeBaseSettings() {
  const knowledgePresenter = useLegacyPresenter("knowledgePresenter");
  const [enableBuiltinKnowledge, setEnableBuiltinKnowledge] = useState(false);
  const [showBuiltinKnowledgeDetail, setShowBuiltinKnowledgeDetail] = useState(false);
  const [builtinKnowledgeDetail, setBuiltinKnowledgeDetail] = useState<BuiltinKnowledgeConfig | null>(null);

  useEffect(() => {
    knowledgePresenter.isSupported().then((res: boolean) => {
      setEnableBuiltinKnowledge(res);
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
