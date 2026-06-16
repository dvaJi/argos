import {
  IMessageManager,
  MESSAGE_METADATA,
  MESSAGE_ROLE,
  MESSAGE_STATUS,
  ISQLitePresenter,
  SQLITE_MESSAGE,
} from "@shared/presenter";
import {
  Message,
  AssistantMessageBlock,
  UserMessageContent,
  UserMessageTextBlock,
  UserMessageMentionBlock,
  UserMessageCodeBlock,
} from "@shared/chat";
import { eventBus, SendTarget } from "@/eventbus";
import { CONVERSATION_EVENTS } from "@/events";

export class MessageManager implements IMessageManager {
  private sqlitePresenter: ISQLitePresenter;

  constructor(sqlitePresenter: ISQLitePresenter) {
    this.sqlitePresenter = sqlitePresenter;
  }

  private formatUserMessageContentForDisplay(
    msgContentBlock: (UserMessageTextBlock | UserMessageMentionBlock | UserMessageCodeBlock)[],
  ): string {
    if (!Array.isArray(msgContentBlock)) return "";
    return msgContentBlock
      .map((block) => {
        if (block.type === "mention") {
          if (block.category === "context") {
            const label = block.id?.trim() || "context";
            return `@${label}`;
          }
        }
        return block.content || "";
      })
      .join("");
  }

  private convertToMessage(sqliteMessage: SQLITE_MESSAGE): Message {
    let metadata: MESSAGE_METADATA | null = null;
    try {
      metadata = JSON.parse(sqliteMessage.metadata);
    } catch (e) {
      console.error("Failed to parse metadata", e);
    }
    const messageContent = JSON.parse(sqliteMessage.content);

    if (sqliteMessage.role === "user") {
      const userContent = messageContent as UserMessageContent;
      if (userContent.content && Array.isArray(userContent.content)) {
        userContent.text = this.formatUserMessageContentForDisplay(userContent.content);
      }
    }
    return {
      id: sqliteMessage.id,
      conversationId: sqliteMessage.conversation_id,
      parentId: sqliteMessage.parent_id,
      role: sqliteMessage.role as MESSAGE_ROLE,
      content: messageContent,
      timestamp: sqliteMessage.created_at,
      status: sqliteMessage.status as MESSAGE_STATUS,
      usage: {
        context_usage: metadata?.contextUsage ?? 0,
        tokens_per_second: metadata?.tokensPerSecond ?? 0,
        total_tokens: metadata?.totalTokens ?? 0,
        generation_time: metadata?.generationTime ?? 0,
        first_token_time: metadata?.firstTokenTime ?? 0,
        input_tokens: metadata?.inputTokens ?? 0,
        output_tokens: metadata?.outputTokens ?? 0,
        reasoning_start_time: metadata?.reasoningStartTime ?? 0,
        reasoning_end_time: metadata?.reasoningEndTime ?? 0,
      },
      avatar: "",
      name: "",
      model_name: metadata?.model ?? "",
      model_id: metadata?.model ?? "",
      model_provider: metadata?.provider ?? "",
      error: "",
      is_variant: sqliteMessage.is_variant,
      variants: sqliteMessage.variants?.map((variant) => this.convertToMessage(variant)) || [],
    };
  }

  async sendMessage(
    conversationId: string,
    content: string,
    role: MESSAGE_ROLE,
    parentId: string,
    isVariant: boolean,
    metadata: MESSAGE_METADATA,
    searchResults?: string,
  ): Promise<Message> {
    const maxOrderSeq = await this.sqlitePresenter.getMaxOrderSeq(conversationId);
    const msgId = await this.sqlitePresenter.insertMessage(
      conversationId,
      content,
      role,
      parentId,
      JSON.stringify(metadata),
      maxOrderSeq + 1,
      0,
      "pending",
      0,
      isVariant ? 1 : 0,
    );

    if (searchResults) {
      await this.sqlitePresenter.addMessageAttachment(msgId, "search_results", searchResults);
    }
    const message = await this.getMessage(msgId);
    if (!message) {
      throw new Error("Failed to create message");
    }
    return message;
  }

  async editMessage(
    messageId: string,
    content: string,
    options?: { emit?: boolean; emitParent?: boolean },
  ): Promise<Message> {
    await this.sqlitePresenter.updateMessage(messageId, { content });
    const message = await this.sqlitePresenter.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    const msg = this.convertToMessage(message);
    const shouldEmit = options?.emit !== false;
    const shouldEmitParent = options?.emitParent !== false;

    if (shouldEmit) {
      eventBus.sendToRenderer(CONVERSATION_EVENTS.MESSAGE_EDITED, SendTarget.ALL_WINDOWS, messageId);
      if (shouldEmitParent && msg.parentId) {
        eventBus.sendToRenderer(CONVERSATION_EVENTS.MESSAGE_EDITED, SendTarget.ALL_WINDOWS, msg.parentId);
      }
    }
    return msg;
  }

  async editMessageSilently(messageId: string, content: string): Promise<Message> {
    return this.editMessage(messageId, content, { emit: false, emitParent: false });
  }

  async deleteMessage(messageId: string): Promise<void> {
    await this.sqlitePresenter.deleteMessage(messageId);
  }

  async retryMessage(messageId: string, metadata: MESSAGE_METADATA): Promise<Message> {
    const originalMessage = await this.getMessage(messageId);
    if (!originalMessage) {
      throw new Error(`Message ${messageId} not found`);
    }

    // Create a new variant message
    const variantMessage = await this.sendMessage(
      originalMessage.conversationId,
      JSON.stringify([]),
      originalMessage.role as MESSAGE_ROLE,
      originalMessage.parentId || "",
      true,
      metadata,
    );

    return variantMessage;
  }

  async getMessage(messageId: string): Promise<Message> {
    const message = await this.sqlitePresenter.getMessage(messageId);
    if (!message) {
      throw new Error(`Message ${messageId} not found`);
    }
    return this.convertToMessage(message);
  }

  async getMessagesByIds(messageIds: string[]): Promise<Message[]> {
    if (messageIds.length === 0) return [];
    const sqliteMessages = await this.sqlitePresenter.getMessagesByIds(messageIds);
    const sqliteById = new Map(sqliteMessages.map((msg) => [msg.id, msg]));
    const result: Message[] = [];

    for (const messageId of messageIds) {
      const sqliteMessage = sqliteById.get(messageId);
      if (!sqliteMessage) continue;
      if (sqliteMessage.role === "assistant" && sqliteMessage.parent_id) {
        const variants = await this.sqlitePresenter.getMessageVariants(sqliteMessage.parent_id);
        if (variants.length > 0) {
          sqliteMessage.variants = variants;
        }
      }
      result.push(this.convertToMessage(sqliteMessage));
    }

    return result;
  }

  async getMessageVariants(messageId: string): Promise<Message[]> {
    const variants = await this.sqlitePresenter.getMessageVariants(messageId);
    return variants.map((variant) => this.convertToMessage(variant));
  }

  async getMainMessageByParentId(conversationId: string, parentId: string): Promise<Message | null> {
    const message = await this.sqlitePresenter.getMainMessageByParentId(conversationId, parentId);
    if (!message) {
      return null;
    }
    return this.convertToMessage(message);
  }

  async getMessageThread(
    conversationId: string,
    page: number,
    pageSize: number,
  ): Promise<{ total: number; list: Message[] }> {
    const sqliteMessages = await this.sqlitePresenter.queryMessages(conversationId);
    const start = (page - 1) * pageSize;
    const end = start + pageSize;

    // Handle message sorting and variant relationships
    const messages = sqliteMessages
      .sort((a, b) => {
        // First sort by creation time
        const timeCompare = a.created_at - b.created_at;
        if (timeCompare !== 0) return timeCompare;
        // If creation time is identical, sort by sequence number
        return a.order_seq - b.order_seq;
      })
      .map((msg) => this.convertToMessage(msg));

    return {
      total: messages.length,
      list: messages.slice(start, end),
    };
  }

  async getMessageIds(conversationId: string): Promise<string[]> {
    return this.sqlitePresenter.queryMessageIds(conversationId);
  }

  async updateMessageStatus(messageId: string, status: MESSAGE_STATUS): Promise<void> {
    await this.sqlitePresenter.updateMessage(messageId, { status });
  }

  async updateMessageMetadata(messageId: string, metadata: Partial<MESSAGE_METADATA>): Promise<void> {
    const message = await this.sqlitePresenter.getMessage(messageId);
    if (!message) {
      return;
    }
    const updatedMetadata = {
      ...JSON.parse(message.metadata),
      ...metadata,
    };
    await this.sqlitePresenter.updateMessage(messageId, {
      metadata: JSON.stringify(updatedMetadata),
    });
  }

  async markMessageAsContextEdge(messageId: string, isEdge: boolean): Promise<void> {
    await this.sqlitePresenter.updateMessage(messageId, {
      isContextEdge: isEdge ? 1 : 0,
    });
  }

  async getContextMessages(
    conversationId: string,
    messageCount: number,
    { ensureUserStart = true, normalizeUserText = true } = {},
  ): Promise<Message[]> {
    const sqliteMessages = await this.sqlitePresenter.queryMessages(conversationId);

    const messages = sqliteMessages
      .sort((a, b) => {
        const timeCompare = b.created_at - a.created_at;
        if (timeCompare !== 0) return timeCompare;
        return b.order_seq - a.order_seq;
      })
      .slice(0, messageCount)
      .sort((a, b) => {
        const timeCompare = a.created_at - b.created_at;
        if (timeCompare !== 0) return timeCompare;
        return a.order_seq - b.order_seq;
      })
      .map((msg) => this.convertToMessage(msg));

    if (ensureUserStart) {
      while (messages.length > 0 && messages[0].role !== "user") {
        messages.shift();
      }
    }

    if (normalizeUserText) {
      return messages.map((msg) => {
        if (msg.role !== "user") {
          return msg;
        }
        const userContent = msg.content as UserMessageContent;
        if (userContent?.content) {
          return {
            ...msg,
            content: {
              ...userContent,
              text: this.formatUserMessageContentForDisplay(userContent.content),
            },
          };
        }
        return msg;
      });
    }

    return messages;
  }

  async getMessageHistory(messageId: string, limit: number = 100): Promise<Message[]> {
    if (limit <= 0) {
      return [];
    }

    const message = await this.getMessage(messageId);
    const sqliteMessages = await this.sqlitePresenter.queryMessages(message.conversationId);
    const orderedMessages = sqliteMessages
      .sort((a, b) => {
        const timeDiff = a.created_at - b.created_at;
        return timeDiff !== 0 ? timeDiff : a.order_seq - b.order_seq;
      })
      .map((sqliteMessage) => this.convertToMessage(sqliteMessage));

    const targetIndex = orderedMessages.findIndex((msg) => msg.id === messageId);
    if (targetIndex === -1) {
      return [message];
    }

    return orderedMessages.slice(Math.max(0, targetIndex - limit + 1), targetIndex + 1);
  }

  async getLastUserMessage(conversationId: string): Promise<Message | null> {
    const sqliteMessage = await this.sqlitePresenter.getLastUserMessage(conversationId);
    if (!sqliteMessage) {
      return null;
    }
    return this.convertToMessage(sqliteMessage);
  }

  async getLastAssistantMessage(conversationId: string): Promise<Message | null> {
    const sqliteMessage = await this.sqlitePresenter.getLastAssistantMessage(conversationId);
    if (!sqliteMessage) {
      return null;
    }
    return this.convertToMessage(sqliteMessage);
  }

  async clearAllMessages(conversationId: string): Promise<void> {
    await this.sqlitePresenter.deleteAllMessagesInConversation(conversationId);
  }
  /**
   * Initialize unfinished messages
   */
  public async initializeUnfinishedMessages(): Promise<void> {
    try {
      // Get all conversations
      const { list: conversations } = await this.sqlitePresenter.getConversationList(1, 1000);

      for (const conversation of conversations) {
        // Get messages for each conversation
        const { list: messages } = await this.getMessageThread(conversation.id, 1, 1000);

        // Find all assistant messages in pending status
        const pendingMessages = messages.filter((msg) => msg.role === "assistant" && msg.status === "pending");

        // Process each unfinished message
        for (const message of pendingMessages) {
          const blocks = Array.isArray(message.content) ? message.content : [];
          const hasQuestionRequest = blocks.some(
            (block) => block.type === "action" && block.action_type === "question_request",
          );
          if (hasQuestionRequest) {
            await this.updateMessageStatus(message.id, "sent");
            continue;
          }
          await this.handleMessageError(message.id, "common.error.sessionInterrupted");
        }
      }
    } catch (error) {
      if (
        error instanceof Error &&
        /no such table:\s*(conversations|messages|message_attachments)/i.test(error.message)
      ) {
        console.info("[MessageManager] Skip legacy unfinished message initialization: legacy tables not found.");
        return;
      }
      console.error("Failed to initialize incomplete message:", error);
    }
  }
  /**
   * Public function for handling the message error state
   * @param messageId Message ID
   * @param errorMessage Error message
   */
  public async handleMessageError(
    messageId: string,
    errorMessage: string = "common.error.requestFailed",
  ): Promise<void> {
    const message = await this.getMessage(messageId);
    if (!message) {
      return;
    }

    let content: AssistantMessageBlock[] = [];
    try {
      content = message.content as AssistantMessageBlock[];
    } catch {
      content = [];
    }

    // Change all loading-status blocks to error
    content.forEach((block: AssistantMessageBlock) => {
      if (block.status === "loading") {
        block.status = "error";
      }
    });

    // Add an error info block
    content.push({
      type: "error",
      content: errorMessage,
      status: "error",
      timestamp: Date.now(),
    });

    // Update message status and content
    await this.updateMessageStatus(messageId, "error");
    await this.editMessage(messageId, JSON.stringify(content));
  }
}
