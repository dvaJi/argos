import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolRequest,
} from "@modelcontextprotocol/sdk/types.js";
import { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { presenter } from "@/presenter";
import { Prompt } from "@shared/presenter";
import { isSafeRegexPattern } from "@shared/regexValidator";

// --- Type definitions and Schema (merged) ---

// Schema for template parameters
const TemplateParameterSchema = z.object({
  name: z.string().describe("Parameter name"),
  description: z.string().describe("Parameter description"),
  required: z.boolean().describe("Whether the parameter is required"),
  // type field removed; all template parameters are strings
});

// Schema for template definitions
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const TemplateDefinitionSchema = z.object({
  name: z.string().describe("Template name"),
  description: z.string().describe("Template description"),
  content: z.string().describe("Template content, may include placeholders"),
  parameters: z.array(TemplateParameterSchema).optional().describe("Template parameter list"),
});

// Infer TypeScript types from the Schema via z.infer
type TemplateDefinition = z.infer<typeof TemplateDefinitionSchema>;
// type TemplateParameter = z.infer<typeof TemplateParameterSchema>

// Schema for the get-template-parameters function arguments
const GetTemplateParametersArgsSchema = z.object({
  templateName: z.string().describe("Template name whose parameters should be returned"),
});

// Schema for the fill-template function arguments
const FillTemplateArgsSchema = z.object({
  templateName: z.string().describe("Template name to fill"),
  templateArgs: z.record(z.string(), z.string()).optional().describe("Key-value pairs used to fill the template"),
  additionalContent: z.string().optional().describe("Extra content the user wants appended to the prompt"),
});

// Convert Zod Schema to JSON Schema
const GetTemplateParametersArgsJsonSchema = zodToJsonSchema(GetTemplateParametersArgsSchema);
const FillTemplateArgsJsonSchema = zodToJsonSchema(FillTemplateArgsSchema);

// --- MCP Server implementation ---
export class AutoPromptingServer {
  private server: Server;

  constructor() {
    this.server = new Server(
      {
        name: "template-prompt-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          tools: {}, // only declare tools capability
        },
      },
    );

    this.setupRequestHandlers();
  }

  public startServer(transport: Transport): void {
    this.server.connect(transport);
  }

  /**
   * Helper: fetch a template definition from the presenter by template name.
   * Converts the Prompt type to a TemplateDefinition.
   * @param name Template name
   * @returns Template definition, or undefined
   */
  private async getTemplateDefinition(name: string): Promise<TemplateDefinition | undefined> {
    try {
      const prompts: Prompt[] = await presenter.configPresenter.getCustomPrompts();
      const prompt = prompts.find((p) => p.name === name);

      if (!prompt) {
        return undefined;
      }

      // Convert the Prompt to a TemplateDefinition, handling undefined content
      const templateDefinition: TemplateDefinition = {
        name: prompt.name,
        description: prompt.description,
        content: prompt.content || "", // fall back to empty string when content is undefined
        parameters: prompt.parameters,
      };

      return templateDefinition;
    } catch (error) {
      console.error("Failed to retrieve custom templates:", error);
      return undefined;
    }
  }

  // List all available tools (matches ListToolsRequestSchema)
  private listTools() {
    return {
      tools: [
        {
          name: "list_all_prompt_template_names",
          description: "Get the list of names of all available prompt templates.",
          inputSchema: zodToJsonSchema(z.object({})), // no parameters required
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
          description: "Fill in template content with the prompt template name and parameters to produce the final prompt.",
          inputSchema: FillTemplateArgsJsonSchema,
          annotations: {
            title: "Fill Prompt Template",
            readOnlyHint: true,
          },
        },
      ],
    };
  }

  // Handle a tool call (matches CallToolRequestSchema)
  private async handleToolCall(request: CallToolRequest) {
    const { name, arguments: args } = request.params;

    if (name === "list_all_prompt_template_names") {
      // 1. Collect all template names
      try {
        const prompts: Prompt[] = await presenter.configPresenter.getCustomPrompts();
        const templateNames = prompts.map((p) => p.name);
        return {
          content: [{ type: "text", text: JSON.stringify(templateNames) }],
        };
      } catch (error) {
        console.error("Failed to retrieve the list of template names:", error);
        throw new Error("Unable to retrieve the list of template names.");
      }
    } else if (name === "get_prompt_template_parameters") {
      // 2. Fetch parameter info for the template
      const parsed = GetTemplateParametersArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          `Invalid parameters for get_prompt_template_parameters: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const { templateName } = parsed.data;
      const template = await this.getTemplateDefinition(templateName);

      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      // template.parameters is already typed as TemplateParameterSchema; no extra adaptation needed
      return {
        content: [{ type: "text", text: JSON.stringify(template.parameters || []) }],
      };
    } else if (name === "fill_prompt_template") {
      // 3. Fill the template to produce the final prompt
      const parsed = FillTemplateArgsSchema.safeParse(args);
      if (!parsed.success) {
        throw new Error(
          `Invalid parameters for fill_prompt_template: ${parsed.error.errors.map((e) => e.message).join(", ")}`,
        );
      }

      const { templateName, templateArgs, additionalContent } = parsed.data;
      const template = await this.getTemplateDefinition(templateName);

      if (!template) {
        throw new Error(`Template not found: ${templateName}`);
      }

      let filledContent = template.content; // start from the template body

      // Replace parameter placeholders
      if (templateArgs && template.parameters) {
        for (const param of template.parameters) {
          const value = templateArgs[param.name] || "";
          // Validate regex pattern for ReDoS safety
          // Escape special characters in param.name to create a safe pattern
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

      // Append additional content
      const finalPrompt = additionalContent ? `${filledContent}\n\n${additionalContent}` : filledContent;

      return {
        content: [{ type: "text", text: finalPrompt }],
      };
    }

    throw new Error(`Unknown tool: ${name}`);
  }

  // Register all request handlers
  private setupRequestHandlers(): void {
    // Register the ListToolsRequestSchema handler, returning tool metadata
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return this.listTools();
    });

    // Register the CallToolRequestSchema handler, dispatching by tool name
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
