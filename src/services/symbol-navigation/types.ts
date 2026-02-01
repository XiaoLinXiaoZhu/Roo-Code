/**
 * Symbol Navigation Service Types
 *
 * Provides type definitions for go_to_definition and find_references tools.
 */

/**
 * Represents a location in the codebase
 */
export interface SymbolLocation {
	/** File URI or path */
	uri: string
	/** Range in the file */
	range: {
		start: { line: number; character: number }
		end: { line: number; character: number }
	}
	/** Code preview at this location */
	preview?: string
}

/**
 * Symbol type classification
 */
export type SymbolType =
	| "function"
	| "class"
	| "variable"
	| "type"
	| "interface"
	| "method"
	| "property"
	| "enum"
	| "namespace"
	| "module"
	| "unknown"

/**
 * Data source for the result
 */
export type DataSource = "lsp" | "tree-sitter" | "semantic-search" | "regex-search"

/**
 * Confidence level of the result
 */
export type ConfidenceLevel = "high" | "medium" | "low"

/**
 * Reason for fallback
 */
export enum FallbackReason {
	LSP_TIMEOUT = "lsp_timeout",
	LSP_NO_RESULT = "lsp_no_result",
	LSP_ERROR = "lsp_error",
	NO_LANGUAGE_SERVER = "no_language_server",
	FILE_NOT_IN_WORKSPACE = "file_not_in_workspace",
}

/**
 * Result of a definition lookup
 */
export interface DefinitionResult {
	/** The symbol name being looked up */
	symbol: string
	/** List of definition locations */
	definitions: SymbolLocation[]
	/** Data source used */
	source: DataSource
	/** Confidence level */
	confidence: ConfidenceLevel
	/** Reason for fallback if applicable */
	fallbackReason?: FallbackReason
	/** Additional metadata about the symbol */
	metadata?: {
		type?: SymbolType
		exported?: boolean
		async?: boolean
		documentation?: string
	}
}

/**
 * Result of a references lookup
 */
export interface ReferencesResult {
	/** The symbol name being looked up */
	symbol: string
	/** List of reference locations */
	references: SymbolLocation[]
	/** Total count of references (may be more than returned) */
	totalCount: number
	/** Whether results were truncated */
	truncated: boolean
	/** Data source used */
	source: DataSource
	/** Confidence level */
	confidence: ConfidenceLevel
	/** Reason for fallback if applicable */
	fallbackReason?: FallbackReason
	/** References grouped by file */
	groupedByFile: Map<string, SymbolLocation[]>
}

/**
 * Options for finding references
 */
export interface FindReferencesOptions {
	/** Whether to include the declaration itself */
	includeDeclaration?: boolean
	/** Maximum number of results to return */
	maxResults?: number
}

/**
 * Symbol Navigation Service interface
 */
export interface ISymbolNavigationService {
	/**
	 * Find the definition of a symbol
	 *
	 * @param file - File path
	 * @param symbol - Symbol name to find
	 * @param surroundingCode - Optional surrounding code to search for (will locate symbol within this code)
	 * @param startLine - Optional starting line (1-based, default: 1)
	 */
	findDefinition(
		file: string,
		symbol: string,
		surroundingCode?: string,
		startLine?: number,
	): Promise<DefinitionResult>

	/**
	 * Find all references to a symbol
	 *
	 * @param file - File path
	 * @param symbol - Symbol name to find
	 * @param surroundingCode - Optional surrounding code to search for (will locate symbol within this code)
	 * @param startLine - Optional starting line (1-based, default: 1)
	 * @param options - Options for the search
	 */
	findReferences(
		file: string,
		symbol: string,
		surroundingCode?: string,
		startLine?: number,
		options?: FindReferencesOptions,
	): Promise<ReferencesResult>
}

// ============================================================================
// UI Structured Types (for frontend rendering)
// ============================================================================

/**
 * Location information for UI display
 */
export interface LocationUI {
	/** Relative file path from workspace root */
	filePath: string
	/** 1-based line number */
	line: number
	/** 1-based column number */
	column: number
	/** Code preview snippet */
	preview: string
	/** Language identifier for syntax highlighting */
	language?: string
}

/**
 * Metadata for UI display
 */
export interface SymbolMetadataUI {
	/** Symbol type (function, class, etc.) */
	type: SymbolType
	/** Whether the symbol is exported */
	exported: boolean
	/** Whether the symbol is async (for functions/methods) */
	async: boolean
	/** Documentation/JSDoc comment if available */
	documentation?: string
}

/**
 * Data source information for UI display
 */
export interface DataSourceUI {
	/** Primary data source used */
	source: DataSource
	/** Confidence level of the result */
	confidence: ConfidenceLevel
	/** Fallback reason if applicable */
	fallbackReason?: FallbackReason
	/** Human-readable description of the data source */
	description: string
}

/**
 * Structured result for definition lookup (UI rendering)
 */
export interface DefinitionResultUI {
	/** The symbol name that was looked up */
	symbol: string
	/** Whether the lookup was successful */
	success: boolean
	/** Error message if lookup failed */
	error?: string
	/** Definition locations */
	definitions: LocationUI[]
	/** Symbol metadata */
	metadata?: SymbolMetadataUI
	/** Data source information */
	dataSource: DataSourceUI
}

/**
 * Reference location grouped by file for UI display
 */
export interface FileReferencesUI {
	/** Relative file path */
	filePath: string
	/** Language identifier for syntax highlighting */
	language?: string
	/** References in this file */
	references: Array<{
		/** 1-based line number */
		line: number
		/** 1-based column number */
		column: number
		/** Code preview snippet */
		preview: string
	}>
}

/**
 * Pagination information for references
 */
export interface ReferencesPaginationUI {
	/** Total number of references found */
	totalCount: number
	/** Number of references returned */
	returnedCount: number
	/** Whether results were truncated */
	truncated: boolean
	/** Maximum results that were requested */
	maxResults?: number
}

/**
 * Structured result for references lookup (UI rendering)
 */
export interface ReferencesResultUI {
	/** The symbol name that was looked up */
	symbol: string
	/** Whether the lookup was successful */
	success: boolean
	/** Error message if lookup failed */
	error?: string
	/** References grouped by file */
	fileGroups: FileReferencesUI[]
	/** Pagination information */
	pagination: ReferencesPaginationUI
	/** Data source information */
	dataSource: DataSourceUI
}
