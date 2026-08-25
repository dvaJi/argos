import zod from "zod";
import type {
  SkillExtensionConfig,
  SkillFolderNode,
  SkillInstallOptions,
  SkillInstallResult,
  SkillMetadata,
  SkillScriptDescriptor,
} from "@argos/shared/types/skill";
import { EntityIdSchema, defineRouteContract } from "../common";

const SkillMetadataSchema = zod.custom<SkillMetadata>();
const SkillInstallOptionsSchema = zod.custom<SkillInstallOptions>().optional();
const SkillInstallResultSchema = zod.custom<SkillInstallResult>();
const SkillFolderNodeSchema = zod.custom<SkillFolderNode>();
const SkillExtensionConfigSchema = zod.custom<SkillExtensionConfig>();
const SkillScriptDescriptorSchema = zod.custom<SkillScriptDescriptor>();

export const skillsListMetadataRoute = defineRouteContract({
  name: "skills.listMetadata",
  input: zod.object({}),
  output: zod.object({
    skills: zod.array(SkillMetadataSchema),
  }),
});

export const skillsGetDirectoryRoute = defineRouteContract({
  name: "skills.getDirectory",
  input: zod.object({}),
  output: zod.object({
    path: zod.string(),
  }),
});

export const skillsInstallFromFolderRoute = defineRouteContract({
  name: "skills.installFromFolder",
  input: zod.object({
    folderPath: zod.string(),
    options: SkillInstallOptionsSchema,
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsInstallFromZipRoute = defineRouteContract({
  name: "skills.installFromZip",
  input: zod.object({
    zipPath: zod.string(),
    options: SkillInstallOptionsSchema,
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsInstallFromUrlRoute = defineRouteContract({
  name: "skills.installFromUrl",
  input: zod.object({
    url: zod.string(),
    options: SkillInstallOptionsSchema,
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsUninstallRoute = defineRouteContract({
  name: "skills.uninstall",
  input: zod.object({
    name: zod.string(),
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsUpdateFileRoute = defineRouteContract({
  name: "skills.updateFile",
  input: zod.object({
    name: zod.string(),
    content: zod.string(),
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsSaveWithExtensionRoute = defineRouteContract({
  name: "skills.saveWithExtension",
  input: zod.object({
    name: zod.string(),
    content: zod.string(),
    config: SkillExtensionConfigSchema,
  }),
  output: zod.object({
    result: SkillInstallResultSchema,
  }),
});

export const skillsGetFolderTreeRoute = defineRouteContract({
  name: "skills.getFolderTree",
  input: zod.object({
    name: zod.string(),
  }),
  output: zod.object({
    nodes: zod.array(SkillFolderNodeSchema),
  }),
});

export const skillsOpenFolderRoute = defineRouteContract({
  name: "skills.openFolder",
  input: zod.object({}),
  output: zod.object({
    opened: zod.literal(true),
  }),
});

export const skillsGetExtensionRoute = defineRouteContract({
  name: "skills.getExtension",
  input: zod.object({
    name: zod.string(),
  }),
  output: zod.object({
    config: SkillExtensionConfigSchema,
  }),
});

export const skillsSaveExtensionRoute = defineRouteContract({
  name: "skills.saveExtension",
  input: zod.object({
    name: zod.string(),
    config: SkillExtensionConfigSchema,
  }),
  output: zod.object({
    saved: zod.literal(true),
  }),
});

export const skillsListScriptsRoute = defineRouteContract({
  name: "skills.listScripts",
  input: zod.object({
    name: zod.string(),
  }),
  output: zod.object({
    scripts: zod.array(SkillScriptDescriptorSchema),
  }),
});

export const skillsGetActiveRoute = defineRouteContract({
  name: "skills.getActive",
  input: zod.object({
    conversationId: EntityIdSchema,
  }),
  output: zod.object({
    skills: zod.array(zod.string()),
  }),
});

export const skillsSetActiveRoute = defineRouteContract({
  name: "skills.setActive",
  input: zod.object({
    conversationId: EntityIdSchema,
    skills: zod.array(zod.string()),
  }),
  output: zod.object({
    skills: zod.array(zod.string()),
  }),
});

export const skillsReadSkillFileRoute = defineRouteContract({
  name: "skills.readSkillFile",
  input: zod.object({
    name: zod.string().min(1),
  }),
  output: zod.object({
    content: zod.string(),
  }),
});
