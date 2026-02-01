export interface GenerationFunctions {
    // Current page for UI refresh
    currentPage: number;
    
    // Helper functions
    getRowContent: (row: any) => string;
    getSessionData: () => any;
}
