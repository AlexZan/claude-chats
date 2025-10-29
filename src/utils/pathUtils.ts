/**
 * Path utility functions
 * Handles cross-platform path operations, especially for Windows
 */

/**
 * Normalize a file path for comparison
 * - Converts to lowercase (Windows is case-insensitive)
 * - Replaces backslashes with forward slashes
 *
 * @param filePath - File path to normalize
 * @returns Normalized path suitable for comparisons
 *
 * @example
 * normalizePath("C:\\Users\\Lex\\file.txt") // "c:/users/lex/file.txt"
 * normalizePath("/home/user/file.txt")      // "/home/user/file.txt"
 */
export function normalizePath(filePath: string): string {
  return filePath.toLowerCase().replace(/\\/g, '/');
}

/**
 * Check if two file paths are equal (cross-platform)
 * Handles Windows case-insensitivity and path separator differences
 *
 * @param path1 - First path
 * @param path2 - Second path
 * @returns True if paths represent the same file
 *
 * @example
 * pathsEqual("C:\\Users\\file.txt", "c:/users/file.txt") // true
 * pathsEqual("/home/file.txt", "/home/other.txt")        // false
 */
export function pathsEqual(path1: string, path2: string): boolean {
  return normalizePath(path1) === normalizePath(path2);
}

/**
 * Find index of path in array, using normalized path comparison
 *
 * @param paths - Array of file paths
 * @param targetPath - Path to find
 * @returns Index of path in array, or -1 if not found
 *
 * @example
 * const paths = ["C:\\Users\\file1.txt", "C:\\Users\\file2.txt"];
 * findPathIndex(paths, "c:/users/file1.txt") // 0
 */
export function findPathIndex(paths: string[], targetPath: string): number {
  const normalized = normalizePath(targetPath);
  return paths.findIndex(p => normalizePath(p) === normalized);
}
