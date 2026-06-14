/**
 * JAR File Resolver
 *
 * Resolves JAR file paths from glob patterns.
 */

import * as path from "path";
import { globSync } from "glob";

/**
 * Resolves JAR files using glob patterns.
 */
export class JarResolver {
  /**
   * Resolve a JAR file path from a glob pattern.
   * Returns null if no matching JAR is found.
   */
  static resolve(projectRoot: string, jarPattern: string): string | null {
    const pattern = path.join(projectRoot, jarPattern);
    const matches = globSync(pattern);

    if (matches.length === 0) {
      return null;
    }

    // Return the first match
    // Could be enhanced to sort by version and return latest
    return matches[0];
  }
}
