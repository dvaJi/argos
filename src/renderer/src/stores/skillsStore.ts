import { Store } from "@tanstack/store";
import { useStore } from "@tanstack/react-store";
import { createSkillClient } from "@api/SkillClient";
import type {
  SkillMetadata,
  SkillInstallResult,
  SkillExtensionConfig,
  SkillScriptDescriptor,
} from "@shared/types/skill";

function createDefaultSkillExtension(): SkillExtensionConfig {
  return {
    version: 1,
    env: {},
    runtimePolicy: { python: "auto", node: "auto" },
    scriptOverrides: {},
  };
}

const skillClient = createSkillClient();
let catalogListenerRegistered = false;

export const skillsStore = new Store({
  skills: [] as SkillMetadata[],
  skillExtensions: {} as Record<string, SkillExtensionConfig>,
  skillScripts: {} as Record<string, SkillScriptDescriptor[]>,
  loading: false,
  error: null as string | null,
});

export const getSkillCount = () => skillsStore.state.skills.length;

export const loadSkillRuntime = async (name: string) => {
  try {
    const [extension, scripts] = await Promise.all([
      skillClient.getSkillExtension(name),
      skillClient.listSkillScripts(name),
    ]);
    skillsStore.setState((s) => ({
      ...s,
      skillExtensions: {
        ...s.skillExtensions,
        [name]: extension ?? createDefaultSkillExtension(),
      },
      skillScripts: { ...s.skillScripts, [name]: scripts ?? [] },
    }));
  } catch (e) {
    console.error(`[SkillsStore] Failed to load runtime config for ${name}:`, e);
    skillsStore.setState((s) => ({
      ...s,
      skillExtensions: {
        ...s.skillExtensions,
        [name]: createDefaultSkillExtension(),
      },
      skillScripts: { ...s.skillScripts, [name]: [] },
    }));
  }
};

export const loadSkillRuntimeData = async (items?: SkillMetadata[]) => {
  const skills = items ?? skillsStore.state.skills;
  const nextExtensions: Record<string, SkillExtensionConfig> = {};
  const nextScripts: Record<string, SkillScriptDescriptor[]> = {};

  await Promise.all(
    skills.map(async (skill) => {
      try {
        const [extension, scripts] = await Promise.all([
          skillClient.getSkillExtension(skill.name),
          skillClient.listSkillScripts(skill.name),
        ]);
        nextExtensions[skill.name] = extension ?? createDefaultSkillExtension();
        nextScripts[skill.name] = scripts ?? [];
      } catch (e) {
        console.error(`[SkillsStore] Failed to load runtime data for ${skill.name}:`, e);
        nextExtensions[skill.name] = createDefaultSkillExtension();
        nextScripts[skill.name] = [];
      }
    }),
  );

  skillsStore.setState((s) => ({
    ...s,
    skillExtensions: nextExtensions,
    skillScripts: nextScripts,
  }));
};

export const loadSkills = async () => {
  skillsStore.setState((s) => ({ ...s, loading: true, error: null }));
  try {
    const nextSkills = await skillClient.getMetadataList();
    skillsStore.setState((s) => ({ ...s, skills: nextSkills }));
    await loadSkillRuntimeData(nextSkills);
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    skillsStore.setState((s) => ({ ...s, error }));
    console.error("[SkillsStore] Failed to load skills:", e);
  } finally {
    skillsStore.setState((s) => ({ ...s, loading: false }));
  }
};

export const installFromFolder = async (
  folderPath: string,
  options?: { overwrite?: boolean },
): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.installFromFolder(folderPath, options);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const installFromZip = async (
  zipPath: string,
  options?: { overwrite?: boolean },
): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.installFromZip(zipPath, options);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const installFromUrl = async (url: string, options?: { overwrite?: boolean }): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.installFromUrl(url, options);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const uninstallSkill = async (name: string): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.uninstallSkill(name);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const getSkillsDir = async (): Promise<string> => {
  return await skillClient.getSkillsDir();
};

export const openSkillsFolder = async (): Promise<void> => {
  await skillClient.openSkillsFolder();
};

export const updateSkillFile = async (name: string, content: string): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.updateSkillFile(name, content);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const saveSkillExtension = async (name: string, config: SkillExtensionConfig): Promise<void> => {
  await skillClient.saveSkillExtension(name, config);
  await loadSkillRuntime(name);
};

export const saveSkillWithExtension = async (
  name: string,
  content: string,
  config: SkillExtensionConfig,
): Promise<SkillInstallResult> => {
  try {
    const result = await skillClient.saveSkillWithExtension(name, content, config);
    if (result.success) await loadSkills();
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : String(e) };
  }
};

export const getSkillFolderTree = async (name: string) => {
  return await skillClient.getSkillFolderTree(name);
};

if (!catalogListenerRegistered) {
  catalogListenerRegistered = true;
  skillClient.onCatalogChanged(() => {
    void loadSkills();
  });
}

export function useSkillsStore() {
  return useStore(skillsStore);
}
