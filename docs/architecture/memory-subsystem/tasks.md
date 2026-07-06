# Memory Subsystem — Task Breakdown

## Phase 1: Core Types + Table + Presenter Foundation

### T1.1 Create shared types (`agent-memory.ts`)
- **File**: `packages/shared/src/types/agent-memory.ts`
- **Content**: `AGENT_MEMORY_CATEGORIES`, `AgentMemoryCategory`, `CATEGORY_IMPORTANCE_FLOOR`, `isAgentMemoryCategory()`
- **Depends**: none
- **PR group**: Core types

### T1.2 Create agent_memory SQLite table
- **File**: `apps/desktop/src/main/presenter/sqlitePresenter/tables/agentMemory.ts`
- **Content**: `AgentMemoryTable` extending `BaseTable` with full schema (id, agent_id, kind, category, content, importance, status, embeddings, persona lifecycle, conflict, timestamps)
- **Register**: Add to `schemaCatalog.ts`
- **Depends**: T1.1
- **PR group**: Core types

### T1.3 Create memory presenter types
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/types.ts`
- **Content**: `MemoryRepositoryPort`, `MemoryCandidate`, `NormalizedMemoryCandidate`, `MemoryWriteOutcome`, `MemoryRecallItem`, `MemoryPresenterDeps`, all re-exports from table
- **Depends**: T1.1, T1.2
- **PR group**: Core types

### T1.4 Create memory scoring utilities
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/scoring.ts`
- **Content**: `buildMemoryProvenanceKey()`, `decayScore()`, `distanceToSimilarity()`, `fuse()` (RRF), `resolveRetrieval()`
- **Depends**: T1.3
- **PR group**: Core types

### T1.5 Create memory presenter core class
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/index.ts`
- **Content**: `MemoryPresenter` class with `writeMemoriesSync()`, `processPendingEmbeddings()`, `recall()`, `retrieve()`, `dispose()`, vector store management, embedding drain logic
- **Depends**: T1.2, T1.3, T1.4
- **PR group**: Core types

### T1.6 Write tests for core memory infrastructure
- **File**: `apps/desktop/test/main/presenter/memoryPresenter.test.ts`
- **Content**: Table CRUD, presenter write/read/dedup, scoring, fusion
- **Depends**: T1.5
- **PR group**: Core types

---

## Phase 2: Extraction + Decision + Agent Tools

### T2.1 Create memory extraction prompts
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/extraction.ts`
- **Content**: `buildTriagePrompt()`, `buildExtractionPrompt()`, `parseTriageDecision()`, `parseMemoryCandidates()` — with task-aware categories
- **Depends**: T1.1
- **PR group**: Extraction

### T2.2 Create memory decision logic
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/decision.ts`
- **Content**: `buildDecisionPrompt()`, `parseDecision()`, `MemoryDecision` type, `ADD_DECISION`
- **Depends**: T1.3
- **PR group**: Extraction

### T2.3 Create memory injection port
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/injectionPort.ts`
- **Content**: `MemoryInjectionPort`, `MemoryInjectionPayload`, `MemoryInjectionResult`, `buildMemorySection()`, `appendMemorySection()`, `estimateTokens()`, `resolveInjectionTokenBudget()`
- **Depends**: T1.3
- **PR group**: Extraction

### T2.4 Create agent memory tools
- **File**: `apps/desktop/src/main/presenter/toolPresenter/agentTools/agentMemoryTools.ts`
- **Content**: `AgentMemoryToolHandler` with `memory_remember`, `memory_recall`, `memory_forget` tools, schema validation, category support
- **Depends**: T1.1, T1.3
- **PR group**: Extraction

### T2.5 Wire memory tools into AgentToolManager
- **File**: `apps/desktop/src/main/presenter/toolPresenter/agentTools/agentToolManager.ts` (modify)
- **Content**: Import and register `AgentMemoryToolHandler`, route memory tool calls
- **Depends**: T2.4
- **PR group**: Extraction

### T2.6 Write tests for extraction + tools
- **Files**: `test/main/presenter/memoryExtraction.test.ts`, `test/main/presenter/memoryDecision.test.ts`, `test/main/presenter/agentMemoryTools.test.ts`
- **Depends**: T2.1, T2.2, T2.4
- **PR group**: Extraction

---

## Phase 3: Routes + Memory Injection

### T3.1 Create memory route contracts
- **File**: `packages/shared-contracts/src/routes/memory.routes.ts`
- **Content**: `memoryListRoute`, `memoryGetStatusRoute`, `memorySearchRoute`, `memoryAddRoute`, `memoryDeleteRoute`, `memoryClearRoute`, `memoryListConflictsRoute`, `memoryResolveConflictRoute`, persona routes
- **Register**: Add to `ARGOS_ROUTE_CATALOG`
- **Depends**: T1.1
- **PR group**: Routes

### T3.2 Create memory route handlers
- **File**: `apps/desktop/src/main/routes/memory.ts` (or similar)
- **Content**: Route handler implementations delegating to `MemoryPresenter`
- **Depends**: T3.1, T1.5
- **PR group**: Routes

### T3.3 Inject memory into system prompt
- **File**: `apps/desktop/src/main/presenter/agentRuntimePresenter/compactionService.ts` (modify)
- **Content**: Add `appendMemorySection()` call after summary section, token-budgeted
- **Depends**: T2.3, T1.5
- **PR group**: Routes

### T3.4 Add memory extraction to agentRuntimePresenter
- **File**: `apps/desktop/src/main/presenter/agentRuntimePresenter/index.ts` (modify)
- **Content**: Add `buildMemorySpanFromTape()`, `runMemoryExtraction()`, `runMemoryFallbackExtraction()`, `readToolCallMessageId()` — with `MemoryAdmissionSpan` type and tool-aware admission logic
- **Depends**: T1.5, T2.1
- **PR group**: Routes

### T3.5 Wire MemoryPresenter into Presenter singleton
- **File**: `apps/desktop/src/main/presenter/index.ts` (modify)
- **Content**: Instantiate `MemoryPresenter`, expose via `presenter.memoryPresenter`, wire lifecycle (start/stop background maintenance)
- **Depends**: T1.5, T3.2
- **PR group**: Routes

### T3.6 Write tests for routes + injection
- **Files**: `test/main/routes/memoryDto.test.ts`, `test/main/presenter/memoryPresenter.test.ts` (extend)
- **Depends**: T3.1, T3.2, T3.3
- **PR group**: Routes

---

## Phase 4: Maintenance + Persona

### T4.1 Add consolidation pass logic
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/index.ts` (extend)
- **Content**: `runConsolidationPass()`, idle timer debounce, cooldown, LLM budget, merge similarity gating
- **Depends**: T1.5
- **PR group**: Maintenance

### T4.2 Add reflection pass
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/index.ts` (extend)
- **Content**: `runReflectionPass()`, importance threshold, reflection prompt, reflection row creation
- **Depends**: T1.5, T2.1
- **PR group**: Maintenance

### T4.3 Add persona evolution
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/index.ts` (extend)
- **Content**: `distillPersonaDraft()`, `approvePersonaDraft()`, `rejectPersonaDraft()`, `rollbackPersona()`, `setPersonaAnchor()`, persona lock serialization
- **Depends**: T1.5, T1.2
- **PR group**: Maintenance

### T4.4 Add archive + maintenance sweep
- **File**: `apps/desktop/src/main/presenter/memoryPresenter/index.ts` (extend)
- **Content**: `runArchiveSweep()`, `startBackgroundMaintenance()`, `stopBackgroundMaintenance()`, decay-based archiving
- **Depends**: T1.5
- **PR group**: Maintenance

### T4.5 Add memory audit repository
- **File**: `apps/desktop/src/main/presenter/sqlitePresenter/tables/agentMemoryAudit.ts`
- **Content**: `AgentMemoryAuditTable` with event logging for extraction, write, persona changes
- **Register**: Add to `schemaCatalog.ts`
- **Depends**: T1.2
- **PR group**: Maintenance

### T4.6 Write tests for maintenance + persona
- **Files**: `test/main/presenter/memoryPresenter.test.ts` (extend), persona-specific tests
- **Depends**: T4.1, T4.2, T4.3
- **PR group**: Maintenance

---

## Phase 5: Final Integration + Gate

### T5.1 Full typecheck pass
- Run `pnpm run typecheck` — fix any type errors across all phases
- **Depends**: all phases

### T5.2 Full test pass
- Run `pnpm test` — ensure 0 failures
- **Depends**: all phases

### T5.3 Lint + format
- Run `pnpm run lint && pnpm run format`
- **Depends**: T5.1, T5.2

### T5.4 Update skill files
- Update `sync-state.md`: mark memory subsystem commits as done
- Update `ported-files.md`: add all new/modified file mappings
- Update `learnings.md`: add memory-specific gotchas
- **Depends**: T5.3
