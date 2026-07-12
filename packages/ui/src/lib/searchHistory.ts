export class SearchHistory {
  private history: string[] = [];
  private currentIndex: number = -1;
  maxHistorySize: number = 100; // Limit the size of the history
  constructor(maxHistorySize = 100) {
    // Initialize with some default values if needed
    this.history = [];
    this.currentIndex = 0;
    this.maxHistorySize = maxHistorySize; // Set a maximum size for the history
  }

  addSearch(query: string) {
    if (query && query !== this.history[this.history.length - 1]) {
      if (this.history.length >= this.maxHistorySize) {
        this.history.shift(); // Remove the oldest search
      }
      this.history.push(query);
      this.currentIndex = this.history.length; // Reset index to the end
    }
  }

  getPrevious() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      return this.history[this.currentIndex];
    }
    return null;
  }

  getNext() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      return this.history[this.currentIndex];
    }
    return null;
  }
  // Reset currentIndex to the length of history
  resetIndex() {
    this.currentIndex = this.history.length;
  }
  clearHistory() {
    this.history.length = 0; // Clear the history array
    this.currentIndex = -1; // Reset index when clearing history
    console.log("Search history cleared");
  }

  insertAtCurrent(query: string) {
    if (!query || query.trim() === "") return;

    const trimmedQuery = query.trim();

    // If current index is at the end of history, just append
    if (this.currentIndex >= this.history.length) {
      this.addSearch(trimmedQuery);
      return;
    }

    // Check if identical to the content at current position to avoid duplicates
    if (this.history[this.currentIndex] === trimmedQuery) {
      return;
    }

    // Check if identical to the last record to avoid duplicates
    if (this.history[this.history.length - 1] === trimmedQuery) {
      return;
    }

    // If history is full, remove the oldest record
    if (this.history.length >= this.maxHistorySize) {
      this.history.shift();
      this.currentIndex = Math.max(0, this.currentIndex - 1);
    }

    // Insert the new content at the current index
    this.history.splice(this.currentIndex, 0, trimmedQuery);
    this.currentIndex = this.history.length; // Reset index to the end

    console.log("Search history inserted at current position:", this.history);
  }
}

export const searchHistory = new SearchHistory(100); // Create a new instance with a maximum size of 100
