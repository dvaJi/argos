import Database from "better-sqlite3-multiple-ciphers";
import path from "path";
import fs from "fs";
import { ConversationsTable } from "./tables/conversations";
import { MessagesTable } from "./tables/messages";
import {
  DatabaseRepairReport,
  DatabaseSchemaDiagnosis,
  ISQLitePresenter,
  SQLITE_MESSAGE,
  CONVERSATION,
  CONVERSATION_SETTINGS,
  AcpSessionEntity,
  AgentSessionLifecycleStatus,
} from "@shared/presenter";
import { MessageAttachmentsTable } from "./tables/messageAttachments";
import { AcpSessionsTable, type AcpSessionUpsertData } from "./tables/acpSessions";
import { AcpTurnsTable, type AcpTurnStatus } from "./tables/acpTurns";
import { NewEnvironmentsTable } from "./tables/newEnvironments";
import { NewSessionsTable } from "./tables/newSessions";
import { NewProjectsTable } from "./tables/newProjects";
import { ArgosSessionsTable } from "./tables/argosSessions";
import { ArgosMessagesTable } from "./tables/argosMessages";
import { ArgosUserMessagesTable } from "./tables/argosUserMessages";
import { ArgosUserMessageFilesTable } from "./tables/argosUserMessageFiles";
import { ArgosUserMessageLinksTable } from "./tables/argosUserMessageLinks";
import { ArgosAssistantBlocksTable } from "./tables/argosAssistantBlocks";
import { ArgosMessageTracesTable } from "./tables/argosMessageTraces";
import { ArgosMessageSearchResultsTable } from "./tables/argosMessageSearchResults";
import { ArgosSearchDocumentsTable } from "./tables/argosSearchDocuments";
import { ArgosPendingInputsTable } from "./tables/argosPendingInputs";
import { ArgosUsageStatsTable } from "./tables/argosUsageStats";
import { ArgosTapeEntriesTable } from "./tables/argosTapeEntries";
import { LegacyImportStatusTable } from "./tables/legacyImportStatus";
import { AgentsTable } from "./tables/agents";
import { ConfigTables } from "./tables/configTables";
import { NewSessionActiveSkillsTable } from "./tables/newSessionActiveSkills";
import { NewSessionDisabledAgentToolsTable } from "./tables/newSessionDisabledAgentTools";
import { SettingsActivityTable } from "./tables/settingsActivity";
import { DatabaseRepairService, SchemaInspector } from "./schemaRepair";
import type { SettingsActivityInput, SettingsActivityRecord } from "@shared/contracts/routes";
import { configureSQLiteConnection } from "./connectionConfig";
import { LegacyChatImportService } from "../agentSessionPresenter/legacyImportService";

const DESTRUCTIVE_DATABASE_ERROR_PATTERNS = [
  /database disk image is malformed/i,
  /file is not a database/i,
  /SQLITE_CORRUPT/i,
  /SQLITE_NOTADB/i,
];

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message ?? "");
  }

  return String(error ?? "");
}

export function isDestructiveDatabaseError(error: unknown): boolean {
  const message = getErrorMessage(error);
  return DESTRUCTIVE_DATABASE_ERROR_PATTERNS.some((pattern) => pattern.test(message));
}

function ensureDatabaseDirectory(dbPath: string): void {
  const dbDir = path.dirname(dbPath);
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true });
  }
}

export function openSQLiteDatabase(dbPath: string, password?: string): Database.Database {
  ensureDatabaseDirectory(dbPath);
  const db = new Database(dbPath);
  configureSQLiteConnection(db, password);
  return db;
}

export function repairSQLiteDatabaseFile(dbPath: string, password?: string): DatabaseRepairReport {
  const db = openSQLiteDatabase(dbPath, password);

  try {
    return new DatabaseRepairService(db, dbPath).repair();
  } finally {
    db.close();
  }
}

function stripLeadingSqlComments(statement: string): string {
  return statement.replace(/^\s*(--[^\n]*(?:\r?\n|$))+/g, "").trim();
}

function splitSqlStatements(sql: string): string[] {
  const statements: string[] = [];
  let current = "";
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let index = 0; index < sql.length; index += 1) {
    const char = sql[index];
    const next = sql[index + 1];

    if (!inSingleQuote && !inDoubleQuote) {
      if (char === "-" && next === "-") {
        while (index + 1 < sql.length && sql[index + 1] !== "\n" && sql[index + 1] !== "\r") {
          index += 1;
        }
        continue;
      }

      if (char === "/" && next === "*") {
        if (current.length > 0 && !/\s$/.test(current)) {
          current += " ";
        }

        index += 2;
        while (index < sql.length && !(sql[index] === "*" && sql[index + 1] === "/")) {
          index += 1;
        }

        if (index >= sql.length) {
          break;
        }

        index += 1;
        continue;
      }
    }

    if (char === "'" && !inDoubleQuote) {
      current += char;
      if (inSingleQuote && next === "'") {
        current += next;
        index += 1;
        continue;
      }
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (char === '"' && !inSingleQuote) {
      inDoubleQuote = !inDoubleQuote;
      current += char;
      continue;
    }

    if (char === ";" && !inSingleQuote && !inDoubleQuote) {
      const trimmed = current.trim();
      if (trimmed) {
        statements.push(trimmed);
      }
      current = "";
      continue;
    }

    current += char;
  }

  const trailing = current.trim();
  if (trailing) {
    statements.push(trailing);
  }

  return statements;
}

function shouldIgnoreMigrationStatementError(statement: string, error: unknown): boolean {
  const normalizedStatement = stripLeadingSqlComments(statement).toUpperCase();
  const message = getErrorMessage(error);

  if (/^ALTER TABLE\b[\s\S]*\bADD COLUMN\b/.test(normalizedStatement) && /duplicate column name/i.test(message)) {
    return true;
  }

  if (/^CREATE(?: UNIQUE)? INDEX\b/.test(normalizedStatement) && /already exists/i.test(message)) {
    return true;
  }

  if (/^ALTER TABLE\b[\s\S]*\bDROP COLUMN\b/.test(normalizedStatement) && /no such column/i.test(message)) {
    return true;
  }

  return false;
}

/**
 * Import mode enum
 */
export enum ImportMode {
  INCREMENT = "increment", // Incremental import
  OVERWRITE = "overwrite", // Overwrite import
}

export class SQLitePresenter implements ISQLitePresenter {
  private db!: Database.Database;
  private conversationsTable!: ConversationsTable;
  private messagesTable!: MessagesTable;
  private messageAttachmentsTable!: MessageAttachmentsTable;
  private acpSessionsTable!: AcpSessionsTable;
  private acpTurnsTable!: AcpTurnsTable;
  public newEnvironmentsTable!: NewEnvironmentsTable;
  public newSessionsTable!: NewSessionsTable;
  public newProjectsTable!: NewProjectsTable;
  public argosSessionsTable!: ArgosSessionsTable;
  public argosMessagesTable!: ArgosMessagesTable;
  public argosUserMessagesTable!: ArgosUserMessagesTable;
  public argosUserMessageFilesTable!: ArgosUserMessageFilesTable;
  public argosUserMessageLinksTable!: ArgosUserMessageLinksTable;
  public argosAssistantBlocksTable!: ArgosAssistantBlocksTable;
  public argosMessageTracesTable!: ArgosMessageTracesTable;
  public argosMessageSearchResultsTable!: ArgosMessageSearchResultsTable;
  public argosSearchDocumentsTable!: ArgosSearchDocumentsTable;
  public argosPendingInputsTable!: ArgosPendingInputsTable;
  public argosUsageStatsTable!: ArgosUsageStatsTable;
  public argosTapeEntriesTable!: ArgosTapeEntriesTable;
  public legacyImportStatusTable!: LegacyImportStatusTable;
  public agentsTable!: AgentsTable;
  public configTables!: ConfigTables;
  public newSessionActiveSkillsTable!: NewSessionActiveSkillsTable;
  public newSessionDisabledAgentToolsTable!: NewSessionDisabledAgentToolsTable;
  public settingsActivityTable!: SettingsActivityTable;
  private currentVersion: number = 0;
  private dbPath: string;
  private password?: string;
  private destructiveInitializationRetryCount = 0;

  constructor(dbPath: string, password?: string) {
    this.dbPath = dbPath;
    this.password = password;
    try {
      this.initializeDatabase();
    } catch (error) {
      this.handleInitializationError(error);
    }
  }

  async deleteAllMessagesInConversation(conversationId: string): Promise<void> {
    return this.messagesTable.deleteAllInConversation(conversationId);
  }

  public getDatabase(): Database.Database {
    return this.db;
  }

  public openDatabaseConnection(dbPath = this.dbPath): Database.Database {
    return openSQLiteDatabase(dbPath, this.password);
  }

  public getDatabasePath(): string {
    return this.dbPath;
  }

  public getDatabasePassword(): string | undefined {
    return this.password;
  }

  public reopenWithPassword(password?: string): void {
    this.password = password;
    this.reopen();
  }

  public async diagnoseSchema(): Promise<DatabaseSchemaDiagnosis> {
    return new SchemaInspector(this.db).diagnose();
  }

  public async repairSchema(): Promise<DatabaseRepairReport> {
    const report = new DatabaseRepairService(this.db, this.dbPath).repair();
    try {
      this.settingsActivityTable?.record({
        category: "data",
        action: "repaired",
        targetType: "database",
        targetId: "schema",
        targetLabel: "Database schema",
        routeName: "settings-database",
        summaryKey: "settings.controlCenter.activity.databaseRepaired",
        summaryParams: {
          status: report.status,
        },
      });
    } catch (error) {
      console.warn("[SettingsActivity] Failed to record repair event:", error);
    }
    return report;
  }

  private initializeDatabase(): void {
    this.db = openSQLiteDatabase(this.dbPath, this.password);
    this.db.prepare("SELECT 1").get();
    this.initTables();
    this.initVersionTable();
    this.migrate();
  }

  private handleInitializationError(error: unknown): void {
    console.error("Database initialization failed:", error);

    if (isDestructiveDatabaseError(error)) {
      if (this.destructiveInitializationRetryCount > 0) {
        console.error("Destructive database recovery was already attempted once; aborting retry.");
        this.closeDatabaseSilently();
        throw error;
      }

      this.destructiveInitializationRetryCount += 1;
      this.backupDatabase();
      this.closeDatabaseSilently();
      this.cleanupDatabaseFiles();
      try {
        this.initializeDatabase();
      } catch (retryError) {
        this.handleInitializationError(retryError);
      }
      return;
    }

    this.closeDatabaseSilently();
    throw error;
  }

  private closeDatabaseSilently(): void {
    if (!this.db) {
      return;
    }

    try {
      this.db.close();
    } catch (error) {
      console.error("Error closing database:", error);
    }
  }

  private backupDatabase(): void {
    const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
    const backupPath = `${this.dbPath}.${timestamp}.bak`;

    try {
      if (fs.existsSync(this.dbPath)) {
        if (this.db?.open) {
          this.db.pragma("wal_checkpoint(TRUNCATE)");
        }
        fs.copyFileSync(this.dbPath, backupPath);
        console.log(`Database backed up to: ${backupPath}`);
      }
    } catch (error) {
      console.error("Error creating database backup:", error);
    }
  }

  private cleanupDatabaseFiles(): void {
    const filesToDelete = [this.dbPath, `${this.dbPath}-wal`, `${this.dbPath}-shm`];

    for (const file of filesToDelete) {
      try {
        if (fs.existsSync(file)) {
          fs.unlinkSync(file);
          console.log(`Deleted file: ${file}`);
        }
      } catch (error) {
        console.error(`Error deleting file ${file}:`, error);
      }
    }
  }

  renameConversation(conversationId: string, title: string): Promise<CONVERSATION> {
    this.conversationsTable.rename(conversationId, title);
    return this.getConversation(conversationId);
  }

  private initTables() {
    this.conversationsTable = new ConversationsTable(this.db);
    this.messagesTable = new MessagesTable(this.db);
    this.messageAttachmentsTable = new MessageAttachmentsTable(this.db);
    this.acpSessionsTable = new AcpSessionsTable(this.db);
    this.acpTurnsTable = new AcpTurnsTable(this.db);
    this.newEnvironmentsTable = new NewEnvironmentsTable(this.db);
    this.newSessionsTable = new NewSessionsTable(this.db);
    this.newProjectsTable = new NewProjectsTable(this.db);
    this.argosSessionsTable = new ArgosSessionsTable(this.db);
    this.argosMessagesTable = new ArgosMessagesTable(this.db);
    this.argosUserMessagesTable = new ArgosUserMessagesTable(this.db);
    this.argosUserMessageFilesTable = new ArgosUserMessageFilesTable(this.db);
    this.argosUserMessageLinksTable = new ArgosUserMessageLinksTable(this.db);
    this.argosAssistantBlocksTable = new ArgosAssistantBlocksTable(this.db);
    this.argosMessageTracesTable = new ArgosMessageTracesTable(this.db);
    this.argosMessageSearchResultsTable = new ArgosMessageSearchResultsTable(this.db);
    this.argosSearchDocumentsTable = new ArgosSearchDocumentsTable(this.db);
    this.argosPendingInputsTable = new ArgosPendingInputsTable(this.db);
    this.argosUsageStatsTable = new ArgosUsageStatsTable(this.db);
    this.argosTapeEntriesTable = new ArgosTapeEntriesTable(this.db);
    this.legacyImportStatusTable = new LegacyImportStatusTable(this.db);
    this.agentsTable = new AgentsTable(this.db);
    this.configTables = new ConfigTables(this.db);
    this.newSessionActiveSkillsTable = new NewSessionActiveSkillsTable(this.db);
    this.newSessionDisabledAgentToolsTable = new NewSessionDisabledAgentToolsTable(this.db);
    this.settingsActivityTable = new SettingsActivityTable(this.db);

    // Create only active tables for the new stack.
    this.acpSessionsTable.createTable();
    this.acpTurnsTable.createTable();
    this.newEnvironmentsTable.createTable();
    this.newSessionsTable.createTable();
    this.newProjectsTable.createTable();
    this.argosSessionsTable.createTable();
    this.argosMessagesTable.createTable();
    this.argosUserMessagesTable.createTable();
    this.argosUserMessageFilesTable.createTable();
    this.argosUserMessageLinksTable.createTable();
    this.argosAssistantBlocksTable.createTable();
    this.argosMessageTracesTable.createTable();
    this.argosMessageSearchResultsTable.createTable();
    this.argosSearchDocumentsTable.createTable();
    this.argosPendingInputsTable.createTable();
    this.argosUsageStatsTable.createTable();
    this.argosTapeEntriesTable.createTable();
    this.legacyImportStatusTable.createTable();
    this.agentsTable.createTable();
    this.configTables.createTable();
    this.newSessionActiveSkillsTable.createTable();
    this.newSessionDisabledAgentToolsTable.createTable();
    this.settingsActivityTable.createTable();
  }

  private initVersionTable() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS schema_versions (
        version INTEGER PRIMARY KEY,
        applied_at INTEGER NOT NULL
      )
    `);

    const result = this.db.prepare("SELECT MAX(version) as version FROM schema_versions").get() as {
      version: number;
      applied_at: number;
    };
    this.currentVersion = result?.version || 0;
  }

  private migrate() {
    // Get migration scripts for all tables
    const migrations = new Map<number, string[]>();
    const tables = [
      this.acpSessionsTable,
      this.newEnvironmentsTable,
      this.newSessionsTable,
      this.newProjectsTable,
      this.argosSessionsTable,
      this.argosMessagesTable,
      this.argosUserMessagesTable,
      this.argosUserMessageFilesTable,
      this.argosUserMessageLinksTable,
      this.argosAssistantBlocksTable,
      this.argosMessageTracesTable,
      this.argosMessageSearchResultsTable,
      this.argosSearchDocumentsTable,
      this.argosPendingInputsTable,
      this.argosUsageStatsTable,
      this.argosTapeEntriesTable,
      this.legacyImportStatusTable,
      this.agentsTable,
      this.configTables,
      this.newSessionActiveSkillsTable,
      this.newSessionDisabledAgentToolsTable,
      this.settingsActivityTable,
    ];

    // Get the latest migration version
    const latestVersion = tables.reduce((maxVersion, table) => {
      const tableMaxVersion = table.getLatestVersion?.() || 0;
      return Math.max(maxVersion, tableMaxVersion);
    }, 0);

    // Only migrate versions that have not been executed
    tables.forEach((table) => {
      for (let version = this.currentVersion + 1; version <= latestVersion; version++) {
        const sql = table.getMigrationSQL?.(version);
        if (sql) {
          if (!migrations.has(version)) {
            migrations.set(version, []);
          }
          migrations.get(version)?.push(sql);
        }
      }
    });

    // Execute migrations in version order
    const versions = Array.from(migrations.keys()).sort((a, b) => a - b);

    for (const version of versions) {
      const migrationSQLs = migrations.get(version) || [];
      if (migrationSQLs.length > 0) {
        console.log(`Executing migration version ${version}`);
        this.db.transaction(() => {
          migrationSQLs.forEach((sqlBlock) => {
            for (const statement of splitSqlStatements(sqlBlock)) {
              console.log(`Executing SQL: ${statement}`);
              try {
                this.db.exec(statement);
              } catch (error) {
                if (shouldIgnoreMigrationStatementError(statement, error)) {
                  console.warn(`Ignoring migration statement error for: ${statement}`, error);
                  continue;
                }

                throw error;
              }
            }
          });
          this.db.prepare("INSERT INTO schema_versions (version, applied_at) VALUES (?, ?)").run(version, Date.now());
        })();
      }
    }
  }

  // Close the database connection
  public close() {
    try {
      this.db.close();
    } catch (error) {
      console.warn("Failed to close database:", error);
    }
  }

  public reopen() {
    try {
      this.close();
      this.initializeDatabase();
    } catch (error) {
      console.error("Failed to reopen database:", error);
      throw error;
    }
  }

  public async clearNewAgentData(): Promise<void> {
    await this.runTransaction(() => {
      // Keep project metadata and legacy import status; clear session/message domain data only.
      this.db.exec(`
        DELETE FROM argos_message_search_results;
        DELETE FROM argos_search_documents;
        DELETE FROM argos_assistant_blocks;
        DELETE FROM argos_user_message_links;
        DELETE FROM argos_user_message_files;
        DELETE FROM argos_user_messages;
        DELETE FROM argos_message_traces;
        DELETE FROM argos_messages;
        DELETE FROM argos_usage_stats;
        DELETE FROM argos_tape_entries;
        DELETE FROM argos_sessions;
        DELETE FROM new_session_active_skills;
        DELETE FROM new_session_disabled_agent_tools;
        DELETE FROM new_environments;
        DELETE FROM new_sessions;
      `);
    });
  }

  public async recordSettingsActivity(input: SettingsActivityInput): Promise<SettingsActivityRecord> {
    return this.settingsActivityTable.record(input);
  }

  public async listSettingsActivity(limit?: number): Promise<SettingsActivityRecord[]> {
    return this.settingsActivityTable.list(limit);
  }

  public async importLegacyChatDb(
    sourceDbPath: string,
    mode: "increment" | "overwrite",
  ): Promise<{
    importedSessions: number;
    importedMessages: number;
    importedSearchResults: number;
  }> {
    const service = new LegacyChatImportService(this);
    return await service.importFromSourceDb(sourceDbPath, mode);
  }

  // Create a new conversation
  public async createConversation(title: string, settings: Partial<CONVERSATION_SETTINGS> = {}): Promise<string> {
    return this.conversationsTable.create(title, settings);
  }

  // Get conversation info
  public async getConversation(conversationId: string): Promise<CONVERSATION> {
    return this.conversationsTable.get(conversationId);
  }

  // Update conversation info
  public async updateConversation(conversationId: string, data: Partial<CONVERSATION>): Promise<void> {
    return this.conversationsTable.update(conversationId, data);
  }

  // Get the conversation list
  public async getConversationList(page: number, pageSize: number): Promise<{ total: number; list: CONVERSATION[] }> {
    return this.conversationsTable.list(page, pageSize);
  }

  public async listChildConversationsByParent(parentConversationId: string): Promise<CONVERSATION[]> {
    return this.conversationsTable.listByParentConversationId(parentConversationId);
  }

  public async listChildConversationsByMessageIds(parentMessageIds: string[]): Promise<CONVERSATION[]> {
    return this.conversationsTable.listByParentMessageIds(parentMessageIds);
  }

  // Get total conversation count
  public async getConversationCount(): Promise<number> {
    return this.conversationsTable.count();
  }

  // Delete the conversation
  public async deleteConversation(conversationId: string): Promise<void> {
    await this.conversationsTable.delete(conversationId);
    await this.acpSessionsTable.deleteByConversation(conversationId);
  }

  // Insert a message
  public async insertMessage(
    conversationId: string,
    content: string,
    role: string,
    parentId: string,
    metadata: string = "{}",
    orderSeq: number = 0,
    tokenCount: number = 0,
    status: string = "pending",
    isContextEdge: number = 0,
    isVariant: number = 0,
  ): Promise<string> {
    return this.messagesTable.insert(
      conversationId,
      content,
      role,
      parentId,
      metadata,
      orderSeq,
      tokenCount,
      status,
      isContextEdge,
      isVariant,
    );
  }

  // Query messages
  public async queryMessages(conversationId: string): Promise<SQLITE_MESSAGE[]> {
    return this.messagesTable.query(conversationId);
  }

  public async queryMessageIds(conversationId: string): Promise<string[]> {
    return this.messagesTable.queryIds(conversationId);
  }

  // Update a message
  public async updateMessage(
    messageId: string,
    data: {
      content?: string;
      status?: string;
      metadata?: string;
      isContextEdge?: number;
      tokenCount?: number;
    },
  ): Promise<void> {
    return this.messagesTable.update(messageId, data);
  }

  // Update the message parent ID
  public async updateMessageParentId(messageId: string, parentId: string): Promise<void> {
    return this.messagesTable.updateParentId(messageId, parentId);
  }

  // Delete a message
  public async deleteMessage(messageId: string): Promise<void> {
    return this.messagesTable.delete(messageId);
  }

  // Get a single message
  public async getMessage(messageId: string): Promise<SQLITE_MESSAGE | null> {
    return this.messagesTable.get(messageId);
  }

  public async getMessagesByIds(messageIds: string[]): Promise<SQLITE_MESSAGE[]> {
    return this.messagesTable.getByIds(messageIds);
  }

  // Get message variants
  public async getMessageVariants(messageId: string): Promise<SQLITE_MESSAGE[]> {
    return this.messagesTable.getVariants(messageId);
  }

  // Get the maximum message order sequence for a conversation
  public async getMaxOrderSeq(conversationId: string): Promise<number> {
    return this.messagesTable.getMaxOrderSeq(conversationId);
  }

  // Delete all messages
  public async deleteAllMessages(): Promise<void> {
    return this.messagesTable.deleteAll();
  }

  // Execute a transaction
  public async runTransaction(operations: () => void): Promise<void> {
    await this.db.transaction(operations)();
  }

  public async getLastUserMessage(conversationId: string): Promise<SQLITE_MESSAGE | null> {
    return this.messagesTable.getLastUserMessage(conversationId);
  }

  public async getLastAssistantMessage(conversationId: string): Promise<SQLITE_MESSAGE | null> {
    return this.messagesTable.getLastAssistantMessage(conversationId);
  }

  public async getMainMessageByParentId(conversationId: string, parentId: string): Promise<SQLITE_MESSAGE | null> {
    return this.messagesTable.getMainMessageByParentId(conversationId, parentId);
  }

  // Add a message attachment
  public async addMessageAttachment(messageId: string, attachmentType: string, attachmentData: string): Promise<void> {
    return this.messageAttachmentsTable.add(messageId, attachmentType, attachmentData);
  }

  // Get message attachments
  public async getMessageAttachments(messageId: string, type: string): Promise<{ content: string }[]> {
    return this.messageAttachmentsTable.get(messageId, type);
  }

  // ACP session helpers
  public async getAcpSession(conversationId: string, agentId: string): Promise<AcpSessionEntity | null> {
    const row = await this.acpSessionsTable.getByConversationAndAgent(conversationId, agentId);
    return row ? (row as AcpSessionEntity) : null;
  }

  public async getAcpSessionByAgentAndSessionId(agentId: string, sessionId: string): Promise<AcpSessionEntity | null> {
    const row = await this.acpSessionsTable.getByAgentAndSessionId(agentId, sessionId);
    return row ? (row as AcpSessionEntity) : null;
  }

  public async upsertAcpSession(conversationId: string, agentId: string, data: AcpSessionUpsertData): Promise<void> {
    const affectedPaths = new Set(this.newEnvironmentsTable.listPathsForSession(conversationId));
    await this.acpSessionsTable.upsert(conversationId, agentId, data);
    for (const path of this.newEnvironmentsTable.listPathsForSession(conversationId)) {
      affectedPaths.add(path);
    }
    for (const path of affectedPaths) {
      this.newEnvironmentsTable.syncPath(path);
    }
  }

  public async updateAcpSessionId(conversationId: string, agentId: string, sessionId: string | null): Promise<void> {
    await this.acpSessionsTable.updateSessionId(conversationId, agentId, sessionId);
  }

  public async updateAcpWorkdir(conversationId: string, agentId: string, workdir: string | null): Promise<void> {
    const affectedPaths = new Set(this.newEnvironmentsTable.listPathsForSession(conversationId));
    await this.acpSessionsTable.updateWorkdir(conversationId, agentId, workdir);
    for (const path of this.newEnvironmentsTable.listPathsForSession(conversationId)) {
      affectedPaths.add(path);
    }
    for (const path of affectedPaths) {
      this.newEnvironmentsTable.syncPath(path);
    }
  }

  public async updateAcpSessionStatus(
    conversationId: string,
    agentId: string,
    status: AgentSessionLifecycleStatus,
  ): Promise<void> {
    await this.acpSessionsTable.updateStatus(conversationId, agentId, status);
  }

  public async deleteAcpSessions(conversationId: string): Promise<void> {
    const affectedPaths = this.newEnvironmentsTable.listPathsForSession(conversationId);
    await this.acpSessionsTable.deleteByConversation(conversationId);
    for (const path of affectedPaths) {
      this.newEnvironmentsTable.syncPath(path);
    }
  }

  public async deleteAcpSession(conversationId: string, agentId: string): Promise<void> {
    const affectedPaths = this.newEnvironmentsTable.listPathsForSession(conversationId);
    await this.acpSessionsTable.deleteByConversationAndAgent(conversationId, agentId);
    for (const path of affectedPaths) {
      this.newEnvironmentsTable.syncPath(path);
    }
  }

  public async startAcpTurn(input: {
    id: string;
    acpSessionId: string;
    conversationId: string;
    userMessageId?: string | null;
    startedAt: number;
  }): Promise<void> {
    this.acpTurnsTable.start(input);
  }

  public async finishAcpTurn(input: {
    id: string;
    status: Exclude<AcpTurnStatus, "active">;
    stopReason?: string | null;
    completedAt: number;
  }): Promise<void> {
    this.acpTurnsTable.finish(input);
  }

  private hasTable(tableName: string): boolean {
    const row = this.db.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableName) as
      | { 1: number }
      | undefined;

    return Boolean(row);
  }

  private hasColumn(tableName: string, columnName: string): boolean {
    if (!this.hasTable(tableName)) {
      return false;
    }

    const rows = this.db.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{ name: string }>;
    return rows.some((row) => row.name === columnName);
  }

  public async migrateAcpAgentReferences(aliasMap: Record<string, string>): Promise<void> {
    const entries = Object.entries(aliasMap).filter(([from, to]) => from && to && from !== to);
    if (!entries.length) {
      return;
    }

    await this.runTransaction(() => {
      const hasNewSessions = this.hasTable("new_sessions");
      const hasAcpSessions = this.hasTable("acp_sessions");
      const hasArgosSessionModelRef =
        this.hasTable("argos_sessions") &&
        this.hasColumn("argos_sessions", "provider_id") &&
        this.hasColumn("argos_sessions", "model_id");

      for (const [from, to] of entries) {
        if (hasNewSessions) {
          this.db.prepare("UPDATE new_sessions SET agent_id = ? WHERE agent_id = ?").run(to, from);
        }

        if (hasAcpSessions) {
          this.db
            .prepare(
              `DELETE FROM acp_sessions
               WHERE agent_id = ?
                 AND EXISTS (
                   SELECT 1
                   FROM acp_sessions AS existing
                   WHERE existing.conversation_id = acp_sessions.conversation_id
                     AND existing.agent_id = ?
                 )`,
            )
            .run(from, to);
          this.db.prepare("UPDATE acp_sessions SET agent_id = ? WHERE agent_id = ?").run(to, from);
        }

        if (hasArgosSessionModelRef) {
          this.db
            .prepare(
              `UPDATE argos_sessions
               SET model_id = ?
               WHERE provider_id = 'acp' AND model_id = ?`,
            )
            .run(to, from);
        }
      }
    });
  }
}
