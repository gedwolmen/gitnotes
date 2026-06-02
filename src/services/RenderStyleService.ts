import { GitHubService } from './GitHubService';
import {
  EMPTY_RENDER_STYLE_SETTINGS,
  RENDER_STYLE_PATH,
  RenderStyleSettings,
} from '../types/RenderStyle';

export interface RenderStyleRepoBinding {
  owner: string;
  name: string;
  branch: string;
}

export interface DiscoveredBinding extends RenderStyleRepoBinding {
  /** Human-friendly label "owner/name". */
  label: string;
}

function safeParse(jsonText: string): RenderStyleSettings {
  try {
    const parsed = JSON.parse(jsonText) as Partial<RenderStyleSettings>;
    if (parsed && typeof parsed === 'object' && parsed.formats && typeof parsed.formats === 'object') {
      return { version: 1, formats: parsed.formats };
    }
} catch (error) {
      console.warn('[RenderStyleService] Failed to parse render styles JSON:', error);
      // fall through to empty
    }
  return { ...EMPTY_RENDER_STYLE_SETTINGS };
}

export class RenderStyleService {
  /**
   * Pull `settings/render.json` from the bound repo. Returns empty
   * settings if the file does not exist (404) or is unparseable.
   */
  static async load(binding: RenderStyleRepoBinding): Promise<RenderStyleSettings> {
    const content = await GitHubService.getFileContent(
      binding.owner,
      binding.name,
      RENDER_STYLE_PATH,
      binding.branch,
    );
    if (!content) return { ...EMPTY_RENDER_STYLE_SETTINGS };
    return safeParse(content);
  }

  /**
   * Persist settings to `settings/render.json`. Creates the file if
   * missing.
   */
  static async save(
    binding: RenderStyleRepoBinding,
    settings: RenderStyleSettings,
  ): Promise<boolean> {
    const json = JSON.stringify(settings, null, 2);
    const result = await GitHubService.updateFile(
      binding.owner,
      binding.name,
      RENDER_STYLE_PATH,
      json,
      'Update render style settings',
      binding.branch,
    );
    return !!result;
  }

  /**
   * Scan all repos accessible to the active GitHub token for an existing
   * `settings/render.json`. The returned list lets the UI implement the
   * 0/1/2+ selection rule from #434.
   */
  static async discoverExisting(): Promise<DiscoveredBinding[]> {
    const repos = await GitHubService.getRepositories();
    const found: DiscoveredBinding[] = [];
    await Promise.all(
      repos.map(async (repo) => {
        try {
          const sha = await GitHubService.getFileShaOrNull(
            repo.owner.login,
            repo.name,
            RENDER_STYLE_PATH,
          );
          if (sha) {
            found.push({
              owner: repo.owner.login,
              name: repo.name,
              branch: 'main',
              label: `${repo.owner.login}/${repo.name}`,
            });
          }
        } catch {
          // ignore - repo may not be readable or branch may differ
        }
      }),
    );
    return found.sort((a, b) => a.label.localeCompare(b.label));
  }
}

export default RenderStyleService;
