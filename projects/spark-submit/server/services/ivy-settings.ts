/**
 * Ivy Settings Writer
 *
 * Generates Ivy settings file for Maven dependency resolution.
 */

import * as fs from "fs";
import * as path from "path";
import type { RuntimeContext } from "../../interface/index.js";

/**
 * Writes Ivy settings files for Maven/Ivy authentication.
 */
export class IvySettingsWriter {
  /**
   * Write Ivy settings file pointing at Maven Central.
   * Returns the path to the generated file.
   *
   * The first download of resolved packages may be slow; if the cache misbehaves,
   * run `rm -rf ~/.ivy2` to clear the local Ivy cache.
   */
  static write(ctx: RuntimeContext): string {
    const ivySettingsPath = path.join(ctx.ivyDir, "ivysettings.xml");

    if (!fs.existsSync(ctx.ivyDir)) {
      fs.mkdirSync(ctx.ivyDir, { recursive: true });
    }

    const ivySettings = `<ivysettings>
  <settings defaultResolver="default" />
  <resolvers>
    <chain name="default">
      <ibiblio name="central" m2compatible="true" root="https://repo1.maven.org/maven2/" />
    </chain>
  </resolvers>
</ivysettings>`;

    fs.writeFileSync(ivySettingsPath, ivySettings);
    return ivySettingsPath;
  }
}
