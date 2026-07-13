import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import zod from "zod";
import { Prompt } from "@argos/shared/presenter";
import { isSafeRegexPattern } from "@argos/shared/regexValidator";

const TemplateParameterSchema = zod.object({
  name: zod.string().describe("Parameter name"),
  description: zod.string().describe("Parameter description"),
  required: zod.boolean().describe("Whether the parameter is required"),
});

const TemplateDefinitionSchema = zod.object({
  name: zod.string().describe("Template name"),
  description: zod.string().describe("Template description"),
  content: zod.string().describe("Template content, may include placeholders"),
  parameters: zod.array(TemplateParameterSchema).optional().describe("Template parameter list"),
});

type TemplateDefinition = zod.infer<typeof TemplateDefinitionSchema>;

const GetTemplateParametersArgsSchema = zod.object({
  templateName: zod.string().describe("Template name whose parameters should be returned"),
});

const FillTemplateArgsSchema = zod.object({
  templateName: zod.string().describe("Template name to fill"),
  templateArgs: zod.record(zod.string(), zod.string()).optional().describe("Key-value pairs used to fill the template"),
  additionalContent: zod.string().optional().describe("Extra content the user wants appended to the prompt"),
});

const GetTemplateParametersArgsJsonSchema = zod.toJSONSchema(GetTemplateParametersArgsSchema, {
  unrepresentable: "any",
});
const FillTemplateArgsJsonSchema = zod.toJSONSchema(FillTemplateArgsSchema, { unrepresentable: "any" });

export interface AutoPromptingServerPorts {
  getCustomPrompts(): Promise<Prompt[]>;
}

export class AutoPromptingServer {
  private server: Server;

  constructor(private readonly ports: AutoPromptingServerPorts) {
    this.server = new Server(
      {
        name: "template-prompt-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {},
        },
      },
    );

    this.setupRequestHandlers();
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  private async getTemplateDefinition(name: string): Promise<TemplateDefinition | undefined> {
    try {
      const prompts: Prompt[] = await this.ports.getCustomPrompts();
      const prompt = prompts.find((p) => p.name === name);
      if (!prompt) {
        return undefined;
      }

      return {
        name: prompt.name,
        description: prompt.description,
        content: prompt.content || "",
        parameters: prompt.parameters,
      };
    } catch (error) {
      console.error("Failed to retrieve custom templates:", error);
      return undefined;
    }
  }

  private listTools() {
    return {
      tools: [
        {
          name: "list_all_prompt_template_names",
          description: "Get the list of names of all available prompt templates.",
          inputSchema: zod.toJSONSchema(zod.object({}), { unrepresentable: "any" }),
          annotations: {
            title: "List Prompt Template Names",
            readOnlyHint: true,
          },
        },
        {
          name: "get_prompt_template_parameters",
          description: "Get the parameter list and descriptions required by a prompt template by name.",
          inputSchema: GetTemplateParametersArgsJsonSchema,
          annotations: {
            title: "Get Template Parameters",
            readOnlyHint: true,
          },
        },
        {
          name: "fill_prompt_template",
          description:
            "Fill in template content with the prompt template name and parameters to produce the final prompt.",
          inputSchema: FillTemplateArgsJsonSchema,
          annotations: {
            title: "Fill Prompt Template",
            readOnlyHint: true,
          },
        },
      ],
    };
  }

  private async handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    if (name === "list_all_prompt_template_names") {
      try {
        const prompts: Prompt[] = await this.ports.getCustomPrompts();
        return {
          content: [{ type: "text", text: JSON.stringify(prompts.map((p) => p.name)) }],
        };
      } catch (error) {
        console.error("Failed to retrieve the list of template names:", error);
        throw new Error("Unable to retrieve the list of template names.");
      }
    }

    if (name === "get_prompt_template_parameters") {
      const parsed = GetTemplateParametersArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          `Invalid parameters for get_prompt_template_parameters: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        );
      }

      const template = await this.getTemplateDefinition(parsed.data.templateName);
      if (!template) {
        throw new Error(`Template not found: ${parsed.data.templateName}`);
      }

      return {
        content: [{ type: "text", text: JSON.stringify(template.parameters || []) }],
      };
    }

    if (name === "fill_prompt_template") {
      const parsed = FillTemplateArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          `Invalid parameters for fill_prompt_template: ${parsed.error.issues.map((e) => e.message).join(", ")}`,
        );
      }

      const { templateName, templateArgs, additionalContent } = parsed.data;
      const template = await this.getTemplateDefinition(templateName);
      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      let filledContent = template.content;
      if (templateArgs && template.parameters) {
        for (const param of template.parameters) {
          const value = templateArgs[param.name] || "";
          const escapedParamName = param.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const pattern = `{{${escapedParamName}}}`;
          if (!isSafeRegexPattern(pattern)) {
            throw new Error(
              `Template parameter name "${param.name}" creates an unsafe regex pattern. Please use a simpler parameter name.`,
            );
          }
          filledContent = filledContent.replace(new RegExp(pattern, "g"), value);
        }
      }

      return {
        content: [
          { type: "text", text: additionalContent ? `${filledContent}\n\n${additionalContent}` : filledContent },
        ],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  private setupRequestHandlers(): void {
    this.server.setRequestHandler(ListToolsRequestSchema, async () => this.listTools());
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      try {
        return await this.handleToolCall(request);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        return {
          content: [{ type: "text", text: `Error: ${errorMessage}` }],
          isError: true,
        };
      }
    });
  }
}
